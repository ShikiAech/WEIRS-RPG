import { test, expect } from '@playwright/test';
import { backend } from './backend';

test('criação com resposta perdida recupera a mesma ficha sem duplicar, mesmo após normalização JSONB', async ({
  page,
}) => {
  const state = await backend(page, { empty: true });
  state.failCreateAcknowledgement = true;
  await page.goto('app.html#/fichas/nova');
  await page
    .getByLabel('Nome do personagem', { exact: true })
    .fill('<img src=x onerror=alert(1)> Ímpio');
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível');
  expect(state.rows).toHaveLength(1);
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('link', { name: 'Fichas', exact: true }).click();
  await page.getByRole('link', { name: 'Criar personagem +' }).click();
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Ficha salva');
  expect(state.rows).toHaveLength(1);
  expect(state.creates).toBe(2);
  await expect(page.locator('.sheet-page h1 img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Experimentar ficha' })).toBeVisible();
  await expect(page.getByLabel('Nome do personagem', { exact: true })).toHaveCount(0);
});

test('edições durante save ficam pendentes e sobrevivem à navegação; conflito permite exportar', async ({
  page,
}) => {
  const state = await backend(page);
  let release!: () => void;
  state.delaySave = new Promise((resolve) => {
    release = resolve;
  });
  await page.goto('app.html#/fichas');
  await page.getByRole('link', { name: 'Abrir ficha →' }).click();
  await page.getByLabel('Nome do personagem', { exact: true }).fill('Zephira A');
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect.poll(() => state.saves).toBe(1);
  await expect(page.getByRole('button', { name: 'Salvar ficha', exact: true })).toBeDisabled();
  await page.getByLabel('Nome do personagem', { exact: true }).fill('Zephira B');
  release();
  state.delaySave = null;
  await expect(page.getByRole('status')).toContainText('Alterações pendentes');
  await expect(
    page.getByText('A gravação anterior foi concluída. Há novas alterações para salvar.'),
  ).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('link', { name: 'Fichas', exact: true }).click();
  state.rows[0].versao = 3; // Um mestre editou enquanto o rascunho ficou fechado.
  await page.getByRole('link', { name: 'Abrir ficha →' }).click();
  await expect(page.getByLabel('Nome do personagem', { exact: true })).toHaveValue('Zephira B');
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('versão mais recente');
  await expect(page.getByRole('button', { name: 'Salvar ficha', exact: true })).toBeDisabled();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar ficha' }).click();
  await downloaded;
  expect(state.rows[0].nome).toBe('Zephira A');
  await page.getByRole('button', { name: 'Recarregar versão salva' }).click();
  await expect(page.getByLabel('Nome do personagem', { exact: true })).toHaveValue('Zephira A');
});

test('validação identifica o campo e não envia uma ficha com nível inválido', async ({ page }) => {
  const state = await backend(page);
  await page.goto('app.html#/fichas');
  await page.getByRole('link', { name: 'Abrir ficha →' }).click();
  await page.getByLabel('Nível', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(page.getByLabel('Nível', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  expect(state.saves).toBe(0);
});

test('espectador pode consultar todas as abas, mas não editar ou excluir', async ({ page }) => {
  await backend(page, { readonly: true });
  await page.goto('app.html#/fichas');
  await page.getByRole('link', { name: 'Abrir ficha →' }).click();
  await expect(page.getByLabel('Nome do personagem', { exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: 'Magias', exact: true }).click();
  await expect(page.getByLabel('Espaços de pacto: total', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar magia', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Excluir esta ficha', exact: true })).toHaveCount(
    0,
  );
});
