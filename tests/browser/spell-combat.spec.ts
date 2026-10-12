import { test, expect } from '@playwright/test';
import { backend } from './backend';
import { chatBackend } from './chat-backend';
import { sessionBackend } from './session-backend';

test('magia tem danos por tipo e rola em Combate sem duplicar ataques', async ({ page }, info) => {
  const sheets = await backend(page),
    chat = await chatBackend(page);
  chat.rollResult = {
    regras: 1,
    expressao: '2d6+2d6',
    total: 20,
    termos: [
      { sinal: 1, faces: 6, dados: [4, 5], selecionados: [1, 2], subtotal: 9 },
      { sinal: 1, faces: 6, dados: [5, 6], selecionados: [1, 2], subtotal: 11 },
    ],
    parcelas: [
      { id: 'fogo', tipo: 'Fogo', expressao: '2d6', total: 9 },
      { id: 'frio', tipo: 'Frio', expressao: '2d6', total: 11 },
    ],
  };
  await page.goto('app.html#/fichas/' + sheets.rows[0].id);
  await page.getByRole('tab', { name: 'Magias', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar magia', exact: true }).click();
  await page.getByLabel('Nome da magia', { exact: true }).fill('Chama gelada');
  await page.getByRole('button', { name: 'Adicionar dano à magia', exact: true }).click();
  await page.getByLabel('Fórmula do dano da magia', { exact: true }).fill('2d6');
  await page.getByLabel('Tipo do dano da magia', { exact: true }).fill('Fogo');
  await page.getByRole('button', { name: 'Adicionar dano à magia', exact: true }).click();
  await page.getByLabel('Fórmula do dano da magia', { exact: true }).nth(1).fill('2d6');
  await page.getByLabel('Tipo do dano da magia', { exact: true }).nth(1).fill('Frio');
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(page.getByText('Ficha salva na mesa.', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Combate', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Magias de combate', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Rolar dano de magia: Chama gelada', exact: true }),
  ).toBeEnabled();
  expect(sheets.rows[0].conteudo.ataques).toHaveLength(0);
  expect(sheets.rows[0].conteudo.magias).toHaveLength(1);
  await page.getByLabel('Animar meus dados em 3D').uncheck();
  await page
    .getByRole('button', { name: 'Rolar dano de magia: Chama gelada', exact: true })
    .click();
  await expect.poll(() => chat.commands.length).toBe(1);
  expect(chat.commands[0]).toMatchObject({
    acao: 'magia_dano',
    entrada_id: sheets.rows[0].conteudo.magias[0].id,
    versao: 2,
  });
  await page.screenshot({
    path: 'artifacts/' + info.project.name + '/magias-combate.png',
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Ver no chat', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Fogo');
  await expect(page.getByRole('log')).toContainText('Frio');
  await expect(page.getByRole('log').getByLabel('Dano por tipo')).toContainText('9');
  await expect(page.getByRole('log').getByLabel('Dano por tipo')).toContainText('11');
  await expect(page.getByRole('log')).toContainText('20');
});
test('painel da sessão usa as mesmas parcelas da magia salva', async ({ page }) => {
  const sheets = await backend(page),
    chat = await chatBackend(page);
  await sessionBackend(page, sheets, chat);
  const { novaEntrada } = await import('../../packages/sheets/modelo.js');
  const spell = {
    ...novaEntrada('magias'),
    nome: 'Chama gelada',
    dano: '2d6+2d6',
    danos: [
      { id: crypto.randomUUID(), dado: '2d6', atributo: '', tipo: 'Fogo' },
      { id: crypto.randomUUID(), dado: '2d6', atributo: '', tipo: 'Frio' },
    ],
  };
  sheets.rows[0].conteudo.magias.push(spell);
  await page.goto('app.html#/chat');
  await page.getByLabel('Animar meus dados em 3D').uncheck();
  await page.getByRole('button', { name: 'Minha ficha', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Ficha durante a sessão' });
  await panel.getByRole('button', { name: 'Ações', exact: true }).click();
  await expect(panel).toContainText('2d6 Fogo');
  await expect(panel).toContainText('2d6 Frio');
  await panel.getByRole('button', { name: 'Dano de magia: Chama gelada', exact: true }).click();
  await expect.poll(() => chat.commands.length).toBe(1);
  expect(chat.commands[0]).toMatchObject({ acao: 'magia_dano', entrada_id: spell.id });
});

test('editar fórmula antiga por teclado mantém o foco e converte sem perder texto ou tipo', async ({
  page,
}) => {
  const sheets = await backend(page);
  const { novaEntrada } = await import('../../packages/sheets/modelo.js');
  const spell = { ...novaEntrada('magias'), nome: 'Magia antiga', dano: '1d6', tipoDano: 'Frio' };
  sheets.rows[0].conteudo.magias.push(spell);
  await page.goto('app.html#/fichas/' + sheets.rows[0].id);
  await page.getByRole('tab', { name: 'Magias', exact: true }).click();
  const formula = page.getByLabel('Fórmula do dano da magia', { exact: true });
  await formula.press('ControlOrMeta+A');
  await formula.pressSequentially('2d6+3');
  await expect(formula).toHaveValue('2d6+3');
  await expect(formula).toBeFocused();
  await expect(page.getByLabel('Tipo do dano da magia', { exact: true })).toHaveValue('Frio');
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(page.getByText('Ficha salva na mesa.', { exact: true })).toBeVisible();
  const updated = sheets.rows[0].conteudo.magias[0];
  expect(updated.dano).toBe('2d6+3');
  expect(updated.danos).toHaveLength(1);
  expect(updated.danos![0].id).not.toBe(spell.id);
});

test('total e subtotais de magia só aparecem depois da animação dos mesmos dados', async ({
  page,
}) => {
  const sheets = await backend(page),
    chat = await chatBackend(page);
  await sessionBackend(page, sheets, chat);
  const { novaEntrada } = await import('../../packages/sheets/modelo.js');
  const spell = {
    ...novaEntrada('magias'),
    nome: 'Chama gelada',
    dano: '2d6+2d6',
    danos: [
      { id: crypto.randomUUID(), dado: '2d6', atributo: '', tipo: 'Fogo' },
      { id: crypto.randomUUID(), dado: '2d6', atributo: '', tipo: 'Frio' },
    ],
  };
  sheets.rows[0].conteudo.magias.push(spell);
  chat.rollResult = {
    regras: 1,
    expressao: '2d6+2d6',
    total: 20,
    termos: [
      { sinal: 1, faces: 6, dados: [4, 5], selecionados: [1, 2], subtotal: 9 },
      { sinal: 1, faces: 6, dados: [5, 6], selecionados: [1, 2], subtotal: 11 },
    ],
    parcelas: [
      { id: spell.danos[0].id, tipo: 'Fogo', expressao: '2d6', total: 9 },
      { id: spell.danos[1].id, tipo: 'Frio', expressao: '2d6', total: 11 },
    ],
  };
  await page.goto('app.html#/chat');
  await page.getByRole('button', { name: 'Minha ficha', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Ficha durante a sessão' });
  await panel.getByRole('button', { name: 'Ações', exact: true }).click();
  await panel.getByRole('button', { name: 'Dano de magia: Chama gelada', exact: true }).click();
  const dice = page.getByRole('region', { name: 'Dados 3D' });
  await expect(dice).toHaveAttribute('data-phase', 'rolando');
  await expect(page.getByRole('log').getByLabel('Dano por tipo')).toHaveCount(0);
  await expect(dice.getByLabel('Dano por tipo')).toHaveCount(0);
  await expect(dice).toHaveAttribute('data-phase', 'concluida', { timeout: 15000 });
  await expect(page.getByRole('log').getByLabel('Dano por tipo')).toContainText('Fogo');
  await expect(page.getByRole('log').getByLabel('Dano por tipo')).toContainText('9');
  await expect(dice.getByLabel('Dano por tipo')).toContainText('Frio');
  await expect(dice.getByLabel('Dano por tipo')).toContainText('11');
});
