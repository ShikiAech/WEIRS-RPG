import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { selectDropdown } from './dropdown';
const snapshot = JSON.parse(await readFile('public/compendium/demo.json', 'utf8'));
async function choose(page: Page, label: string, kind: string, name: string) {
  const entry = snapshot.catalog.entries.find((e: any) => e.kind === kind && e.name === name);
  await page.getByRole('combobox', { name: label, exact: true }).fill(name);
  await page.getByRole('option', { name: `${name} · ${entry.sourceTitle}`, exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  await page.route('**/compendium/demo.json', (route) => route.fulfill({ json: snapshot }));
  await page.goto('app.html#/fichas/nova?demo=1');
});
test('espécie simples oculta seletores sem alternativas e mantém traços; variantes opcionais continuam disponíveis', async ({
  page,
}) => {
  await page.getByRole('button', { name: '2 Espécie', exact: true }).click();
  await choose(page, 'Espécie', 'especie', 'Inamons');
  await expect(page.getByRole('combobox', { name: 'Forma', exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Tamanho', exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('combobox', { name: 'Linhagem (quando houver)', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Traços da espécie', exact: true })).toBeVisible();
  await expect(page.getByText('Disfarce Abissal', { exact: true })).toBeVisible();
  await choose(page, 'Espécie', 'especie', 'Humanos');
  await expect(
    page.getByRole('combobox', { name: 'Linhagem (quando houver)', exact: true }),
  ).toBeVisible();
  await choose(page, 'Espécie', 'especie', 'N0-V4');
  await expect(page.getByRole('combobox', { name: 'Forma', exact: true })).toBeVisible();
});
test('kits aparecem na etapa cinco e troca para moedas remove itens equipados', async ({
  page,
}) => {
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await choose(page, 'Classe', 'classe', 'Guerreiro');
  await expect(page.getByLabel('Equipamento de Guerreiro', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '5 Vida e defesas', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Equipamentos iniciais', exact: true }),
  ).toBeVisible();
  const fighter = snapshot.catalog.entries.find(
    (e: any) => e.kind === 'classe' && e.name === 'Guerreiro',
  );
  const kits = snapshot.catalog.equipmentOptions.filter(
    (o: any) => o.ownerRevisionId === fighter.ref.revisionId,
  );
  await selectDropdown(
    page.getByLabel('Equipamento de Guerreiro', { exact: true }),
    kits.find((o: any) => o.key === 'A').id,
  );
  const equip = page.getByRole('combobox', { name: 'Buscar equipamentos iniciais', exact: true });
  await equip.click();
  const armor = page.getByRole('checkbox', { name: 'Cota de Malha', exact: true });
  await armor.check();
  await equip.press('Escape');
  await selectDropdown(
    page.getByLabel('Equipamento de Guerreiro', { exact: true }),
    kits.find((o: any) => o.key === 'C').id,
  );
  await expect(
    page.getByText('Nenhum item recebido pode ser equipado nesta etapa.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('p').filter({ hasText: /^Classe de armadura:/ })).toContainText('10');
});
test('chips permitem descrição por foco e toque e remoção independente da busca', async ({
  page,
}, testInfo) => {
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await choose(page, 'Classe', 'classe', 'Mago');
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  const group = page.getByRole('group', { name: 'Mago', exact: true });
  const search = group.getByRole('combobox', { name: 'Buscar magias de Mago', exact: true });
  await search.fill('Raio de Fogo');
  await page.getByRole('checkbox', { name: 'Raio de Fogo', exact: true }).check();
  await search.press('Escape');
  const chips = group.getByRole('list', { name: 'Magias selecionadas de Mago', exact: true });
  await expect(chips.getByText('Raio de Fogo', { exact: true })).toBeVisible();
  const info = chips.getByRole('button', { name: 'Sobre Raio de Fogo', exact: true });
  await info.focus();
  await expect(chips.getByRole('tooltip')).toBeVisible();
  await info.press('Escape');
  if (testInfo.project.use.hasTouch) await info.tap();
  else await info.hover();
  await expect(chips.getByRole('tooltip')).toBeVisible();
  await page.screenshot({
    path: `artifacts/task1/${testInfo.project.name}-selected-spells.png`,
    fullPage: true,
  });
  await search.fill('inexistente');
  await search.press('Escape');
  await chips.getByRole('button', { name: 'Remover Raio de Fogo', exact: true }).click();
  await expect(chips.getByText('Raio de Fogo', { exact: true })).toHaveCount(0);
});
test('mesma magia mantém origens separadas e concessão fixa não pode ser removida', async ({
  page,
}) => {
  await page.getByRole('button', { name: '2 Espécie', exact: true }).click();
  await choose(page, 'Espécie', 'especie', 'Elfos');
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await choose(page, 'Classe', 'classe', 'Mago');
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  const mage = page.getByRole('group', { name: 'Mago', exact: true });
  const fixed = page.getByRole('group', { name: 'Familiaridade Arcana', exact: true });
  const fixedChips = fixed.getByRole('list', {
    name: 'Magias selecionadas de Familiaridade Arcana',
    exact: true,
  });
  await expect(fixedChips.getByText('Mensagem', { exact: true })).toBeVisible();
  await expect(fixedChips.getByRole('button', { name: /^Remover/ })).toHaveCount(0);
  await mage.getByRole('combobox', { name: 'Buscar magias de Mago', exact: true }).fill('Mensagem');
  await mage.getByRole('checkbox', { name: 'Mensagem', exact: true }).check();
  await mage.getByRole('combobox').last().press('Escape');
  const selected = mage.getByRole('list', { name: 'Magias selecionadas de Mago', exact: true });
  await selected.getByRole('button', { name: 'Remover Mensagem', exact: true }).click();
  await expect(selected.getByText('Mensagem', { exact: true })).toHaveCount(0);
  await expect(fixedChips.getByText('Mensagem', { exact: true })).toBeVisible();
});
