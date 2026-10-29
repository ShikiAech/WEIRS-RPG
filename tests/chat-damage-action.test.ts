import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChatDamageAction, canRollChatDamage } from '../apps/web/features/chat/damage-action';
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

test('disponibilidade de dano usa apenas a entrada salva e respeita parcelas vazias', async () => {
  const sheet: any = { id: 'sheet', campanha_id: 'campaign', versao: 3, conteudo: criarConteudo() };
  const spell = {
    ...novaEntrada('magias'),
    nome: 'Cura',
    descricao: 'O alvo recupera 2d8 pontos de vida.',
    dano: '',
    danos: [] as any[],
  };
  sheet.conteudo.magias.push(spell);
  const message: any = {
    campanha_id: 'campaign',
    secreta: true,
    resultado: { origem: { ficha_id: 'sheet', versao: 1, entrada_id: spell.id, acao: 'magia' } },
  };
  assert.equal(canRollChatDamage(message, sheet), false);
  await assert.rejects(
    buildChatDamageAction(message, async () => sheet),
    /não possui dano/,
  );
  // Parcelas explícitas substituem a fórmula legada, mesmo quando ela ainda está preenchida.
  spell.dano = '2d8';
  assert.equal(canRollChatDamage(message, sheet), false);
  spell.danos.push({ id: crypto.randomUUID(), dado: '1d6', atributo: '', tipo: 'Fogo' });
  assert.equal(canRollChatDamage(message, sheet), true);
  message.resultado.origem.acao = 'magia_ataque';
  assert.equal(canRollChatDamage(message, sheet), true);
  const command = await buildChatDamageAction(message, async () => sheet);
  assert.equal(command.acao, 'magia_dano');
  assert.equal(command.versao, 3);
  assert.equal(command.secreta, true);
  assert.equal(canRollChatDamage(message), false);
  assert.equal(canRollChatDamage(message, { ...sheet, campanha_id: 'other' }), false);
  assert.equal(canRollChatDamage(message, { ...sheet, id: 'other' }), false);
  message.resultado.origem.acao = 'descricao_magia';
  assert.equal(canRollChatDamage(message, sheet), false);
  message.resultado.origem.acao = 'magia';
  sheet.conteudo.magias = [];
  assert.equal(canRollChatDamage(message, sheet), false);
  await assert.rejects(
    buildChatDamageAction(message, async () => sheet),
    /removida/,
  );
  assert.equal(canRollChatDamage({ ...message, resultado: null }, sheet), false);
});
