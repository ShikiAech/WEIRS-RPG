import { test, expect, type Page } from '@playwright/test';
import { backend } from './backend';
import { chatBackend } from './chat-backend';
import { sessionBackend } from './session-backend';
import { tabletopBackend } from './tabletop-backend';

async function openSheet(page: Page, readonly = false) {
  const sheets = await backend(page, { readonly });
  const chat = await chatBackend(page, undefined, { readonly });
  const session = await sessionBackend(page, sheets, chat);
  await tabletopBackend(page, sheets, chat);
  sheets.rows[0].conteudo.combate.pvMaximos = 20;
  sheets.rows[0].conteudo.combate.pvAtuais = 20;
  await page.goto('app.html#/chat');
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  await page.getByRole('button', { name: 'Minha ficha', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Ficha durante a sessão' })).toContainText(
    'PV 20/20',
  );
  return { sheets, chat, session };
}

test('ficha atravessa o mapa até o chat e o topo da tela por arraste e teclado', async ({
  page,
}) => {
  await openSheet(page);
  const floating = page.locator('.session-floating');
  const grip = page.getByRole('button', { name: 'Mover Ficha do personagem', exact: true });
  const initial = (await floating.boundingBox())!;
  const handle = (await grip.boundingBox())!;
  const viewport = page.viewportSize()!;
  const targetX = viewport.width - initial.width - 4;
  const start = { x: handle.x + 20, y: handle.y + 10 };
  const end = { x: targetX + start.x - initial.x, y: 4 + start.y - initial.y };
  if (test.info().project.name === 'mobile') {
    const touch = await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    for (let step = 1; step <= 12; step++)
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          {
            x: start.x + ((end.x - start.x) * step) / 12,
            y: start.y + ((end.y - start.y) * step) / 12,
          },
        ],
      });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touch.detach();
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 12 });
    await page.mouse.up();
  }
  await expect.poll(async () => Math.round((await floating.boundingBox())!.y)).toBe(4);
  await expect
    .poll(async () => Math.round((await floating.boundingBox())!.x))
    .toBe(Math.round(targetX));
  await floating.getByRole('button', { name: 'Pop Out', exact: true }).click({ trial: true });
  await grip.focus();
  await grip.press('ArrowDown');
  await expect.poll(async () => Math.round((await floating.boundingBox())!.y)).toBe(24);
  await floating.getByRole('button', { name: 'Recolher Ficha do personagem', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Ficha durante a sessão' })).toBeHidden();
  if (test.info().project.name === 'mobile') {
    await page.getByRole('button', { name: 'Chat', exact: true }).click();
    await expect(floating).toBeVisible();
  }
  await floating.getByRole('button', { name: 'Expandir Ficha do personagem', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Ficha durante a sessão' })).toBeVisible();
  await page.screenshot({
    path: `artifacts/sheet-window-drag-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test('Pop Out abre janela real e preserva campos, atualizações, ações e retorno', async ({
  page,
}) => {
  const { sheets, chat, session } = await openSheet(page);
  const sheet = page.getByRole('complementary', { name: 'Ficha durante a sessão' });
  await sheet.getByLabel('Quantidade de PV', { exact: true }).fill('3');
  const titlebar = page.locator('.session-floating .floating-titlebar');
  const pop = titlebar.getByRole('button', { name: 'Pop Out', exact: true });
  const collapse = titlebar.getByRole('button', {
    name: 'Recolher Ficha do personagem',
    exact: true,
  });
  const popBox = (await pop.boundingBox())!;
  const collapseBox = (await collapse.boundingBox())!;
  expect(collapseBox.x - popBox.x - popBox.width).toBeGreaterThanOrEqual(6);
  const popupPromise = page.waitForEvent('popup');
  await pop.click();
  const popup = await popupPromise;
  expect(popup.url()).toBe('about:blank');
  const detached = popup.getByRole('complementary', { name: 'Ficha durante a sessão' });
  await expect(detached).toBeVisible();
  await expect(detached.getByLabel('Quantidade de PV', { exact: true })).toHaveValue('3');
  await expect(sheet).toHaveCount(0);
  await expect(popup.locator('.floating-titlebar')).toHaveCSS('display', 'flex');
  await detached.getByRole('button', { name: 'Aplicar dano', exact: true }).click();
  await expect(detached).toContainText('PV 17/20');
  expect(session.operations.at(-1)?.command).toMatchObject({ tipo: 'pv', expressao: '3' });
  await detached.getByRole('button', { name: 'Força +0', exact: true }).click();
  await expect.poll(() => chat.commands.length).toBe(1);
  expect(chat.commands[0]).toMatchObject({ tipo: 'acao', acao: 'atributo', versao: 2 });
  await expect(page.getByRole('region', { name: 'Dados 3D' })).toHaveAttribute(
    'data-phase',
    'concluida',
    { timeout: 15000 },
  );
  sheets.rows[0].conteudo.combate.pvAtuais = 12;
  sheets.rows[0].versao++;
  await popup.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(detached).toContainText('PV 12/20');
  await detached.getByRole('button', { name: 'Inventário', exact: true }).click();
  await popup.screenshot({
    path: `artifacts/sheet-window-popup-${test.info().project.name}.png`,
    fullPage: true,
  });
  await popup.getByRole('button', { name: 'Trazer ficha de volta', exact: true }).click();
  await expect.poll(() => popup.isClosed()).toBe(true);
  await expect(sheet).toContainText('PV 12/20');
  await expect(sheet.getByRole('button', { name: 'Inventário', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(sheet.getByLabel('Quantidade de PV', { exact: true })).toHaveValue('3');
  await page.screenshot({
    path: `artifacts/sheet-window-return-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test('fechar a janela devolve a ficha com o estado local e sair da mesa fecha a janela', async ({
  page,
}) => {
  await openSheet(page);
  const sheet = page.getByRole('complementary', { name: 'Ficha durante a sessão' });
  await sheet.getByRole('button', { name: 'Recursos', exact: true }).click();
  let opening = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Pop Out', exact: true }).click();
  let popup = await opening;
  await expect(popup.getByRole('complementary', { name: 'Ficha durante a sessão' })).toBeVisible();
  await popup.close();
  await expect(sheet.getByRole('button', { name: 'Recursos', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  opening = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Pop Out', exact: true }).click();
  popup = await opening;
  await expect(popup.getByRole('complementary', { name: 'Ficha durante a sessão' })).toBeVisible();
  await page.goto('app.html#/campanhas');
  await expect.poll(() => popup.isClosed()).toBe(true);
});

test('encerrar a página principal também encerra a ficha destacada', async ({ page }) => {
  await openSheet(page);
  const opening = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Pop Out', exact: true }).click();
  const popup = await opening;
  await expect(popup.getByRole('complementary', { name: 'Ficha durante a sessão' })).toBeVisible();
  await page.close();
  await expect.poll(() => popup.isClosed()).toBe(true);
});

test('fechar a janela durante uma operação preserva a confirmação na ficha principal', async ({
  page,
}) => {
  const { session } = await openSheet(page);
  let release!: () => void;
  session.delay = new Promise<void>((resolve) => {
    release = resolve;
  });
  const opening = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Pop Out', exact: true }).click();
  const popup = await opening;
  const detached = popup.getByRole('complementary', { name: 'Ficha durante a sessão' });
  await detached.getByLabel('Quantidade de PV', { exact: true }).fill('3');
  await detached.getByRole('button', { name: 'Aplicar dano', exact: true }).click();
  await expect(detached).toContainText('Confirmando operação…');
  await popup.close();
  const sheet = page.getByRole('complementary', { name: 'Ficha durante a sessão' });
  await expect(sheet).toContainText('Confirmando operação…');
  await expect(sheet.getByLabel('Quantidade de PV', { exact: true })).toHaveValue('3');
  release();
  await expect(sheet).toContainText('PV 17/20');
  expect(session.operations).toHaveLength(1);
});

test('sair da conta encerra a ficha destacada', async ({ page }) => {
  await openSheet(page);
  const opening = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Pop Out', exact: true }).click();
  const popup = await opening;
  await expect(popup.getByRole('complementary', { name: 'Ficha durante a sessão' })).toBeVisible();
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect.poll(() => popup.isClosed()).toBe(true);
  await expect(page.getByRole('button', { name: 'Entrar com Google', exact: true })).toBeVisible();
});

test('editar a ficha destacada abre o editor na página principal e encerra a janela', async ({
  page,
}) => {
  const { sheets } = await openSheet(page);
  const opening = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Pop Out', exact: true }).click();
  const popup = await opening;
  await popup.getByRole('link', { name: 'Editar ficha completa →', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('#/fichas/' + sheets.rows[0].id + '$'));
  await expect.poll(() => popup.isClosed()).toBe(true);
});

test('bloqueio de popup mantém a ficha e explica como permitir a nova janela', async ({ page }) => {
  await openSheet(page);
  await page.evaluate(() => {
    window.open = () => null;
  });
  await page.getByRole('button', { name: 'Pop Out', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Permita pop-ups');
  await expect(page.getByRole('complementary', { name: 'Ficha durante a sessão' })).toContainText(
    'PV 20/20',
  );
  await page.getByRole('button', { name: 'Recolher Ficha do personagem', exact: true }).click();
  await page.getByRole('button', { name: 'Pop Out', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});

test('janela destacada mantém leitura de espectador e encerra ao perder acesso', async ({
  page,
}) => {
  const { sheets, session } = await openSheet(page, true);
  const opening = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Pop Out', exact: true }).click();
  const popup = await opening;
  const sheet = popup.getByRole('complementary', { name: 'Ficha durante a sessão' });
  await expect(sheet.getByRole('button', { name: 'Aplicar dano', exact: true })).toBeDisabled();
  await expect(sheet.getByRole('button', { name: 'Força +0', exact: true })).toBeDisabled();
  expect(session.operations).toHaveLength(0);
  await page.evaluate(() =>
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }),
  );
  sheets.memberships.length = 0;
  await popup.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => popup.isClosed()).toBe(true);
  await expect(page.getByText('Acesso à mesa encerrado.', { exact: true })).toBeVisible();
});
