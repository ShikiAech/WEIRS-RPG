import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const snapshot = JSON.parse(await readFile('public/compendium/demo.json', 'utf8'));
const storagePrefix = 'weirs-rpg:creation-draft:';
const entry = (kind: string, name: string) =>
  snapshot.catalog.entries.find((item: any) => item.kind === kind && item.name === name);

async function savedSelections(page: Page) {
  return page.evaluate((prefix) => {
    const key = Object.keys(sessionStorage).find((key) => key.startsWith(prefix));
    if (!key) throw new Error('O criador não persistiu o rascunho da sessão.');
    const draft = JSON.parse(sessionStorage.getItem(key)!).value.draft;
    return {
      spells: draft.spellSelections.map((selection: any) => selection.spellRef.revisionId),
      abilities: draft.castingAbilities.map((selection: any) => selection.ability),
    };
  }, storagePrefix);
}

test('falha de verificação após alterar o rascunho explica a magia recusada e permite tentar novamente', async ({
  page,
}) => {
  await page.route('**/compendium/demo.json', (route) => route.fulfill({ json: snapshot }));
  await page.goto('app.html#/campanhas');
  await page.evaluate(async (pendingRef) => {
    const modulePath = '/WEIRS-RPG/apps/web/lib/compendium-source.ts';
    const { compendiumSource } = await import(modulePath);
    const { repository } = compendiumSource(true);
    const getCatalog = repository.getCreationCatalog.bind(repository);
    const get = repository.get.bind(repository);
    repository.getCreationCatalog = async (draft: any, signal: AbortSignal) => {
      const catalog = await getCatalog(draft, signal);
      return {
        ...catalog,
        entries: catalog.entries.filter(
          (item: any) =>
            item.kind !== 'magia' ||
            draft.spellSelections.some(
              (selection: any) => selection.spellRef.revisionId === item.ref.revisionId,
            ),
        ),
      };
    };
    (window as any).spellVerificationAttempts = 0;
    repository.get = async (ref: any, signal: AbortSignal) => {
      if (ref.revisionId === pendingRef.revisionId) {
        (window as any).spellVerificationAttempts++;
        if ((window as any).spellVerificationAttempts === 1)
          await new Promise<void>((resolve, reject) => {
            (window as any).failSpellVerification = () =>
              reject(new Error('Detalhes temporariamente indisponíveis'));
            signal.addEventListener('abort', () => resolve(), { once: true });
          });
      }
      return get(ref, signal);
    };
  }, entry('magia', 'Luz').ref);
  await page.evaluate(() => {
    window.location.hash = '/fichas/nova?demo=1';
  });
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await page.getByRole('combobox', { name: 'Classe', exact: true }).fill('Mago');
  await page
    .getByRole('option', { name: `Mago · ${entry('classe', 'Mago').sourceTitle}`, exact: true })
    .click();
  await expect(page.getByLabel('Resumo do personagem')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  const wizard = page.getByRole('group', { name: 'Mago', exact: true });
  const search = wizard.getByRole('combobox', { name: 'Buscar magias de Mago', exact: true });
  await search.fill('Luz');
  await wizard.getByRole('checkbox', { name: 'Luz', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => typeof (window as any).failSpellVerification))
    .toBe('function');
  await expect.poll(() => savedSelections(page)).toEqual({ spells: [], abilities: [] });

  await wizard
    .getByRole('combobox', { name: 'Atributo de conjuração de Mago', exact: true })
    .click();
  await wizard.getByRole('option', { name: 'Inteligência', exact: true }).click();
  await expect.poll(() => savedSelections(page)).toEqual({ spells: [], abilities: ['int'] });
  await page.evaluate(() => (window as any).failSpellVerification());
  await expect(wizard.getByRole('alert')).toContainText(/não foi possível.*Luz/i);
  await expect(wizard.getByText('Verificando magia…', { exact: true })).toHaveCount(0);
  await expect.poll(() => savedSelections(page)).toEqual({ spells: [], abilities: ['int'] });
  await expect(page.getByRole('dialog', { name: 'Magias ajustadas', exact: true })).toHaveCount(0);

  await search.fill('Luz');
  const light = wizard.getByRole('checkbox', { name: 'Luz', exact: true });
  await expect(light).toBeEnabled();
  await light.click();
  await expect(light).toBeChecked();
  await expect
    .poll(() => savedSelections(page))
    .toEqual({
      spells: [entry('magia', 'Luz').ref.revisionId],
      abilities: ['int'],
    });
  expect(await page.evaluate(() => (window as any).spellVerificationAttempts)).toBe(2);
  await expect(wizard.getByRole('alert')).toHaveCount(0);
});
