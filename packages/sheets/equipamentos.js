import { calcularFicha } from './calculos.js';
import { novaEntrada, ATRIBUTOS, UUID } from './modelo.js';

export const TIPOS_EQUIPAMENTO = {
  basico: 'Básico',
  arma: 'Arma',
  armadura: 'Armadura',
  escudo: 'Escudo',
};
export function novoEquipamento() {
  return {
    ...novaEntrada('inventario.itens'),
    tipo: 'basico',
    descricao: '',
    categoriaArma: 'simples',
    alcanceArma: 'corpo-a-corpo',
    critico: 20,
    categoriaArmadura: 'leve',
    forcaMinima: 0,
    caBase: 10,
    limiteDestreza: null,
    adicionarDestreza: true,
    desvantagemFurtividade: false,
    bonusCa: 2,
    outrosBonus: 0,
  };
}
/** @returns {import('../contracts/sheets').AttackDamage} */
export function novoDano() {
  return { id: crypto.randomUUID(), dado: '', atributo: '', tipo: '' };
}
/** @returns {import('../contracts/sheets').EquipmentAttack} */
export function novoAtaqueEquipamento(item) {
  return {
    ...novaEntrada('ataques'),
    nome: item.nome,
    itemId: item.id,
    atributo: 'for',
    bonus: 0,
    proficiente: false,
    critico: item.critico ?? 20,
    danos: [novoDano()],
  };
}
export function formulaDano(dano, atributos) {
  const formula = dano.dado.trim();
  if (!formula) return '';
  const mod = dano.atributo ? atributos[dano.atributo] : 0;
  return formula + (mod ? (mod > 0 ? '+' : '') + mod : '');
}
export function validarFormulaDano(expression) {
  if (!expression) return '';
  const expr = expression.toLowerCase().replace(/\s/g, '');
  if (expression.length > 120)
    return 'A fórmula total deve ter até 120 caracteres. Simplifique ou divida os danos em ataques separados.';
  if (
    !/^[+-]?([0-9]{1,3}d[0-9]{1,4}(k[hl][0-9]{1,3})?|[0-9]{1,4})([+-]([0-9]{1,3}d[0-9]{1,4}(k[hl][0-9]{1,3})?|[0-9]{1,4}))*$/.test(
      expr,
    )
  )
    return 'Use uma soma ou subtração de dados e números, como 1d8+4+1d6.';
  let total = 0;
  for (const match of expr.matchAll(/(\d+)d(\d+)(?:k([hl])(\d+))?/g)) {
    const n = Number(match[1]),
      faces = Number(match[2]),
      keep = Number(match[4] || n);
    total += n;
    if (n < 1 || faces < 2 || faces > 1000 || keep < 1 || keep > n || total > 100)
      return 'Use até 100 dados no total, com 2 a 1.000 faces e uma seleção válida.';
  }
  return '';
}
// Mantém os campos usados pelo chat e pelo banco compatíveis com a ficha v1.
/** @param {import('../contracts/sheets').SheetContent} content */
export function sincronizarEquipamentos(content) {
  const c = structuredClone(content),
    calc = calcularFicha(c);
  for (const attack of c.ataques) {
    if (!attack.itemId || !attack.atributo) continue;
    const item = c.inventario.itens.find((x) => x.id === attack.itemId);
    if (!item) continue;
    attack.valor =
      calc.atributos[attack.atributo] +
      (attack.bonus ?? 0) +
      (attack.proficiente ? calc.proficiencia : 0);
    attack.critico = item.critico ?? 20;
    const damages = (attack.danos || []).filter((x) => x.dado.trim());
    attack.dano = damages
      .map((x) =>
        formulaDano(x, calc.atributos)
          .trim()
          .replace(/^\+\s*/, ''),
      )
      .join('+')
      .replace(/\+\-/g, '-')
      .replace(/\s/g, '');
    attack.tipoDano = [...new Set(damages.map((x) => x.tipo.trim()).filter(Boolean))].join(' / ');
  }
  return c;
}
/** @param {import('../contracts/sheets').SheetContent} content */
export function alterarSintonia(content, itemId, active) {
  const c = structuredClone(content);
  const linked = c.inventario.sintonizados.some((x) => x.itemId === itemId);
  if (active && !linked && c.inventario.sintonizados.length < c.inventario.limiteSintonizacao) {
    const item = c.inventario.itens.find((x) => x.id === itemId);
    if (item)
      c.inventario.sintonizados.push({
        ...novaEntrada('inventario.sintonizados'),
        itemId,
        nome: item.nome,
      });
  } else if (!active)
    c.inventario.sintonizados = c.inventario.sintonizados.filter((x) => x.itemId !== itemId);
  return c;
}
/** @param {import('../contracts/sheets').SheetContent} content */
export function removerEquipamento(content, id) {
  const c = structuredClone(content);
  c.inventario.itens = c.inventario.itens.filter((x) => x.id !== id);
  c.inventario.sintonizados = c.inventario.sintonizados.filter((x) => x.itemId !== id);
  c.ataques = c.ataques.filter((x) => x.itemId !== id);
  c.recursos = c.recursos.filter((x) => x.itemId !== id);
  return c;
}
export function validarEquipamentos(c) {
  const errors = [],
    ids = new Set(c.inventario.itens.map((x) => x.id));
  const damageIds = new Set();
  // IDs dos danos também não podem colidir com entradas existentes.
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
    for (const x of list) damageIds.add(x.id);
  const error = (campo, mensagem) => errors.push({ campo, mensagem });
  function number(value, path, min, max) {
    if (value !== undefined && (!Number.isInteger(value) || value < min || value > max))
      error(path, `Informe um número inteiro entre ${min} e ${max}.`);
  }
  function choice(value, path, options) {
    if (value !== undefined && !options.includes(value)) error(path, 'Escolha uma opção válida.');
  }
  function flag(value, path) {
    if (value !== undefined && typeof value !== 'boolean') error(path, 'Informe uma opção válida.');
  }
  function text(value, path, max = 120) {
    if (value !== undefined && (typeof value !== 'string' || value.length > max))
      error(path, 'Texto inválido ou acima do limite.');
  }
  c.inventario.itens.forEach((item, i) => {
    const path = `inventario.itens.${i}.`;
    choice(item.tipo, path + 'tipo', Object.keys(TIPOS_EQUIPAMENTO));
    text(item.descricao, path + 'descricao', 10000);
    choice(item.categoriaArma, path + 'categoriaArma', ['simples', 'marcial']);
    choice(item.alcanceArma, path + 'alcanceArma', ['corpo-a-corpo', 'distancia']);
    choice(item.categoriaArmadura, path + 'categoriaArmadura', ['leve', 'media', 'pesada']);
    number(item.critico, path + 'critico', 1, 20);
    number(item.forcaMinima, path + 'forcaMinima', 0, 99);
    number(item.caBase, path + 'caBase', 0, 99);
    if (item.limiteDestreza !== null) number(item.limiteDestreza, path + 'limiteDestreza', 0, 99);
    number(item.bonusCa, path + 'bonusCa', -99, 99);
    number(item.outrosBonus, path + 'outrosBonus', -99, 99);
    flag(item.adicionarDestreza, path + 'adicionarDestreza');
    flag(item.desvantagemFurtividade, path + 'desvantagemFurtividade');
  });
  for (const [path, list] of [
    ['ataques', c.ataques],
    ['recursos', c.recursos],
  ])
    list.forEach((entry, i) => {
      if (
        entry.itemId !== undefined &&
        (typeof entry.itemId !== 'string' || !ids.has(entry.itemId))
      )
        error(`${path}.${i}.itemId`, 'O equipamento vinculado não existe.');
      if (path !== 'ataques') return;
      const p = `${path}.${i}.`;
      choice(entry.atributo, p + 'atributo', Object.keys(ATRIBUTOS));
      number(entry.bonus, p + 'bonus', -99, 99);
      number(entry.critico, p + 'critico', 1, 20);
      flag(entry.proficiente, p + 'proficiente');
      if (entry.danos === undefined) return;
      const formulaError = validarFormulaDano(entry.dano);
      if (formulaError) error(p + 'danos', formulaError);
      if (!Array.isArray(entry.danos) || entry.danos.length > 20) {
        error(p + 'danos', 'Informe até 20 danos por ataque.');
        return;
      }
      entry.danos.forEach((d, j) => {
        const dp = p + `danos.${j}.`;
        if (!d || typeof d !== 'object') {
          error(dp, 'Dano inválido.');
          return;
        }
        if (!UUID.test(d.id) || damageIds.has(d.id))
          error(dp + 'id', 'Identificador inválido ou duplicado.');
        damageIds.add(d.id);
        text(d.dado ?? null, dp + 'dado');
        text(d.tipo ?? null, dp + 'tipo');
        choice(d.atributo ?? null, dp + 'atributo', ['', ...Object.keys(ATRIBUTOS)]);
      });
    });
  const linked = new Set();
  c.inventario.sintonizados.forEach((x, i) => {
    if (x.itemId && linked.has(x.itemId))
      error(`inventario.sintonizados.${i}.itemId`, 'Este item já está sintonizado.');
    if (x.itemId) linked.add(x.itemId);
  });
  if (c.inventario.sintonizados.length > c.inventario.limiteSintonizacao)
    error('inventario.sintonizados', 'O limite de sintonia foi excedido.');
  c.magias.forEach((x, i) => text(x.compendioId, `magias.${i}.compendioId`));
  c.conjuracao.espacos.forEach((x, i) => flag(x.ativo, `conjuracao.espacos.${i}.ativo`));
  return errors;
}
