import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mesaFixture } from './sql/mesa-fixture';
import { criarConteudo, novaEntrada, validarFicha } from '../packages/sheets/modelo.js';
import {
  novoAtaqueEquipamento,
  novoEquipamento,
  sincronizarEquipamentos,
} from '../packages/sheets/equipamentos.js';
import type { SheetContent } from '../packages/contracts/sheets';

test('venda parcial preserva ações e venda final limpa vínculos de equipamento atomicamente', async () => {
  const { db, gm, player, campaign, sheet, user } = await mesaFixture();
  try {
    const migration = await readFile(
      new URL('../supabase/migrations/202610120008_ficha.sql', import.meta.url),
      'utf8',
    ).catch((e) => {
      if (e.code === 'ENOENT') return '';
      throw e;
    });
    if (migration) await db.exec(migration);
    const c: SheetContent = criarConteudo(),
      item = { ...novoEquipamento(), nome: 'Arma solar', quantidade: 2, tipo: 'arma' as const };
    c.inventario.itens.push(item);
    c.ataques.push({ ...novaEntrada('ataques'), nome: 'Soco', dano: '1d4' });
    c.ataques.push(novoAtaqueEquipamento(item));
    c.recursos.push({ ...novaEntrada('recursos'), nome: 'Fôlego', maximo: 2 });
    c.recursos.push({
      ...novaEntrada('recursos'),
      nome: 'Carga solar',
      maximo: 3,
      itemId: item.id,
    });
    await user(player, 'SELECT * FROM public.salvar_ficha($1,1,$2,$3,1)', [
      sheet,
      'Herói',
      sincronizarEquipamentos(c),
    ]);
    const offer = crypto.randomUUID();
    const operate = async (actor: string, cmd: unknown, request = crypto.randomUUID()) =>
      (
        await user(actor, 'SELECT public.operar_mesa($1,$2,$3) AS result', [campaign, request, cmd])
      )[0].result;
    await operate(gm, {
      tipo: 'loja',
      versao: 0,
      aberta: true,
      nome: 'Loja',
      ofertas: [{ id: offer, nome: item.nome, preco: 100, venda: 50, estoque: 0 }],
    });
    const sell = {
      tipo: 'vender',
      ficha_id: sheet,
      versao: 2,
      oferta_id: offer,
      item_id: item.id,
      quantidade: 1,
      preco_unitario: 50,
    };
    const partial = await operate(player, sell);
    assert.equal(partial.ficha.conteudo.inventario.itens[0].quantidade, 1);
    assert.equal(partial.ficha.conteudo.ataques.length, 2);
    assert.equal(partial.ficha.conteudo.recursos.length, 2);
    const request = crypto.randomUUID(),
      command = { ...sell, versao: 3 };
    const final = await operate(player, command, request);
    assert.equal(final.ficha.conteudo.inventario.itens.length, 0);
    assert.deepEqual(
      final.ficha.conteudo.ataques.map((a: any) => a.nome),
      ['Soco'],
    );
    assert.deepEqual(
      final.ficha.conteudo.recursos.map((r: any) => r.nome),
      ['Fôlego'],
    );
    assert.deepEqual(validarFicha({ ...final.ficha, versao_esquema: 1 }), []);
    assert.deepEqual(await operate(player, command, request), final);
  } finally {
    await db.close();
  }
});
