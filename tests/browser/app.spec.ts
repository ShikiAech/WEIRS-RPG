import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('compêndio filtra acentos, abre texto completo e mantém páginas originais', async ({
  page,
}, testInfo) => {
  await page.goto('app.html#/compendio?demo=1');
  await page.getByLabel('Buscar no compêndio').fill('acalmar emocoes');
  await page.getByRole('button', { name: 'Acalmar Emoções', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(/hostil/i);
  await page.getByRole('button', { name: 'Fechar detalhes' }).click();
  await page.goto('app.html#/campanhas');
  await expect(page.getByRole('button', { name: 'Crônicas de Othans', exact: true })).toBeVisible();
  await page.screenshot({
    path: `artifacts/${testInfo.project.name}/campanhas.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Crônicas de Othans', exact: true }).click();
  await expect(page.getByRole('heading', { name: /CAPÍTULO 1 -/ })).toBeVisible();
  await page.goto('index.html');
  await expect(page.getByRole('button', { name: /Simular Minha Ficha/ })).toBeVisible();
});

test('ficha temporária preserva homebrew, cálculos, listas, pacto e inventário sem aparentar salvamento', async ({
  page,
}, testInfo) => {
  await page.goto('app.html#/fichas');
  await page.getByRole('link', { name: 'Experimentar ficha' }).click();
  await expect(page.getByText('Ficha temporária', { exact: true })).toBeVisible();
  await page.getByLabel('Nome do personagem', { exact: true }).fill('Ímpio de Xintai');
  await page.getByLabel('Espécie', { exact: true }).fill('Inamon');
  await page.getByLabel('Classe', { exact: true }).fill('Pugilista');
  await page.getByLabel('Nível', { exact: true }).fill('5');
  await page.getByRole('tab', { name: 'Atributos e perícias' }).click();
  await page.getByLabel('Força: valor', { exact: true }).fill('18');
  await expect(page.getByTestId('mod-for')).toHaveText('+4');
  await expect(page.getByTestId('proficiency')).toHaveText('+3');
  await page.getByRole('tab', { name: 'Combate' }).click();
  await page.getByLabel('PV temporários', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Adicionar ataque' }).click();
  await page.getByLabel('Nome do ataque', { exact: true }).fill('Soco astral');
  await page.getByLabel('Dano', { exact: true }).fill('1d8 + 4');
  await page.getByRole('tab', { name: 'Magias' }).click();
  await page.getByRole('button', { name: 'Adicionar perfil de conjuração' }).click();
  await page.getByLabel('Nome do perfil', { exact: true }).fill('Homebrew');
  await page.getByLabel('Espaços de pacto: total', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Adicionar magia' }).click();
  await page.getByLabel('Nome da magia', { exact: true }).fill('Luz própria');
  await page.getByRole('tab', { name: 'Inventário' }).click();
  await page.getByRole('button', { name: 'Adicionar item' }).click();
  await page.getByLabel('Nome do item', { exact: true }).fill('Manoplas');
  await page.getByLabel('Peso (kg)', { exact: true }).fill('0.5');
  await page.getByRole('tab', { name: 'Personagem', exact: true }).click();
  await expect(page.getByLabel('Espécie', { exact: true })).toHaveValue('Inamon');
  const leave = page.waitForEvent('dialog');
  await page.evaluate(() => history.back());
  await (await leave).dismiss();
  await expect(page).toHaveURL(/#\/fichas\/teste$/);
  await expect(page.getByLabel('Nome do personagem', { exact: true })).toHaveValue(
    'Ímpio de Xintai',
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `artifacts/${testInfo.project.name}/ficha.png` });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar ficha' }).click();
  const copy = await download;
  expect(copy.suggestedFilename()).toContain('ficha');
  const snapshot = JSON.parse(await readFile((await copy.path())!, 'utf8'));
  expect(snapshot.conteudo.inventario.itens[0].peso).toBe(0.5);
  expect(snapshot.conteudo.identidade.especie).toBe('Inamon');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByLabel('Arquivo da ficha').setInputFiles((await copy.path())!);
  await expect(
    page.getByText('Cópia importada. Confira os campos antes de salvar.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar ficha', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('callback cancelado limpa parâmetros e continua na aplicação', async ({ page }) => {
  await page.goto(
    'app.html?error=access_denied&error_description=privado&next=https://example.test',
  );
  await expect(page.getByRole('alert')).toContainText('login foi cancelado');
  await expect(page).toHaveURL(/app\.html#\/fichas$/);
  await expect(
    page.getByRole('heading', { name: 'Fichas de personagens', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
