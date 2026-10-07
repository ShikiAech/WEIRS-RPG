import type { Page } from '@playwright/test';
import { criarConteudo } from '../../packages/sheets/modelo.js';
import type { SheetRecord } from '../../packages/contracts/sheets';

export const ownerId = '10000000-0000-4000-a000-000000000001';
export const campaignId = '508cdfdb-e6c0-8aac-ab86-dd036a4234d3';
const sheetId = '30000000-0000-4000-a000-000000000001';
const user = {
  id: ownerId,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'mesa@example.test',
  app_metadata: { provider: 'google', providers: ['google'] },
  user_metadata: { full_name: 'Jogador da mesa' },
  created_at: '2026-10-07T00:00:00Z',
};

// Somente os testes interceptam HTTP. O aplicativo usa o SDK real e não contém login de teste.
export async function backend(page: Page, options: { empty?: boolean; readonly?: boolean } = {}) {
  const state = {
    rows: options.empty
      ? []
      : [
          {
            id: sheetId,
            campanha_id: campaignId,
            proprietario_id: ownerId,
            nome: 'Zephira',
            conteudo: criarConteudo(),
            versao_esquema: 1,
            versao: 1,
            criado_em: '2026-10-07T00:00:00Z',
            atualizado_em: '2026-10-07T00:00:00Z',
          } as SheetRecord,
        ],
    creates: 0,
    saves: 0,
    deletes: 0,
    failCreateAcknowledgement: false,
    conflict: false,
    delaySave: null as Promise<void> | null,
  };
  await page.addInitScript(
    ({ user }) => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const token =
        btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) +
        '.' +
        btoa(JSON.stringify({ sub: user.id, exp, role: 'authenticated' })) +
        '.testing';
      localStorage.setItem(
        'weirs-rpg-auth',
        JSON.stringify({
          access_token: token,
          refresh_token: 'testing-refresh',
          expires_at: exp,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }),
      );
    },
    { user },
  );
  const reorder = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(reorder)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .reverse()
              .map(([k, v]) => [k, reorder(v)]),
          )
        : value;
  await page.route('https://weirs-test.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const respond = async (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/auth/v1/user') return respond(user);
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (url.pathname === '/rest/v1/campanhas')
      return respond([{ id: campaignId, nome: 'Crônicas de Othans' }]);
    if (url.pathname === '/rest/v1/membros_campanha')
      return respond([
        {
          campanha_id: campaignId,
          usuario_id: ownerId,
          papel: options.readonly ? 'espectador' : 'jogador',
        },
      ]);
    if (url.pathname === '/rest/v1/fichas') {
      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      if (method === 'GET') return respond(id ? state.rows.find((r) => r.id === id) : state.rows);
      if (method === 'POST') {
        state.creates++;
        const input = request.postDataJSON();
        if (state.rows.some((r) => r.id === input.id))
          return respond({ code: '23505', message: 'duplicate' }, 409);
        const row = {
          ...input,
          conteudo: reorder(input.conteudo),
          versao: 1,
          criado_em: new Date().toISOString(),
          atualizado_em: new Date().toISOString(),
        } as SheetRecord;
        state.rows.push(row);
        if (state.failCreateAcknowledgement) {
          state.failCreateAcknowledgement = false;
          return respond({ message: 'unavailable' }, 503);
        }
        return respond(row, 201);
      }
      if (method === 'DELETE') {
        state.deletes++;
        state.rows = state.rows.filter((r) => r.id !== id);
        return respond([{ id }]);
      }
    }
    if (url.pathname === '/rest/v1/rpc/salvar_ficha') {
      state.saves++;
      const input = request.postDataJSON();
      if (state.delaySave) await state.delaySave;
      const row = state.rows.find((r) => r.id === input.p_id)!;
      if (state.conflict || row.versao !== input.p_versao)
        return respond({ code: 'WF001', message: 'conflict' }, 409);
      Object.assign(row, {
        nome: input.p_nome,
        conteudo: input.p_conteudo,
        versao: row.versao + 1,
      });
      return respond(row);
    }
    throw new Error(`Request inesperado: ${method} ${url.pathname}`);
  });
  return state;
}
