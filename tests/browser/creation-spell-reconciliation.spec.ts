import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const snapshot = JSON.parse(await readFile('public/compendium/demo.json', 'utf8'));
const storagePrefix = 'weirs-rpg:creation-draft:';
const entry = (kind: string, name: string) =>
  snapshot.catalog.entries.find((item: any) => item.kind === kind && item.name === name);

test.beforeEach(async ({ page }) => {
  await page.route('**/compendium/demo.json', (route) => route.fulfill({ json: snapshot }));
});

async function settled(page: Page) {
  await expect(page.getByLabel('Resumo do personagem')).toHaveAttribute('aria-busy', 'false');
}

async function chooseClass(page: Page, name: string, label = 'Classe') {
  await page.getByRole('combobox', { name: label, exact: true }).fill(name);
  await page
    .getByRole('option', { name: `${name} · ${entry('classe', name).sourceTitle}`, exact: true })
    .click();
  await settled(page);
}

async function startClass(page: Page, name: string, navigate = true) {
  if (navigate) await page.goto('app.html#/fichas/nova?demo=1');
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await chooseClass(page, name);
}

async function selectSpell(profile: Locator, name: string) {
  await profile.getByRole('combobox', { name: /^Buscar magias de / }).fill(name);
  const option = profile.getByRole('checkbox', { name, exact: true });
  await option.click();
  await expect(option).toBeChecked();
}

async function savedSpellRefs(page: Page) {
  return page.evaluate((prefix) => {
    const key = Object.keys(sessionStorage).find((key) => key.startsWith(prefix));
    if (!key) throw new Error('O criador não persistiu o rascunho da sessão.');
    return JSON.parse(sessionStorage.getItem(key)!)
      .value.draft.spellSelections.map((selection: any) => selection.spellRef.revisionId)
      .sort();
  }, storagePrefix);
}

async function expectSavedSpells(page: Page, names: string[]) {
  await expect
    .poll(() => savedSpellRefs(page))
    .toEqual(names.map((name) => entry('magia', name).ref.revisionId).sort());
}

test('reduzir o nível remove círculo indisponível com nome e motivo e mantém magias válidas', async ({
  page,
}, testInfo) => {
  await startClass(page, 'Bruxo');
  const level = page.getByLabel('Níveis em Bruxo', { exact: true });
  await level.fill('5');
  await level.press('Tab');
  await settled(page);
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  const warlock = page.getByRole('group', { name: 'Bruxo', exact: true });
  await selectSpell(warlock, 'Raio Místico');
  await warlock.getByRole('tab', { name: 'Círculo 1', exact: true }).click();
  await selectSpell(warlock, 'Enfeitiçar Pessoa');
  await warlock.getByRole('tab', { name: 'Círculo 2', exact: true }).click();
  await selectSpell(warlock, 'Passo Nebuloso');
  await expectSavedSpells(page, ['Raio Místico', 'Enfeitiçar Pessoa', 'Passo Nebuloso']);

  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await level.fill('1');
  await level.press('Tab');
  const notice = page.getByRole('dialog', { name: 'Magias ajustadas', exact: true });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Passo Nebuloso');
  await expect(notice).toContainText('Bruxo');
  await expect(notice).toContainText(/círculo/i);
  await expect(notice).not.toContainText('Raio Místico');
  await expect(notice).not.toContainText('Enfeitiçar Pessoa');
  await expectSavedSpells(page, ['Raio Místico', 'Enfeitiçar Pessoa']);
  const screenshot = `artifacts/ux-guided/${testInfo.project.name}-spell-reconciliation-modal.png`;
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('Aviso de magias removidas', {
    path: screenshot,
    contentType: 'image/png',
  });
  await notice.getByRole('button', { name: 'Entendi', exact: true }).click();
  await expect(notice).not.toBeVisible();

  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  await expect(warlock.getByRole('tab', { name: 'Círculo 2', exact: true })).toHaveCount(0);
  await warlock.getByRole('tab', { name: 'Círculo 1', exact: true }).click();
  await warlock.getByRole('combobox', { name: /^Buscar magias de / }).fill('Enfeitiçar Pessoa');
  await expect(
    warlock.getByRole('checkbox', { name: 'Enfeitiçar Pessoa', exact: true }),
  ).toBeChecked();
  await page.reload();
  await settled(page);
  await expect(page.getByRole('dialog', { name: 'Magias ajustadas', exact: true })).toHaveCount(0);
  await expectSavedSpells(page, ['Raio Místico', 'Enfeitiçar Pessoa']);
});

