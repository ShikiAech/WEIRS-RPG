import { test, expect } from '@playwright/test';
import { backend } from './backend';
import { chatBackend } from './chat-backend';

test('accordion pertence ao chat e só revela os números ao terminar, mesmo com Realtime antes da RPC', async ({
  page,
}) => {
  await backend(page);
  const chat = await chatBackend(page);
  let acknowledge!: () => void;
  chat.acknowledgementGate = new Promise<void>((resolve) => {
    acknowledge = resolve;
  });
  let load!: () => void;
  const assets = new Promise<void>((resolve) => {
    load = resolve;
  });
  await page.route('**/dice/models.json', async (route) => {
    await assets;
    await route.continue();
  });
  await page.goto('app.html#/chat');
  const accordion = page.getByRole('button', { name: 'Mesa de dados 3D', exact: true });
  await expect(accordion).toHaveAttribute('aria-expanded', 'true');
  const panel = page.getByRole('region', { name: 'Dados 3D' });
  await expect(page.locator('.chat-room').getByRole('region', { name: 'Dados 3D' })).toBeVisible();
  await page.getByLabel('Mensagem ou comando de dados').fill('/r 2d6+3');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Rolando dados…');
  await expect(page.getByRole('log').locator('.roll-total')).toHaveCount(0);
  await expect(page.getByRole('log').locator('.dice-breakdown')).toHaveCount(0);
  await expect(panel).not.toContainText('Resultado confirmado:');
  // A consulta de recuperação também vê o registro enquanto a resposta HTTP está pendente.
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  acknowledge();
  await expect(page.getByLabel('Mensagem ou comando de dados')).toHaveValue('');
  await expect(page.getByRole('log').locator('.roll-total')).toHaveCount(0);
  load();
  await expect(panel.locator('canvas')).toBeInViewport();
  await expect(panel).toHaveAttribute('data-phase', 'concluida', { timeout: 15000 });
  await expect(panel).toContainText('Resultado confirmado: 11');
  await expect(page.getByRole('log').locator('.roll-total')).toHaveText('Total11');
  await expect(page.getByRole('log').locator('.die')).toHaveCount(2);
  // O painel concluído permanece e não fica sobreposto à página.
  const before = await panel.boundingBox();
  await expect(panel).toHaveCSS('position', 'static');
  await page.waitForTimeout(4700);
  await expect(panel.locator('canvas')).toBeVisible();
  expect((await panel.boundingBox())?.height).toBe(before?.height);
  await accordion.click();
  await expect(accordion).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();
  await accordion.click();
  await expect(panel).toContainText('Resultado confirmado: 11');
  await expect(panel).toHaveAttribute('data-phase', 'concluida');
  await expect(panel.locator('canvas')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `artifacts/dice-accordion-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test('recolher durante animação libera o resultado, guarda preferência e não trava o chat', async ({
  page,
}) => {
  await backend(page);
  await chatBackend(page);
  await page.goto('app.html#/chat');
  await page.getByLabel('Mensagem ou comando de dados').fill('/r 2d6+3');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Rolando dados…');
  const accordion = page.getByRole('button', { name: 'Mesa de dados 3D', exact: true });
  await accordion.click();
  await expect(page.getByRole('log').locator('.roll-total')).toHaveText('Total11');
  await page.reload();
  await expect(accordion).toHaveAttribute('aria-expanded', 'false');
  await page.getByLabel('Mensagem ou comando de dados').fill('/r 2d6+3');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('log').locator('.roll-total')).toHaveCount(2);
  await expect(page.getByRole('log')).not.toContainText('Rolando dados…');
});

test('consulta de recuperação confirma resposta perdida sem revelar números antes da animação', async ({
  page,
}) => {
  await backend(page);
  const chat = await chatBackend(page);
  chat.publishOnSend = false;
  chat.failAcknowledgement = true;
  let load!: () => void;
  const gate = new Promise<void>((resolve) => {
    load = resolve;
  });
  await page.route('**/dice/models.json', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('app.html#/chat');
  await page.getByLabel('Mensagem ou comando de dados').fill('/r 2d6+3');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('confirmar');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByRole('log')).toContainText('Rolando dados…');
  await expect(page.getByRole('log').locator('.roll-total')).toHaveCount(0);
  load();
  await expect(page.getByRole('log').locator('.roll-total')).toHaveText('Total11', {
    timeout: 15000,
  });
  await page.getByRole('button', { name: 'Reenviar mesma tentativa' }).click();
  await expect(page.getByLabel('Mensagem ou comando de dados')).toHaveValue('');
  await expect(page.getByRole('region', { name: 'Dados 3D' })).toHaveAttribute(
    'data-phase',
    'concluida',
  );
});

test('duas rolagens consecutivas esperam cada animação; recolher libera toda a fila', async ({
  page,
}) => {
  await backend(page);
  await chatBackend(page);
  let load!: () => void;
  const gate = new Promise<void>((resolve) => {
    load = resolve;
  });
  await page.route('**/dice/models.json', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('app.html#/chat');
  for (let i = 0; i < 2; i++) {
    await page.getByLabel('Mensagem ou comando de dados').fill('/r 2d6+3');
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    await expect(page.getByLabel('Mensagem ou comando de dados')).toHaveValue('');
  }
  await expect(page.getByRole('log').getByText('Rolando dados…', { exact: true })).toHaveCount(2);
  load();
  await expect(page.getByRole('log').locator('.roll-total')).toHaveCount(1, { timeout: 15000 });
  await expect(page.getByRole('log').getByText('Rolando dados…', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Mesa de dados 3D' }).click();
  await expect(page.getByRole('log').locator('.roll-total')).toHaveCount(2);
  await expect(page.getByRole('log')).not.toContainText('Rolando dados…');
});
