import { expect, test } from '@playwright/test';
import { creationBackend } from './creation-backend';

test('carregamento ocupa a etapa e bloqueia escolhas enquanto as regras estão sendo atualizadas', async ({
  page,
}) => {
  await creationBackend(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/rest\/v1\/rpc\/obter_compendio(?:_seletivo)?(?:\?.*)?$/, async (route) => {
    await pending;
    await route.fallback();
  });
  await page.goto('app.html#/fichas/nova');
  await page.getByRole('button', { name: '2 Espécie', exact: true }).click();
  const stage = page.locator('.creation-stage');
  try {
    await expect(stage).toHaveAttribute('aria-busy', 'true');
    const loading = stage.getByRole('status');
    await expect(loading).toContainText('Carregando');
    await expect(loading.locator('.creation-spinner')).toBeVisible();
    await expect(loading.locator('.creation-skeleton').first()).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Espécie', exact: true })).toBeDisabled();
  } finally {
    release();
  }
  await expect(stage).toHaveAttribute('aria-busy', 'false');
  await expect(stage.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Espécie', exact: true })).toBeEnabled();
});

test('busca do catálogo apresenta spinner dentro do dropdown', async ({ page }) => {
  await creationBackend(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/rest/v1/rpc/buscar_compendio', async (route) => {
    await pending;
    await route.fallback();
  });
  await page.goto('app.html#/fichas/nova');
  await page.getByRole('button', { name: '2 Espécie', exact: true }).click();
  await page.getByRole('combobox', { name: 'Espécie', exact: true }).click();
  try {
    await expect(
      page.locator('.dropdown-popup').getByRole('status').locator('.dropdown-spinner'),
    ).toBeVisible();
  } finally {
    release();
  }
  await expect(
    page.getByRole('option', { name: 'Espécie de teste · Teste', exact: true }),
  ).toBeVisible();
});
