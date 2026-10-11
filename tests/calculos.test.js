import test from 'node:test';
import assert from 'node:assert/strict';
import { modificador, proficiencia, calcularFicha } from '../packages/sheets/calculos.js';
import { criarConteudo } from '../packages/sheets/modelo.js';
test('modificadores negativos e níveis nos limites de proficiência', () => {
  assert.equal(modificador(9), -1);
  assert.equal(modificador(10), 0);
  const niveis = [1, 4, 5, 8, 9, 12, 13, 16, 17, 20];
  assert.deepEqual(
    niveis.map((n) => proficiencia(n)),
    [2, 2, 3, 3, 4, 4, 5, 5, 6, 6],
  );
});
test('especialização, meia proficiência e percepção com ajustes', () => {
  const c = criarConteudo();
  c.classes[0].nivel = 5;
  c.atributos.sab.valor = 14;
  c.pericias.percepcao.grau = 'proficiente';
  assert.equal(calcularFicha(c).percepcaoPassiva, 15);
  c.pericias.percepcao.grau = 'especializacao';
  assert.equal(calcularFicha(c).pericias.percepcao, 8);
  c.pericias.percepcao.grau = 'meia';
  assert.equal(calcularFicha(c).pericias.percepcao, 3);
  c.combate.ajustePercepcaoPassiva = 2;
  assert.equal(calcularFicha(c).percepcaoPassiva, 15);
});