test('remover uma multiclasse avisa sobre as magias removidas e preserva a outra origem', async ({
  page,
}) => {
  await startClass(page, 'Clérigo');
  await chooseClass(page, 'Mago', 'Adicionar multiclasse');
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  const cleric = page.getByRole('group', { name: 'Clérigo', exact: true });
  await cleric.getByRole('tab', { name: 'Círculo 1', exact: true }).click();
  await selectSpell(cleric, 'Bênção');
  await selectSpell(page.getByRole('group', { name: 'Mago', exact: true }), 'Mãos Mágicas');
  await expectSavedSpells(page, ['Bênção', 'Mãos Mágicas']);

  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await page
    .getByRole('group', { name: 'Multiclasse 1', exact: true })
    .getByRole('button', { name: 'Remover esta classe', exact: true })
    .click();
  const notice = page.getByRole('dialog', { name: 'Magias ajustadas', exact: true });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Mãos Mágicas');
  await expect(notice).toContainText('Mago');
  await expect(notice).toContainText(/origem.*removida/i);
  await expect(notice).not.toContainText('Bênção');
  await expectSavedSpells(page, ['Bênção']);
  await notice.getByRole('button', { name: 'Entendi', exact: true }).click();
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Mago', exact: true })).toHaveCount(0);
  await cleric.getByRole('tab', { name: 'Círculo 1', exact: true }).click();
  await cleric.getByRole('combobox', { name: /^Buscar magias de / }).fill('Bênção');
  await expect(cleric.getByRole('checkbox', { name: 'Bênção', exact: true })).toBeChecked();
});

test('restaurar rascunho inválido remove magia de outra lista e mantém escolhas válidas', async ({
  page,
}) => {
  await startClass(page, 'Mago');
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  await selectSpell(page.getByRole('group', { name: 'Mago', exact: true }), 'Mãos Mágicas');
  await expectSavedSpells(page, ['Mãos Mágicas']);
  await page.evaluate(
    ({ prefix, invalidRef }) => {
      const key = Object.keys(sessionStorage).find((key) => key.startsWith(prefix))!;
      const stored = JSON.parse(sessionStorage.getItem(key)!);
      stored.value.draft.spellSelections.push({
        profileId: stored.value.draft.spellSelections[0].profileId,
        spellRef: invalidRef,
        prepared: true,
      });
      sessionStorage.setItem(key, JSON.stringify(stored));
    },
    { prefix: storagePrefix, invalidRef: entry('magia', 'Bênção').ref },
  );
  await page.reload();
  const notice = page.getByRole('dialog', { name: 'Magias ajustadas', exact: true });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Bênção');
  await expect(notice).toContainText('Mago');
  await expect(notice).toContainText(/lista/i);
  await expect(notice).not.toContainText('Mãos Mágicas');
  await expectSavedSpells(page, ['Mãos Mágicas']);
  await notice.getByRole('button', { name: 'Entendi', exact: true }).click();
  const wizard = page.getByRole('group', { name: 'Mago', exact: true });
  await wizard.getByRole('combobox', { name: /^Buscar magias de / }).fill('Mãos Mágicas');
  await expect(wizard.getByRole('checkbox', { name: 'Mãos Mágicas', exact: true })).toBeChecked();
  await page.reload();
  await settled(page);
  await expect(page.getByRole('dialog', { name: 'Magias ajustadas', exact: true })).toHaveCount(0);
  await expectSavedSpells(page, ['Mãos Mágicas']);
});

