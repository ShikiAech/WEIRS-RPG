import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { mesaFixture } from './sql/mesa-fixture';
import { novaEntrada } from '../packages/sheets/modelo.js';

async function fixture() {
  const f = await mesaFixture(['202610110005_rolagens_secretas.sql']);
  try {
    await f.db.exec(
      await readFile(new URL('./sql/storage-bootstrap.sql', import.meta.url), 'utf8'),
    );
    const names = (await readdir(new URL('../supabase/migrations/', import.meta.url)))
      .filter((x) => x >= '202610110006' && x.endsWith('.sql'))
      .sort();
    for (const name of names)
      await f.db.exec(
        await readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'),
      );
    const source = (
      await f.db.query<{ conteudo: any }>('SELECT conteudo FROM public.fichas WHERE id=$1', [
        f.sheet,
      ])
    ).rows[0].conteudo;
    source.atributos.int.valor = 18;
    source.atributos.int.ajusteModificador = -1;
    const spell = {
      ...novaEntrada('magias'),
      nome: 'Chama gelada',
      dano: '9999',
      danos: [
        { id: crypto.randomUUID(), dado: '1d6+1', atributo: 'int', tipo: 'Frio' },
        { id: crypto.randomUUID(), dado: '2d4', atributo: '', tipo: 'Fogo' },
        { id: crypto.randomUUID(), dado: '-2', atributo: '', tipo: 'Necrótico' },
      ],
    };
    source.magias.push(spell);
    await f.db.query('UPDATE public.fichas SET conteudo=$1,versao=versao+1 WHERE id=$2', [
      source,
      f.sheet,
    ]);
    const roll = (uid: string, request = crypto.randomUUID(), extra = {}) =>
      f
        .user(uid, 'SELECT * FROM public.enviar_chat($1,$2,$3)', [
          f.campaign,
          request,
          {
            tipo: 'acao',
            ficha_id: f.sheet,
            versao: 2,
            entrada_id: spell.id,
            acao: 'magia_dano',
            modo: 'normal',
            ...extra,
          },
        ])
        .then((rows) => rows[0]);
    return { ...f, spell, source, roll };
  } catch (e) {
    await f.db.close();
    throw e;
  }
}
test('dano de magia usa parcelas da ficha salva e os mesmos dados para cada subtotal', async () => {
  const { db, player, outsider, spectator, roll, spell } = await fixture();
  try {
    const request = crypto.randomUUID(),
      message = await roll(player, request),
      result = message.resultado;
    assert.equal(result.expressao, '1d6+1+3+2d4-2');
    assert.deepEqual(
      result.parcelas.map((p: any) => p.tipo),
      ['Frio', 'Fogo', 'Necrótico'],
    );
    assert.equal(result.parcelas[0].total, result.termos[0].subtotal + 4);
    assert.equal(result.parcelas[1].total, result.termos[3].subtotal);
    assert.equal(result.parcelas[2].total, -2);
    assert.equal(
      result.total,
      result.parcelas.reduce((sum: number, p: any) => sum + p.total, 0),
    );
    assert.equal(result.origem.entrada_id, spell.id);
    assert.deepEqual(await roll(player, request), message);
    await assert.rejects(roll(outsider), { code: 'WC002' });
    await assert.rejects(roll(spectator), { code: 'WC002' });
    await db.query('INSERT INTO public.administradores(usuario_id) VALUES($1)', [outsider]);
    const admin = await roll(outsider);
    assert.equal(admin.resultado.expressao, '1d6+1+3+2d4-2');
    assert.equal(admin.resultado.parcelas.length, 3);
    await assert.rejects(roll(player, crypto.randomUUID(), { versao: 1 }), { code: 'WC005' });
    await assert.rejects(roll(player, crypto.randomUUID(), { modo: 'vantagem' }), {
      code: 'WC003',
    });
  } finally {
    await db.close();
  }
});
test('subtotais secretos são preservados na revelação e não vazam na linha pública', async () => {
  const { db, gm, player, campaign, user, roll } = await fixture();
  try {
    const message = await roll(gm, crypto.randomUUID(), { secreta: true });
    assert.equal(message.resultado.parcelas.length, 3);
    const publicRow = (
      await user(player, 'SELECT * FROM public.mensagens_chat WHERE id=$1', [message.id])
    )[0];
    assert.equal(publicRow.resultado, null);
    const revealed = (
      await user(gm, 'SELECT * FROM public.revelar_rolagem($1,$2)', [campaign, message.id])
    )[0];
    assert.deepEqual(revealed.resultado, message.resultado);
  } finally {
    await db.close();
  }
});
test('limites de todas as parcelas são conjuntos e a fórmula antiga segue disponível', async () => {
  const { db, player, source, sheet, spell, roll } = await fixture();
  try {
    source.magias[0].danos[0].dado = '60d6';
    source.magias[0].danos[1].dado = '60d6';
    await db.query('UPDATE public.fichas SET conteudo=$1,versao=versao+1 WHERE id=$2', [
      source,
      sheet,
    ]);
    await assert.rejects(roll(player, crypto.randomUUID(), { versao: 3 }), { code: 'WC003' });
    delete source.magias[0].danos;
    source.magias[0].dano = '2d6+3';
    source.magias[0].tipoDano = 'Fogo';
    await db.query('UPDATE public.fichas SET conteudo=$1,versao=versao+1 WHERE id=$2', [
      source,
      sheet,
    ]);
    const legacy = await roll(player, crypto.randomUUID(), { versao: 4 });
    assert.equal(legacy.resultado.expressao, '2d6+3');
    assert.equal(legacy.resultado.parcelas[0].tipo, 'Fogo');
    assert.equal(legacy.resultado.parcelas[0].id, spell.id);
  } finally {
    await db.close();
  }
});

test('sinais iniciais e alterações de atributo conservam a fronteira entre parcelas', async () => {
  const { db, player, source, sheet, roll } = await fixture();
  try {
    source.magias[0].danos[0].dado = '+1d6+1';
    source.magias[0].danos[1].dado = '+2d4';
    await db.query('UPDATE public.fichas SET conteudo=$1,versao=versao+1 WHERE id=$2', [
      source,
      sheet,
    ]);
    const first = await roll(player, crypto.randomUUID(), { versao: 3 });
    assert.equal(first.resultado.expressao, '1d6+1+3+2d4-2');
    source.atributos.int.valor = 8;
    await db.query('UPDATE public.fichas SET conteudo=$1,versao=versao+1 WHERE id=$2', [
      source,
      sheet,
    ]);
    const second = await roll(player, crypto.randomUUID(), { versao: 4 });
    assert.equal(second.resultado.expressao, '1d6+1-2+2d4-2');
    assert.equal(second.resultado.parcelas[0].total, second.resultado.termos[0].subtotal - 1);
  } finally {
    await db.close();
  }
});
