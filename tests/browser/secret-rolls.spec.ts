import { test, expect } from '@playwright/test';
import { backend, campaignId } from './backend';
import { chatBackend } from './chat-backend';

test('rolagem secreta entrega só o aviso público; mestre revela o mesmo resultado depois', async ({
  page,
  context,
}) => {
  const player = await context.newPage();
  await backend(page, { master: true });
  await backend(player);
  const state = await chatBackend(page, undefined, { master: true });
  await chatBackend(player, state);
  state.rollResult = {
    regras: 1,
    expressao: '1d20+731',
    total: 748,
    termos: [
      { sinal: 1, faces: 20, dados: [17], selecionados: [1], subtotal: 17 },
      { sinal: 1, valor: 731, subtotal: 731 },
    ],
  };
  const deliveredToPlayer: string[] = [];
  player.on('response', async (response) => {
    if (/\/rest\/v1\/(mensagens_chat|rpc\/ler_segredos_chat)/.test(response.url()))
      deliveredToPlayer.push(await response.text());
  });
  player.on('websocket', (socket) =>
    socket.on('framereceived', ({ payload }) => deliveredToPlayer.push(String(payload))),
  );
  await page.goto('app.html#/chat');
  await player.goto('app.html#/chat');
  await expect(page.getByRole('status')).toHaveText('Ao vivo');
  await expect(player.getByRole('status')).toHaveText('Ao vivo');
  await page.getByLabel('Visibilidade da rolagem').selectOption({ label: 'Só mestres' });
  await page.getByLabel('Mensagem ou comando de dados').fill('/r 1d20+731');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(player.getByRole('log')).toContainText('Rolagem secreta');
  await expect(player.getByRole('log')).not.toContainText('1d20+731');
  await expect(player.getByRole('log')).not.toContainText('748');
  await expect(player.getByRole('region', { name: 'Dados 3D' }).locator('canvas')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Dados 3D' })).toHaveAttribute(
    'data-phase',
    'concluida',
    { timeout: 15000 },
  );
  await expect(page.getByRole('log')).toContainText('1d20+731');
  expect(state.commands[0]).toMatchObject({
    tipo: 'rolagem',
    expressao: '1d20+731',
    secreta: true,
  });
  expect(state.rows[1]).toMatchObject({
    secreta: true,
    rotulo: 'Rolagem secreta',
    resultado: null,
  });
  const beforeReveal = [...deliveredToPlayer];
  expect(beforeReveal.length).toBeGreaterThan(0);
  expect(beforeReveal.join('\n')).not.toContain('1d20+731');
  expect(beforeReveal.join('\n')).not.toMatch(/"total"\s*:\s*748\b/);
  await page.getByRole('button', { name: 'Revelar resultado', exact: true }).click();
  await expect(player.getByRole('log')).toContainText('1d20+731');
  await expect(player.getByRole('log').getByText('748', { exact: true })).toBeVisible();
  expect(state.rows).toHaveLength(3);
  expect(state.rows[2].resultado).toEqual(state.privateRolls.get(state.rows[1].id).resultado);
  const repeated = await page.evaluate(
    async ({ campaign, message }) => {
      const session = JSON.parse(localStorage.getItem('weirs-rpg-auth')!);
      const response = await fetch('https://weirs-test.supabase.co/rest/v1/rpc/revelar_rolagem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ p_campanha: campaign, p_mensagem: message }),
      });
      return response.json();
    },
    { campaign: campaignId, message: state.rows[1].id },
  );
  expect(repeated[0].id).toBe(state.rows[2].id);
  expect(state.rows).toHaveLength(3);
  await player.close();
});

test('comando /gmroll usa segredo e jogador não consegue usá-lo', async ({ page, context }) => {
  await backend(page, { master: true });
  const state = await chatBackend(page, undefined, { master: true });
  await page.goto('app.html#/chat');
  await page.getByLabel('Animar meus dados em 3D').uncheck();
  await page.getByLabel('Mensagem ou comando de dados').fill('/gmroll 2d6+3');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('2d6+3');
  expect(state.commands[0].secreta).toBe(true);
  const player = await context.newPage();
  await backend(player);
  await chatBackend(player, state);
  await player.goto('app.html#/chat');
  await expect(player.getByLabel('Visibilidade da rolagem')).toHaveCount(0);
  await player.getByLabel('Mensagem ou comando de dados').fill('/gmroll 1d20');
  await player.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(player.getByRole('alert')).toContainText('Somente o mestre');
  expect(state.rows).toHaveLength(2);
  await player.close();
});

test('histórico secreto é hidratado só para mestres e não reproduz animações antigas', async ({
  page,
  context,
}) => {
  await backend(page, { master: true });
  const state = await chatBackend(page, undefined, { master: true });
  const result = {
    regras: 1,
    expressao: '1d20+73',
    total: 90,
    termos: [
      { sinal: 1, faces: 20, dados: [17], selecionados: [1], subtotal: 17 },
      { sinal: 1, valor: 73, subtotal: 73 },
    ],
  };
  const marker = state.row(2, {
    tipo: 'rolagem',
    secreta: true,
    texto: 'O mestre realizou uma rolagem secreta.',
    rotulo: 'Rolagem secreta',
    resultado: null,
  });
  state.rows.push(marker);
  state.privateRolls.set(marker.id, {
    ...marker,
    rotulo: 'Percepção do espião',
    resultado: result,
  });
  await page.goto('app.html#/chat');
  await expect(page.getByRole('log')).toContainText('Percepção do espião');
  await expect(page.getByRole('log')).toContainText('1d20+73');
  await expect(page.getByRole('region', { name: 'Dados 3D' })).toHaveAttribute(
    'data-phase',
    'ociosa',
  );
  const player = await context.newPage();
  await backend(player);
  await chatBackend(player, state);
  await player.goto('app.html#/chat');
  await expect(player.getByRole('log')).toContainText('Rolagem secreta');
  await expect(player.getByRole('log')).not.toContainText('Percepção do espião');
  await expect(player.getByRole('log')).not.toContainText('1d20+73');
  await expect(player.getByRole('region', { name: 'Dados 3D' }).locator('canvas')).toHaveCount(0);
  await player.close();
});

test('perder o papel de mestre remove resultado privado da conversa e da janela de dados', async ({
  page,
}) => {
  const access = { master: true };
  await backend(page, access);
  const state = await chatBackend(page, undefined, access);
  state.rollResult = {
    regras: 1,
    expressao: '1d20+879',
    total: 896,
    termos: [
      { sinal: 1, faces: 20, dados: [17], selecionados: [1], subtotal: 17 },
      { sinal: 1, valor: 879, subtotal: 879 },
    ],
  };
  await page.goto('app.html#/chat');
  await page.getByLabel('Visibilidade da rolagem').selectOption({ label: 'Só mestres' });
  await page.getByLabel('Mensagem ou comando de dados').fill('/r 1d20+879');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Dados 3D' })).toHaveAttribute(
    'data-phase',
    'concluida',
    { timeout: 15000 },
  );
  await expect(page.getByRole('log')).toContainText('1d20+879');
  access.master = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByLabel('Visibilidade da rolagem')).toHaveCount(0);
  await expect(page.getByRole('log')).toContainText('Rolagem secreta');
  await expect(page.getByRole('log')).not.toContainText('1d20+879');
  await expect(page.getByRole('log')).not.toContainText('896');
  await expect(page.getByRole('button', { name: 'Revelar resultado', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Dados 3D' }).locator('canvas')).toHaveCount(0);
});
