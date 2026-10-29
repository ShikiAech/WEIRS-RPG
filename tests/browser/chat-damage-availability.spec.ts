import { test, expect } from '@playwright/test';
import type { SheetRecord, SheetSpell } from '../../packages/contracts/sheets';
import { novaEntrada } from '../../packages/sheets/modelo.js';
import { backend } from './backend';
import { chatBackend } from './chat-backend';

function casting(sheet: SheetRecord, spell: SheetSpell, action = 'magia') {
  return {
    tipo: 'acao',
    texto: '',
    rotulo: spell.nome,
    resultado: {
      regras: 1,
      origem: {
        ficha_id: sheet.id,
        ficha_nome: sheet.nome,
        versao: sheet.versao,
        entrada_id: spell.id,
        acao: action,
        modo: 'normal',
      },
    },
  };
}

test('chat oferece dano somente para magias com dano na ficha salva', async ({ page }) => {
  const sheets = await backend(page);
  const chat = await chatBackend(page, undefined, { sheets: sheets.rows });
  const sheet = sheets.rows[0];
  let lookups = 0;
  await page.route('**/rest/v1/fichas?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('id') === 'eq.' + sheet.id) lookups++;
    return route.fallback();
  });
  const spells = [
    { nome: 'Curar Ferimentos', descricao: 'O alvo recupera 2d8 pontos de vida.' },
    { nome: 'Orientação', descricao: 'O alvo adiciona 1d4 a um teste de atributo.' },
    { nome: 'Luz', descricao: 'O objeto emite luz plena em um raio de 6 metros.' },
    {
      nome: 'Raio de Enfraquecimento',
      descricao: 'Faça um ataque de magia. O alvo causa metade do dano.',
    },
    {
      nome: 'Raio de Fogo',
      descricao: 'O alvo sofre 1d10 de dano de Fogo.',
      danos: [{ id: crypto.randomUUID(), dado: '1d10', atributo: '' as const, tipo: 'Fogo' }],
    },
    { nome: 'Mísseis Mágicos legado', dano: '3d4+3' },
  ].map((values) => ({ ...novaEntrada('magias'), ...values }));
  sheet.conteudo.magias.push(...spells);
  for (const [i, spell] of spells.entries())
    chat.rows.push(
      chat.row(i + 2, casting(sheet, spell, i === 3 ? 'magia_ataque' : 'magia')) as any,
    );
  // Mensagens antigas de uma magia removida também não devem oferecer uma ação impossível.
  chat.rows.push(
    chat.row(8, casting(sheet, { ...novaEntrada('magias'), nome: 'Magia removida' })) as any,
  );
  await page.goto('app.html#/chat');
  const log = page.getByRole('log');
  const fire = log.getByRole('button', { name: 'Rolar dano: Raio de Fogo', exact: true });
  await expect(fire).toBeVisible();
  await expect(
    log.getByRole('button', { name: 'Rolar dano: Mísseis Mágicos legado', exact: true }),
  ).toBeVisible();
  for (const spell of spells.slice(0, 4))
    await expect(
      log.getByRole('button', { name: 'Rolar dano: ' + spell.nome, exact: true }),
    ).toHaveCount(0);
  await expect(
    log.getByRole('button', { name: 'Rolar dano: Magia removida', exact: true }),
  ).toHaveCount(0);
  expect(lookups).toBe(1);
  // A mesma ficha atende várias mensagens, inclusive novas conjurações da mesma versão.
  const again = chat.row(9, casting(sheet, spells[4]));
  chat.rows.push(again as any);
  chat.publish(again);
  await expect(fire).toHaveCount(2);
  expect(lookups).toBe(1);
  // Mesmo após a consulta de exibição, a ação usa a versão atual no momento do clique.
  sheet.versao = 9;
  await fire.first().click();
  await expect.poll(() => chat.commands.length).toBe(1);
  expect(chat.commands[0]).toMatchObject({
    acao: 'magia_dano',
    entrada_id: spells[4].id,
    versao: 9,
  });
  expect(lookups).toBe(2);
});

for (const master of [false, true])
  test(`dano respeita ficha inacessível e segredo para ${master ? 'mestre' : 'jogador'}`, async ({
    page,
  }) => {
    const sheets = await backend(page, { master });
    const chat = await chatBackend(page, undefined, { master, sheets: sheets.rows });
    const sheet = sheets.rows[0];
    const spell = { ...novaEntrada('magias'), nome: 'Raio secreto', dano: '1d10' };
    const healing = {
      ...novaEntrada('magias'),
      nome: 'Cura secreta',
      descricao: 'Recupere 2d8 pontos de vida.',
    };
    sheet.conteudo.magias.push(spell, healing);
    for (const [index, entry] of [spell, healing].entries()) {
      const message = chat.row(index + 2, { ...casting(sheet, entry), secreta: true });
      chat.privateRolls.set(message.id, message);
      chat.rows.push({ ...message, resultado: null, rotulo: 'Rolagem secreta' } as any);
    }
    const unavailable = { ...sheet, id: crypto.randomUUID() };
    chat.rows.push(
      chat.row(4, casting(unavailable, { ...spell, nome: 'Magia inacessível' })) as any,
    );
    let lookupFinished = false;
    await page.route('**/rest/v1/fichas?*', async (route) => {
      if (new URL(route.request().url()).searchParams.get('id') !== 'eq.' + unavailable.id)
        return route.fallback();
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: '{"code":"42501"}',
      });
      lookupFinished = true;
    });
    await page.goto('app.html#/chat');
    await expect.poll(() => lookupFinished).toBe(true);
    const log = page.getByRole('log');
    await expect(
      log.getByRole('button', { name: 'Rolar dano: Magia inacessível', exact: true }),
    ).toHaveCount(0);
    await expect(
      log.getByRole('button', { name: 'Rolar dano: Cura secreta', exact: true }),
    ).toHaveCount(0);
    const secret = log.getByRole('button', { name: 'Rolar dano: Raio secreto', exact: true });
    if (master) {
      await secret.click();
      await expect.poll(() => chat.commands.length).toBe(1);
      expect(chat.commands[0]).toMatchObject({
        acao: 'magia_dano',
        secreta: true,
        entrada_id: spell.id,
      });
    } else {
      await expect(secret).toHaveCount(0);
      await expect(log).not.toContainText('Raio secreto');
      expect(chat.commands).toHaveLength(0);
    }
  });
