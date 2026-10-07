import { test, expect } from '@playwright/test';
import { backend } from './backend';
import { chatBackend } from './chat-backend';

test('mesa compacta acompanha o fim da conversa sem cobrir mensagens ou envio', async ({
  page,
}) => {
  await backend(page);
  const chat = await chatBackend(page);
  chat.rollResult = {
    regras: 1,
    expressao: '6d6',
    total: 21,
    termos: [
      {
        sinal: 1,
        faces: 6,
        dados: [1, 2, 3, 4, 5, 6],
        selecionados: [1, 2, 3, 4, 5, 6],
        subtotal: 21,
      },
    ],
  };
  await page.goto('app.html#/chat');
  await page.getByLabel('Mensagem ou comando de dados').fill('/r 6d6');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  const panel = page.locator('.dice-accordion');
  const tray = page.getByRole('region', { name: 'Dados 3D' });
  await expect(tray).toHaveAttribute('data-phase', 'concluida', { timeout: 15000 });
  await expect(page.getByRole('log').locator('.die')).toHaveCount(6);
  const bounds = await page.evaluate(() => {
    const box = (selector: string) => {
      const r = document.querySelector(selector)!.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width };
    };
    return {
      log: box('.chat-log'),
      last: box('.chat-message:last-child'),
      dice: box('.dice-accordion'),
      composer: box('.chat-composer'),
      viewport: innerWidth,
      page: document.documentElement.scrollWidth,
    };
  });
  // A última mensagem fica junto à mesa, mesmo quando o histórico é curto.
  expect(bounds.dice.top).toBeGreaterThanOrEqual(bounds.log.bottom);
  expect(bounds.dice.top - bounds.last.bottom).toBeLessThan(60);
  expect(bounds.dice.width).toBeLessThanOrEqual(380);
  expect(bounds.page).toBeLessThanOrEqual(bounds.viewport);
  if (test.info().project.name === 'desktop') {
    expect(bounds.composer.left).toBeGreaterThanOrEqual(bounds.dice.right);
    expect(Math.abs(bounds.composer.top - bounds.dice.top)).toBeLessThan(2);
  } else {
    expect(bounds.composer.top).toBeGreaterThanOrEqual(bounds.dice.bottom);
  }
  await expect(tray.locator('canvas')).toBeInViewport();
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `artifacts/chat-layout-audit/after-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.locator('.chat-room').screenshot({
    path: `artifacts/chat-layout-audit/chat-${test.info().project.name}.png`,
  });
  // O accordion continua operável por teclado e o envio fica acessível após recolher.
  const toggle = page.getByRole('button', { name: 'Mesa de dados 3D', exact: true });
  await toggle.focus();
  await toggle.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.getByLabel('Mensagem ou comando de dados').fill('Continuamos a aventura.');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Continuamos a aventura.');
  await page.screenshot({
    path: `artifacts/chat-layout-audit/collapsed-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test('ler histórico conserva a mesa e novas mensagens não interrompem a leitura', async ({
  page,
}) => {
  await backend(page);
  const chat = await chatBackend(page);
  chat.rows = Array.from({ length: 65 }, (_, i) =>
    chat.row(i + 1, { texto: 'Mensagem ' + (i + 1) }),
  );
  await page.goto('app.html#/chat');
  const log = page.getByRole('log');
  await expect(log.getByText('Mensagem 65', { exact: true })).toBeVisible();
  await expect
    .poll(() => log.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight))
    .toBeLessThan(2);
  const panel = page.locator('.dice-accordion');
  await panel.scrollIntoViewIfNeeded();
  const before = await panel.boundingBox();
  await log.evaluate((node) => {
    node.scrollTop = 0;
  });
  await expect.poll(() => log.evaluate((node) => node.scrollTop)).toBe(0);
  expect(await panel.boundingBox()).toEqual(before);
  const next = chat.row(66, { texto: 'Chegou uma mensagem recente.' });
  chat.rows.push(next);
  chat.publish(next);
  await expect(page.getByRole('button', { name: 'Ir para mensagens recentes' })).toBeVisible();
  await expect.poll(() => log.evaluate((node) => node.scrollTop)).toBe(0);
  await page.getByRole('button', { name: 'Ir para mensagens recentes' }).click();
  await expect(log.getByText('Chegou uma mensagem recente.', { exact: true })).toBeVisible();
  await expect
    .poll(() => log.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight))
    .toBeLessThan(2);
  await expect(page.getByRole('region', { name: 'Dados 3D' })).toBeVisible();
});
