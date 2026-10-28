import { ATRIBUTOS, UUID } from './modelo.js';
import { calcularFicha } from './calculos.js';
import { formulaDano, validarFormulaDano } from './equipamentos.js';

/** @param {import('../contracts/sheets').SheetSpell} spell
 * @returns {import('../contracts/sheets').AttackDamage[]} */
export function danosMagia(spell) {
  if (Array.isArray(spell.danos)) return spell.danos;
  return typeof spell.dano === 'string' && spell.dano.trim()
    ? [{ id: spell.id, dado: spell.dano, atributo: '', tipo: spell.tipoDano || '' }]
    : [];
}
/** @param {import('../contracts/sheets').SheetSpell} spell */
export function temDanoMagia(spell) {
  return danosMagia(spell).some((d) => typeof d.dado === 'string' && d.dado.trim());
}
/** @param {import('../contracts/sheets').SheetSpell} spell
 * @param {Record<string, number>} attributes */
export function formulasMagia(spell, attributes) {
  return danosMagia(spell)
    .filter((d) => d.dado.trim())
    .map((d) => ({
      ...d,
      formula: formulaDano(d, attributes).toLowerCase().replace(/\s/g, '').replace(/^\+/, ''),
    }));
}
/** @param {import('../contracts/sheets').SheetContent} content */
export function sincronizarMagias(content) {
  const c = structuredClone(content),
    calc = calcularFicha(c);
  for (const spell of c.magias) {
    if (!Array.isArray(spell.danos)) continue;
    const parts = formulasMagia(spell, calc.atributos);
    spell.dano = parts
      .map((d) => d.formula)
      .join('+')
      .replace(/\+-/g, '-');
    spell.tipoDano = [...new Set(parts.map((d) => d.tipo.trim()).filter(Boolean))].join(' / ');
  }
  return c;
}
/** @param {import('../contracts/sheets').SheetContent} c */
export function validarMagias(c) {
  const errors = [],
    ids = new Set();
  const error = (campo, mensagem) => errors.push({ campo, mensagem });
  for (const list of [
    c.classes,
    c.ataques,
    c.recursos,
    c.magias,
    c.inventario.itens,
    c.conjuracao.perfis,
    c.inventario.sintonizados,
    c.caracteristicas,
    c.tracos,
    c.talentos,
    c.idiomas,
    c.combate.dadosVida,
    c.combate.deslocamentosAdicionais,
    c.combate.condicoes,
  ])
    for (const e of list) ids.add(e.id);
  for (const a of c.ataques)
    if (Array.isArray(a.danos)) for (const d of a.danos) if (d?.id) ids.add(d.id);
  const attrs = calcularFicha(c).atributos;
  c.magias.forEach((s, i) => {
    const p = 'magias.' + i;
    if (
      s.salvaguardaAtributo !== undefined &&
      !['', ...Object.keys(ATRIBUTOS)].includes(s.salvaguardaAtributo)
    )
      error(p + '.salvaguardaAtributo', 'Escolha um atributo de salvaguarda válido.');
    for (const key of ['bonusAtaque', 'cd'])
      if (
        s[key] !== undefined &&
        (!Number.isInteger(s[key]) || s[key] < (key === 'cd' ? 0 : -9999) || s[key] > 9999)
      )
        error(p + '.' + key, 'Informe um valor inteiro válido.');
    if (s.tipoDano !== undefined && (typeof s.tipoDano !== 'string' || s.tipoDano.length > 10000))
      error(p + '.tipoDano', 'Informe um tipo de dano válido.');
    if (s.dano !== undefined && (typeof s.dano !== 'string' || s.dano.length > 120))
      error(p + '.dano', 'A fórmula total deve ter até 120 caracteres.');
    if (s.danos === undefined) {
      if (typeof s.dano === 'string' && s.dano.trim()) {
        const e = validarFormulaDano(s.dano);
        if (e) error(p + '.dano', e);
      }
      return;
    }
    if (!Array.isArray(s.danos) || s.danos.length > 20) {
      error(p + '.danos', 'Informe até 20 parcelas de dano por magia.');
      return;
    }
    let correct = true;
    s.danos.forEach((d, j) => {
      const path = p + '.danos.' + j;
      if (!d || typeof d !== 'object' || Array.isArray(d)) {
        error(path, 'Dano inválido.');
        correct = false;
        return;
      }
      if (typeof d.id !== 'string' || !UUID.test(d.id) || ids.has(d.id)) {
        error(path + '.id', 'Identificador inválido ou duplicado.');
        correct = false;
      }
      ids.add(d.id);
      if (typeof d.dado !== 'string' || d.dado.length > 120) {
        error(path + '.dado', 'Informe uma fórmula de até 120 caracteres.');
        correct = false;
      } else if (d.dado.trim()) {
        const e = validarFormulaDano(d.dado);
        if (e) {
          error(path + '.dado', e);
          correct = false;
        }
      }
      if (typeof d.tipo !== 'string' || d.tipo.length > 120) {
        error(path + '.tipo', 'Informe um tipo de dano de até 120 caracteres.');
        correct = false;
      }
      if (!['', ...Object.keys(ATRIBUTOS)].includes(d.atributo)) {
        error(path + '.atributo', 'Escolha um atributo válido.');
        correct = false;
      }
    });
    if (correct) {
      const expr = formulasMagia(s, attrs)
        .map((d) => d.formula)
        .join('+')
        .replace(/\+-/g, '-');
      if (expr) {
        const e = validarFormulaDano(expr);
        if (e) error(p + '.danos', e.replace('em ataques separados', 'em ações separadas'));
      }
    }
  });
  return errors;
}
