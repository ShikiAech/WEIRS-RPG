import test from 'node:test';
import assert from 'node:assert/strict';
import { criarConteudo, novaEntrada, validarFicha } from '../packages/sheets/modelo.js';
const equipamentos = await import('../packages/sheets/equipamentos.js').catch(
  () => ({}) as typeof import('../packages/sheets/equipamentos.js'),
);
import { readSheetFile } from '../apps/web/lib/sheet-file';
import type { SheetContent } from '../packages/contracts/sheets';

test('ataques de arma atualizam acerto e múltiplos danos ao mudar atributo e nível', () => {
  const c: SheetContent = criarConteudo();
  c.classes[0].nivel = 5;
  c.atributos.for.valor = 18;
  const item = { ...novaEntrada('inventario.itens'), tipo: 'arma', critico: 19 };
  c.inventario.itens.push(item);
  c.ataques.push({
    ...novaEntrada('ataques'),
    itemId: item.id,
    atributo: 'for',
    bonus: 1,
    proficiente: true,
    danos: [
      { id: crypto.randomUUID(), dado: '1d8', atributo: 'for', tipo: 'cortante' },
      { id: crypto.randomUUID(), dado: '1d6', atributo: '', tipo: 'fogo' },
    ],
  } as never);
  assert.equal(typeof equipamentos.sincronizarEquipamentos, 'function');
  const next = equipamentos.sincronizarEquipamentos(c);
  assert.equal(next.ataques[0].valor, 8);
  assert.equal(next.ataques[0].dano, '1d8+4+1d6');
  assert.equal(next.ataques[0].tipoDano, 'cortante / fogo');
  assert.equal(next.ataques[0].critico, 19);
  assert.equal(c.ataques[0].valor, 0);
  c.ataques[0].bonus = 99;
  const enhanced = equipamentos.sincronizarEquipamentos(c);
  assert.equal(enhanced.ataques[0].valor, 106);
  assert.deepEqual(validarFicha({ nome: 'Teste', versao_esquema: 1, conteudo: enhanced }), []);
});

test('sintonia bloqueia quarto item e libera vaga ao remover equipamento', () => {
  const c: SheetContent = criarConteudo();
  c.inventario.itens = Array.from({ length: 4 }, () => novaEntrada('inventario.itens'));
  assert.equal(typeof equipamentos.alterarSintonia, 'function');
  let next = c;
  for (const item of c.inventario.itens.slice(0, 3))
    next = equipamentos.alterarSintonia(next, item.id, true);
  assert.equal(
    equipamentos.alterarSintonia(next, c.inventario.itens[3].id, true).inventario.sintonizados
      .length,
    3,
  );
  next = equipamentos.removerEquipamento(next, c.inventario.itens[0].id);
  assert.equal(
    equipamentos.alterarSintonia(next, c.inventario.itens[3].id, true).inventario.sintonizados
      .length,
    3,
  );
});

test('validação rejeita crítico inválido, recurso excedido e referência de item ausente', () => {
  const c: SheetContent = criarConteudo();
  c.inventario.itens.push({ ...novaEntrada('inventario.itens'), tipo: 'arma', critico: 21 });
  let errors = validarFicha({ nome: 'Teste', versao_esquema: 1, conteudo: c });
  assert.ok(errors.some((e) => e.campo.endsWith('critico')));
  c.inventario.itens[0].critico = 20;
  c.recursos.push({
    ...novaEntrada('recursos'),
    itemId: crypto.randomUUID(),
    maximo: 2,
    gastos: 1,
  });
  errors = validarFicha({ nome: 'Teste', versao_esquema: 1, conteudo: c });
  assert.ok(errors.some((e) => e.campo.endsWith('itemId')));
});

test('importação mantém itens antigos e preserva os dados novos na cópia JSON', () => {
  const c: SheetContent = criarConteudo();
  c.inventario.itens.push(novaEntrada('inventario.itens'));
  const parsed = readSheetFile(JSON.stringify({ nome: 'Teste', versao_esquema: 1, conteudo: c }));
  assert.equal(parsed.content.inventario.itens[0].quantidade, 1);
  parsed.content.inventario.itens[0].tipo = 'armadura';
  parsed.content.inventario.itens[0].limiteDestreza = null;
  const copy = readSheetFile(
    JSON.stringify({ nome: parsed.name, versao_esquema: 1, conteudo: parsed.content }),
  );
  assert.equal(copy.content.inventario.itens[0].limiteDestreza, null);
});

test('importação recalcula ataques vinculados e rejeita danos com campos ausentes', () => {
  const c: SheetContent = criarConteudo();
  c.atributos.for.valor = 18;
  const item = equipamentos.novoEquipamento();
  c.inventario.itens.push(item as SheetContent['inventario']['itens'][number]);
  c.ataques.push(equipamentos.novoAtaqueEquipamento(item));
  c.ataques[0].proficiente = true;
  c.ataques[0].danos = [
    { id: crypto.randomUUID(), dado: '1d8', atributo: 'for', tipo: 'cortante' },
  ];
  const copy = readSheetFile(JSON.stringify({ nome: 'Teste', versao_esquema: 1, conteudo: c }));
  assert.equal(copy.content.ataques[0].valor, 6);
  assert.equal(copy.content.ataques[0].dano, '1d8+4');
  c.ataques[0].danos = [
    { id: crypto.randomUUID(), dado: '51d6', atributo: '', tipo: 'fogo' },
    { id: crypto.randomUUID(), dado: '50d6', atributo: '', tipo: 'fogo' },
  ];
  assert.throws(() =>
    readSheetFile(JSON.stringify({ nome: 'Teste', versao_esquema: 1, conteudo: c })),
  );
  c.ataques[0].danos = [{ id: crypto.randomUUID() } as never];
  assert.throws(() =>
    readSheetFile(JSON.stringify({ nome: 'Teste', versao_esquema: 1, conteudo: c })),
  );
});

test('composição normaliza sinais e valida os limites agregados de dano da mesa', () => {
  const c: SheetContent = criarConteudo(),
    item = equipamentos.novoEquipamento();
  c.inventario.itens.push(item as SheetContent['inventario']['itens'][number]);
  const attack = equipamentos.novoAtaqueEquipamento(item);
  attack.danos = [
    { id: crypto.randomUUID(), dado: '+1d8', atributo: '', tipo: 'fogo' },
    { id: crypto.randomUUID(), dado: '+1d6', atributo: '', tipo: 'fogo' },
  ];
  c.ataques.push(attack);
  const next = equipamentos.sincronizarEquipamentos(c);
  assert.equal(next.ataques[0].dano, '1d8+1d6');
  assert.equal(next.ataques[0].tipoDano, 'fogo');
  assert.ok(equipamentos.validarFormulaDano('51d6+50d6'));
  assert.ok(equipamentos.validarFormulaDano('1d1'));
  assert.equal(equipamentos.validarFormulaDano('2d20kh1+4'), '');
  c.atributos.for.valor = 18;
  c.ataques[0].danos = Array.from({ length: 20 }, () => ({
    id: crypto.randomUUID(),
    dado: '1d6+1',
    atributo: 'for' as const,
    tipo: 'fogo',
  }));
  const errors = validarFicha({
    nome: 'Teste',
    versao_esquema: 1,
    conteudo: equipamentos.sincronizarEquipamentos(c),
  });
  assert.ok(errors.some((e) => e.campo === 'ataques.0.danos'));
});
