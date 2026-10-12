import { test, expect } from '@playwright/test';
import { backend, campaignId, ownerId } from './backend';

test('usuário entra como jogador, repete uma confirmação perdida e cria ficha', async ({
  page,
}, info) => {
  const state = await backend(page, { empty: true, nonmember: true });
  state.failJoinAcknowledgement = true;
  await page.goto('app.html#/campanhas');
  await page.getByRole('button', { name: 'Entrar como jogador em Crônicas de Othans' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Entrar como jogador em Crônicas de Othans' }).click();
  await expect(page.getByText('Você participa como jogador.', { exact: true })).toBeVisible();
  expect(state.memberships).toHaveLength(1);
  await page.screenshot({
    path: 'artifacts/' + info.project.name + '/participacao.png',
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Criar personagem nesta campanha' }).click();
  await page.getByLabel('Nome do personagem', { exact: true }).fill('Novo jogador');
  await expect(page.getByRole('combobox', { name: 'Campanha', exact: true })).toHaveValue(
    campaignId,
  );
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(page.getByText('Ficha salva na mesa.', { exact: true })).toBeVisible();
  expect(state.rows[0].proprietario_id).toBe(ownerId);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('admin edita ficha alheia e adiciona cópia em outra campanha sem duplicar', async ({
  page,
}, info) => {
  const state = await backend(page, { admin: true, nonmember: true });
  const destination = '508cdfdb-e6c0-4aac-ab86-dd036a423499';
  state.campaigns.push({ id: destination, nome: 'Outra campanha' });
  const otherOwner = '10000000-0000-4000-a000-000000000002';
  state.rows[0].proprietario_id = otherOwner;
  await page.goto('app.html#/fichas/' + state.rows[0].id);
  await page.getByLabel('Nome do personagem', { exact: true }).fill('Zephira revista');
  await expect(page.getByRole('button', { name: 'Adicionar cópia', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Salvar ficha', exact: true }).click();
  await expect(page.getByText('Ficha salva na mesa.', { exact: true })).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Campanha de destino', exact: true })
    .selectOption(destination);
  state.failCopyAcknowledgement = true;
  await page.getByRole('button', { name: 'Adicionar cópia', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Confirmar mesma cópia', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar mesma cópia', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Abrir cópia' })).toBeVisible();
  expect(state.rows).toHaveLength(2);
  expect(state.rows[1].proprietario_id).toBe(otherOwner);
  expect(state.rows[1].campanha_id).toBe(destination);
  expect(state.rows[0].campanha_id).toBe(campaignId);
  await expect(page.getByRole('button', { name: 'Excluir esta ficha' })).toHaveCount(0);
  await page.screenshot({
    path: 'artifacts/' + info.project.name + '/admin-copia.png',
    fullPage: false,
  });
  state.admin = false;
  await page.reload();
  await expect(page.getByLabel('Nome do personagem', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Adicionar cópia', exact: true })).toHaveCount(0);
});

test('jogador e espectador não recebem controles de administrador', async ({ page }) => {
  await backend(page, { readonly: true });
  await page.goto('app.html#/campanhas');
  await expect(page.getByText('Você acompanha como espectador.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Entrar como jogador/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'Fichas', exact: true }).click();
  await page.getByRole('link', { name: 'Zephira', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Adicionar cópia', exact: true })).toHaveCount(0);
});

test('criar em outra campanha conserva os rascunhos separados da conta', async ({ page }) => {
  const state = await backend(page, { empty: true });
  const other = '508cdfdb-e6c0-4aac-ab86-dd036a423499';
  state.campaigns.push({ id: other, nome: 'Outra campanha' });
  state.memberships.push({ campanha_id: other, usuario_id: ownerId, papel: 'jogador' });
  await page.goto('app.html#/campanhas');
  await page
    .getByRole('article', { name: 'Participação em Crônicas de Othans' })
    .getByRole('link', { name: 'Criar personagem nesta campanha' })
    .click();
  await page.getByLabel('Nome do personagem', { exact: true }).fill('Rascunho Othans');
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('link', { name: 'Campanhas', exact: true }).click();
  await page
    .getByRole('article', { name: 'Participação em Outra campanha' })
    .getByRole('link', { name: 'Criar personagem nesta campanha' })
    .click();
  await expect(page.getByRole('combobox', { name: 'Campanha', exact: true })).toHaveValue(other);
  await expect(page.getByLabel('Nome do personagem', { exact: true })).toHaveValue('');
  await page.getByLabel('Nome do personagem', { exact: true }).fill('Rascunho outra mesa');
  await page.getByRole('link', { name: 'Campanhas', exact: true }).click();
  await page
    .getByRole('article', { name: 'Participação em Crônicas de Othans' })
    .getByRole('link', { name: 'Criar personagem nesta campanha' })
    .click();
  await expect(page.getByLabel('Nome do personagem', { exact: true })).toHaveValue(
    'Rascunho Othans',
  );
  await expect(page.getByRole('combobox', { name: 'Campanha', exact: true })).toHaveValue(
    campaignId,
  );
});

test('admin abre chat sem vínculo e a revogação encerra o acesso privado', async ({ page }) => {
  const access = await backend(page, { admin: true, nonmember: true });
  const { chatBackend } = await import('./chat-backend');
  await chatBackend(page, undefined, { master: true });
  await page.goto('app.html#/chat/' + campaignId);
  await expect(
    page.getByRole('combobox', { name: 'Visibilidade da rolagem', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Mensagem ou comando de dados' })).toBeEnabled();
  await expect(page.getByRole('log')).toContainText('Mensagem anterior');
  access.admin = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByRole('status').filter({ hasText: 'Acesso encerrado' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Mensagem ou comando de dados' })).toBeDisabled();
  await expect(page.getByRole('log')).toBeEmpty();
});
