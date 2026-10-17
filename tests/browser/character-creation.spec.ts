import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const snapshot = JSON.parse(await readFile('public/compendium/demo.json', 'utf8')).catalog;
const find = (kind: string, name: string, path?: string) =>
  snapshot.entries.find(
    (e: any) => e.kind === kind && e.name === name && (!path || e.source.path === path),
  );
test('assistente demonstra atributos, origens e revisão antes de abrir a ficha', async ({
  page,
}, info) => {
  await page.goto('app.html#/fichas/nova?demo=1');
  await expect(page.getByRole('heading', { name: 'Criar personagem', exact: true })).toBeVisible();
  await expect(page.getByText('Demonstração do assistente', { exact: false })).toBeVisible();
  for (const label of ['Força', 'Destreza', 'Constituição', 'Inteligência', 'Sabedoria', 'Carisma'])
    await page.getByLabel(`${label}: valor base`, { exact: true }).fill('14');
  await page.getByRole('button', { name: 'Próxima etapa', exact: true }).click();
  await page.getByLabel('Buscar espécie', { exact: true }).fill('Anansis');
  await page
    .getByLabel('Espécie', { exact: true })
    .selectOption(find('especie', 'Anansis').ref.revisionId);
  await page.getByRole('button', { name: 'Próxima etapa', exact: true }).click();
  await page.getByLabel('Buscar antecedente', { exact: true }).fill('Criminoso');
  const bg = find('antecedente', 'Criminoso', 'data/background.json');
  await page.getByLabel('Antecedente', { exact: true }).selectOption(bg.ref.revisionId);
  await page.getByLabel('Destreza: bônus do antecedente', { exact: true }).fill('2');
  await page.getByLabel('Constituição: bônus do antecedente', { exact: true }).fill('1');
  await page
    .getByLabel('Equipamento de Criminoso', { exact: true })
    .selectOption(
      snapshot.equipmentOptions.find(
        (o: any) => o.ownerRevisionId === bg.ref.revisionId && o.key === 'B',
      ).id,
    );
  await page.getByRole('button', { name: 'Próxima etapa', exact: true }).click();
  const cls = find('classe', 'Guerreiro');
  await page.getByLabel('Buscar classe', { exact: true }).fill('Guerreiro');
  await page.getByLabel('Classe', { exact: true }).selectOption(cls.ref.revisionId);
  await page.getByLabel('Atletismo', { exact: true }).check();
  await page.getByLabel('Percepção', { exact: true }).check();
  const style = snapshot.entries.find(
    (e: any) =>
      e.kind === 'talento' && e.source.path === 'data/feats.json' && e.originalName === 'Archery',
  );
  await page.getByLabel(style.name, { exact: true }).check();
  const mastery = snapshot.choices.find(
    (g: any) => g.ownerRevisionId === cls.ref.revisionId && g.key === 'maestrias-1',
  );
  for (const option of mastery.options.slice(0, mastery.minimum)) {
    await page.getByLabel(`Buscar em ${mastery.name}`, { exact: true }).fill(option.name);
    await page.getByLabel(option.name, { exact: true }).check();
  }
  await page
    .getByLabel('Equipamento de Guerreiro', { exact: true })
    .selectOption(
      snapshot.equipmentOptions.find(
        (o: any) => o.ownerRevisionId === cls.ref.revisionId && o.key === 'C',
      ).id,
    );
  await page.getByRole('button', { name: 'Próxima etapa', exact: true }).click();
  await expect(page.getByText(/PV máximos:/)).toBeVisible();
  await page.getByRole('button', { name: 'Próxima etapa', exact: true }).click();
  await expect(page.getByText(/As magias e usos concedidos/)).toBeVisible();
  await page.getByRole('button', { name: 'Próxima etapa', exact: true }).click();
  await page.getByLabel('Nome do personagem', { exact: true }).fill('Anansi de teste');
  await expect(page.getByText('Nenhuma pendência obrigatória.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `artifacts/character-creation/${info.project.name}-review.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Abrir ficha temporária', exact: true }).click();
  await expect(page.getByText('Ficha temporária', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Espécie', { exact: true })).toHaveValue('Anansis');
  await expect(page.getByLabel('Nome do personagem', { exact: true })).toHaveValue(
    'Anansi de teste',
  );
});
test('rolagens ficam no rascunho entre etapas e não escolhem um conjunto automaticamente', async ({
  page,
}) => {
  await page.goto('app.html#/fichas/nova?demo=1');
  await page.getByLabel('Gerar atributos com 4d6').check();
  await page.getByRole('button', { name: 'Gerar dois conjuntos' }).click();
  await expect(page.getByLabel('Usar conjunto 1')).not.toBeChecked();
  await expect(page.getByLabel('Usar conjunto 2')).not.toBeChecked();
  const before = (await page.getByTestId('ability-sets').textContent()) ?? '';
  await page.getByLabel('Usar conjunto 2').check();
  await page.getByRole('button', { name: 'Próxima etapa', exact: true }).click();
  await page.getByRole('button', { name: 'Etapa anterior', exact: true }).click();
  await expect(page.getByTestId('ability-sets')).toHaveText(before);
  await expect(page.getByLabel('Usar conjunto 2')).toBeChecked();
});

import { creationBackend } from './creation-backend';
import { campaignId } from './backend';
test('criação autenticada repete a mesma tentativa depois de resposta perdida', async ({
  page,
}) => {
  const backend = await creationBackend(page);
  await page.goto('app.html#/fichas/nova');
  for (const label of ['Força', 'Destreza', 'Constituição', 'Inteligência', 'Sabedoria', 'Carisma'])
    await page.getByLabel(`${label}: valor base`, { exact: true }).fill('14');
  await page.getByRole('button', { name: 'Próxima etapa', exact: true }).click();
  await page
    .getByLabel('Espécie', { exact: true })
    .selectOption({ label: 'Espécie de teste · Teste' });
  await page.getByRole('button', { name: 'Próxima etapa', exact: true }).click();
  await page
    .getByLabel('Antecedente', { exact: true })
    .selectOption({ label: 'Origem de teste · Teste' });
  await page.getByLabel('Força: bônus do antecedente', { exact: true }).fill('2');
  await page.getByLabel('Constituição: bônus do antecedente', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Próxima etapa', exact: true }).click();
  await page
    .getByLabel('Classe', { exact: true })
    .selectOption({ label: 'Classe de teste · Teste' });
  await page.getByRole('button', { name: '7 Revisão', exact: true }).click();
  await page.getByLabel('Nome do personagem', { exact: true }).fill('Persistente');
  await page.getByLabel('Campanha', { exact: true }).selectOption(campaignId);
  await page.getByRole('button', { name: 'Criar ficha na campanha', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível');
  expect(backend.state.rows).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Revisar escolhas', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Nome do personagem', { exact: true })).toBeDisabled();
  await page.route('**/rest/v1/rpc/obter_compendio', (route) =>
    route.fulfill({ status: 503, json: { message: 'Indisponível' } }),
  );
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('link', { name: 'Fichas', exact: true }).click();
  await page.getByRole('link', { name: 'Criar personagem +', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Suas escolhas foram preservadas' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Criar ficha na campanha', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Criar ficha na campanha', exact: true }).click();
  await expect(page.getByText('Ficha de personagem', { exact: true })).toBeVisible();
  expect(backend.state.rows).toHaveLength(1);
  expect(backend.requests).toHaveLength(2);
  expect(backend.requests[0]).toEqual(backend.requests[1]);
  await expect(page.getByLabel('Nome do personagem', { exact: true })).toHaveValue('Persistente');
  await page.getByText('Histórico da criação guiada', { exact: true }).click();
  await expect(page.getByText(/histórico não reaplica benefícios/)).toBeVisible();
});
test('indisponibilidade das regras mantém atributos e logout encerra o rascunho da conta', async ({
  page,
}) => {
  await creationBackend(page);
  let failures = 1;
  await page.route('**/rest/v1/rpc/obter_compendio', async (route) => {
    if (failures-- > 0) return route.fulfill({ status: 503, json: { message: 'SQL privado' } });
    return route.fallback();
  });
  await page.goto('app.html#/fichas/nova');
  await expect(page.getByRole('alert')).toContainText('Suas escolhas foram preservadas');
  await page.getByLabel('Força: valor base', { exact: true }).fill('16');
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Força: valor base', { exact: true })).toHaveValue('16');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Experimentar ficha', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Experimentar criação guiada', exact: true }).click();
  await expect(page.getByLabel('Força: valor base', { exact: true })).toHaveValue('');
});

test('editar atributos durante falha do catálogo preserva escolhas existentes', async ({
  page,
}) => {
  const backend = await creationBackend(page);
  const gid = '00000000-0000-4000-8000-000000007001',
    oid = '00000000-0000-4000-8000-000000007002';
  backend.raw.tables.compendio_grupos_escolha = [
    {
      id: gid,
      revisao_id: '00000000-0000-4000-8000-000000001001',
      chave: 'aparencia',
      nome_pt: 'Aparência',
      minimo: 1,
      maximo: 1,
      aquisicao: 'ambas',
      pontos_atributo: null,
      limite_atributo: null,
      tipo_opcao: null,
      categoria_talento_codigo: null,
      requisito_id: null,
      nivel: 1,
    },
  ];
  backend.raw.tables.compendio_opcoes_escolha = [
    {
      id: oid,
      grupo_id: gid,
      nome_pt: 'Aparência vigilante',
      tipo: 'texto',
      alvo_revisao_id: null,
      atributo_codigo: null,
      proficiencia_id: null,
      valor: 'vigilante',
      quantidade: 1,
    },
  ];
  let unavailable = false;
  await page.route('**/rest/v1/rpc/obter_compendio', (route) =>
    unavailable
      ? route.fulfill({ status: 503, json: { message: 'Indisponível' } })
      : route.fallback(),
  );
  await page.goto('app.html#/fichas/nova');
  await page.getByRole('button', { name: '2 Espécie', exact: true }).click();
  await page
    .getByLabel('Espécie', { exact: true })
    .selectOption({ label: 'Espécie de teste · Teste' });
  await page.getByLabel('Aparência vigilante', { exact: true }).check();
  unavailable = true;
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('link', { name: 'Fichas', exact: true }).click();
  await page.getByRole('link', { name: 'Criar personagem +', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Suas escolhas foram preservadas' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '1 Atributos', exact: true }).click();
  await page.getByLabel('Força: valor base', { exact: true }).fill('16');
  unavailable = false;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Suas escolhas foram preservadas' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '2 Espécie', exact: true }).click();
  await expect(page.getByLabel('Aparência vigilante', { exact: true })).toBeChecked();
});
