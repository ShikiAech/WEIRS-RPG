import test from 'node:test';
import assert from 'node:assert/strict';
import { criarConteudo, novaEntrada, validarFicha } from '../packages/sheets/modelo.js';
import { readSheetFile } from '../apps/web/lib/sheet-file';
import { actionCatalog } from '../apps/web/features/session/action-favorites';
import type { SheetContent, SheetRecord } from '../packages/contracts/sheets';

function sample() {
  const c = criarConteudo() as SheetContent;
  c.atributos.int.valor = 18;
  c.atributos.int.ajusteModificador = -1;
  const s = {
    ...novaEntrada('magias'),
    nome: 'Chama gelada',
    dano: '9999',
    danos: [
      { id: crypto.randomUUID(), dado: '1d6+1', atributo: 'int', tipo: 'Frio' },
      { id: crypto.randomUUID(), dado: '2d4', atributo: '', tipo: 'Fogo' },
      { id: crypto.randomUUID(), dado: '-2', atributo: '', tipo: 'Necrótico' },
    ],
  };
  c.magias.push(s as SheetContent['magias'][number]);
  return c;
}
const valid = (c: SheetContent) => validarFicha({ nome: 'Mago', conteudo: c, versao_esquema: 1 });
test('importar parcelas de magia recalcula a fórmula e conserva o cadastro único', () => {
  const c = sample();
  const imported = readSheetFile(
    JSON.stringify({ nome: 'Mago', conteudo: c, versao_esquema: 1 }),
  ).content;
  assert.equal(imported.magias[0].dano, '1d6+1+3+2d4-2');
  assert.equal(imported.magias[0].tipoDano, 'Frio / Fogo / Necrótico');
  assert.equal(imported.ataques.length, 0);
  assert.equal(imported.magias.length, 1);
});
test('validação rejeita fórmulas, atributos, ids e limites inválidos das parcelas', () => {
  const c = sample(),
    spell = c.magias[0] as any;
  spell.danos[0].dado = '2d1';
  assert.ok(valid(c).some((e) => e.campo.startsWith('magias.0.danos')));
  spell.danos[0].dado = '1d6';
  spell.danos[0].atributo = 'outro';
  assert.ok(valid(c).some((e) => e.campo.endsWith('atributo')));
  spell.danos[0].atributo = '';
  spell.danos[0].id = c.classes[0].id;
  assert.ok(valid(c).some((e) => e.campo.endsWith('id')));
  spell.danos[0].id = crypto.randomUUID();
  spell.danos[0].dado = '60d6';
  spell.danos[1].dado = '60d6';
  assert.ok(valid(c).some((e) => e.campo.startsWith('magias.0.danos')));
  spell.danos = 'inválido';
  assert.ok(valid(c).some((e) => e.campo === 'magias.0.danos'));
});
test('fórmula antiga funciona e favoritos reconhecem parcelas mesmo sem fórmula derivada', () => {
  const c = criarConteudo() as SheetContent;
  c.magias.push({ ...novaEntrada('magias'), nome: 'Magia antiga', dano: '2d6+3' });
  assert.deepEqual(valid(c), []);
  const imported = readSheetFile(JSON.stringify({ nome: 'Mago', conteudo: c, versao_esquema: 1 }));
  assert.equal(imported.content.magias[0].dano, '2d6+3');
  const newer = sample();
  delete newer.magias[0].dano;
  const record = {
    id: crypto.randomUUID(),
    campanha_id: crypto.randomUUID(),
    proprietario_id: crypto.randomUUID(),
    nome: 'Mago',
    conteudo: newer,
    versao: 1,
    versao_esquema: 1,
    criado_em: '',
    atualizado_em: '',
  } as SheetRecord;
  assert.ok(
    actionCatalog(record).some(
      (a) => a.acao === 'magia_dano' && a.entrada_id === newer.magias[0].id,
    ),
  );
});

test('descrição opcional de perícia valida texto sem lançar com uma perícia inválida', () => {
  const c = criarConteudo() as SheetContent;
  c.pericias.arcanismo.descricao = 'Texto salvo';
  assert.deepEqual(valid(c), []);
  c.pericias.arcanismo = null as never;
  assert.doesNotThrow(() => valid(c));
  assert.ok(valid(c).some((e) => e.campo.startsWith('pericias.arcanismo')));
});
