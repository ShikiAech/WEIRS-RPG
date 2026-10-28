import { test, expect } from '@playwright/test';
import { backend } from './backend';
import { chatBackend } from './chat-backend';
import { sessionBackend } from './session-backend';
import { novaEntrada } from '../../packages/sheets/modelo.js';
import {
  novoEquipamento,
  novoAtaqueEquipamento,
  sincronizarEquipamentos,
} from '../../packages/sheets/equipamentos.js';

test('nome do ataque de uma arma envia a descrição na aba Inventário', async ({ page }) => {
  const sheets = await backend(page);
  const sheet = sheets.rows[0];
  const item = { ...novoEquipamento(), tipo: 'arma' as const, nome: 'Espada do inventário' };
  const attack = { ...novoAtaqueEquipamento(item), observacoes: 'Lâmina guardada' };
  sheet.conteudo.inventario.itens.push(item);
  sheet.conteudo.ataques.push(attack);
  sheet.conteudo = sincronizarEquipamentos(sheet.conteudo);
  const chat = await chatBackend(page, undefined, { sheets: sheets.rows });
  await page.goto('app.html#/fichas/' + sheet.id);
  await page.getByRole('tab', { name: 'Inventário', exact: true }).click();
  const title = page.getByRole('button', { name: 'Espada do inventário', exact: true });
  await expect(title).toBeVisible();
  await title.focus();
  await title.press('Enter');
  await expect.poll(() => chat.commands.length).toBe(1);
  expect(chat.commands[0]).toMatchObject({
    acao: 'descricao_ataque',
    entrada_id: attack.id,
    versao: 1,
  });
  await expect(
    page.getByRole('button', { name: 'Rolar ataque: Espada do inventário', exact: true }),
  ).toBeEnabled();
});

for (const surface of ['sessão', 'ficha'] as const) {
  test(`nomes enviam a descrição por teclado na ${surface} sem substituir as rolagens`, async ({
    page,
  }, info) => {
    const sheets = await backend(page);
    const sheet = sheets.rows[0];
    const attack = {
      ...novaEntrada('ataques'),
      nome: 'Espada de teste',
      dano: '1d8',
      observacoes: 'Lâmina antiga',
    };
    const feature = {
      ...novaEntrada('caracteristicas'),
      nome: 'Talento especial',
      descricao: 'Descrição da característica',
    };
    const spell = {
      ...novaEntrada('magias'),
      nome: 'Luz de teste',
      descricao: 'Uma luz brilhante',
    };
    const trait = {
      ...novaEntrada('tracos'),
      nome: 'Traço de teste',
      descricao: 'Descrição do traço',
    };
    const feat = {
      ...novaEntrada('talentos'),
      nome: 'Dom de teste',
      descricao: 'Descrição do talento',
    };
    sheet.conteudo.ataques.push(attack);
    sheet.conteudo.caracteristicas.push(feature);
    sheet.conteudo.magias.push(spell);
    sheet.conteudo.tracos.push(trait);
    sheet.conteudo.talentos.push(feat);
    const chat = await chatBackend(page, undefined, { sheets: sheets.rows });
    await sessionBackend(page, sheets, chat);
    await page.goto(surface === 'sessão' ? 'app.html#/chat' : 'app.html#/fichas/' + sheet.id);
    if (surface === 'sessão')
      await page.getByRole('button', { name: 'Minha ficha', exact: true }).click();
    const scope =
      surface === 'sessão'
        ? page.getByRole('complementary', { name: 'Ficha durante a sessão' })
        : page.locator('.sheet-page');
    if (surface === 'sessão')
      await scope.getByRole('button', { name: 'Ações', exact: true }).click();
    else await page.getByRole('tab', { name: 'Combate', exact: true }).click();
    const title = scope.getByRole('button', { name: 'Espada de teste', exact: true });
    await expect(title).toHaveAttribute('title', 'Enviar descrição ao chat');
    await title.focus();
    await title.press('Enter');
    await expect.poll(() => chat.commands.length).toBe(1);
    expect(chat.commands[0]).toMatchObject({
      acao: 'descricao_ataque',
      entrada_id: attack.id,
      versao: 1,
    });
    await expect(
      scope.getByRole('button', {
        name: surface === 'sessão' ? 'Ataque: Espada de teste' : 'Rolar ataque: Espada de teste',
        exact: true,
      }),
    ).toBeEnabled();
    await scope.getByRole('button', { name: 'Luz de teste', exact: true }).click();
    await expect.poll(() => chat.commands.length).toBe(2);
    expect(chat.commands[1]).toMatchObject({ acao: 'descricao_magia', entrada_id: spell.id });
    if (surface === 'ficha')
      await page.getByRole('tab', { name: 'Características', exact: true }).click();
    const featureTitle = scope.getByRole('button', { name: 'Talento especial', exact: true });
    await featureTitle.focus();
    await featureTitle.press('Space');
    await expect.poll(() => chat.commands.length).toBe(3);
    expect(chat.commands[2]).toMatchObject({
      acao: 'descricao_caracteristica',
      entrada_id: feature.id,
    });
    await scope.getByRole('button', { name: 'Traço de teste', exact: true }).click();
    await expect.poll(() => chat.commands.length).toBe(4);
    expect(chat.commands[3]).toMatchObject({ acao: 'descricao_traco', entrada_id: trait.id });
    await scope.getByRole('button', { name: 'Dom de teste', exact: true }).click();
    await expect.poll(() => chat.commands.length).toBe(5);
    expect(chat.commands[4]).toMatchObject({ acao: 'descricao_talento', entrada_id: feat.id });
    await expect(scope.getByRole('button', { name: /^Enviar descrição ao chat/ })).toHaveCount(0);
    await page.screenshot({
      path: `artifacts/task-review/${info.project.name}-description-${surface}.png`,
      fullPage: true,
    });
    if (surface === 'sessão')
      await scope.getByRole('button', { name: 'Testes', exact: true }).click();
    else await page.getByRole('tab', { name: 'Atributos e perícias', exact: true }).click();
    const skillTitle = scope.getByRole('button', { name: 'Acrobacia', exact: true });
    await skillTitle.click();
    await expect.poll(() => chat.commands.length).toBe(6);
    expect(chat.commands[5]).toMatchObject({ acao: 'descricao_pericia', entrada_id: 'acrobacia' });
    if (surface === 'ficha') {
      await page.getByLabel('Nome do personagem', { exact: true }).fill('Alterado');
      await expect(skillTitle).toBeDisabled();
    }
  });
}
