import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const snapshot = JSON.parse(await readFile('public/compendium/demo.json', 'utf8'));
test.beforeEach(async ({ page }) => {
  await page.route('**/compendium/demo.json', (route) => route.fulfill({ json: snapshot }));
});

async function startClass(page: Page, name: string, navigate = true) {
  const entry = snapshot.catalog.entries.find((e: any) => e.kind === 'classe' && e.name === name);
  if (navigate) await page.goto('app.html#/fichas/nova?demo=1');
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await page.getByRole('combobox', { name: 'Classe', exact: true }).fill(name);
  await page.getByRole('option', { name: `${name} · ${entry.sourceTitle}`, exact: true }).click();
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  return page.getByRole('group', { name, exact: true });
}

async function search(profile: Locator, name: string) {
  await profile.getByRole('combobox', { name: /^Buscar magias de / }).fill(name);
  return profile.getByRole('checkbox', { name, exact: true });
}

test('cota de truques impede exceder e libera uma vaga ao desmarcar no dropdown', async ({
  page,
}) => {
  const profile = await startClass(page, 'Mago');
  await expect(profile.getByRole('tab', { name: 'Truques', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  for (const name of ['Luz', 'Mãos Mágicas', 'Raio de Gelo'])
    await (await search(profile, name)).check();
  const fourth = await search(profile, 'Ilusão Menor');
  await expect(fourth).toBeDisabled();
  await expect(profile).toContainText('Truques: 3/3');
  await (await search(profile, 'Luz')).uncheck();
  await (await search(profile, 'Ilusão Menor')).check();
  await expect(profile).toContainText('Truques: 3/3');
  await expect(profile.getByRole('button', { name: 'Remover', exact: true })).toHaveCount(0);
  await profile.getByRole('combobox', { name: /^Buscar magias de / }).press('Escape');
  await expect(profile.getByRole('combobox', { name: /^Buscar magias de / })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(profile.getByRole('checkbox')).toHaveCount(0);
  await profile.getByRole('combobox', { name: /^Buscar magias de / }).press('ArrowDown');
  await expect(profile.getByRole('checkbox', { name: 'Ilusão Menor', exact: true })).toBeFocused();
});

test('grimório limita conhecidas e preparadas sem impedir desmarcar a seleção', async ({
  page,
}) => {
  const profile = await startClass(page, 'Mago');
  await profile.getByRole('tab', { name: 'Círculo 1', exact: true }).click();
  for (const name of [
    'Absorver Elementos',
    'Alarme',
    'Armadura Arcana',
    'Catapulta',
    'Causar Medo',
    'Compreender Idiomas',
  ]) {
    await (await search(profile, name)).check();
  }
  await expect(profile).toContainText('Grimório: 6/6');
  await expect(profile).toContainText('Preparadas: 4/4');
  await expect(
    profile.getByRole('checkbox', { name: 'Preparar Compreender Idiomas', exact: true }),
  ).toBeDisabled();
  await expect(await search(profile, 'Mísseis Mágicos')).toBeDisabled();
  await search(profile, 'Absorver Elementos');
  await profile
    .getByRole('checkbox', { name: 'Preparar Absorver Elementos', exact: true })
    .uncheck();
  await search(profile, 'Compreender Idiomas');
  await profile
    .getByRole('checkbox', { name: 'Preparar Compreender Idiomas', exact: true })
    .check();
  await expect(profile).toContainText('Preparadas: 4/4');
  await (await search(profile, 'Alarme')).uncheck();
  await (await search(profile, 'Mísseis Mágicos')).check();
  await expect(profile).toContainText('Grimório: 6/6');
  await expect(profile.getByRole('list', { name: 'Pendências desta origem' })).toHaveCount(0);
});

test('preparação da lista inteira bloqueia a próxima magia e mantém a escolhida editável', async ({
  page,
}) => {
  const profile = await startClass(page, 'Clérigo');
  await profile.getByRole('tab', { name: 'Círculo 1', exact: true }).click();
  for (const name of ['Bênção', 'Comando', 'Curar Ferimentos', 'Detectar Magia'])
    await (await search(profile, name)).check();
  await expect(await search(profile, 'Escudo da Fé')).toBeDisabled();
  await (await search(profile, 'Bênção')).uncheck();
  await (await search(profile, 'Escudo da Fé')).check();
  await expect(profile).toContainText('Preparadas: 4/4');
});

test('descrição está disponível por foco antes de selecionar a magia e abas usam teclado', async ({
  page,
}, testInfo) => {
  const profile = await startClass(page, 'Mago');
  await search(profile, 'Luz');
  const info = profile.getByRole('button', { name: 'Sobre Luz', exact: true });
  await info.focus();
  const tooltip = profile.getByRole('tooltip');
  await expect(tooltip).toContainText('Você toca');
  const trigger = (await info.boundingBox())!;
  const popup = (await tooltip.boundingBox())!;
  const gap = popup.y < trigger.y ? trigger.y - 4 : trigger.y + trigger.height + 4;
  await info.hover();
  await page.mouse.move(trigger.x + trigger.width / 2, gap);
  await page.mouse.move(popup.x + 20, popup.y + 20);
  await expect(tooltip).toBeVisible();
  await page.screenshot({ path: `artifacts/ux-guided/${testInfo.project.name}-spell-tooltip.png` });
  await expect(profile.getByRole('checkbox', { name: 'Luz', exact: true })).not.toBeChecked();
  await profile.getByRole('tab', { name: 'Truques', exact: true }).focus();
  await profile.getByRole('tab', { name: 'Truques', exact: true }).press('ArrowRight');
  await expect(profile.getByRole('tab', { name: 'Círculo 1', exact: true })).toBeFocused();
  await expect(profile.getByRole('tab', { name: 'Círculo 1', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(profile.getByRole('combobox', { name: /^Buscar magias de / })).toHaveValue('');
});

test('descrição ausente do catálogo selecionado carrega pela referência e permite tentar novamente', async ({
  page,
}) => {
  await page.goto('app.html#/fichas/nova?demo=1');
  await page.evaluate(async () => {
    const modulePath = '/WEIRS-RPG/apps/web/lib/compendium-demo.ts';
    const { demoCompendium: repository } = await import(modulePath);
    const getCatalog = repository.getCreationCatalog.bind(repository);
    const get = repository.get.bind(repository);
    repository.getCreationCatalog = async (draft: any, signal: AbortSignal) => {
      const catalog = await getCatalog(draft, signal);
      return {
        ...catalog,
        entries: catalog.entries.filter(
          (entry: any) =>
            entry.kind !== 'magia' ||
            draft.spellSelections.some(
              (selection: any) => selection.spellRef.revisionId === entry.ref.revisionId,
            ),
        ),
      };
    };
    let attempts = 0;
    repository.get = async (ref: any, signal: AbortSignal) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      if (attempts++ === 0) throw new Error('indisponível');
      return get(ref, signal);
    };
  });
  const profile = await startClass(page, 'Mago', false);
  await search(profile, 'Luz');
  await profile.getByRole('button', { name: 'Sobre Luz', exact: true }).focus();
  const tooltip = profile.getByRole('tooltip');
  await expect(tooltip.getByRole('status')).toBeVisible();
  await expect(tooltip).toContainText('Não foi possível carregar a descrição');
  await tooltip.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(tooltip).toContainText('Você toca');
  await expect(profile.getByRole('checkbox', { name: 'Luz', exact: true })).not.toBeChecked();
  const bounds = await tooltip.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual((await page.viewportSize())!.width);
});

test('voltar à etapa durante atualização do catálogo mantém as cotas de truques e preparo protegidas', async ({
  page,
}) => {
  await page.goto('app.html#/fichas/nova?demo=1');
  await page.evaluate(async () => {
    const modulePath = '/WEIRS-RPG/apps/web/lib/compendium-demo.ts';
    const { demoCompendium: repository } = await import(modulePath);
    const getCatalog = repository.getCreationCatalog.bind(repository);
    const pending: (() => void)[] = [];
    (window as any).releaseSpellCatalog = () => pending.splice(0).forEach((release) => release());
    repository.getCreationCatalog = async (draft: any, signal: AbortSignal) => {
      const catalog = await getCatalog(draft, signal);
      if (draft.spellSelections.length)
        await new Promise<void>((resolve) => {
          pending.push(resolve);
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
      return {
        ...catalog,
        entries: catalog.entries.filter(
          (entry: any) =>
            entry.kind !== 'magia' ||
            draft.spellSelections.some(
              (selection: any) => selection.spellRef.revisionId === entry.ref.revisionId,
            ),
        ),
      };
    };
  });
  const profile = await startClass(page, 'Mago', false);
  for (const name of ['Luz', 'Mãos Mágicas', 'Raio de Gelo'])
    await (await search(profile, name)).check();
  await expect(profile).toContainText('Truques: 3/3');
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  await expect(await search(profile, 'Ilusão Menor')).toBeDisabled();
  await page.evaluate(() => (window as any).releaseSpellCatalog());
  await expect(profile).toContainText('Truques: 3/3');
  await expect(profile.getByRole('checkbox', { name: 'Ilusão Menor', exact: true })).toBeDisabled();
  await (await search(profile, 'Luz')).uncheck();
  await expect(await search(profile, 'Ilusão Menor')).toBeEnabled();
  await profile.getByRole('tab', { name: 'Círculo 1', exact: true }).click();
  for (const name of [
    'Absorver Elementos',
    'Alarme',
    'Armadura Arcana',
    'Catapulta',
    'Causar Medo',
    'Compreender Idiomas',
  ])
    await (await search(profile, name)).check();
  await expect(profile).toContainText('Preparadas: 4/4');
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await page.getByRole('button', { name: '6 Magias', exact: true }).click();
  await profile.getByRole('tab', { name: 'Círculo 1', exact: true }).click();
  await search(profile, 'Compreender Idiomas');
  const prepare = profile.getByRole('checkbox', {
    name: 'Preparar Compreender Idiomas',
    exact: true,
  });
  await expect(prepare).toBeDisabled();
  await page.evaluate(() => (window as any).releaseSpellCatalog());
  await expect(profile).toContainText('Preparadas: 4/4');
  await expect(prepare).toBeDisabled();
});
