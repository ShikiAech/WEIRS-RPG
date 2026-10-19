import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { backend } from './backend';
import { chatBackend } from './chat-backend';
import { sessionBackend } from './session-backend';
import {
  novoEquipamento,
  novoAtaqueEquipamento,
  sincronizarEquipamentos,
} from '../../packages/sheets/equipamentos.js';
import { novaEntrada } from '../../packages/sheets/modelo.js';

test('equipamentos guardam ataques múltiplos, recursos e sintonia na cópia da ficha', async ({
  page,
}, info) => {
  await page.goto('app.html#/fichas/teste');
  await page.getByLabel('Nome do personagem', { exact: true }).fill('Viajante');
  await page.getByRole('tab', { name: 'Inventário', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar item', exact: true }).click();
  await page.getByLabel('Nome do item', { exact: true }).fill('Lâmina solar');
  await page.getByLabel('Tipo de equipamento', { exact: true }).selectOption('arma');
  await page.getByLabel('Crítico a partir de', { exact: true }).fill('19');
  await page.getByRole('button', { name: 'Adicionar ataque à arma', exact: true }).click();
  await page.getByLabel('Proficiente com a arma', { exact: true }).check();
  await page.getByLabel('Fórmula de dados', { exact: true }).fill('1d8');
  await page.getByLabel('Atributo do dano', { exact: true }).selectOption('for');
  await page.getByLabel('Tipo de dano', { exact: true }).fill('cortante');
  await page.getByRole('button', { name: 'Adicionar dano', exact: true }).click();
  await page.getByLabel('Fórmula de dados', { exact: true }).nth(1).fill('1d6');
  await page.getByLabel('Tipo de dano', { exact: true }).nth(1).fill('fogo');
  await page.getByRole('button', { name: 'Adicionar recurso ao item', exact: true }).click();
  await page.getByLabel('Nome do recurso', { exact: true }).fill('Energia solar');
  await page.getByLabel('Quantidade máxima', { exact: true }).fill('3');
  await page.getByLabel('Quantidade atual', { exact: true }).fill('2');
  await page.getByLabel('Item sintonizado', { exact: true }).check();
  await page.getByRole('tab', { name: 'Atributos e perícias', exact: true }).click();
  await page.getByLabel('Força: valor', { exact: true }).fill('18');
  await page.getByRole('tab', { name: 'Inventário', exact: true }).click();
  await expect(page.getByText(/^Acerto /)).toContainText('+6');
  await page.screenshot({
    path: `artifacts/ficha-ux/02-arma-${info.project.name}.png`,
    fullPage: true,
  });
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar ficha', exact: true }).click();
  const download = await downloading;
  const snapshot = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(snapshot.conteudo.ataques[0]).toMatchObject({ valor: 6, dano: '1d8+4+1d6', critico: 19 });
  expect(snapshot.conteudo.recursos[0]).toMatchObject({
    maximo: 3,
    gastos: 1,
    itemId: snapshot.conteudo.inventario.itens[0].id,
  });
  expect(snapshot.conteudo.inventario.sintonizados).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('pop-up exibe equipamento, ataques e recursos vinculados com gasto compartilhado', async ({
  page,
}, info) => {
  const sheets = await backend(page),
    chat = await chatBackend(page),
    session = await sessionBackend(page, sheets, chat);
  const f = sheets.rows[0],
    item = { ...novoEquipamento(), nome: 'Lâmina solar', tipo: 'arma' as const, critico: 19 };
  f.conteudo.inventario.itens.push(item);
  f.conteudo.ataques.push(novoAtaqueEquipamento(item));
  f.conteudo.recursos.push({
    ...novaEntrada('recursos'),
    nome: 'Energia solar',
    maximo: 3,
    gastos: 1,
    itemId: item.id,
  });
  f.conteudo = sincronizarEquipamentos(f.conteudo);
  await page.goto('app.html#/chat');
  await page.getByRole('button', { name: 'Minha ficha', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Ficha durante a sessão' });
  await panel.getByRole('button', { name: 'Inventário', exact: true }).click();
  await panel.getByText('Detalhes de Lâmina solar', { exact: true }).click();
  await expect(panel).toContainText('Crítico 19–20');
  await expect(panel).toContainText('Energia solar · 2/3');
  await panel.getByRole('button', { name: 'Gastar Energia solar', exact: true }).click();
  await expect(panel).toContainText('Energia solar · 1/3');
  expect(session.operations.at(-1)?.command).toMatchObject({
    tipo: 'gasto',
    caminho: 'recurso',
    entrada_id: f.conteudo.recursos[0].id,
  });
  await panel.getByRole('button', { name: 'Recursos', exact: true }).click();
  await expect(panel).toContainText('Energia solar · 1/3');
  await page.screenshot({
    path: `artifacts/ficha-ux/04-popup-${info.project.name}.png`,
    fullPage: true,
  });
});

test('magias podem ser pesquisadas, marcadas e agrupadas com espaços configuráveis', async ({
  page,
}, info) => {
  await page.goto('app.html#/fichas/teste');
  await page.getByRole('tab', { name: 'Magias', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar perfil de conjuração', exact: true }).click();
  await page.getByLabel('Nome do perfil', { exact: true }).fill('Bardo');
  await page.getByLabel('Novo círculo de espaços', { exact: true }).selectOption('2');
  await page.getByRole('button', { name: 'Adicionar espaços', exact: true }).click();
  await page.getByLabel('Círculo 2: total', { exact: true }).fill('3');
  await page.getByLabel('Círculo 2: gastos', { exact: true }).fill('1');
  await expect(page.getByText('2 de 3 disponíveis', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Buscar magias no compêndio', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Adicionar magias do compêndio', exact: true });
  await dialog.getByLabel('Buscar magias', { exact: true }).fill('acalmar emocoes');
  await dialog.getByLabel('Acalmar Emoções', { exact: true }).check();
  await expect(dialog.getByText('Na ficha', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Concluir seleção', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Círculo 2 · 1 magia', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Descrição da magia', { exact: true })).toHaveValue(/hostil/i);
  await page.getByRole('button', { name: 'Buscar magias no compêndio', exact: true }).click();
  await expect(dialog.getByLabel('Buscar magias', { exact: true })).toBeFocused();
  await dialog.getByLabel('Buscar magias', { exact: true }).fill('acalmar');
  await expect(dialog.getByLabel('Acalmar Emoções', { exact: true })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Buscar magias no compêndio', exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: `artifacts/ficha-ux/03-magias-${info.project.name}.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
