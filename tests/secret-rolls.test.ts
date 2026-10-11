import test from 'node:test';
import assert from 'node:assert/strict';
import { mesaFixture } from './sql/mesa-fixture';

test('rolagem secreta não aparece no SELECT público, só mestres recuperam e revelar não rerrola', async () => {
  const f = await mesaFixture(['202610110005_rolagens_secretas.sql']);
  const { db, gm, player, outsider, campaign, user } = f;
  const request = crypto.randomUUID(),
    command = { tipo: 'rolagem', expressao: '2d20kh1+9', rotulo: 'NPC secreto', secreta: true };
  const send = (id: string) =>
    user(id, 'SELECT * FROM public.enviar_chat($1,$2,$3)', [campaign, request, command]).then(
      (r) => r[0],
    );
  const denied = (p: Promise<unknown>, code: string) =>
    assert.rejects(p, (e: any) => e.code === code);
  try {
    const rolled = await send(gm);
    assert.equal(rolled.secreta, true);
    assert.equal(rolled.resultado.expressao, command.expressao);
    const visible = (
      await user(player, 'SELECT * FROM public.mensagens_chat WHERE id=$1', [rolled.id])
    )[0];
    assert.equal(visible.resultado, null);
    assert.equal(visible.rotulo, 'Rolagem secreta');
    assert.ok(!JSON.stringify(visible).includes('NPC secreto'));
    assert.ok(!JSON.stringify(visible).includes('2d20'));
    await denied(user(player, 'SELECT * FROM private.rolagens_secretas'), '42501');
    const secrets = (id: string) =>
      user(id, 'SELECT public.ler_segredos_chat($1,$2) AS result', [campaign, [rolled.id]]).then(
        (r) => r[0].result,
      );
    assert.deepEqual(await secrets(player), []);
    assert.equal((await secrets(gm))[0].resultado.total, rolled.resultado.total);
    await denied(secrets(outsider), 'WC002');
    await denied(send(player), 'WC002');
    assert.deepEqual(await send(gm), rolled);
    await denied(
      user(gm, 'SELECT * FROM public.enviar_chat($1,$2,$3)', [
        campaign,
        crypto.randomUUID(),
        {
          tipo: 'acao',
          ficha_id: f.sheet,
          versao: 1,
          entrada_id: 'iniciativa',
          acao: 'iniciativa',
          modo: 'normal',
          secreta: true,
        },
      ]),
      'WC003',
    );
    const reveal = (id: string) =>
      user(id, 'SELECT * FROM public.revelar_rolagem($1,$2)', [campaign, rolled.id]).then(
        (r) => r[0],
      );
    await denied(reveal(player), 'WC002');
    const shown = await reveal(gm);
    assert.equal(shown.secreta, false);
    assert.deepEqual(shown.resultado, rolled.resultado);
    assert.notEqual(shown.id, rolled.id);
    assert.deepEqual(await reveal(gm), shown);
    assert.equal(
      (await user(player, 'SELECT * FROM public.mensagens_chat WHERE id=$1', [shown.id]))[0]
        .resultado.total,
      rolled.resultado.total,
    );
    await db.query(
      "UPDATE public.membros_campanha SET papel='jogador' WHERE campanha_id=$1 AND usuario_id=$2",
      [campaign, gm],
    );
    assert.deepEqual(await secrets(gm), []);
    await denied(send(gm), 'WC002');
    await denied(reveal(gm), 'WC002');
  } finally {
    await db.close();
  }
});
