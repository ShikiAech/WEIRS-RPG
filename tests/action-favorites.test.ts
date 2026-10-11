import test from 'node:test';
import assert from 'node:assert/strict';
import { criarConteudo, novaEntrada } from '../packages/sheets/modelo.js';
import type { SheetRecord } from '../packages/contracts/sheets';
import {
  actionCatalog,
  buildFavoriteCommand,
  favoriteKey,
  parseFavorites,
  toggleFavorite,
} from '../apps/web/features/session/action-favorites';

const sheet = (): SheetRecord => ({
  id: crypto.randomUUID(),
  campanha_id: crypto.randomUUID(),
  proprietario_id: crypto.randomUUID(),
  nome: 'Lia',
  conteudo: criarConteudo(),
  versao: 1,
  versao_esquema: 1,
  criado_em: '',
  atualizado_em: '',
});

test('favorite references rebuild commands with the saved sheet current version and roll mode', () => {
  const record = sheet();
  const attack = { ...novaEntrada('ataques'), nome: 'Espada', valor: 5, dano: '1d8+3' };
  record.conteudo.ataques.push(attack);
  record.versao = 9;
  assert.deepEqual(
    buildFavoriteCommand(record, { acao: 'ataque', entrada_id: attack.id }, 'vantagem'),
    {
      tipo: 'acao',
      ficha_id: record.id,
      versao: 9,
      entrada_id: attack.id,
      acao: 'ataque',
      modo: 'vantagem',
    },
  );
  attack.nome = 'Espada encantada';
  assert.equal(
    actionCatalog(record).find((a) => a.acao === 'ataque' && a.entrada_id === attack.id)?.label,
    'Ataque: Espada encantada',
  );
  record.conteudo.ataques = [];
  assert.equal(
    buildFavoriteCommand(record, { acao: 'ataque', entrada_id: attack.id }, 'normal'),
    null,
  );
});

test('favorites respect unavailable death and hit dice actions and force normal on damage and CD', () => {
  const record = sheet();
  assert.equal(
    buildFavoriteCommand(record, { acao: 'morte', entrada_id: 'morte' }, 'vantagem'),
    null,
  );
  record.conteudo.combate.pvAtuais = 0;
  assert.equal(
    buildFavoriteCommand(record, { acao: 'morte', entrada_id: 'morte' }, 'vantagem')?.modo,
    'normal',
  );
  record.conteudo.combate.falhasMorte = 3;
  assert.equal(
    buildFavoriteCommand(record, { acao: 'morte', entrada_id: 'morte' }, 'normal'),
    null,
  );
  const die = { ...novaEntrada('combate.dadosVida'), maximo: 1, gastos: 1 };
  record.conteudo.combate.dadosVida = [die] as never;
  assert.equal(
    buildFavoriteCommand(record, { acao: 'dado_vida', entrada_id: die.id }, 'normal'),
    null,
  );
  die.gastos = 0;
  assert.equal(
    buildFavoriteCommand(record, { acao: 'dado_vida', entrada_id: die.id }, 'desvantagem')?.modo,
    'normal',
  );
  const attack = { ...novaEntrada('ataques'), nome: 'Explosão', tipo: 'cd', dano: '2d6' };
  record.conteudo.ataques.push(attack);
  assert.equal(
    buildFavoriteCommand(record, { acao: 'ataque', entrada_id: attack.id }, 'vantagem')?.modo,
    'normal',
  );
  assert.equal(
    buildFavoriteCommand(record, { acao: 'dano', entrada_id: attack.id }, 'vantagem')?.modo,
    'normal',
  );
});

test('invalid spell profile references are unavailable while homebrew damage stays independent', () => {
  const record = sheet();
  const spell = {
    ...novaEntrada('magias'),
    nome: 'Raio homebrew',
    perfilId: crypto.randomUUID(),
    dano: '2d6',
  };
  record.conteudo.magias.push(spell);
  assert.equal(
    buildFavoriteCommand(record, { acao: 'magia_ataque', entrada_id: spell.id }, 'normal'),
    null,
  );
  assert.equal(
    buildFavoriteCommand(record, { acao: 'magia_dano', entrada_id: spell.id }, 'vantagem')?.modo,
    'normal',
  );
  const profile = { ...novaEntrada('conjuracao.perfis'), id: spell.perfilId };
  record.conteudo.conjuracao.perfis.push(profile);
  assert.equal(
    buildFavoriteCommand(record, { acao: 'magia_ataque', entrada_id: spell.id }, 'desvantagem')
      ?.modo,
    'desvantagem',
  );
});

test('stored preferences contain references only, reject malformed data, deduplicate and cap at twelve', () => {
  assert.deepEqual(parseFavorites('invalid'), []);
  assert.deepEqual(parseFavorites('{"acao":"ataque"}'), []);
  const references = Array.from({ length: 20 }, (_, i) => ({
    acao: 'ataque' as const,
    entrada_id: String(i),
    label: 'private',
    versao: 2,
  }));
  const parsed = parseFavorites(
    JSON.stringify([{ acao: 'bad', entrada_id: 'id' }, ...references, references[0]]),
  );
  assert.equal(parsed.length, 12);
  assert.deepEqual(parsed[0], { acao: 'ataque', entrada_id: '0' });
  assert.equal(toggleFavorite(parsed, { acao: 'ataque', entrada_id: 'new' }).length, 12);
  const removed = toggleFavorite(parsed, parsed[0]);
  assert.equal(removed.length, 11);
  assert.equal(toggleFavorite(removed, { acao: 'pericia', entrada_id: 'percepcao' }).length, 12);
  assert.notEqual(
    favoriteKey('user1', 'campaign', 'sheet'),
    favoriteKey('user2', 'campaign', 'sheet'),
  );
  assert.notEqual(
    favoriteKey('user1', 'campaign', 'sheet'),
    favoriteKey('user1', 'other', 'sheet'),
  );
});
