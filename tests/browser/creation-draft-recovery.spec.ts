import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { creationBackend } from './creation-backend';
import { campaignId } from './backend';

const catalog = JSON.parse(await readFile('public/compendium/demo.json', 'utf8')).catalog;
const storagePrefix = 'weirs-rpg:creation-draft:';

async function settled(page: Page) {
  await expect(page.getByText('Atualizando regras e benefícios…', { exact: true })).toBeHidden({
    timeout: 20_000,
  });
}

async function choose(page: Page, label: string, name: string, kind?: string) {
  const source = kind
    ? catalog.entries.find((entry: any) => entry.kind === kind && entry.name === name).sourceTitle
    : 'Teste';
  await page.getByRole('combobox', { name: label, exact: true }).fill(name);
  await page.getByRole('option', { name: `${name} · ${source}`, exact: true }).click();
  await settled(page);
}

test('demo: reload recupera origens, escolhas, nome, PV e nível vazio obrigatório', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('app.html#/fichas/nova?demo=1');
  await settled(page);
  await page.getByLabel('Força: valor base', { exact: true }).fill('16');
  await page.getByLabel('Destreza: valor base', { exact: true }).fill('0');
  await page.getByRole('button', { name: '2 Espécie', exact: true }).click();
  await choose(page, 'Espécie', 'Anansis', 'especie');
  await page.getByRole('button', { name: '3 Antecedente', exact: true }).click();
  await choose(page, 'Antecedente', 'Soldado', 'antecedente');
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await choose(page, 'Classe', 'Guerreiro', 'classe');
  const level = page.getByLabel('Níveis em Guerreiro', { exact: true });
  await level.fill('3');
  await level.press('Tab');
  await choose(page, 'Subclasse de Guerreiro', 'Campeão', 'subclasse');
  await page.getByLabel('Atletismo', { exact: true }).check();
  await page.getByRole('button', { name: '5 Vida e defesas', exact: true }).click();
  await page.getByLabel('Método de PV do nível 3', { exact: true }).selectOption('external');
  await page.getByLabel('Resultado de PV do nível 3', { exact: true }).fill('7');
  await page.getByRole('button', { name: '7 Revisão', exact: true }).click();
  await page.getByLabel('Nome do personagem', { exact: true }).fill('Rascunho recuperado');
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await level.fill('');
  await level.press('Tab');

  await page.reload();
  await settled(page);
  await expect(level).toBeVisible();
  await expect(level).toHaveValue('');
  await expect(level).toHaveAttribute('required', '');
  await expect(level).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert')).toHaveText('O nível da classe é obrigatório.');
  await expect(page.getByRole('combobox', { name: 'Classe', exact: true })).toHaveValue(
    'Guerreiro',
  );
  await expect(
    page.getByRole('combobox', { name: 'Subclasse de Guerreiro', exact: true }),
  ).toHaveValue('Campeão');
  await expect(page.getByLabel('Atletismo', { exact: true })).toBeChecked();
  await page.getByRole('button', { name: '5 Vida e defesas', exact: true }).click();
  await expect(page.getByLabel('Método de PV do nível 3', { exact: true })).toHaveValue('external');
  await expect(page.getByLabel('Resultado de PV do nível 3', { exact: true })).toHaveValue('7');
  await page.getByRole('button', { name: '2 Espécie', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Espécie', exact: true })).toHaveValue('Anansis');
  await page.getByRole('button', { name: '3 Antecedente', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Antecedente', exact: true })).toHaveValue(
    'Soldado',
  );
  await page.getByRole('button', { name: '1 Atributos', exact: true }).click();
  await expect(page.getByLabel('Força: valor base', { exact: true })).toHaveValue('16');
  await expect(page.getByLabel('Destreza: valor base', { exact: true })).toHaveValue('0');
  await page.getByRole('button', { name: '7 Revisão', exact: true }).click();
  await expect(page.getByLabel('Nome do personagem', { exact: true })).toHaveValue(
    'Rascunho recuperado',
  );
  await expect(
    page.getByRole('button', { name: 'Abrir ficha temporária', exact: true }),
  ).toBeDisabled();
});

test('demo: reload aplica nível válido pendente sem perder subclasse e PV anteriores', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('app.html#/fichas/nova?demo=1');
  await settled(page);
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await choose(page, 'Classe', 'Guerreiro', 'classe');
  const level = page.getByLabel('Níveis em Guerreiro', { exact: true });
  await level.fill('3');
  await level.press('Tab');
  await choose(page, 'Subclasse de Guerreiro', 'Campeão', 'subclasse');
  await page.getByRole('button', { name: '5 Vida e defesas', exact: true }).click();
  await page.getByLabel('Método de PV do nível 3', { exact: true }).selectOption('external');
  await page.getByLabel('Resultado de PV do nível 3', { exact: true }).fill('7');
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await level.fill('12');
  // No blur: this is the edit that a page reload interrupts.
  await page.reload();
  await settled(page);
  await expect(level).toHaveValue('12');
  await expect(page.getByLabel('Resumo do personagem')).toContainText('Guerreiro 12');
  await expect(
    page.getByRole('combobox', { name: 'Subclasse de Guerreiro', exact: true }),
  ).toHaveValue('Campeão');
  await page.getByRole('button', { name: '5 Vida e defesas', exact: true }).click();
  await expect(page.getByText('Nível 12 · Guerreiro', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Método de PV do nível 3', { exact: true })).toHaveValue('external');
  await expect(page.getByLabel('Resultado de PV do nível 3', { exact: true })).toHaveValue('7');
});

test('demo: reload reconcilia duas edições pendentes de multiclasse em conjunto', async ({
  page,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('app.html#/fichas/nova?demo=1');
  await settled(page);
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await choose(page, 'Classe', 'Guerreiro', 'classe');
  await choose(page, 'Adicionar multiclasse', 'Mago', 'classe');
  // Exercise recovery of multiple pending values in the same saved draft, not sequential blur events.
  await page.evaluate((prefix) => {
    const key = Object.keys(sessionStorage).find((key) => key.startsWith(prefix))!;
    const saved = JSON.parse(sessionStorage.getItem(key)!);
    saved.value.classLevelInputs = Object.fromEntries(
      saved.value.draft.classes.map((cls: any, index: number) => [cls.id, index === 0 ? '5' : '4']),
    );
    saved.value.step = 6;
    sessionStorage.setItem(key, JSON.stringify(saved));
  }, storagePrefix);
  await page.reload();
  await settled(page);
  await expect(page.getByLabel('Resumo do personagem')).toContainText('Guerreiro 5');
  await expect(page.getByLabel('Resumo do personagem')).toContainText('Mago 4');
  await page.getByRole('button', { name: '5 Vida e defesas', exact: true }).click();
  await expect(page.getByText('Nível 5 · Guerreiro', { exact: true })).toBeVisible();
  await expect(page.getByText('Nível 9 · Mago', { exact: true })).toBeVisible();
});

for (const input of ['0', '21', '1.5']) {
  test(`demo: reload mantém nível pendente inválido ${input} e bloqueia conclusão`, async ({
    page,
  }) => {
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('app.html#/fichas/nova?demo=1');
    await settled(page);
    await page.getByRole('button', { name: '4 Classes', exact: true }).click();
    await choose(page, 'Classe', 'Guerreiro', 'classe');
    const level = page.getByLabel('Níveis em Guerreiro', { exact: true });
    await level.fill(input);
    await page.reload();
    await settled(page);
    await expect(level).toHaveValue(input);
    await expect(level).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Resumo do personagem')).toContainText('Guerreiro 1');
    await page.getByRole('button', { name: '7 Revisão', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Informe um nível inteiro entre 1 e 20.');
    await expect(
      page.getByRole('button', { name: 'Abrir ficha temporária', exact: true }),
    ).toBeDisabled();
  });
}

for (const corruption of ['json', 'version', 'account', 'campaign', 'shape'] as const) {
  test(`demo: armazenamento ${corruption} inválido é descartado sem quebrar o criador`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('app.html#/fichas/nova?demo=1');
    await settled(page);
    await page.getByLabel('Força: valor base', { exact: true }).fill('16');
    await page.evaluate(
      ({ prefix, corruption }) => {
        const key = Object.keys(sessionStorage).find((key) => key.startsWith(prefix));
        if (!key) throw new Error('O criador não persistiu o rascunho da sessão.');
        const stored = JSON.parse(sessionStorage.getItem(key)!);
        if (corruption === 'version') stored.version = 999;
        if (corruption === 'account') stored.account = 'outra-conta';
        if (corruption === 'campaign') stored.campaign = 'outra-campanha';
        if (corruption === 'shape') stored.value.draft.classes = [{ level: 3 }];
        sessionStorage.setItem(
          key,
          corruption === 'json' ? '{rascunho incompleto' : JSON.stringify(stored),
        );
      },
      { prefix: storagePrefix, corruption },
    );
    await page.reload();
    await settled(page);
    await expect(page.getByLabel('Força: valor base', { exact: true })).toHaveValue('');
    await expect(
      page.getByRole('heading', { name: 'Criar personagem', exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('demo: storage indisponível mantém fallback em memória entre visitas', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      get() {
        throw new Error('Storage indisponível');
      },
    });
  });
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('app.html#/fichas/nova?demo=1');
  await settled(page);
  await page.getByLabel('Força: valor base', { exact: true }).fill('16');
  await page.goto('app.html#/fichas/teste');
  await expect(page.getByText('Ficha temporária', { exact: true })).toBeVisible();
  await page.goto('app.html#/fichas/nova?demo=1');
  await settled(page);
  await expect(page.getByLabel('Força: valor base', { exact: true })).toHaveValue('16');
});

async function readyAuthenticated(page: Page) {
  for (const label of ['Força', 'Destreza', 'Constituição', 'Inteligência', 'Sabedoria', 'Carisma'])
    await page.getByLabel(`${label}: valor base`, { exact: true }).fill('14');
  await page.getByRole('button', { name: '2 Espécie', exact: true }).click();
  await choose(page, 'Espécie', 'Espécie de teste');
  await page.getByRole('button', { name: '3 Antecedente', exact: true }).click();
  await choose(page, 'Antecedente', 'Origem de teste');
  await page.getByLabel('Força: bônus do antecedente', { exact: true }).fill('2');
  await page.getByLabel('Constituição: bônus do antecedente', { exact: true }).fill('1');
  await page.getByRole('button', { name: '4 Classes', exact: true }).click();
  await choose(page, 'Classe', 'Classe de teste');
  await page.getByRole('button', { name: '7 Revisão', exact: true }).click();
  await page.getByLabel('Nome do personagem', { exact: true }).fill('Pedido recuperado');
  await page.getByLabel('Campanha', { exact: true }).selectOption(campaignId);
}

test('auth: reload preserva tentativa idempotente e sucesso limpa o rascunho', async ({ page }) => {
  const backend = await creationBackend(page);
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('app.html#/fichas/nova');
  await readyAuthenticated(page);
  await page.getByRole('button', { name: 'Criar ficha na campanha', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível');
  await page.reload();
  await settled(page);
  await expect(page.getByLabel('Nome do personagem', { exact: true })).toHaveValue(
    'Pedido recuperado',
  );
  await expect(page.getByLabel('Nome do personagem', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Campanha', { exact: true })).toHaveValue(campaignId);
  await page.getByRole('button', { name: 'Criar ficha na campanha', exact: true }).click();
  await expect(page.getByText('Ficha de personagem', { exact: true })).toBeVisible();
  expect(backend.state.rows).toHaveLength(1);
  expect(backend.requests).toHaveLength(2);
  expect(backend.requests[1]).toEqual(backend.requests[0]);
  await page.getByRole('link', { name: 'Fichas', exact: true }).click();
  await page.getByRole('link', { name: 'Criar personagem +', exact: true }).click();
  await page.reload();
  await settled(page);
  await expect(page.getByLabel('Força: valor base', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: '7 Revisão', exact: true }).click();
  await expect(page.getByLabel('Nome do personagem', { exact: true })).toHaveValue('');
});

test('auth: logout elimina rascunhos da sessão sem limpar armazenamento de outros recursos', async ({
  page,
}) => {
  await creationBackend(page);
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('app.html#/fichas/nova');
  await page.getByLabel('Força: valor base', { exact: true }).fill('16');
  await page.goto(`app.html#/fichas/nova?campanha=${campaignId}`);
  await page.reload();
  await settled(page);
  await page.getByLabel('Força: valor base', { exact: true }).fill('12');
  await page.evaluate(() => sessionStorage.setItem('outro-recurso', 'preservado'));
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Experimentar ficha', exact: true })).toBeVisible();
  // The backend fixture signs this same account in again on a full navigation.
  await page.reload();
  await settled(page);
  await expect(page.getByLabel('Força: valor base', { exact: true })).toHaveValue('');
  await page.goto('app.html#/fichas/nova');
  await page.reload();
  await settled(page);
  await expect(page.getByLabel('Força: valor base', { exact: true })).toHaveValue('');
  expect(await page.evaluate(() => sessionStorage.getItem('outro-recurso'))).toBe('preservado');
});

test('auth: campanhas recuperam somente seu próprio rascunho', async ({ page }) => {
  await creationBackend(page);
  page.on('dialog', (dialog) => dialog.accept());
  const first = `app.html#/fichas/nova?campanha=${campaignId}`;
  const second = 'app.html#/fichas/nova?campanha=00000000-0000-4000-8000-000000000002';
  await page.goto(first);
  await page.getByLabel('Força: valor base', { exact: true }).fill('16');
  await page.goto(second);
  await settled(page);
  await expect(page.getByLabel('Força: valor base', { exact: true })).toHaveValue('');
  await page.getByLabel('Força: valor base', { exact: true }).fill('12');
  await page.goto(first);
  await page.reload();
  await settled(page);
  await expect(page.getByLabel('Força: valor base', { exact: true })).toHaveValue('16');
  await page.goto(second);
  await page.reload();
  await settled(page);
  await expect(page.getByLabel('Força: valor base', { exact: true })).toHaveValue('12');
});