test('resposta de busca fora da lista ou do círculo nunca oferece escolha utilizável', async ({
  page,
}) => {
  await page.goto('app.html#/fichas/nova?demo=1');
  await page.evaluate(async () => {
    const modulePath = '/WEIRS-RPG/apps/web/lib/compendium-demo.ts';
    const { demoCompendium: repository } = await import(modulePath);
    const list = repository.list.bind(repository);
    (window as any).unfilteredSpellQueries = {};
    repository.list = async (query: any, signal: AbortSignal) => {
      const result = await list(
        query.kind === 'magia'
          ? { ...query, classRevisionId: undefined, circle: undefined }
          : query,
        signal,
      );
      if (query.kind === 'magia')
        (window as any).unfilteredSpellQueries[query.query] = result.entries.map(
          (item: any) => item.name,
        );
      return result;
    };
  });
  await startClass(page, 'Mago', false);
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  const wizard = page.getByRole('group', { name: 'Mago', exact: true });
  await selectSpell(wizard, 'Mãos Mágicas');
  await wizard.getByRole('tab', { name: 'Círculo 1', exact: true }).click();
  for (const name of ['Bênção', 'Passo Nebuloso']) {
    await wizard.getByRole('combobox', { name: /^Buscar magias de / }).fill(name);
    await expect
      .poll(() => page.evaluate((query) => (window as any).unfilteredSpellQueries[query], name))
      .toContain(name);
    await expect(wizard.getByText('Consultando magias…', { exact: true })).toHaveCount(0);
    const invalid = wizard.getByRole('checkbox', { name, exact: true });
    await expect
      .poll(async () => (await invalid.count()) === 0 || (await invalid.isDisabled()))
      .toBe(true);
  }
  await expectSavedSpells(page, ['Mãos Mágicas']);
  await expect(page.getByRole('dialog', { name: 'Magias ajustadas', exact: true })).toHaveCount(0);
});

test('truque escolhido primeiro na origem adicional impede duplicação pela classe sem remover escolhas', async ({
  page,
}) => {
  await startClass(page, 'Clérigo');
  const order = page.getByRole('group', { name: 'Ordem Divina', exact: true });
  await order.getByRole('combobox').click();
  await order.getByRole('checkbox', { name: 'Taumaturgo', exact: true }).click();
  await expect(order.getByRole('combobox')).toHaveValue('Taumaturgo');
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  const additional = page.getByRole('group', { name: 'Taumaturgo', exact: true });
  await selectSpell(additional, 'Luz');
  await expectSavedSpells(page, ['Luz']);

  const cleric = page.getByRole('group', { name: 'Clérigo', exact: true });
  await cleric.getByRole('combobox', { name: /^Buscar magias de / }).fill('Luz');
  await expect(cleric.getByRole('checkbox', { name: 'Luz', exact: true })).toBeDisabled();
  await expect(cleric).toContainText(/truque adicional/i);
  await selectSpell(cleric, 'Orientação');
  await expectSavedSpells(page, ['Luz', 'Orientação']);
  await additional.getByRole('combobox', { name: /^Buscar magias de / }).fill('Luz');
  await expect(additional.getByRole('checkbox', { name: 'Luz', exact: true })).toBeChecked();
  await expect(additional).toContainText('Truques: 1/1');
  await expect(page.getByRole('dialog', { name: 'Magias ajustadas', exact: true })).toHaveCount(0);
});

