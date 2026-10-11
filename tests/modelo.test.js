import test from 'node:test';
import assert from 'node:assert/strict';
import {
  criarConteudo,
  validarFicha,
  limparReferencias,
  novaEntrada,
} from '../packages/sheets/modelo.js';
const ficha = () => ({ nome: 'Ímpio — ação', conteudo: criarConteudo(), versao_esquema: 1 });
test('padrões independentes e preservação de zeros e acentos', () => {
  const a = ficha(),
    b = ficha();
  a.conteudo.inventario.moedas.po = 0;
  a.conteudo.atributos.for.valor = 18;
  assert.equal(b.conteudo.atributos.for.valor, 10);
  assert.deepEqual(validarFicha(a), []);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
});
test('rejeita esquema inválido, NaN, nível total 21 e IDs duplicados', () => {
  let f = ficha();
  f.versao_esquema = 2;
  assert.ok(validarFicha(f).length);
  f = ficha();
  f.conteudo.atributos.for.valor = NaN;
  assert.ok(validarFicha(f).length);
  f = ficha();
  f.conteudo.classes[0].nivel = 20;
  f.conteudo.classes.push(novaEntrada('classes'));
  assert.ok(validarFicha(f).length);
  f = ficha();
  f.conteudo.classes.push({ ...f.conteudo.classes[0] });
  assert.ok(validarFicha(f).length);
});
test('remover origens preserva magias e nomes de itens', () => {
  const f = ficha();
  const perfil = novaEntrada('conjuracao.perfis');
  f.conteudo.conjuracao.perfis.push(perfil);
  const magia = novaEntrada('magias');
  magia.perfilId = perfil.id;
  f.conteudo.magias.push(magia);
  f.conteudo.conjuracao.perfis = [];
  limparReferencias(f.conteudo);
  assert.equal(f.conteudo.magias.length, 1);
  assert.equal(f.conteudo.magias[0].perfilId, '');
});
test('quantidades gastas e tamanho do conteúdo são validados', () => {
  const f = ficha();
  f.conteudo.recursos.push({ ...novaEntrada('recursos'), maximo: 1, gastos: 2 });
  assert.ok(validarFicha(f).length);
  f.conteudo.recursos = [];
  f.conteudo.historia.anotacoes = 'a'.repeat(250000);
  assert.ok(validarFicha(f).length);
});
