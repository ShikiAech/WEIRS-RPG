import { test, expect } from '@playwright/test';
import { backend } from './backend';
import { chatBackend } from './chat-backend';
import { novaEntrada } from '../../packages/sheets/modelo.js';

test('rolagem confirmada anima modelos 3D e mostra os valores do servidor', async ({ page }) => {
  await backend(page);
  await chatBackend(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('app.html#/chat');
  await expect(page.getByLabel('Animar meus dados em 3D')).toBeChecked();
  await expect(page.getByRole('region', { name: 'Dados 3D' })).toHaveCount(0);
  await page.getByLabel('Mensagem ou comando de dados').fill('/r 2d6+3');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  const tray = page.getByRole('region', { name: 'Dados 3D' });
  await expect(tray).toBeVisible();
  await expect(tray.locator('canvas')).toBeVisible();
  await expect(tray).toHaveAttribute('data-phase', 'concluida', { timeout: 15000 });
  await expect(tray).toContainText('Resultado confirmado: 11');
  await expect(tray).toContainText('d6: 4, 4');
  await page.screenshot({ path: `artifacts/dice-${test.info().project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'Fechar dados 3D' }).click();
  await expect(tray).toHaveCount(0);
  await expect(page.getByRole('log')).toContainText('2d6+3');
});

test('histórico e Realtime não disparam animação; retry só anima a confirmação e sair limpa o palco', async ({
  page,
}) => {
  await backend(page);
  const chat = await chatBackend(page);
  const result = {
    regras: 1,
    expressao: '1d20',
    total: 18,
    termos: [{ sinal: 1, faces: 20, dados: [18], selecionados: [1], subtotal: 18 }],
  };
  chat.rows.push(
    chat.row(2, { tipo: 'rolagem', texto: '', rotulo: 'Rolagem antiga', resultado: result }),
  );
  await page.goto('app.html#/chat');
  await expect(page.getByRole('log')).toContainText('Rolagem antiga');
  const tray = page.getByRole('region', { name: 'Dados 3D' });
  await expect(tray).toHaveCount(0);
  chat.publish(
    chat.row(3, { tipo: 'rolagem', texto: '', rotulo: 'Outro jogador', resultado: result }),
  );
  await expect(page.getByRole('log')).toContainText('Outro jogador');
  await expect(tray).toHaveCount(0);
  chat.failAcknowledgement = true;
  await page.getByLabel('Mensagem ou comando de dados').fill('/r 2d6+3');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('confirmar', { timeout: 20000 });
  await expect(tray).toHaveCount(0);
  await page.getByRole('button', { name: 'Reenviar mesma tentativa' }).click();
  await expect(tray.locator('canvas')).toBeVisible();
  await expect(page.getByRole('log').getByText('2d6+3', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(tray).toHaveCount(0);
});

test('ações da ficha também animam o resultado confirmado e context loss mantém o chat', async ({
  page,
}) => {
  const state = await backend(page);
  await chatBackend(page);
  state.rows[0].conteudo.ataques.push({
    ...novaEntrada('ataques'),
    nome: 'Espada longa',
    valor: 7,
    dano: '1d8+4',
  });
  await page.goto('app.html#/fichas/' + state.rows[0].id);
  await page.getByRole('tab', { name: 'Combate', exact: true }).click();
  await page.getByRole('button', { name: 'Rolar ataque: Espada longa', exact: true }).click();
  const tray = page.getByRole('region', { name: 'Dados 3D' });
  await expect(tray.locator('canvas')).toBeVisible();
  await tray.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext();
  });
  await expect(tray).toContainText('Visualização 3D indisponível');
  await expect(page.getByText('Ação enviada ao chat.')).toBeVisible();
  await page.getByRole('link', { name: 'Ver no chat' }).click();
  await expect(tray).toHaveCount(0);
  await expect(page.getByRole('log')).toContainText('Zephira · Espada longa');
});

test('conjunto completo, percentuais e descartados usam os modelos gratuitos', async ({ page }) => {
  await backend(page);
  const chat = await chatBackend(page);
  const faces = [4, 6, 8, 10, 12, 20, 100];
  chat.rollResult = {
    regras: 1,
    expressao: '1d4+1d6+1d8+1d10+1d12+2d20kh1+1d100',
    total: 146,
    termos: faces.map((face) => ({
      sinal: 1,
      faces: face,
      dados: face === 20 ? [3, 18] : [face === 100 ? 88 : face],
      selecionados: face === 20 ? [2] : [1],
      subtotal: face === 20 ? 18 : face === 100 ? 88 : face,
    })),
  };
  await page.goto('app.html#/chat');
  await page
    .getByLabel('Mensagem ou comando de dados')
    .fill('/r 1d4+1d6+1d8+1d10+1d12+2d20kh1+1d100');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  const tray = page.getByRole('region', { name: 'Dados 3D' });
  await expect(tray).toHaveAttribute('data-phase', 'concluida', { timeout: 15000 });
  await expect(tray).toContainText('3 (descartado), 18');
  await expect(tray).toContainText('d100: 88');
  await page.screenshot({
    path: `artifacts/dice-set-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test('preferência desliga 3D, persiste e evita carregar o renderizador', async ({ page }) => {
  await backend(page);
  await chatBackend(page);
  const models: string[] = [];
  page.on('request', (r) => {
    if (
      /\/dice\/(models\.json|diffuse-light\.png)/.test(r.url()) ||
      r.url().includes('/dice/renderer.ts')
    )
      models.push(r.url());
  });
  await page.goto('app.html#/chat');
  await page.getByLabel('Animar meus dados em 3D').uncheck();
  await page.reload();
  await expect(page.getByLabel('Animar meus dados em 3D')).not.toBeChecked();
  await page.getByLabel('Mensagem ou comando de dados').fill('/r 2d6+3');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('2d6+3');
  await expect(page.getByRole('region', { name: 'Dados 3D' })).toHaveCount(0);
  expect(models).toEqual([]);
});

test('movimento reduzido e falha dos modelos preservam a rolagem no chat', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await backend(page);
  await chatBackend(page);
  await page.goto('app.html#/chat');
  await page.getByLabel('Mensagem ou comando de dados').fill('/r 2d6+3');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('2d6+3');
  await expect(page.getByRole('region', { name: 'Dados 3D' })).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route('**/dice/models.json', (route) => route.abort());
  await page.getByLabel('Mensagem ou comando de dados').fill('/r 2d6+3');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  const tray = page.getByRole('region', { name: 'Dados 3D' });
  await expect(tray).toContainText('Visualização 3D indisponível');
  await expect(page.getByRole('log').getByText('2d6+3', { exact: true })).toHaveCount(2);
  await page.getByRole('link', { name: 'Campanhas', exact: true }).click();
  await expect(tray).toHaveCount(0);
});

test('navegador sem WebGL mantém envio e resultado sem erro de JavaScript', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...args: any[]
    ) {
      if (kind.startsWith('webgl') || kind === 'experimental-webgl') return null;
      return (original as any).call(this, kind, ...args);
    } as typeof original;
  });
  await backend(page);
  await chatBackend(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('app.html#/chat');
  await page.getByLabel('Mensagem ou comando de dados').fill('/r 2d6+3');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Dados 3D' })).toContainText(
    'Visualização 3D indisponível',
  );
  await expect(page.getByRole('log')).toContainText('2d6+3');
  await expect(page.getByLabel('Mensagem ou comando de dados')).toHaveValue('');
  expect(errors).toEqual([]);
});

test('desligar 3D durante envio pendente não reapresenta o resultado ao religar', async ({
  page,
}) => {
  await backend(page);
  const chat = await chatBackend(page);
  let release!: () => void;
  chat.acknowledgementGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.goto('app.html#/chat');
  await page.getByLabel('Mensagem ou comando de dados').fill('/r 2d6+3');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect.poll(() => chat.commands.length).toBe(1);
  await page.getByLabel('Animar meus dados em 3D').uncheck();
  release();
  await expect(page.getByLabel('Mensagem ou comando de dados')).toHaveValue('');
  await page.getByLabel('Animar meus dados em 3D').check();
  await expect(page.getByRole('region', { name: 'Dados 3D' })).toHaveCount(0);
});