test('catálogo parcial verifica a magia antes de selecionar e explica falha ou lista inválida', async ({
  page,
}) => {
  await page.goto('app.html#/fichas/nova?demo=1');
  await page.evaluate(async (foreignRef) => {
    const modulePath = '/WEIRS-RPG/apps/web/lib/compendium-demo.ts';
    const { demoCompendium: repository } = await import(modulePath);
    const getCatalog = repository.getCreationCatalog.bind(repository);
    const list = repository.list.bind(repository);
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
    repository.list = (query: any, signal: AbortSignal) =>
      list(query.kind === 'magia' ? { ...query, classRevisionId: undefined } : query, signal);
    (window as any).foreignSpellVerificationCalls = 0;
    repository.get = async (ref: any, signal: AbortSignal) => {
      if (ref.revisionId === foreignRef.revisionId) {
        (window as any).foreignSpellVerificationCalls++;
        if ((window as any).foreignSpellVerificationCalls === 1)
          throw new Error('Detalhes temporariamente indisponíveis');
      }
      return get(ref, signal);
    };
  }, entry('magia', 'Bênção').ref);
  await startClass(page, 'Mago', false);
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  const wizard = page.getByRole('group', { name: 'Mago', exact: true });
  await selectSpell(wizard, 'Mãos Mágicas');
  await expectSavedSpells(page, ['Mãos Mágicas']);
  await wizard.getByRole('tab', { name: 'Círculo 1', exact: true }).click();
  await wizard.getByRole('combobox', { name: /^Buscar magias de / }).fill('Bênção');
  const foreign = wizard.getByRole('checkbox', { name: 'Bênção', exact: true });
  await expect(foreign).toBeEnabled();
  await foreign.click();
  await expect(wizard.getByRole('alert')).toContainText(/Não foi possível verificar Bênção/i);
  await expect(foreign).not.toBeChecked();
  await expectSavedSpells(page, ['Mãos Mágicas']);

  await foreign.click();
  await expect(wizard.getByRole('alert')).toContainText('Bênção');
  await expect(wizard.getByRole('alert')).toContainText(/não pertence à lista.*permitida/i);
  expect(await page.evaluate(() => (window as any).foreignSpellVerificationCalls)).toBe(2);
  // Disabling the focused option can close the popup; reopen to inspect the verified option.
  await wizard.getByRole('combobox', { name: /^Buscar magias de / }).fill('Bênção');
  await expect(foreign).not.toBeChecked();
  await expect(foreign).toBeDisabled();
  await expectSavedSpells(page, ['Mãos Mágicas']);
  await expect(page.getByRole('dialog', { name: 'Magias ajustadas', exact: true })).toHaveCount(0);
});

