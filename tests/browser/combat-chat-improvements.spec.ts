import { test, expect } from '@playwright/test';
import { backend } from './backend';
import { chatBackend } from './chat-backend';
import { sessionBackend } from './session-backend';
import { novaEntrada } from '../../packages/sheets/modelo.js';

test('expressões de PV e edição exata de temporários funcionam no painel da sessão', async ({
  page,
}) => {
  const sheets = await backend(page),
    chat = await chatBackend(page, undefined, { sheets: sheets.rows });
  const session = await sessionBackend(page, sheets, chat);
  const f = sheets.rows[0];
  f.conteudo.combate.pvAtuais = f.conteudo.combate.pvMaximos = 20;
  await page.goto('app.html#/chat');
  await page.getByRole('button', { name: 'Minha ficha', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Ficha durante a sessão' });
  await panel.getByLabel('Quantidade de PV', { exact: true }).fill('8 + 4');
  await panel.getByRole('button', { name: 'Aplicar dano', exact: true }).click();
  await expect(panel).toContainText('PV 8/20');
  await expect(panel).toContainText('8+4 = 12');
  expect(session.operations[0].command.expressao).toBe('8 + 4');
  await panel.getByLabel('Quantidade de PV', { exact: true }).fill('10');
  await panel.getByRole('button', { name: 'Conceder PV temporários', exact: true }).click();
  await expect(panel).toContainText('Temp. 10');
  await panel.getByLabel('Quantidade de PV', { exact: true }).fill('0');
  await panel.getByRole('button', { name: 'Definir PV temporários', exact: true }).click();
  await expect(panel).toContainText('Temp. 0');
  await page.screenshot({
    path: `output/combat-expression-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test('dano de mensagem carrega ficha atual e descrição não substitui ataque', async ({ page }) => {
  const sheets = await backend(page),
    chat = await chatBackend(page, undefined, { sheets: sheets.rows });
  const f = sheets.rows[0];
  const attack = {
    ...novaEntrada('ataques'),
    nome: 'Espada de teste',
    dano: '2d6+1',
    observacoes: 'Lâmina antiga',
  };
  f.conteudo.ataques.push(attack);
  const prior: any = chat.row(2, {
    tipo: 'acao',
    rotulo: 'Espada de teste',
    texto: '',
    resultado: {
      regras: 1,
      total: 15,
      origem: {
        ficha_id: f.id,
        ficha_nome: f.nome,
        versao: 1,
        entrada_id: attack.id,
        acao: 'ataque',
        modo: 'normal',
      },
    },
  });
  chat.rows.push(prior);
  f.versao = 4;
  await sessionBackend(page, sheets, chat);
  await page.goto('app.html#/chat');
  let confirm!: () => void;
  chat.acknowledgementGate = new Promise<void>((resolve) => {
    confirm = resolve;
  });
  const damage = page.getByRole('button', { name: 'Rolar dano: Espada de teste', exact: true });
  await damage.click();
  await expect.poll(() => chat.commands.length).toBe(1);
  await expect(damage).toBeDisabled();
  confirm();
  expect(chat.commands[0]).toMatchObject({ acao: 'dano', versao: 4, entrada_id: attack.id });
  await page.getByRole('button', { name: 'Minha ficha', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Ficha durante a sessão' });
  await panel.getByRole('button', { name: 'Ações', exact: true }).click();
  await expect(
    panel.getByRole('button', { name: 'Ataque: Espada de teste', exact: true }),
  ).toBeVisible();
  await panel
    .getByRole('button', { name: 'Enviar descrição ao chat: Espada de teste', exact: true })
    .click();
  await expect.poll(() => chat.commands.length).toBe(2);
  expect(chat.commands[1].acao).toBe('descricao_ataque');
  await expect(page.getByRole('log')).toContainText('Lâmina antiga');
});

test('carregar ficha para dano reserva envio e operações da sessão até confirmar a ação', async ({
  page,
}) => {
  const sheets = await backend(page),
    chat = await chatBackend(page, undefined, { sheets: sheets.rows });
  const session = await sessionBackend(page, sheets, chat);
  const sheet = sheets.rows[0];
  const attack = { ...novaEntrada('ataques'), nome: 'Espada com consulta lenta', dano: '1d8+2' };
  sheet.conteudo.ataques.push(attack);
  chat.rows.push(
    chat.row(2, {
      tipo: 'acao',
      rotulo: attack.nome,
      texto: '',
      resultado: {
        regras: 1,
        origem: {
          ficha_id: sheet.id,
          ficha_nome: sheet.nome,
          versao: 1,
          entrada_id: attack.id,
          acao: 'ataque',
          modo: 'normal',
        },
      },
    }) as any,
  );
  let releaseLookup!: () => void, releaseSend!: () => void;
  const lookupGate = new Promise<void>((resolve) => {
    releaseLookup = resolve;
  });
  chat.acknowledgementGate = new Promise<void>((resolve) => {
    releaseSend = resolve;
  });
  let lookingUp = false;
  await page.route('**/rest/v1/fichas?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('id') !== 'eq.' + sheet.id)
      return route.fallback();
    lookingUp = true;
    await lookupGate;
    return route.fallback();
  });
  await page.goto('app.html#/chat');
  await page.getByRole('button', { name: 'Minha ficha', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Ficha durante a sessão' });
  await expect(panel.getByRole('button', { name: 'Aplicar dano', exact: true })).toBeEnabled();
  const composer = page.getByLabel('Mensagem ou comando de dados');
  await composer.fill('Mensagem concorrente');
  const trigger = page.getByRole('button', { name: 'Rolar dano: ' + attack.nome, exact: true });
  await trigger.focus();
  await trigger.press('Enter');
  await expect.poll(() => lookingUp).toBe(true);
  try {
    await expect(composer).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toBeDisabled();
    await expect(panel.getByRole('button', { name: 'Aplicar dano', exact: true })).toBeDisabled();
    await composer.dispatchEvent('keydown', { key: 'Enter' });
    expect(chat.commands).toHaveLength(0);
    expect(session.operations).toHaveLength(0);
    chat.failAcknowledgement = true;
    releaseLookup();
    await expect.poll(() => chat.commands.length).toBe(1);
    expect(chat.commands[0]).toMatchObject({ tipo: 'acao', acao: 'dano', entrada_id: attack.id });
    await expect(composer).toBeDisabled();
    const retry = page.getByRole('button', { name: 'Reenviar mesma tentativa', exact: true });
    await expect(retry).toBeVisible();
    expect(chat.receipts.size).toBe(1);
    releaseSend();
    await retry.click();
    await expect(composer).toBeEnabled();
    await expect(composer).toHaveValue('Mensagem concorrente');
    expect(chat.commands).toHaveLength(1);
    expect(session.operations).toHaveLength(0);
  } finally {
    releaseLookup();
    releaseSend();
  }
});
