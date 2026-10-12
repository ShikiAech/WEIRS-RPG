import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { syntheticRoll20Pdf } from '../fixtures/roll20-pdf';

test('PDF é revisado antes de substituir o rascunho, cancelar e aplicar funcionam em ambos os tamanhos', async ({
  page,
}, info) => {
  await page.goto('app.html#/fichas/teste');
  await page.getByLabel('Nome do personagem', { exact: true }).fill('Antes da importação');
  const upload = () =>
    page
      .getByLabel('PDF da ficha do Roll20', { exact: true })
      .setInputFiles({
        name: 'personagem.pdf',
        mimeType: 'application/pdf',
        buffer: syntheticRoll20Pdf(),
      });
  await upload();
  const dialog = page.getByRole('dialog', { name: 'Revisar dados do PDF' });
  await expect(dialog).toBeVisible({ timeout: 30000 });
  await expect(dialog).toContainText('Viajante');
  await expect(dialog).toContainText('29/31 · CA 15');
  await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  await expect(page.getByLabel('Nome do personagem', { exact: true })).toHaveValue(
    'Antes da importação',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel('Nome do personagem', { exact: true })).toHaveValue(
    'Antes da importação',
  );
  await upload();
  await expect(dialog).toBeVisible();
  await page.screenshot({
    path: `artifacts/roll20-import/preview-${info.project.name}.png`,
    fullPage: true,
  });
  expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Substituir campos com dados do PDF' }).click();
  await expect(page.getByLabel('Nome do personagem', { exact: true })).toHaveValue('Viajante');
  await expect(
    page.getByText(
      'PDF importado. Confira os pontos da revisão e os campos nas abas antes de salvar.',
    ),
  ).toBeVisible();
  await page.getByText('Pontos para revisar na importação do PDF', { exact: true }).click();
  await expect(page.getByText(/Deslocamento vazio no PDF/)).toBeVisible();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar ficha', exact: true }).click();
  const copy = JSON.parse(await readFile((await (await downloading).path())!, 'utf8'));
  expect(copy.conteudo.atributos.for.valor).toBe(18);
  expect(copy.conteudo.combate.pvAtuais).toBe(29);
  expect(copy.conteudo.classes[0].nivel).toBe(4);
});

test('PDF inválido e excessivo exibem erro sem alterar a ficha', async ({ page }) => {
  await page.goto('app.html#/fichas/teste');
  await page.getByLabel('Nome do personagem', { exact: true }).fill('Preservado');
  const input = page.getByLabel('PDF da ficha do Roll20', { exact: true });
  await input.setInputFiles({
    name: 'invalido.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('não é PDF'),
  });
  await expect(page.getByRole('alert')).toContainText('PDF válido');
  await input.setInputFiles({
    name: 'grande.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole('alert')).toContainText('10 MiB');
  await input.setInputFiles({
    name: 'pagina-enorme.pdf',
    mimeType: 'application/pdf',
    buffer: syntheticRoll20Pdf(10000, 10000),
  });
  await expect(page.getByRole('alert')).toContainText('páginas grandes');
  await expect(page.getByLabel('Nome do personagem', { exact: true })).toHaveValue('Preservado');
});

test('PDF fornecido do Roll20 recupera a ficha real completa', async ({ page }, info) => {
  test.skip(
    !process.env.ROLL20_PDF_SAMPLE,
    'Verificação local opcional com PDF fornecido pelo usuário.',
  );
  await page.goto('app.html#/fichas/teste');
  await page
    .getByLabel('PDF da ficha do Roll20', { exact: true })
    .setInputFiles(process.env.ROLL20_PDF_SAMPLE!);
  const dialog = page.getByRole('dialog', { name: 'Revisar dados do PDF' });
  await expect(page.locator('dialog[open], [role="alert"]')).toBeVisible();
  await expect(dialog).toBeVisible({ timeout: 60000 });
  await expect(dialog).toContainText('TONY OLLI');
  await page.screenshot({
    path: `artifacts/roll20-import/real-preview-${info.project.name}.png`,
    fullPage: true,
  });
  await dialog.getByRole('button', { name: 'Aplicar dados à ficha' }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar ficha', exact: true }).click();
  const copy = JSON.parse(await readFile((await (await downloading).path())!, 'utf8'));
  expect(copy.conteudo.atributos.for.valor).toBe(18);
  expect(copy.conteudo.atributos.con.resistenciaProficiente).toBe(true);
  expect(copy.conteudo.pericias.adestrarAnimais.grau).toBe('proficiente');
  expect(copy.conteudo.inventario.itens).toHaveLength(11);
  expect(copy.conteudo.magias).toHaveLength(3);
  expect(copy.conteudo.ataques).toHaveLength(8);
  expect(copy.conteudo.caracteristicas).toHaveLength(9);
  expect(copy.conteudo.tracos).toHaveLength(3);
  expect(copy.conteudo.talentos).toHaveLength(2);
  expect(copy.conteudo.magias[0].verbal).toBe(true);
  expect(copy.conteudo.magias[0].somatico).toBe(false);
  expect(copy.conteudo.magias[0].descricao).toContain('pequeno milagre');
  expect(copy.conteudo.magias[0].descricao).not.toContain('faísca');
  expect(copy.conteudo.magias[1].somatico).toBe(true);
  expect(copy.conteudo.magias.every((s: { preparada: boolean }) => s.preparada)).toBe(true);
  expect(copy.conteudo.inventario.moedas.po).toBe(30);
  await mkdir('artifacts/roll20-import', { recursive: true });
  await writeFile('artifacts/roll20-import/tony-olli.json', JSON.stringify(copy, null, 2));
});