test('verificação pendente aplica a magia sem perder a alteração mais recente do rascunho', async ({
  page,
}) => {
  await page.goto('app.html#/fichas/nova?demo=1');
  await page.evaluate(async (pendingRef) => {
    const modulePath = '/WEIRS-RPG/apps/web/lib/compendium-demo.ts';
    const { demoCompendium: repository } = await import(modulePath);
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
    (window as any).pendingSpellVerification = 'idle';
    repository.get = async (ref: any, signal: AbortSignal) => {
      if (ref.revisionId === pendingRef.revisionId) {
        (window as any).pendingSpellVerification = 'pending';
        await new Promise<void>((resolve) => {
          (window as any).releaseSpellVerification = resolve;
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
      }
      const detail = await get(ref, signal);
      if (ref.revisionId === pendingRef.revisionId)
        (window as any).pendingSpellVerification = 'resolved';
      return detail;
    };
  }, entry('magia', 'Luz').ref);
  await startClass(page, 'Mago', false);
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  const wizard = page.getByRole('group', { name: 'Mago', exact: true });
  await wizard.getByRole('combobox', { name: /^Buscar magias de / }).fill('Luz');
  await wizard.getByRole('checkbox', { name: 'Luz', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).pendingSpellVerification))
    .toBe('pending');
  await expectSavedSpells(page, []);

  await wizard
    .getByRole('combobox', { name: 'Atributo de conjuração de Mago', exact: true })
    .click();
  await wizard.getByRole('option', { name: 'Inteligência', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate((prefix) => {
        const key = Object.keys(sessionStorage).find((key) => key.startsWith(prefix))!;
        return JSON.parse(sessionStorage.getItem(key)!).value.draft.castingAbilities.map(
          (selection: any) => selection.ability,
        );
      }, storagePrefix),
    )
    .toEqual(['int']);
  await page.evaluate(() => (window as any).releaseSpellVerification());
  await expect
    .poll(() => page.evaluate(() => (window as any).pendingSpellVerification))
    .toBe('resolved');
  await expect(wizard.getByText('Verificando magia…', { exact: true })).toHaveCount(0);
  await wizard.getByRole('combobox', { name: /^Buscar magias de / }).fill('Luz');
  await expect(wizard.getByRole('checkbox', { name: 'Luz', exact: true })).toBeChecked();
  await expectSavedSpells(page, ['Luz']);
  expect(
    await page.evaluate((prefix) => {
      const key = Object.keys(sessionStorage).find((key) => key.startsWith(prefix))!;
      return JSON.parse(sessionStorage.getItem(key)!).value.draft.castingAbilities.map(
        (selection: any) => selection.ability,
      );
    }, storagePrefix),
  ).toEqual(['int']);
  await expect(wizard.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Magias ajustadas', exact: true })).toHaveCount(0);
});

test('duas verificações pendentes em origens distintas preservam ambas as escolhas ao concluir', async ({
  page,
}) => {
  await page.goto('app.html#/fichas/nova?demo=1');
  await page.evaluate(
    async (pendingRefs) => {
      const modulePath = '/WEIRS-RPG/apps/web/lib/compendium-demo.ts';
      const { demoCompendium: repository } = await import(modulePath);
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
      (window as any).spellVerificationResolvers = {};
      (window as any).completedSpellVerifications = [];
      repository.get = async (ref: any, signal: AbortSignal) => {
        if (pendingRefs.includes(ref.revisionId))
          await new Promise<void>((resolve) => {
            (window as any).spellVerificationResolvers[ref.revisionId] = resolve;
            signal.addEventListener('abort', () => resolve(), { once: true });
          });
        const detail = await get(ref, signal);
        if (pendingRefs.includes(ref.revisionId))
          (window as any).completedSpellVerifications.push(ref.revisionId);
        return detail;
      };
    },
    [entry('magia', 'Luz').ref.revisionId, entry('magia', 'Mãos Mágicas').ref.revisionId],
  );
  await startClass(page, 'Clérigo', false);
  await chooseClass(page, 'Mago', 'Adicionar multiclasse');
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  const cleric = page.getByRole('group', { name: 'Clérigo', exact: true });
  const wizard = page.getByRole('group', { name: 'Mago', exact: true });
  await cleric.getByRole('combobox', { name: /^Buscar magias de / }).fill('Luz');
  await cleric.getByRole('checkbox', { name: 'Luz', exact: true }).click();
  await wizard.getByRole('combobox', { name: /^Buscar magias de / }).fill('Mãos Mágicas');
  await wizard.getByRole('checkbox', { name: 'Mãos Mágicas', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => Object.keys((window as any).spellVerificationResolvers).length))
    .toBe(2);
  await expectSavedSpells(page, []);

  for (const name of ['Luz', 'Mãos Mágicas']) {
    const revisionId = entry('magia', name).ref.revisionId;
    await page.evaluate((ref) => (window as any).spellVerificationResolvers[ref](), revisionId);
    await expect
      .poll(() => page.evaluate(() => (window as any).completedSpellVerifications))
      .toContain(revisionId);
    await expectSavedSpells(page, name === 'Luz' ? ['Luz'] : ['Luz', 'Mãos Mágicas']);
  }
  await cleric.getByRole('combobox', { name: /^Buscar magias de / }).fill('Luz');
  await expect(cleric.getByRole('checkbox', { name: 'Luz', exact: true })).toBeChecked();
  await wizard.getByRole('combobox', { name: /^Buscar magias de / }).fill('Mãos Mágicas');
  await expect(wizard.getByRole('checkbox', { name: 'Mãos Mágicas', exact: true })).toBeChecked();
  await expect(page.getByRole('dialog', { name: 'Magias ajustadas', exact: true })).toHaveCount(0);
});
