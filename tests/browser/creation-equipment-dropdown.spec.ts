import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { selectDropdown } from './dropdown';

const snapshot = JSON.parse(await readFile('public/compendium/demo.json', 'utf8'));
const catalog = snapshot.catalog;
const fighter = catalog.entries.find(
  (entry: any) => entry.kind === 'classe' && entry.name === 'Guerreiro',
);
const kit = catalog.equipmentOptions.find(
  (option: any) => option.ownerRevisionId === fighter.ref.revisionId && option.key === 'A',
);
const pack = catalog.entries.find(
  (entry: any) => entry.ref.revisionId === kit.packageRef.revisionId,
);
const kitItems = pack.data.items.flatMap((item: any) =>
  catalog.entries.filter((entry: any) => entry.ref.revisionId === item.equipmentRef?.revisionId),
);
const armor = kitItems.find((entry: any) => entry.data.armor);
const weapon = kitItems.find((entry: any) => entry.data.weapon);
const basic = kitItems.find(
  (entry: any) => !entry.data.armor && !entry.data.shield && !entry.data.weapon,
);
const storagePrefix = 'weirs-rpg:creation-draft:';

async function start(page: Page) {
  await page.route('**/compendium/demo.json', (route) => route.fulfill({ json: snapshot }));
  await page.goto('app.html#/fichas/nova?demo=1');
  await page.getByLabel('Destreza: valor base', { exact: true }).fill('10');
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await page.getByRole('combobox', { name: 'Classe', exact: true }).fill(fighter.name);
  await page
    .getByRole('option', { name: `${fighter.name} · ${fighter.sourceTitle}`, exact: true })
    .click();
  await selectDropdown(page.getByLabel('Equipamento de Guerreiro', { exact: true }), kit.id);
  await page.getByRole('button', { name: '5 Vida e defesas', exact: true }).click();
  return page.getByRole('combobox', { name: 'Buscar equipamentos iniciais', exact: true });
}

function armorClass(page: Page) {
  return page.locator('p').filter({ hasText: /^Classe de armadura:/ });
}

test('equipamentos iniciais usam busca e seleção pela linha com atualização da defesa', async ({
  page,
}) => {
  const search = await start(page);
  await expect(search).toBeVisible();
  await expect(armorClass(page)).toContainText('Classe de armadura: 10');
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await search.click();
  const eligible = kitItems.filter(
    (entry: any) => entry.data.armor || entry.data.shield || entry.data.weapon,
  );
  await expect(page.getByRole('checkbox')).toHaveCount(eligible.length);
  await expect(page.getByRole('checkbox', { name: basic.name, exact: true })).toHaveCount(0);
  await search.fill(armor.name);
  await expect(page.getByRole('checkbox')).toHaveCount(1);
  await page.locator('.dropdown-option-text').getByText(armor.name, { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: armor.name, exact: true })).toBeChecked();
  await expect(armorClass(page)).toContainText(`Classe de armadura: ${armor.data.armor.baseAc}`);
  await page.locator('.dropdown-option-text').getByText(armor.name, { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: armor.name, exact: true })).not.toBeChecked();
  await expect(armorClass(page)).toContainText('Classe de armadura: 10');
});

test('limpar equipamentos remove as escolhas do seletor e preserva referências alheias', async ({
  page,
}) => {
  const search = await start(page);
  await search.fill(armor.name);
  await page.getByRole('checkbox', { name: armor.name, exact: true }).check();
  await search.fill(weapon.name);
  await page.getByRole('checkbox', { name: weapon.name, exact: true }).check();
  await page.evaluate(
    ({ prefix, ref }) => {
      const key = Object.keys(sessionStorage).find((key) => key.startsWith(prefix))!;
      const stored = JSON.parse(sessionStorage.getItem(key)!);
      stored.value.draft.equippedRefs.push(ref);
      sessionStorage.setItem(key, JSON.stringify(stored));
    },
    { prefix: storagePrefix, ref: basic.ref },
  );
  await page.reload();
  await expect(search).toBeVisible();
  await search.fill(weapon.name);
  await page.getByRole('button', { name: 'Limpar equipamentos iniciais', exact: true }).click();
  await expect(armorClass(page)).toContainText('Classe de armadura: 10');
  await expect(page.getByRole('checkbox', { name: armor.name, exact: true })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: weapon.name, exact: true })).not.toBeChecked();
  const equipped = await page.evaluate((prefix) => {
    const key = Object.keys(sessionStorage).find((key) => key.startsWith(prefix))!;
    return JSON.parse(sessionStorage.getItem(key)!).value.draft.equippedRefs;
  }, storagePrefix);
  expect(equipped).toEqual([basic.ref]);
});
