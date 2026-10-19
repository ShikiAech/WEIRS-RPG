import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const snapshot = JSON.parse(await readFile('public/compendium/demo.json', 'utf8'));
test('busca de magias e atributo de conjuração têm a mesma altura e não extrapolam o formulário', async ({
  page,
}) => {
  await page.route('**/compendium/demo.json', (route) => route.fulfill({ json: snapshot }));
  await page.goto('app.html#/fichas/nova?demo=1');
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  const mage = snapshot.catalog.entries.find((e: any) => e.kind === 'classe' && e.name === 'Mago');
  await page.getByRole('combobox', { name: 'Classe', exact: true }).fill('Mago');
  await page.getByRole('option', { name: `Mago · ${mage.sourceTitle}`, exact: true }).click();
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  const profile = page.getByRole('group', { name: 'Mago', exact: true });
  const search = profile.getByRole('combobox', { name: 'Buscar magias de Mago', exact: true });
  const ability = profile.getByRole('combobox', {
    name: 'Atributo de conjuração de Mago',
    exact: true,
  });
  await expect(search).toBeVisible();
  await expect(ability).toBeVisible();
  const searchBox = (await search.boundingBox())!;
  const abilityBox = (await ability.boundingBox())!;
  expect(searchBox.height).toBe(abilityBox.height);
  for (const control of [search, ability]) {
    const bounds = await control.evaluate((element) => {
      const shell = element.closest('.dropdown-control') ?? element;
      const box = shell.getBoundingClientRect();
      return { height: box.height, x: box.x, right: box.right };
    });
    expect(bounds.height).toBe(44);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual((await page.viewportSize())!.width);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
