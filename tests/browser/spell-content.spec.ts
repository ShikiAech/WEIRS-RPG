import { test, expect } from '@playwright/test';

test('compêndio preserva custo de material e duração na ficha', async ({ page }) => {
  await page.goto('app.html#/fichas/teste');
  await page.getByRole('tab', { name: 'Magias', exact: true }).click();
  await page.getByRole('button', { name: 'Buscar magias no compêndio', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Adicionar magias do compêndio' });
  await dialog.getByLabel('Buscar magias', { exact: true }).fill('simulacro');
  await dialog.getByLabel('Simulacro', { exact: true }).check();
  await expect(dialog.getByText('Na ficha', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Concluir seleção', exact: true }).click();
  await expect(page.getByLabel('Material necessário', { exact: true })).toHaveValue(
    /1\.500 PO.*consome/,
  );
  await expect(page.getByLabel('Duração', { exact: true })).not.toHaveValue('');
});
