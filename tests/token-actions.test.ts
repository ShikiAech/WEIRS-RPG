import test from 'node:test';
import assert from 'node:assert/strict';
import { criarConteudo } from '../packages/sheets/modelo.js';
import type { SheetRecord } from '../packages/contracts/sheets';
import type { TokenRecord } from '../packages/contracts/tabletop';
import type { SessionState } from '../packages/contracts/session';
import { tokenAccess, tokenHpCommand } from '../apps/web/features/session/token-actions';

const campaign = crypto.randomUUID(),
  owner = crypto.randomUUID();
const record: SheetRecord = {
  id: crypto.randomUUID(),
  campanha_id: campaign,
  proprietario_id: owner,
  nome: 'Lia',
  conteudo: criarConteudo(),
  versao: 8,
  versao_esquema: 1,
  criado_em: '',
  atualizado_em: '',
};
record.conteudo.combate.pvMaximos = 20;
record.conteudo.combate.pvAtuais = 15;
const token: TokenRecord = {
  id: crypto.randomUUID(),
  campanha_id: campaign,
  cena_id: crypto.randomUUID(),
  versao: 1,
  nome: 'Lia',
  x: 1,
  y: 1,
  tamanho: 1,
  cor: '#fff000',
  rotacao: 0,
  oculto: false,
  bloqueado: false,
  ficha_id: record.id,
  controlador_id: null,
  imagem_id: null,
  combate_id: null,
  aura: null,
};

test('token controllers cannot edit another sheet and hidden tokens cannot generate public state actions', () => {
  assert.equal(tokenAccess(token, record, undefined, undefined, owner, 'jogador').editable, true);
  assert.equal(
    tokenAccess(
      { ...token, controlador_id: 'someone' },
      record,
      undefined,
      undefined,
      'someone',
      'jogador',
    ).editable,
    false,
  );
  assert.equal(
    tokenAccess(token, record, undefined, undefined, owner, 'espectador').editable,
    false,
  );
  assert.equal(
    tokenAccess({ ...token, oculto: true }, record, undefined, undefined, owner, 'mestre').editable,
    false,
  );
  assert.equal(
    tokenAccess(token, { ...record, campanha_id: 'other' }, undefined, undefined, owner, 'mestre')
      .editable,
    false,
  );
});

test('token sheet PV commands use delta semantics and the current saved version', () => {
  const access = tokenAccess(token, record, undefined, undefined, owner, 'jogador');
  assert.deepEqual(tokenHpCommand(access, 'dano', 7), {
    tipo: 'pv',
    ficha_id: record.id,
    versao: 8,
    acao: 'dano',
    valor: 7,
  });
  assert.deepEqual(tokenHpCommand(access, 'temporarios', 5), {
    tipo: 'pv',
    ficha_id: record.id,
    versao: 8,
    acao: 'temporarios',
    valor: 5,
  });
  assert.equal(tokenHpCommand(access, 'cura', NaN), null);
  assert.equal(tokenHpCommand(access, 'dano', -1), null);
  assert.equal(tokenHpCommand(access, 'dano', 1.5), null);
});
test('loss of GM role removes the cached private record, not only editing permission', () => {
  const access = tokenAccess(token, record, undefined, undefined, 'former-gm', 'jogador');
  assert.equal(access.record, undefined);
  assert.equal(access.editable, false);
  assert.equal(
    tokenAccess(token, record, undefined, undefined, 'former-gm', 'espectador').record,
    undefined,
  );
  const spectator = tokenAccess(token, record, undefined, undefined, owner, 'espectador');
  assert.equal(spectator.record, record);
  assert.equal(spectator.editable, false);
});

test('NPC token PV updates send true deltas with the current combat version', () => {
  const participant = {
    id: crypto.randomUUID(),
    nome: 'Goblin',
    pvAtuais: 5,
    pvMaximos: 10,
    ca: 12,
    iniciativa: 2,
  };
  const mesa: SessionState = {
    campanha_id: campaign,
    versao: 14,
    estado: {
      combate: { ativo: true, rodada: 1, turno: participant.id, participantes: [participant] },
      loja: { aberta: false, nome: 'Loja', ofertas: [] },
    },
  };
  const npc = { ...token, ficha_id: null, combate_id: participant.id };
  const access = tokenAccess(npc, undefined, participant, mesa, owner, 'mestre');
  assert.equal(access.editable, true);
  assert.deepEqual(tokenHpCommand(access, 'dano', 999), {
    tipo: 'combate',
    acao: 'dano',
    id: participant.id,
    versao: 14,
    valor: 999,
  });
  assert.deepEqual(tokenHpCommand(access, 'cura', 999), {
    tipo: 'combate',
    acao: 'cura',
    id: participant.id,
    versao: 14,
    valor: 999,
  });
  assert.equal(tokenHpCommand(access, 'temporarios', 5)?.valor, 5);
  assert.equal(tokenAccess(npc, undefined, participant, mesa, owner, 'jogador').editable, false);
  assert.equal(
    tokenAccess(
      npc,
      undefined,
      participant,
      {
        ...mesa,
        estado: { ...mesa.estado, combate: { ...mesa.estado.combate, participantes: [] } },
      },
      owner,
      'mestre',
    ).editable,
    false,
  );
});

test('token HP expressions preserve server dice and allow exact temporary HP clear', () => {
  const access = tokenAccess(token, record, undefined, undefined, owner, 'jogador');
  assert.deepEqual(tokenHpCommand(access, 'dano', '2d8+3'), {
    tipo: 'pv',
    ficha_id: record.id,
    versao: record.versao,
    acao: 'dano',
    expressao: '2d8+3',
  });
  assert.equal(tokenHpCommand(access, 'temporarios_definir', '0')?.expressao, '0');
});
