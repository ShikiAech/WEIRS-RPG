import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { ChatError, chatError, createChatRepository } from '../apps/web/lib/chat';
import type { ChatCommand, SheetAction } from '../packages/contracts/chat';

const campaign = '20000000-0000-4000-a000-000000000001';
const request = '40000000-0000-4000-a000-000000000001';
const description: Extract<ChatCommand, { tipo: 'acao' }> = {
  tipo: 'acao',
  ficha_id: '30000000-0000-4000-a000-000000000001',
  versao: 3,
  entrada_id: 'arcanismo',
  acao: 'descricao_pericia',
  modo: 'normal',
};

function rejectedRepository(code: string, message: string) {
  const calls: { url: string; body: unknown }[] = [];
  const client = createClient('https://example.supabase.co', 'public-test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
        return new Response(JSON.stringify({ code, message, details: null, hint: null }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  });
  return { repository: createChatRepository(client), calls };
}

test('descrições recusadas por servidor antigo explicam a atualização sem mudar ou repetir o pedido', async () => {
  for (const acao of [
    'descricao_magia',
    'descricao_ataque',
    'descricao_caracteristica',
    'descricao_traco',
    'descricao_talento',
    'descricao_pericia',
  ] satisfies SheetAction[]) {
    const { repository, calls } = rejectedRepository('WC003', 'Ação inválida.');
    const command = { ...description, acao };
    await assert.rejects(repository.send(campaign, request, command), (error: unknown) => {
      assert.ok(error instanceof ChatError);
      assert.equal(error.code, 'WC003');
      assert.match(error.message, /servidor/i);
      assert.match(error.message, /descriç/i);
      assert.match(error.message, /atualiz/i);
      assert.doesNotMatch(error.message, /100 dados|kh\/kl|perfil.*magia/i);
      assert.equal(chatError(error), error, 'A camada de UI deve preservar o erro contextual.');
      return true;
    });
    assert.deepEqual(calls, [
      {
        url: 'https://example.supabase.co/rest/v1/rpc/enviar_chat',
        body: { p_campanha: campaign, p_pedido: request, p_comando: command },
      },
    ]);
  }
});

test('erros conhecidos de descrição orientam a correção da entrada, do tamanho ou do modo', async () => {
  for (const [raw, guidance] of [
    ['Entrada removida ou indisponível.', /ficha salva.*recarregue/i],
    ['Descrição excede o limite de 10000 caracteres.', /10000 caracteres.*reduza/i],
    ['Descrição não usa vantagem.', /modo normal.*sem vantagem/i],
    ['Descrição inválida.', /identificar.*descrição.*recarregue/i],
  ] as const) {
    const { repository } = rejectedRepository('WC003', raw);
    await assert.rejects(repository.send(campaign, request, description), (error: unknown) => {
      assert.ok(error instanceof ChatError);
      assert.equal(error.code, 'WC003');
      assert.match(error.message, guidance);
      assert.doesNotMatch(error.message, /100 dados|kh\/kl|perfil.*magia/i);
      return true;
    });
  }
});

test('rejeição desconhecida de descrição mantém código sem expor detalhes internos ou instruir dados', async () => {
  const raw = 'Detalhe interno que não deve ser apresentado';
  const { repository } = rejectedRepository('WC003', raw);
  await assert.rejects(repository.send(campaign, request, description), (error: unknown) => {
    assert.ok(error instanceof ChatError);
    assert.equal(error.code, 'WC003');
    assert.match(error.message, /descrição/i);
    assert.doesNotMatch(error.message, /Detalhe interno|100 dados|kh\/kl|perfil.*magia/i);
    return true;
  });
});

test('descrição desatualizada pede recarregar a ficha antes de enviar', async () => {
  const { repository } = rejectedRepository('WC005', 'A ficha foi alterada.');
  await assert.rejects(repository.send(campaign, request, description), (error: unknown) => {
    assert.ok(error instanceof ChatError);
    assert.equal(error.code, 'WC005');
    assert.match(error.message, /recarregue.*enviar.*descrição/i);
    assert.doesNotMatch(error.message, /rolar/i);
    return true;
  });
});

test('outras ações e códigos mantêm mensagens e regras de sessão existentes', async () => {
  for (const code of ['WC003', 'WC005']) {
    const { repository } = rejectedRepository(code, 'Ação inválida.');
    await assert.rejects(repository.send(campaign, request, { ...description, acao: 'pericia' }), {
      code,
      message: new ChatError(code).message,
    });
  }
  for (const code of ['WC002', 'WC004', 'WC006', 'PGRST301']) {
    const { repository } = rejectedRepository(code, 'Ação inválida.');
    const expectedCode = code === 'PGRST301' ? 'SESSAO' : code;
    await assert.rejects(repository.send(campaign, request, description), {
      code: expectedCode,
      message: new ChatError(expectedCode).message,
    });
  }
});
