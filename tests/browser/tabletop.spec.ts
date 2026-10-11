import { test, expect } from '@playwright/test';
import { backend } from './backend';
import { chatBackend } from './chat-backend';
import { sessionBackend } from './session-backend';
import { tabletopBackend, tokenId, otherTokenId } from './tabletop-backend';

async function showMap(page: import('@playwright/test').Page) {
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Mapa', exact: true }).click();
  await expect(page.getByRole('application', { name: 'Mapa da campanha' })).toBeVisible();
}

test('jogador move o próprio token e abre a ficha; PV, rolagens e janela recolhida continuam integrados', async ({
  page,
}) => {
  const sheets = await backend(page),
    chat = await chatBackend(page);
  await sessionBackend(page, sheets, chat);
  const maps = await tabletopBackend(page, sheets, chat);
  sheets.rows[0].conteudo.combate.pvMaximos = 20;
  sheets.rows[0].conteudo.combate.pvAtuais = 20;
  await page.goto('app.html#/chat');
  await showMap(page);
  const token = page.getByRole('button', { name: 'Token Zephira', exact: true });
  await token.focus();
  await token.press('Enter');
  await token.press('ArrowRight');
  await expect.poll(() => maps.tokens.find((t) => t.id === tokenId)?.x).toBe(4);
  expect(maps.operations[0].command).toMatchObject({
    tipo: 'token_atualizar',
    id: tokenId,
    versao: 1,
    patch: { x: 4, y: 3 },
  });
  const guard = page.getByRole('button', { name: 'Token Guarda', exact: true });
  await guard.focus();
  await guard.press('Enter');
  await guard.press('ArrowRight');
  expect(maps.tokens.find((t) => t.id === otherTokenId)?.x).toBe(7);
  expect(maps.operations).toHaveLength(1);
  await token.click();
  await page.getByRole('button', { name: 'Ficha do token', exact: true }).click();
  const sheet = page.getByRole('complementary', { name: 'Ficha durante a sessão' });
  await expect(sheet).toContainText('PV 20/20');
  await sheet.getByLabel('Quantidade de PV', { exact: true }).fill('3');
  await sheet.getByRole('button', { name: 'Aplicar dano', exact: true }).click();
  await expect(sheet).toContainText('PV 17/20');
  await expect(page.locator('.map-selection')).toContainText('PV 17/20', { timeout: 10000 });
  const collapse = page.getByRole('button', { name: 'Recolher Ficha do personagem', exact: true });
  await collapse.click();
  await expect(sheet).toBeHidden();
  await page.getByRole('button', { name: 'Expandir Ficha do personagem', exact: true }).click();
  await expect(sheet).toContainText('PV 17/20');
  await sheet.getByRole('button', { name: 'Força +0', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Dados 3D' })).toHaveAttribute(
    'data-phase',
    'concluida',
    { timeout: 15000 },
  );
  expect(chat.commands[0]).toMatchObject({ tipo: 'acao', acao: 'atributo', versao: 2 });
  await sheet.getByRole('button', { name: 'Fechar painel', exact: true }).click();
  if (test.info().project.name === 'mobile')
    await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Operação de sessão confirmada.');
  await page.screenshot({
    path: `artifacts/tabletop-integrated-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test('mestres veem camada oculta e podem preparar e exibir cenas sem entregar segredos aos jogadores', async ({
  page,
  context,
}) => {
  const player = await context.newPage();
  const gmSheets = await backend(page, { master: true }),
    playerSheets = await backend(player);
  const chat = await chatBackend(page, undefined, { master: true });
  await chatBackend(player, chat);
  const maps = await tabletopBackend(page, gmSheets, chat, undefined, { master: true });
  await tabletopBackend(player, playerSheets, chat, maps);
  const deliveredToPlayer: string[] = [];
  player.on('response', async (response) => {
    if (/\/rest\/v1\/(cenas_mapa|tokens_mapa)/.test(response.url()))
      deliveredToPlayer.push(await response.text());
  });
  await page.goto('app.html#/chat');
  await player.goto('app.html#/chat');
  await showMap(page);
  await showMap(player);
  await expect(
    page.getByRole('button', { name: 'Token Emboscada secreta', exact: true }),
  ).toBeVisible();
  await expect(
    player.getByRole('button', { name: 'Token Emboscada secreta', exact: true }),
  ).toHaveCount(0);
  await expect(player.getByRole('button', { name: 'Revelar área', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cenas e mapas', exact: true }).click();
  await page.getByRole('button', { name: 'Nova cena', exact: true }).click();
  await page.getByLabel('Nome da cena', { exact: true }).fill('Câmara ainda secreta');
  await page.getByLabel('Disponível aos jogadores', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Criar cena', exact: true }).click();
  await expect.poll(() => maps.scenes.length).toBe(2);
  await player.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(player.getByRole('application', { name: 'Mapa da campanha' })).toContainText(
    'Zephira',
  );
  expect(deliveredToPlayer.join('\n')).not.toContain('Emboscada secreta');
  expect(deliveredToPlayer.join('\n')).not.toContain('Câmara ainda secreta');
  await page.getByRole('button', { name: 'Editar cena Câmara ainda secreta', exact: true }).click();
  await page.getByLabel('Disponível aos jogadores', { exact: true }).check();
  await page.getByRole('button', { name: 'Salvar cena', exact: true }).click();
  await page.getByRole('button', { name: 'Exibir cena Câmara ainda secreta', exact: true }).click();
  await expect
    .poll(() => maps.scenes.find((s) => s.nome === 'Câmara ainda secreta')?.ativa)
    .toBe(true);
  await player.bringToFront();
  await expect(player.getByRole('button', { name: 'Token Zephira', exact: true })).toHaveCount(0);
  expect(maps.scenes.find((s) => s.nome === 'Câmara ainda secreta')?.publicada).toBe(true);
  await page.screenshot({
    path: `artifacts/tabletop-scenes-${test.info().project.name}.png`,
    fullPage: true,
  });
  await player.close();
});

test('conflito de movimento recarrega posição e resposta perdida reenvia o mesmo pedido', async ({
  page,
}) => {
  const sheets = await backend(page),
    chat = await chatBackend(page);
  const maps = await tabletopBackend(page, sheets, chat);
  await page.goto('app.html#/chat');
  await showMap(page);
  const token = page.getByRole('button', { name: 'Token Zephira', exact: true });
  maps.beforeOperation = () => {
    const row = maps.tokens.find((t) => t.id === tokenId)!;
    row.x = 10;
    row.versao++;
  };
  await token.focus();
  await token.press('Enter');
  await token.press('ArrowRight');
  await expect(page.getByRole('alert')).toBeVisible();
  expect(maps.tokens.find((t) => t.id === tokenId)?.x).toBe(10);
  await token.focus();
  await token.press('ArrowRight');
  await expect.poll(() => maps.tokens.find((t) => t.id === tokenId)?.x).toBe(11);
  expect(maps.operations[1].command.versao).toBe(2);
  await expect(page.locator('.map-status')).not.toContainText('Salvando');
  maps.lost = true;
  await token.focus();
  await token.press('ArrowRight');
  const retry = page.getByRole('button', { name: 'Reenviar alteração', exact: true });
  await expect(retry).toBeVisible({ timeout: 20000 });
  await retry.click();
  await expect(retry).toHaveCount(0);
  expect(maps.operations.at(-1)?.pedido).toBe(maps.operations.at(-2)?.pedido);
  expect(maps.tokens.find((t) => t.id === tokenId)?.x).toBe(12);
});

test('upload autenticado compartilha mapa e mantém documento privado fora da biblioteca do jogador', async ({
  page,
  context,
}) => {
  const player = await context.newPage();
  const gmSheets = await backend(page, { master: true }),
    playerSheets = await backend(player);
  const chat = await chatBackend(page, undefined, { master: true });
  await chatBackend(player, chat);
  const maps = await tabletopBackend(page, gmSheets, chat, undefined, { master: true });
  await tabletopBackend(player, playerSheets, chat, maps);
  await page.goto('app.html#/chat');
  await player.goto('app.html#/chat');
  await showMap(page);
  await showMap(player);
  await page.getByRole('button', { name: 'Arquivos da campanha', exact: true }).click();
  const file = page.getByLabel('Enviar arquivo da campanha', { exact: true });
  await file.setInputFiles({
    name: 'mapa.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect.poll(() => maps.assets.filter((a) => a.estado === 'pronto').length).toBe(1);
  await expect(page.getByRole('button', { name: /^Baixar mapa/ })).toBeVisible();
  expect(maps.objects.size).toBe(1);
  await expect
    .poll(() =>
      page.locator('.map-assets img').evaluate((node: HTMLImageElement) => node.naturalWidth),
    )
    .toBe(1);
  await page
    .getByRole('combobox', { name: 'Visibilidade do arquivo', exact: true })
    .selectOption('mestre');
  await file.setInputFiles({
    name: 'segredo.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj<</Type /Catalog>>endobj\n%%EOF'),
  });
  await expect.poll(() => maps.assets.filter((a) => a.estado === 'pronto').length).toBe(2);
  await expect(page.getByRole('button', { name: 'Baixar segredo.pdf', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar ferramentas do mapa', exact: true }).click();
  await page.getByRole('button', { name: 'Cenas e mapas', exact: true }).click();
  await page.getByRole('button', { name: 'Editar cena Ruínas de Othans', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Imagem de fundo', exact: true })
    .selectOption(maps.assets[0].id);
  await page.getByRole('button', { name: 'Salvar cena', exact: true }).click();
  await expect.poll(() => maps.scenes[0].fundo_id).toBe(maps.assets[0].id);
  await expect(page.locator('.map-canvas image')).toHaveAttribute('href', /^blob:/);
  await player.getByRole('button', { name: 'Arquivos da campanha', exact: true }).click();
  await player.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(player.getByRole('button', { name: /^Baixar mapa/ })).toBeVisible();
  await expect(player.getByRole('button', { name: 'Baixar segredo.pdf', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Fechar ferramentas do mapa', exact: true }).click();
  await page.getByRole('button', { name: 'Arquivos da campanha', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Remover arquivo segredo.pdf', exact: true }).click();
  await expect.poll(() => maps.assets.length).toBe(1);
  expect(maps.objects.size).toBe(1);
  expect(maps.operations.slice(-2).map((op) => op.command.tipo)).toEqual([
    'arquivo_preparar_exclusao',
    'arquivo_excluir',
  ]);
  await player.close();
});

test('régua mede a escala da cena e mestre revela neblina e desenha sem encher o chat', async ({
  page,
}) => {
  const sheets = await backend(page, { master: true }),
    chat = await chatBackend(page, undefined, { master: true });
  const maps = await tabletopBackend(page, sheets, chat, undefined, { master: true });
  await page.goto('app.html#/chat');
  await showMap(page);
  if (test.info().project.name === 'desktop')
    await page.getByRole('button', { name: 'Mesa de dados 3D', exact: true }).click();
  const locations = await page
    .getByRole('application', { name: 'Mapa da campanha' })
    .evaluate((node) => {
      const svg = node as SVGSVGElement;
      const layer = svg.querySelector(':scope > g') as SVGGraphicsElement;
      const position = (x: number, y: number) => {
        const p = svg.createSVGPoint();
        p.x = x * 64;
        p.y = y * 64;
        const world = p.matrixTransform(layer.getScreenCTM()!);
        return { x: world.x, y: world.y };
      };
      return { a: position(9.2, 7.2), b: position(12.2, 9.2) };
    });
  const gesture = async () => {
    await page.mouse.move(locations.a.x, locations.a.y);
    await page.mouse.down();
    await page.mouse.move(locations.b.x, locations.b.y, { steps: 8 });
    await page.mouse.up();
  };
  await page.getByRole('button', { name: 'Régua', exact: true }).click();
  await gesture();
  await expect(page.locator('.map-status')).toContainText('15 pés');
  expect(maps.operations).toHaveLength(0);
  await page.getByRole('button', { name: 'Cenas e mapas', exact: true }).click();
  await page.getByLabel('Cobrir áreas não reveladas', { exact: true }).click();
  await expect.poll(() => maps.scenes[0].nevoa).toBe(true);
  await expect(page.getByLabel('Cobrir áreas não reveladas', { exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Fechar ferramentas do mapa', exact: true }).click();
  await page.getByRole('button', { name: 'Revelar área', exact: true }).click();
  await gesture();
  await expect.poll(() => maps.scenes[0].revelacoes.length).toBe(1);
  expect(maps.scenes[0].revelacoes[0]).toEqual({ x: 9, y: 7, w: 4, h: 3 });
  await page.getByRole('button', { name: 'Desenhar no mapa', exact: true }).click();
  await gesture();
  await expect.poll(() => maps.scenes[0].desenhos.length).toBe(1);
  expect(maps.scenes[0].desenhos[0].pontos.length).toBeGreaterThan(2);
  await page.getByRole('button', { name: 'Cenas e mapas', exact: true }).click();
  await page.getByRole('button', { name: 'Limpar desenhos', exact: true }).click();
  await expect.poll(() => maps.scenes[0].desenhos.length).toBe(0);
  expect(chat.rows).toHaveLength(1);
  expect(chat.commands).toHaveLength(0);
});

test('ping compartilha a posição entre duas janelas e desaparece sem registrar mensagem', async ({
  page,
  context,
}) => {
  const player = await context.newPage();
  const gmSheets = await backend(page, { master: true }),
    playerSheets = await backend(player);
  const chat = await chatBackend(page, undefined, { master: true });
  await chatBackend(player, chat);
  const maps = await tabletopBackend(page, gmSheets, chat, undefined, { master: true });
  await tabletopBackend(player, playerSheets, chat, maps);
  await page.goto('app.html#/chat');
  await player.goto('app.html#/chat');
  await showMap(page);
  await showMap(player);
  await page.getByRole('button', { name: 'Marcar local', exact: true }).click();
  const point = await page
    .getByRole('application', { name: 'Mapa da campanha' })
    .evaluate((node) => {
      const svg = node as SVGSVGElement,
        layer = svg.querySelector(':scope > g') as SVGGraphicsElement;
      const p = svg.createSVGPoint();
      p.x = 13 * 64;
      p.y = 10 * 64;
      const result = p.matrixTransform(layer.getScreenCTM()!);
      return { x: result.x, y: result.y };
    });
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('.map-ping')).toHaveCount(1);
  await player.bringToFront();
  await expect(player.locator('.map-ping')).toHaveCount(1);
  expect(maps.pings[0].x).toBeCloseTo(13, 1);
  expect(maps.pings[0].y).toBeCloseTo(10, 1);
  await expect(page.locator('.map-ping')).toHaveCount(0, { timeout: 10000 });
  await expect(player.locator('.map-ping')).toHaveCount(0, { timeout: 10000 });
  expect(chat.commands).toHaveLength(0);
  expect(chat.rows).toHaveLength(1);
  await player.close();
});
