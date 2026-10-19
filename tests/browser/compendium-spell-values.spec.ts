import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { backend } from './backend';
import { chatBackend } from './chat-backend';
import { entry, fixture } from '../fixtures/creation';

test('detalhes exibem parcelas de dano do registro tipado', async ({ page }) => {
  const { catalog } = fixture();
  catalog.entries.push(
    entry(
      700,
      'magia',
      {
        circle: 0,
        school: 'Necromancia',
        castingTime: 'Uma Ação',
        range: 'Toque',
        rangeFeet: null,
        duration: 'Instantânea',
        durationSeconds: null,
        concentration: false,
        ritual: false,
        components: {
          verbal: true,
          somatic: true,
          material: '',
          costCopper: null,
          consumed: false,
        },
        classRefs: [],
        damages: [{ id: 'typed', order: 0, dice: '1d10', damageType: 'necrotico' }],
        scales: [],
      },
      'Toque Gélido',
    ),
  );
  await page.route('**/compendium/demo.json', (route) =>
    route.fulfill({
      json: { schemaVersion: 1, mode: 'demonstracao', catalog },
    }),
  );
  await page.goto('app.html#/compendio?demo=1');
  await page.getByLabel('Buscar no compêndio').fill('Toque Gélido');
  await page.getByRole('button', { name: 'Toque Gélido', exact: true }).click();
  await expect(page.getByRole('dialog').locator('dl')).toContainText('1d10 necrotico');
});

test('detalhes usam os valores atualizados de dano e alcance das magias JSON', async ({ page }) => {
  await page.goto('app.html#/compendio?demo=1');
  await page.getByRole('button', { name: 'Magias', exact: true }).click();
  for (const [name, damage, range] of [
    ['Toque Gélido', /1d10 necr[oó]tico/i, 'Toque'],
    ['Salpico Ácido', /1d6 [aá]cido/i, '18 metros [60 pés]'],
  ] as const) {
    await page.getByLabel('Buscar no compêndio').fill(name);
    await page.getByRole('button', { name, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('dl')).toContainText(damage);
    await expect(dialog.locator('dl')).toContainText(range);
    await dialog.getByRole('button', { name: 'Fechar detalhes' }).click();
  }
});

test('magias JSON conservam reação e dano entre compêndio, ficha salva e combate', async ({
  page,
}) => {
  test.setTimeout(60000);
  const sheets = await backend(page);
  const chat = await chatBackend(page);
  await page.goto('app.html#/fichas/teste');
  await page.getByLabel('Nome do personagem', { exact: true }).fill('Mago');
  await page.getByRole('tab', { name: 'Magias', exact: true }).click();
  await page.getByRole('button', { name: 'Buscar magias no compêndio', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Adicionar magias do compêndio' });
  for (const name of ['Toque Gélido', 'Repreensão Infernal']) {
    await dialog.getByLabel('Buscar magias', { exact: true }).fill(name);
    await dialog.getByLabel(name, { exact: true }).check();
    await expect(dialog.getByText('Na ficha', { exact: true })).toBeVisible();
  }
  await dialog.getByRole('button', { name: 'Concluir seleção', exact: true }).click();
  const reaction =
    'Uma Reação, que você realiza em resposta a sofrer dano de uma criatura que você possa ver a até 18 metros [60 pés] de você';
  const time = page.getByLabel('Tempo de conjuração', { exact: true }).nth(1);
  await expect(time).toHaveValue(reaction);
  await time.fill(reaction + '.');
  await expect(time).toHaveValue(reaction + '.');
  await expect(page.getByLabel('Fórmula do dano da magia', { exact: true }).first()).toHaveValue(
    '1d10',
  );
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar ficha', exact: true }).click();
  const file = await downloaded;
  const exported = await readFile((await file.path())!, 'utf8');
  page.once('dialog', (dialog) => dialog.accept());
  await page.goto('app.html#/fichas/' + sheets.rows[0].id);
  await expect(page.getByLabel('Nome do personagem', { exact: true })).toHaveValue('Zephira');
  await page.locator('input[type=file][accept*=json]').setInputFiles({
    name: 'magias.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exported),
  });
  await expect(
    page.getByText('Cópia importada. Confira os campos antes de salvar.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(page.getByText('Ficha salva na mesa.', { exact: true })).toBeVisible();
  expect(sheets.rows[0].conteudo.magias[1].tempo).toBe(reaction + '.');
  expect(sheets.rows[0].conteudo.magias[0].dano).toBe('1d10');
  await page.getByRole('tab', { name: 'Combate', exact: true }).click();
  await expect(page.getByText(/^1d10 necr[oó]tico$/i)).toBeVisible();
  await page.getByLabel('Animar meus dados em 3D').uncheck();
  await page
    .getByRole('button', { name: 'Rolar dano de magia: Toque Gélido', exact: true })
    .click();
  await expect.poll(() => chat.commands.length).toBe(1);
  expect(chat.commands[0]).toMatchObject({
    acao: 'magia_dano',
    entrada_id: sheets.rows[0].conteudo.magias[0].id,
  });
});

test('seleção de truque usa nível total e preserva edição manual de dano', async ({ page }) => {
  await page.goto('app.html#/fichas/teste');
  await page.getByLabel('Nível', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Adicionar classe', exact: true }).click();
  await page.getByLabel('Nível', { exact: true }).nth(1).fill('2');
  await page.getByRole('tab', { name: 'Magias', exact: true }).click();
  await page.getByRole('button', { name: 'Buscar magias no compêndio', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Adicionar magias do compêndio' });
  await dialog.getByLabel('Buscar magias', { exact: true }).fill('Toque Gélido');
  await dialog.getByLabel('Toque Gélido', { exact: true }).check();
  await expect(dialog.getByText('Na ficha', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Concluir seleção', exact: true }).click();
  const formula = page.getByLabel('Fórmula do dano da magia', { exact: true }).first();
  await expect(formula).toHaveValue('2d10');
  await formula.fill('9d10');
  await page.getByRole('button', { name: 'Buscar magias no compêndio', exact: true }).click();
  await dialog.getByLabel('Buscar magias', { exact: true }).fill('Repreensão Infernal');
  await dialog.getByLabel('Repreensão Infernal', { exact: true }).check();
  await expect(dialog.getByText('Na ficha', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Concluir seleção', exact: true }).click();
  await expect(formula).toHaveValue('9d10');
  await expect(page.getByLabel('Fórmula do dano da magia', { exact: true }).nth(1)).toHaveValue(
    '2d10',
  );
});
