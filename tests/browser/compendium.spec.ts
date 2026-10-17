import { test, expect } from '@playwright/test';

test('demonstração explícita consulta os domínios do modelo relacional', async ({ page }) => {
  await page.goto('app.html#/compendio?demo=1');
  await expect(page.getByText(/Catálogo de demonstração/)).toBeVisible();
  await page.getByRole('button', { name: 'Equipamentos', exact: true }).click();
  await page.getByLabel('Buscar no compêndio').fill('Adaga');
  await page.getByRole('button', { name: 'Adaga', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('1d4');
  await expect(dialog).toContainText(/Perfurante/i);
  await page.getByRole('button', { name: 'Fechar detalhes' }).click();
  await expect(dialog).not.toBeVisible();
});
test('banco indisponível permite retentar sem retornar catálogo estático', async ({ page }) => {
  let calls = 0;
  await page.route('**/rest/v1/rpc/buscar_compendio', async (route) => {
    calls++;
    if (calls === 1)
      return route.fulfill({ status: 503, json: { message: 'falha interna confidencial' } });
    return route.fulfill({ json: [] });
  });
  await page.goto('app.html#/compendio');
  await expect(page.getByRole('alert')).toContainText('Não foi possível consultar');
  await expect(page.getByText('falha interna confidencial')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Acalmar Emoções', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByText(/Nenhum registro encontrado/)).toBeVisible();
  expect(calls).toBe(2);
});

test('antecedente reúne descrição, benefícios e equipamento sem cópia incompleta', async ({
  page,
}) => {
  await page.goto('app.html#/compendio?demo=1');
  await page.getByRole('button', { name: 'Antecedentes', exact: true }).click();
  await page.getByLabel('Buscar no compêndio').fill('Acólito');
  const acolyte = page.getByRole('button', { name: 'Acólito', exact: true });
  await expect(acolyte).toHaveCount(1);
  await acolyte.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Você se dedicou ao serviço em um templo');
  await expect(dialog).toContainText('Atributos: Inteligência, Sabedoria, Carisma');
  await expect(dialog).toContainText('Perícias: Intuição, Religião');
  await expect(dialog).toContainText('Talento: Iniciado em Magia (Clérigo)');
  await expect(dialog).toContainText('Pergaminho (10 folhas)');
  await expect(dialog).toContainText('Equipamento — opção B: 50 PO');
});
