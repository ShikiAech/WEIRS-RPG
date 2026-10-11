import { test, expect } from '@playwright/test';
import { backend } from './backend';
import { chatBackend } from './chat-backend';
import { novaEntrada } from '../../packages/sheets/modelo.js';

test('rolagem confirmada anima modelos 3D e mostra os valores do servidor', async ({ page }) => {
  await backend(page);
  await chatBackend(page);
  // Observe the camera sent to WebGL, rather than a second React render or an asset fetch.
  await page.addInitScript(() => {
    const probe = {
      projections: [] as number[][],
      cameraTravel: [] as number[],
      heights: [] as number[],
      canvases: 0,
    };
    (window as any).diceMotionProbe = probe;
    const names = new WeakMap<WebGLUniformLocation, string>();
    const originalLocation = WebGL2RenderingContext.prototype.getUniformLocation;
    WebGL2RenderingContext.prototype.getUniformLocation = function (program, name) {
      const location = originalLocation.call(this, program, name);
      if (location) names.set(location, name);
      return location;
    };
    const originalMatrix = WebGL2RenderingContext.prototype.uniformMatrix4fv;
    WebGL2RenderingContext.prototype.uniformMatrix4fv = function (location, transpose, value) {
      if (location && names.get(location) === 'projectionMatrix') {
        const matrix = Array.from(value);
        const canvas = this.canvas as HTMLCanvasElement;
        // The shadow camera is square; select the projection for the visible tray.
        if (Math.abs(matrix[0] / matrix[5] - canvas.height / canvas.width) < 0.002)
          probe.projections.push([matrix[0], matrix[5], matrix[12], matrix[13]]);
      }
      if (location && names.get(location) === 'modelMatrix') {
        const matrix = Array.from(value);
        // Both dice share the vertical arc; exclude the floor.
        if (matrix[13] > 0.1) probe.heights.push(matrix[13]);
      }
      if (location && names.get(location) === 'viewMatrix') {
        const matrix = Array.from(value);
        // The tray camera preserves its X axis; the angled shadow camera does not.
        if (Math.abs(matrix[0] - 1) < 0.000001) probe.cameraTravel.push(matrix[12]);
      }
      originalMatrix.call(this, location, transpose, value);
    };
    new MutationObserver((mutations) => {
      for (const mutation of mutations)
        for (const node of mutation.addedNodes)
          if (node instanceof HTMLCanvasElement) probe.canvases++;
    }).observe(document, { childList: true, subtree: true });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('app.html#/chat');
  await expect(page.getByLabel('Animar meus dados em 3D')).toBeChecked();
  await expect(page.getByRole('region', { name: 'Dados 3D' })).toHaveAttribute(
    'data-phase',
    'ociosa',
  );
  await page.getByLabel('Mensagem ou comando de dados').fill('/r 2d6+3');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  const tray = page.getByRole('region', { name: 'Dados 3D' });
  await expect(tray).toBeVisible();
  await expect(tray.locator('canvas')).toBeVisible();
  await expect(tray).toHaveAttribute('data-phase', 'concluida', { timeout: 15000 });
  await expect(tray).toContainText('Resultado confirmado: 11');
  await expect(tray).toContainText('d6: 4, 4');
  const probe = await page.evaluate(() => (window as any).diceMotionProbe);
  await test.info().attach('dice-motion', {
    body: JSON.stringify(probe),
    contentType: 'application/json',
  });
  expect(probe.canvases).toBe(1);
  expect(probe.projections.length).toBeGreaterThan(0);
  expect(new Set(probe.projections.map((matrix: number[]) => matrix.join(','))).size).toBe(1);
  expect(probe.cameraTravel.length).toBeGreaterThan(1);
  expect(Math.max(...probe.cameraTravel) - Math.min(...probe.cameraTravel)).toBeGreaterThan(1);
  for (let i = 1; i < probe.cameraTravel.length; i++)
    expect(probe.cameraTravel[i] - probe.cameraTravel[i - 1]).toBeLessThanOrEqual(0.001);
  expect(probe.heights.length).toBeGreaterThan(0);
  let descending = false;
  let secondLaunch = false;
  for (let i = 1; i < probe.heights.length; i++) {
    const difference = probe.heights[i] - probe.heights[i - 1];
    if (difference < -0.001) descending = true;
    if (descending && difference > 0.001) secondLaunch = true;
  }
  expect(descending).toBe(true);
  expect(Math.max(...probe.heights) - Math.min(...probe.heights)).toBeGreaterThan(0.2);
  expect(secondLaunch).toBe(false);
  await page.screenshot({ path: `artifacts/dice-${test.info().project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'Mesa de dados 3D', exact: true }).click();
  await expect(tray).toBeHidden();
  await expect(page.getByRole('log')).toContainText('2d6+3');
});

test('histórico e eventos fora do envio não animam; confirmação Realtime e retry não duplicam a animação', async ({
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
  await expect(tray).toHaveAttribute('data-phase', 'ociosa');
  const external = chat.row(3, {
    tipo: 'rolagem',
    texto: '',
    rotulo: 'Outro jogador',
    resultado: result,
  });
  chat.rows.push(external);
  chat.publish(external);
  await expect(page.getByRole('log')).toContainText('Outro jogador');
  await expect(tray).toHaveAttribute('data-phase', 'ociosa');
  chat.failAcknowledgement = true;
  await page.getByLabel('Mensagem ou comando de dados').fill('/r 2d6+3');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('confirmar', { timeout: 20000 });
  await expect(tray.locator('canvas')).toBeVisible();
  await expect(tray).toHaveAttribute('data-phase', 'concluida');
  await page.getByRole('button', { name: 'Reenviar mesma tentativa' }).click();
  await expect(page.getByLabel('Mensagem ou comando de dados')).toHaveValue('');
  await expect(tray).toHaveAttribute('data-phase', 'concluida');
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
  await expect(tray).toHaveAttribute('data-phase', 'ociosa');
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
  await expect(page.getByRole('region', { name: 'Dados 3D' }).locator('canvas')).toHaveCount(0);
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
  await expect(page.getByRole('region', { name: 'Dados 3D' }).locator('canvas')).toHaveCount(0);
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
  await expect(page.getByRole('region', { name: 'Dados 3D' })).not.toHaveAttribute(
    'data-phase',
    'rolando',
  );
});
