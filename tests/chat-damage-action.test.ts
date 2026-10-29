import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChatDamageAction } from '../apps/web/features/chat/damage-action';
import { criarConteudo, novaEntrada } from '../packages/sheets/modelo.js';

test('dano de chat usa a versão e definição atuais, mantendo segredo e rejeitando entrada removida', async () => {
  const sheet: any = { id: 'sheet', campanha_id: 'campaign', versao: 9, conteudo: criarConteudo() };
  const attack = { ...novaEntrada('ataques'), dano: '2d6+1' };
  sheet.conteudo.ataques.push(attack);
  const message: any = {
    campanha_id: 'campaign',
    secreta: true,
    resultado: { origem: { ficha_id: 'sheet', versao: 1, entrada_id: attack.id, acao: 'ataque' } },
  };
  const cmd = await buildChatDamageAction(message, async () => sheet);
  assert.equal(cmd.versao, 9);
  assert.equal(cmd.acao, 'dano');
  assert.equal(cmd.secreta, true);
  sheet.conteudo.ataques[0].dano = '';
  await assert.rejects(
    buildChatDamageAction(message, async () => sheet),
    /não possui dano/,
  );
  sheet.conteudo.ataques = [];
  await assert.rejects(
    buildChatDamageAction(message, async () => sheet),
    /removida/,
  );
  await assert.rejects(
    buildChatDamageAction(message, async () => {
      throw Error('Sem permissão');
    }),
    /Sem permissão/,
  );
  await assert.rejects(
    buildChatDamageAction(message, async () => ({ ...sheet, campanha_id: 'other' })),
    /indisponível/,
  );
});
