import type { Ability, SheetContent, EquipmentItem, SheetSpell } from '../contracts/sheets';
import { criarConteudo, novaEntrada, validarFicha } from './modelo.js';
import { calcularFicha, modificador } from './calculos.js';
import { novoEquipamento } from './equipamentos.js';

export interface PdfText {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PdfPage {
  width: number;
  height: number;
  items: PdfText[];
  rules?: { x0: number; x1: number; y: number }[];
  inkAt?: (x: number, y: number) => boolean | undefined;
  ringAt?: (x: number, y: number) => boolean | undefined;
}
export interface Roll20PdfImport {
  name: string;
  content: SheetContent;
  warnings: string[];
  pages: number;
  found: { label: string; value: string }[];
}
type Row = { y: number; items: PdfText[]; text: string };
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const norm = (s: string) =>
  clean(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
function rows(items: PdfText[]): Row[] {
  const result: Row[] = [];
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let row = result.at(-1);
    if (row && Math.abs(row.y - item.y) >= 3) row = undefined;
    if (!row) {
      row = { y: item.y, items: [], text: '' };
      result.push(row);
    }
    row.items.push(item);
  }
  for (const row of result) {
    row.items.sort((a, b) => a.x - b.x);
    row.text = clean(row.items.map((i) => i.text).join(' '));
  }
  return result;
}
function region(p: PdfPage, x0: number, x1: number, y0 = 0, y1 = 792) {
  return p.items.filter((i) => i.x >= x0 && i.x < x1 && i.y >= y0 && i.y < y1);
}
function text(p: PdfPage, x0: number, x1: number, y0 = 0, y1 = 792) {
  return rows(region(p, x0, x1, y0, y1))
    .map((r) => r.text)
    .join('\n')
    .trim();
}
function number(source: string) {
  const n = source.trim().replace('−', '-').replace(',', '.');
  return /^[+-]?\d+(?:\.\d+)?$/.test(n) ? Number(n) : undefined;
}
function numeric(p: PdfPage, x0: number, x1: number, y0: number, y1: number) {
  return rows(region(p, x0, x1, y0, y1))
    .map((r) => number(r.text))
    .find((n) => n !== undefined);
}
function heading(p: PdfPage, name: string, y0 = 0) {
  return rows(p.items).find((r) => r.y >= y0 && r.text.includes(name));
}
function label(p: PdfPage, name: string, x0 = 0, x1 = 612) {
  return p.items.find((i) => i.text === name && i.x >= x0 && i.x < x1);
}
function fieldAbove(p: PdfPage, name: string, x0 = 0, x1 = 270) {
  const h = label(p, name, x0, x1);
  if (!h) return '';
  const right =
    p.items
      .filter((i) => i.x > h.x + 2 && i.x < x1 && Math.abs(i.y - h.y) < 3)
      .sort((a, b) => a.x - b.x)[0]?.x ?? x1;
  return clean(text(p, h.x - 1, right - 1, h.y - 22, h.y - 1));
}
function numberAbove(p: PdfPage, h: PdfText | undefined) {
  if (!h) return undefined;
  const cx = h.x + h.width / 2;
  return p.items
    .filter((i) => i.y < h.y && i.y >= h.y - 24 && Math.abs(i.x + i.width / 2 - cx) < 16)
    .sort((a, b) => b.y - a.y)
    .map((i) => number(i.text))
    .find((n) => n !== undefined);
}
function normalized(p: PdfPage): PdfPage {
  const sx = 612 / p.width,
    sy = 792 / p.height;
  return {
    ...p,
    width: 612,
    height: 792,
    items: p.items.map((i) => ({
      ...i,
      x: i.x * sx,
      y: i.y * sy,
      width: i.width * sx,
      height: i.height * sy,
    })),
    rules: p.rules?.map((r) => ({ x0: r.x0 * sx, x1: r.x1 * sx, y: r.y * sy })),
    inkAt: p.inkAt && ((x, y) => p.inkAt!(x / sx, y / sy)),
    ringAt: p.ringAt && ((x, y) => p.ringAt!(x / sx, y / sy)),
  };
}

/** Recognizes the printed D&D 2024 layout. PDF text is data, never executable content. */
export function parseRoll20Pdf(input: PdfPage[]): Roll20PdfImport {
  if (
    !input.length ||
    input.length > 30 ||
    input.some(
      (p) =>
        !Number.isFinite(p.width) ||
        !Number.isFinite(p.height) ||
        p.width <= 0 ||
        p.height <= 0 ||
        p.items.some((i) => ![i.x, i.y, i.width, i.height].every(Number.isFinite)),
    )
  )
    throw Error('PDF inválido ou acima do limite de 30 páginas.');
  const pages = input.map(normalized),
    first = pages[0];
  const all = pages.map((p) => text(p, 0, 612)).join('\n');
  if (!all.trim())
    throw Error(
      'Este PDF não contém texto selecionável. Exporte a ficha pelo Roll20; PDFs digitalizados precisam de OCR.',
    );
  if (
    ![
      'STRENGTH',
      'DEXTERITY',
      'CONSTITUTION',
      'INTELLIGENCE',
      'WISDOM',
      'CHARISMA',
      'HIT POINTS',
      'BACKGROUND',
    ].every((s) => text(first, 0, 612).includes(s))
  )
    throw Error('Layout não reconhecido. Escolha o PDF impresso da ficha D&D 2024 do Roll20.');
  const c: SheetContent = criarConteudo();
  const warnings = new Set<string>();
  const warn = (s: string) => warnings.add(s);
  const fit = (s: string, max = 120, label = 'Texto') => {
    if (s.length > max)
      warn(
        `${label}: o texto excede o limite da ficha e foi reduzido a ${max} caracteres. Confira o original.`,
      );
    return s.trim().slice(0, max);
  };
  const name = fit(fieldAbove(first, 'NAME'), 120, 'Nome');
  if (!name) throw Error('Não foi possível localizar o nome no layout do PDF do Roll20.');
  c.identidade.antecedente = fit(fieldAbove(first, 'BACKGROUND'));
  c.identidade.especie = fit(fieldAbove(first, 'SPECIES'));
  const classText = fieldAbove(first, 'CLASS');
  const classes = [...classText.matchAll(/([^\d,;/|]+?)\s*(\d{1,2})(?=\s|[,;/|]|$)/g)];
  if (classes.length)
    c.classes = classes.map((m) => ({
      ...novaEntrada('classes'),
      nome: fit(m[1]),
      nivel: Number(m[2]),
    }));
  else {
    c.classes[0].nome = fit(classText);
    warn('Classe e nível: confira os valores; o nível não pôde ser identificado.');
  }
  const subclasses = fieldAbove(first, 'SUBCLASS').split('|');
  c.classes.forEach((entry, i) => {
    entry.subclasse = fit(subclasses[i] || '');
  });
  const xp = fieldAbove(first, 'XP', 270, 345).match(/(\d[\d.,]*)\s*\//);
  if (xp) c.identidade.experiencia = Number(xp[1].replace(/[.,]/g, ''));
  const size = norm(text(first, 443, 492, 153, 181));
  c.identidade.tamanho =
    (
      {
        tiny: 'Minúsculo',
        small: 'Pequeno',
        medium: 'Médio',
        large: 'Grande',
        huge: 'Enorme',
        gargantuan: 'Imenso',
      } as Record<string, string>
    )[size] ||
    fit(size) ||
    'Médio';
  const armor = label(first, 'ARMOR', 330),
    shield = label(first, 'SHIELD');
  const ca = armor
      ? numeric(
          first,
          armor.x - 8,
          armor.x + armor.width + 8,
          armor.y + 14,
          shield?.y ?? armor.y + 40,
        )
      : numeric(first, 339, 376, 45, 70),
    current = numberAbove(first, label(first, 'CURRENT')),
    max = numberAbove(first, label(first, 'MAX', 430, 480));
  if (ca !== undefined) c.combate.ca = ca;
  else warn('CA não encontrada: confira o valor padrão.');
  if (max !== undefined) c.combate.pvMaximos = max;
  else warn('PV máximos não encontrados: confira o valor padrão.');
  if (current !== undefined) c.combate.pvAtuais = current;
  else warn('PV atuais não encontrados: confira o valor padrão.');
  c.combate.pvTemporarios = numberAbove(first, label(first, 'TEMP')) ?? 0;
  const spent = label(first, 'SPENT'),
    diceMax = label(first, 'MAX', 480, 525);
  const hitText = text(first, 474, 525, spent ? spent.y + spent.height : 68, diceMax?.y ?? 89);
  const hits = [...hitText.matchAll(/(\d+)\s*[dD](6|8|10|12)\b/g)];
  for (const hit of hits) {
    const existing = c.combate.dadosVida.find((d) => d.dado === 'd' + hit[2]);
    if (existing) existing.maximo += Number(hit[1]);
    else
      c.combate.dadosVida.push({
        ...novaEntrada('combate.dadosVida'),
        dado: 'd' + hit[2],
        maximo: Number(hit[1]),
        gastos: 0,
      });
  }
  const spentText = spent ? text(first, 474, 525, spent.y - 24, spent.y - 1) : '';
  const spentDice = [...spentText.matchAll(/(\d+)\s*[dD](6|8|10|12)\b/g)];
  for (const hit of spentDice) {
    const die = c.combate.dadosVida.find((d) => d.dado === 'd' + hit[2]);
    if (die) die.gastos += Number(hit[1]);
  }
  if (!spentDice.length && c.combate.dadosVida.length === 1)
    c.combate.dadosVida[0].gastos = numberAbove(first, spent) ?? 0;
  c.combate.escudo =
    first.inkAt?.(shield ? shield.x + shield.width / 2 : 357.5, shield ? shield.y - 6 : 71) ??
    false;
  const deathMarks = (name: string) => {
    const h = label(first, name);
    return h
      ? [-13, 0, 13].filter((dx) => {
          const x = h.x + h.width / 2 + dx,
            y = h.y - 8;
          return (
            [
              [0, 0],
              [-1.25, 0],
              [1.25, 0],
              [0, -1.25],
              [0, 1.25],
            ].filter(([ox, oy]) => first.inkAt?.(x + ox, y + oy)).length >= 4
          );
        }).length
      : 0;
  };
  c.combate.sucessosMorte = deathMarks('SUCCESSES');
  c.combate.falhasMorte = deathMarks('FAILURES');
  const inspiration = label(first, 'HEROIC INSPIRATION');
  c.combate.inspiracao = first.inkAt?.(67, inspiration ? inspiration.y + 37.5 : 637) ?? false;
  const abilityNames: Record<Ability, string> = {
    for: 'STRENGTH',
    des: 'DEXTERITY',
    con: 'CONSTITUTION',
    int: 'INTELLIGENCE',
    sab: 'WISDOM',
    car: 'CHARISMA',
  };
  let abilityCount = 0;
  for (const [key, label] of Object.entries(abilityNames) as [Ability, string][]) {
    const h = first.items.find((i) => i.text === label),
      right = ['int', 'sab', 'car'].includes(key);
    if (!h) continue;
    const value = numeric(first, right ? 190 : 73, right ? 226 : 107, h.y + 17, h.y + 49);
    if (value !== undefined) {
      c.atributos[key].valor = value;
      abilityCount++;
    }
    const displayed = numeric(first, right ? 154 : 35, right ? 188 : 72, h.y + 17, h.y + 49);
    if (displayed !== undefined)
      c.atributos[key].ajusteModificador = displayed - modificador(c.atributos[key].valor);
  }
  if (abilityCount !== 6)
    throw Error('Não foi possível reconhecer os seis atributos no layout do PDF.');
  let calc = calcularFicha(c);
  const prof = numeric(first, 40, 89, 162, 197);
  if (prof !== undefined) c.combate.ajusteProficiencia = prof - calc.proficiencia;
  calc = calcularFicha(c);
  const skills: Record<string, keyof SheetContent['pericias']> = {
    athletics: 'atletismo',
    acrobatics: 'acrobacia',
    'sleight of hand': 'prestidigitacao',
    stealth: 'furtividade',
    arcana: 'arcanismo',
    history: 'historia',
    investigation: 'investigacao',
    nature: 'natureza',
    religion: 'religiao',
    'animal handling': 'adestrarAnimais',
    insight: 'intuicao',
    medicine: 'medicina',
    perception: 'percepcao',
    survival: 'sobrevivencia',
    deception: 'enganacao',
    intimidation: 'intimidacao',
    performance: 'atuacao',
    persuasion: 'persuasao',
  };
  for (const [key, label] of Object.entries(abilityNames) as [Ability, string][]) {
    const h = first.items.find((i) => i.text === label)!;
    const right = ['int', 'sab', 'car'].includes(key),
      x0 = right ? 143 : 27,
      x1 = right ? 237 : 122;
    const next =
      first.items
        .filter(
          (i) => Object.values(abilityNames).includes(i.text) && i.y > h.y && i.x > 130 === right,
        )
        .sort((a, b) => a.y - b.y)[0]?.y ?? (right ? 660 : 590);
    for (const row of rows(region(first, x0, x1, h.y + 50, next))) {
      const m = clean(row.text).match(/^([+-]?\d+)\s+(.+)$/);
      if (!m) continue;
      const bonus = Number(m[1]),
        marked = first.inkAt?.(right ? 142.1 : 25, row.y + 4);
      const label = norm(m[2]);
      if (label === 'saving throw') {
        c.atributos[key].resistenciaProficiente = marked ?? false;
        c.atributos[key].ajusteResistencia =
          bonus - calc.atributos[key] - (marked ? calc.proficiencia : 0);
      } else if (skills[label]) {
        const skill = c.pericias[skills[label]],
          base = calc.atributos[skill.atributo as Ability];
        skill.grau = marked ? 'proficiente' : 'nenhuma';
        skill.ajuste = bonus - base - (marked ? calc.proficiencia : 0);
        if (marked && bonus - base >= 2 * calc.proficiencia)
          warn(
            'Um bônus de perícia pode incluir especialização ou outros ajustes. Foi mantida proficiência simples com ajuste para preservar o valor; confirme a especialização na ficha.',
          );
        if (!marked && skill.ajuste)
          warn(
            'Alguns bônus de perícia foram preservados como ajustes. Confira meia proficiência e outros bônus na aba Atributos e perícias.',
          );
      }
    }
  }
  if (!first.inkAt)
    warn(
      'Marcações de proficiência não disponíveis: os bônus impressos foram preservados como ajustes. Confira as proficiências.',
    );
  calc = calcularFicha(c);
  const initiative = numeric(first, 267, 316, 152, 179),
    passive = numeric(first, 529, 588, 152, 179);
  if (initiative !== undefined) c.combate.ajusteIniciativa = initiative - calc.atributos.des;
  if (passive !== undefined)
    c.combate.ajustePercepcaoPassiva = passive - (10 + calc.pericias.percepcao);
  const speedLabel = label(first, 'SPEED');
  const speed = clean(
    text(first, 352, 412, (speedLabel?.y ?? 143) + 7, (speedLabel?.y ?? 143) + 35),
  ).match(/^(\d+(?:[.,]\d+)?)\s*(ft\.?|feet|m|metros?)?$/i);
  if (speed) {
    c.combate.deslocamento = Number(speed[1].replace(',', '.'));
    c.combate.unidade = /^(m|metro)/i.test(speed[2] || '') ? 'metros' : 'pes';
  } else
    warn(
      'Deslocamento vazio no PDF: o padrão de 9 metros foi mantido; informe o deslocamento correto.',
    );
  for (const [key, x] of [
    ['leves', 79.9],
    ['medias', 115.4],
    ['pesadas', 146],
    ['escudos', 181.2],
  ] as const)
    c.treinamento[key] = first.inkAt?.(x, (label(first, 'LIGHT')?.y ?? 703.5) + 4.7) ?? false;
  c.treinamento.armas = fit(
    clean(text(first, 24, 237, 720, 744))
      .replace(/^WEAPONS\s*/, '')
      .replace(/^WEAPONS/, ''),
    10000,
  );
  c.treinamento.ferramentas = fit(
    clean(text(first, 24, 237, 753, 780)).replace(/^TOOLS\s*/, ''),
    10000,
  );

  const second = pages.find((p) => heading(p, 'CANTRIPS & PREPARED SPELLS'));
  const prepared = new Set<string>();
  if (second) {
    const anchors = ['Ability', 'Modifier', 'Spell Save DC', 'Bonus'].map((name) =>
      label(second, name, 60, 125),
    );
    const defaults = [28, 55, 85, 110, 141];
    const bands = anchors.every(Boolean)
      ? [0, ...anchors.slice(1).map((h, i) => (h!.y + anchors[i]!.y) / 2), anchors[3]!.y + 25]
      : defaults;
    const values = bands.slice(0, 4).map((top, i) =>
      clean(text(second, 14, 60, top, bands[i + 1]))
        .split('/')
        .map(clean),
    );
    const abilityMap: Record<string, Ability> = {
      str: 'for',
      strength: 'for',
      dex: 'des',
      dexterity: 'des',
      con: 'con',
      constitution: 'con',
      int: 'int',
      intelligence: 'int',
      wis: 'sab',
      wisdom: 'sab',
      cha: 'car',
      charisma: 'car',
    };
    values[0].forEach((source, i) => {
      const ability = abilityMap[norm(source)];
      if (!ability) return;
      const profile = {
        ...novaEntrada('conjuracao.perfis'),
        nome: values[0].length > 1 ? 'Conjuração do PDF ' + (i + 1) : 'Conjuração do PDF',
        atributo: ability,
        classeId: c.classes.length === 1 && values[0].length === 1 ? c.classes[0].id : '',
      };
      const base = calcularFicha(c),
        printedMod = number(values[1][i] || ''),
        printedDc = number(values[2][i] || ''),
        printedAttack = number(values[3][i] || '');
      profile.ajusteModificador = (printedMod ?? base.atributos[ability]) - base.atributos[ability];
      const modifier = base.atributos[ability] + profile.ajusteModificador;
      profile.ajusteCd =
        printedDc !== undefined ? printedDc - (8 + base.proficiencia + modifier) : 0;
      profile.ajusteAtaque =
        printedAttack !== undefined ? printedAttack - (base.proficiencia + modifier) : 0;
      c.conjuracao.perfis.push(profile);
    });
    if (c.conjuracao.perfis.length > 1)
      warn(
        'Múltiplos perfis de conjuração: confira a classe de origem e associe cada magia ao perfil correto. A ordem impressa não identifica esses vínculos.',
      );
    const lang = heading(second, 'LANGUAGES')?.y,
      equip = heading(second, 'EQUIPMENT', 300)?.y;
    if (lang !== undefined && equip !== undefined)
      c.idiomas = clean(text(second, 434, 601, lang + 9, equip - 3))
        .split(/[,;]+/)
        .filter((s) => s.trim())
        .map((s) => ({ ...novaEntrada('idiomas'), nome: fit(s) }));
    const appearance = heading(second, 'APPEARANCE')?.y,
      story = heading(second, 'BACKSTORY & PERSONALITY')?.y;
    if (appearance !== undefined && story !== undefined)
      c.historia.aparencia = fit(text(second, 434, 601, appearance + 10, story - 4), 10000);
    const align = heading(second, 'ALIGNMENT')?.y,
      pronouns = heading(second, 'PRONOUNS')?.y;
    if (align !== undefined && pronouns !== undefined)
      c.historia.alinhamento = fit(clean(text(second, 434, 601, align + 9, pronouns - 3)));
    if (story !== undefined && align !== undefined)
      c.historia.historia = fit(text(second, 434, 601, story + 9, align - 4), 10000);
    const coins = heading(second, 'COINS')?.y;
    if (coins !== undefined)
      for (const [key, label] of [
        ['pc', 'CP'],
        ['pp', 'SP'],
        ['pe', 'EP'],
        ['po', 'GP'],
        ['pl', 'PP'],
      ] as const) {
        const h = second.items.find((i) => i.text === label && i.y > coins);
        if (h)
          c.inventario.moedas[key] = numeric(second, h.x - 8, h.x + 23, h.y + 9, h.y + 35) ?? 0;
      }
    for (const level of region(second, 14, 24, 175, 790).filter((i) => /^[0-9]$/.test(i.text)))
      prepared.add(norm(text(second, 24, 93, level.y - 3, level.y + 10)));
  }

  // Detailed combat tables contain complete names and additional attacks missing on page 1.
  let combatActive = false;
  for (const p of pages.slice(1)) {
    if (heading(p, 'COMBAT REFERENCE')) combatActive = true;
    if (
      heading(p, 'SPELLS & SPELLCASTING') ||
      heading(p, 'INVENTORY') ||
      heading(p, 'BACKSTORY, PERSONALITY')
    )
      combatActive = false;
    if (!combatActive) continue;
    const attackHeader = label(p, 'ATK/DC');
    const attacks = heading(p, 'ATTACKS')?.y ?? (attackHeader ? attackHeader.y - 15 : undefined),
      end = heading(p, 'WEAPON MASTERIES')?.y ?? heading(p, 'ACTIONS')?.y ?? 792;
    if (attacks !== undefined) {
      const candidates = rows(region(p, 129, 169, attacks + 15, end)).filter((r) =>
        /^(?:[+-]\d+|(?:STR|DEX|CON|INT|WIS|CHA)\s+\d+|[—–-])$/.test(r.text),
      );
      candidates.forEach((r, i) => {
        const stop = candidates[i + 1]?.y ?? end;
        const name = clean(text(p, 24, 128, r.y - 3, stop - 4));
        const damage = clean(
          text(p, 171, (label(p, 'RANGE')?.x ?? 244) - 2, r.y - 3, stop - 4),
        ).match(/^([\ddD+−.\-]+)\s*(.*)$/);
        const rangeX = label(p, 'RANGE')?.x ?? 244,
          notesX = label(p, 'NOTES')?.x ?? 307;
        const range = clean(text(p, rangeX - 2, notesX - 2, r.y - 3, stop - 4));
        const notes = text(p, notesX - 2, 601, r.y - 3, stop - 4);
        const dc = /^[A-Z]/.test(r.text),
          damageOnly = /^[—–-]$/.test(r.text);
        const value = Number(r.text.match(/[+-]?\d+$/)?.[0] ?? 0);
        if (damageOnly)
          warn(
            'Algumas entradas de dano ou cura não têm jogada de ataque/CD no PDF. Foram preservadas com bônus 0 e uma observação; confira antes de rolar.',
          );
        c.ataques.push({
          ...novaEntrada('ataques'),
          nome: fit(name),
          tipo: dc ? 'cd' : 'bonus',
          valor: value,
          dano: fit(damage?.[1]?.replace('−', '-') || ''),
          tipoDano: fit(damage?.[2] || ''),
          observacoes: fit(
            [
              range && 'Alcance: ' + range,
              dc && 'Salvaguarda: ' + r.text.split(' ')[0],
              damageOnly &&
                'Sem jogada de ataque/CD no PDF; use somente o dano ou cura. Bônus 0 é um marcador editável.',
              notes,
            ]
              .filter(Boolean)
              .join('\n'),
            10000,
          ),
        });
      });
    }
    const reference = attacks === undefined ? text(p, 14, 601, 40) : text(p, 14, 601, end);
    if (reference)
      c.historia.anotacoes +=
        (c.historia.anotacoes ? '\n\n' : 'Referência de combate do PDF:\n') + reference;
    const resist = heading(p, 'RESISTANCES')?.y,
      vulner = heading(p, 'VULNERABILITIES')?.y,
      immune = heading(p, 'IMMUNITIES')?.y;
    if (resist !== undefined && vulner !== undefined)
      c.combate.resistencias = fit(
        clean(text(p, 80, 217, resist - 3, vulner - 4)).replace(/^None$/i, ''),
        10000,
      );
    if (vulner !== undefined && immune !== undefined)
      c.combate.vulnerabilidades = fit(
        clean(text(p, 80, 217, vulner - 3, immune - 4)).replace(/^None$/i, ''),
        10000,
      );
    if (immune !== undefined)
      c.combate.imunidades = fit(
        clean(text(p, 80, 217, immune - 3, immune + 15)).replace(/^None$/i, ''),
        10000,
      );
    const senses = label(p, 'SENSES');
    if (senses) {
      const bottom = heading(p, 'ATTACKS')?.y ?? 175;
      const sense = rows(
        region(p, 220, label(p, 'WEAPONS', senses.x)?.x ?? 395, senses.y + 9, bottom - 4),
      )
        .filter((r) => !/PASSIVE|PERCEPTION|^\d+$/.test(r.text))
        .map((r) => r.text)
        .join('\n');
      c.combate.sentidos = fit(sense, 10000);
    }
  }
  if (!c.ataques.length) {
    const h = heading(first, 'WEAPONS & DAMAGE CANTRIPS')?.y,
      end = heading(first, 'CLASS FEATURES')?.y;
    if (h !== undefined && end !== undefined)
      for (const r of rows(region(first, 328, 362, h + 18, end)).filter((r) =>
        /^([+-]\d+|[A-Z]{3}\s+\d+)$/.test(r.text),
      )) {
        const d = clean(text(first, 363, 421, r.y - 2, r.y + 8)).match(/^([\ddD+\-]+)\s*(.*)$/);
        c.ataques.push({
          ...novaEntrada('ataques'),
          nome: fit(clean(text(first, 250, 328, r.y - 2, r.y + 8))),
          tipo: /^[A-Z]/.test(r.text) ? 'cd' : 'bonus',
          valor: Number(r.text.match(/[+-]?\d+$/)![0]),
          dano: d?.[1] || '',
          tipoDano: d?.[2] || '',
          observacoes: '',
        });
      }
    if (c.ataques.length)
      warn(
        'Ataques lidos da página resumida: nomes podem estar abreviados e descrições podem faltar. Exporte também a referência de combate.',
      );
  }

  let spellActive = false,
    lastSpell: SheetSpell | undefined;
  for (const p of pages.slice(1)) {
    if (heading(p, 'SPELLS & SPELLCASTING')) spellActive = true;
    if (heading(p, 'INVENTORY') || heading(p, 'BACKSTORY, PERSONALITY')) spellActive = false;
    if (!spellActive) continue;
    const h = heading(p, 'CANTRIPS & SPELLS')?.y;
    const top = h !== undefined ? h + 35 : 0;
    const nameX = (label(p, 'NAME')?.x ?? 27) - 3;
    const rangeX = (label(p, 'RANGE')?.x ?? 114) - 1;
    const notesX = label(p, 'NOTES')?.x ?? 204;
    const flagsX =
      (p.items.find((i) => i.text === 'V' && i.y < (label(p, 'NAME')?.y ?? top) + 3)?.x ?? 172) - 3;
    const prepHeader = label(p, 'PR.');
    const levels = p.items
      .filter((i) => i.x < 24 && i.y > (h !== undefined ? h + 20 : 0) && /^[0-9]$/.test(i.text))
      .sort((a, b) => a.y - b.y);
    const rules = p.rules?.filter((r) => r.x0 <= 25 && r.x1 >= 590).map((r) => r.y) || [];
    if (lastSpell) {
      const stop = levels.length
        ? (rules.filter((y) => y < levels[0].y).at(-1) ?? levels[0].y - 10)
        : 792;
      const continuation = text(p, notesX, 601, top, stop - 1)
        .split('\n')
        .filter((s) => !/^NOTES$/.test(s))
        .join('\n');
      if (continuation) lastSpell.descricao = fit(lastSpell.descricao + '\n' + continuation, 10000);
    }
    levels.forEach((level, i) => {
      const start =
        rules.filter((y) => y < level.y).at(-1) ?? (i ? (levels[i - 1].y + level.y) / 2 : top);
      const end =
        rules.find((y) => y > level.y + 8) ??
        (levels[i + 1] ? (level.y + levels[i + 1].y) / 2 : 792);
      const nameAndTime = rows(region(p, nameX, rangeX, start + 1, end - 1));
      const timeRow = nameAndTime.find((r) =>
        /^(Action|Bonus Action|Reaction|\d+\s+(Action|Minute|Hour|ação|ações|minuto|hora)|Special|Ação|Reação)/i.test(
          r.text,
        ),
      );
      const name = clean(
        nameAndTime
          .filter((r) => r !== timeRow && !/^NAME$/.test(r.text))
          .map((r) => r.text)
          .join(' '),
      );
      if (!name) return;
      const flags = region(p, flagsX, notesX, start + 1, end - 1);
      const flag = (letter: string) => {
        const f = flags.find((f) => f.text === letter);
        return !!(f && p.ringAt?.(f.x + f.width / 2, f.y + f.height / 2));
      };
      c.magias.push({
        ...novaEntrada('magias'),
        nome: fit(name),
        circulo: Number(level.text),
        preparada:
          Number(level.text) === 0 ||
          (prepHeader
            ? (p.inkAt?.(prepHeader.x - 1, level.y + 4) ?? false)
            : prepared.has(norm(name))),
        tempo: fit(timeRow?.text || ''),
        alcance: fit(clean(text(p, rangeX, flagsX, start + 1, end - 1))),
        verbal: flag('V'),
        somatico: flag('S'),
        material: flag('M') ? 'Componente material indicado no PDF; confira os detalhes.' : '',
        ritual: flag('R'),
        concentracao: flag('C'),
        descricao: fit(text(p, notesX, 601, start + 1, end - 1), 10000),
        observacoes: 'Importada do PDF do Roll20.',
      });
      lastSpell = c.magias.at(-1);
    });
  }
  for (const p of pages.slice(1)) {
    for (const title of ['SPELL SLOTS', 'WARLOCK SPELLS']) {
      const h = label(p, title);
      if (!h) continue;
      const headers = region(p, 125, 601, h.y + 5, h.y + 30)
        .filter((i) => i.text === 'Level')
        .sort((a, b) => a.x - b.x);
      for (let col = 0; col < headers.length; col++) {
        const left = headers[col].x,
          right = headers[col + 1]?.x ?? (title === 'WARLOCK SPELLS' ? 235 : 601);
        const totalHeader = region(p, left, right, h.y + 5, h.y + 30).find(
          (i) => i.text === 'Total',
        );
        const spentHeader = region(p, left, right, h.y + 5, h.y + 30).find(
          (i) => i.text === 'Expended',
        );
        if (!totalHeader || !spentHeader) continue;
        const end =
          title === 'WARLOCK SPELLS'
            ? totalHeader.y + 30
            : Math.min(totalHeader.y + 65, label(p, 'WARLOCK SPELLS')?.y ?? 792);
        for (const r of rows(region(p, left - 3, totalHeader.x - 10, totalHeader.y + 8, end))) {
          const n = number(r.text);
          if (!n || n > 9) continue;
          const total = numeric(p, totalHeader.x - 10, spentHeader.x - 10, r.y - 3, r.y + 10);
          const spent = numeric(p, spentHeader.x - 8, right, r.y - 3, r.y + 10) ?? 0;
          if (total !== undefined) {
            if (title === 'WARLOCK SPELLS')
              c.conjuracao.pacto = { circulo: n, total, gastos: spent };
            else c.conjuracao.espacos[n - 1] = { circulo: n, total, gastos: spent, ativo: true };
          }
        }
      }
    }
  }

  if (!c.magias.length && second)
    for (const level of region(second, 14, 24, 175, 790).filter((i) => /^[0-9]$/.test(i.text))) {
      c.magias.push({
        ...novaEntrada('magias'),
        nome: fit(clean(text(second, 24, 93, level.y - 3, level.y + 10))),
        circulo: Number(level.text),
        preparada: true,
        tempo: fit(clean(text(second, 93, 148, level.y - 3, level.y + 10))),
        alcance: fit(clean(text(second, 148, 198, level.y - 3, level.y + 10))),
      });
    }
  if (c.magias.length) {
    if (c.conjuracao.perfis.length === 1)
      for (const spell of c.magias) spell.perfilId = c.conjuracao.perfis[0].id;
    warn(
      'Conjuração: confira o atributo, o perfil de origem, a duração e os detalhes de materiais; esses valores não estão completos no PDF.',
    );
    if (!pages.some((p) => heading(p, 'SPELLS & SPELLCASTING')))
      warn(
        'Magias lidas do resumo: descrições e componentes não foram exportados. Inclua a seção Magias na impressão.',
      );
  }

  let inventoryActive = false,
    equipmentSection = false;
  const previous: (EquipmentItem | undefined)[] = [];
  for (const p of pages.slice(1)) {
    if (heading(p, 'INVENTORY')) {
      inventoryActive = true;
      equipmentSection = true;
    }
    if (heading(p, 'BACKSTORY, PERSONALITY')) inventoryActive = false;
    if (!inventoryActive) continue;
    const equipment = heading(p, 'EQUIPMENT')?.y ?? -1,
      attunement = heading(p, 'MAGIC ITEM ATTUNEMENT')?.y,
      possessions = heading(p, 'POSSESSIONS')?.y;
    for (let col = 0; col < 2; col++) {
      const x0 = col ? 306 : 24,
        x1 = col ? 600 : 304,
        weightX = col ? 526 : 240,
        qtyX = col ? 563 : 280;
      const candidates = rows(region(p, qtyX, x1, 0, 792)).filter((r) => /^\d+$/.test(r.text));
      const records = candidates.filter((r) =>
        /\b(?:lbs?|kg)\b/.test(text(p, weightX, qtyX, r.y - 3, r.y + 9)),
      );
      if (previous[col]) {
        const stop = Math.min(
          records[0]?.y ?? 792,
          ...[attunement, possessions, heading(p, 'WEIGHT')?.y].filter(
            (y): y is number => y !== undefined,
          ),
        );
        const continuation = text(p, x0, x1, 0, stop - 4)
          .split('\n')
          .filter((s) => !/^NAME\s+WT\.\s+QTY$/.test(s))
          .join('\n');
        if (continuation && !heading(p, 'INVENTORY'))
          previous[col]!.descricao = fit(previous[col]!.descricao + '\n' + continuation, 10000);
      }
      records.forEach((r, i) => {
        const stop = Math.min(
          records[i + 1]?.y ?? 792,
          ...[attunement, possessions, heading(p, 'WEIGHT')?.y].filter(
            (y): y is number => y !== undefined && y > r.y,
          ),
        );
        if (
          attunement !== undefined &&
          r.y > attunement &&
          (possessions === undefined || r.y < possessions)
        )
          return;
        const name = clean(text(p, x0, weightX, r.y - 3, r.y + 10));
        const wt = text(p, weightX, qtyX, r.y - 3, r.y + 9).match(/([\d.,]+)\s*(lbs?|kg)/);
        const qty = Number(r.text);
        if (!name || !wt) return;
        if (!qty && Number(wt[1].replace(',', '.')))
          warn(
            'Item com quantidade zero e peso impresso: o peso por unidade não pode ser calculado. Confira o inventário.',
          );
        const body = text(p, x0, x1, r.y + 11, stop - 4);
        const item: EquipmentItem = {
          ...novoEquipamento(),
          nome: fit(name),
          quantidade: qty,
          peso: !qty
            ? 0
            : Math.round(
                ((Number(wt[1].replace(',', '.')) * (wt[2] === 'kg' ? 1 : 0.45359237)) / qty) *
                  100000,
              ) / 100000,
          descricao: fit(body, 10000),
          equipado:
            equipmentSection &&
            r.y > equipment &&
            (attunement === undefined || r.y < attunement) &&
            (possessions === undefined || r.y < possessions)
              ? (p.inkAt?.(37 + col * 285.75, r.y + 4) ?? false)
              : false,
        };
        // Categories are printed in the first metadata row, not inferred from narrative mentions.
        const metadata = body.split('\n')[0] || '';
        if (/(?:Melee|Ranged) Weapon/i.test(metadata)) {
          item.tipo = 'arma';
          item.categoriaArma = /\bMartial\b/.test(metadata) ? 'marcial' : 'simples';
          item.alcanceArma = /Ranged Weapon/.test(metadata) ? 'distancia' : 'corpo-a-corpo';
        } else if (/^Shield(?:\s|·|$)/i.test(metadata)) {
          item.tipo = 'escudo';
          const ac = metadata.match(/([+-]?\d+)\s+AC\b/);
          if (ac) item.bonusCa = Number(ac[1]);
        } else if (/^(Light|Medium|Heavy)(?:\s|·|$)/.test(metadata)) {
          item.tipo = 'armadura';
          item.categoriaArmadura = metadata.startsWith('Heavy')
            ? 'pesada'
            : metadata.startsWith('Medium')
              ? 'media'
              : 'leve';
        }
        c.inventario.itens.push(item);
        previous[col] = item;
      });
    }
    if (attunement !== undefined)
      for (const [left, right] of [
        [44, 217],
        [229, 404],
        [415, 601],
      ]) {
        const name = clean(text(p, left, right, attunement + 9, possessions ?? attunement + 45));
        if (!name) continue;
        const matches = c.inventario.itens.filter((i) => norm(name) === norm(i.nome));
        const match = matches.length === 1 ? matches[0] : undefined;
        if (!match)
          warn(
            'Sintonia: um nome não corresponde a um item único do inventário. A entrada foi preservada para vincular manualmente.',
          );
        if (!match || !c.inventario.sintonizados.some((s) => s.itemId === match.id))
          c.inventario.sintonizados.push({
            ...novaEntrada('inventario.sintonizados'),
            nome: fit(name),
            itemId: match?.id || '',
          });
      }
    if (attunement !== undefined || possessions !== undefined) equipmentSection = false;
    const weight = heading(p, 'WEIGHT')?.y;
    if (weight !== undefined)
      c.historia.anotacoes += '\n\nPeso informado no PDF:\n' + text(p, 14, 601, weight + 10);
  }
  if (c.inventario.itens.length)
    warn(
      'Inventário: pesos convertidos de libras para kg por unidade. Confira quantidades, sintonia, cargas, crítico e valores de armadura; configurações não impressas usam os padrões da ficha.',
    );
  if (c.ataques.length)
    warn(
      'Ataques: bônus e danos preservados como valores manuais. Confira vínculos com equipamentos e atributos antes de usar progressão automática.',
    );

  const classSources = new Set(
    c.classes.flatMap((entry) => [entry.nome, entry.subclasse]).map(norm),
  );
  const speciesSources = new Set(c.identidade.especie.split(/\s*[-|]\s*/).map(norm));
  const featureTitle = (value: string) => {
    const match = value.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
    if (!match) return undefined;
    const source = norm(match[2]);
    return ['class', 'species', 'feat', 'other', 'custom', 'background'].includes(source) ||
      classSources.has(source) ||
      speciesSources.has(source)
      ? match
      : undefined;
  };
  // Feature titles sit at the top of each column; descriptions may continue across pages.
  const lastFeature: (SheetContent['caracteristicas'][number] | undefined)[] = [];
  let featuresActive = false;
  for (const p of pages.slice(1)) {
    if (heading(p, 'BACKSTORY, PERSONALITY')) featuresActive = true;
    if (!featuresActive) continue;
    const classHeading = heading(p, 'CLASS FEATURES')?.y;
    const storyHeading = heading(p, 'BACKSTORY & PERSONALITY')?.y;
    if (classHeading !== undefined && storyHeading !== undefined)
      c.historia.historia = fit(
        text(p, 14, 600, storyHeading + 9, classHeading - 5)
          .split('\n')
          .filter((s) => !/^Alignment\s+Pronouns$/i.test(s))
          .join('\n'),
        10000,
      );
    const breaks = rows(p.items)
      .filter((r) => /^(CLASS FEATURES|SPECIES TRAITS|OTHER FEATURES)$/.test(r.text))
      .map((r) => r.y);
    for (let col = 0; col < 2; col++) {
      const x0 = col ? 306 : 14,
        x1 = col ? 601 : 303;
      const titles = rows(region(p, x0, x1, 0, 792)).filter((r) => featureTitle(r.text));
      const limit = Math.min(titles[0]?.y ?? 792, ...breaks);
      if (lastFeature[col] && !storyHeading) {
        const continuation = text(p, x0, x1, 0, limit - 3);
        if (continuation)
          lastFeature[col]!.descricao = fit(
            lastFeature[col]!.descricao + '\n' + continuation,
            10000,
          );
      }
      titles.forEach((r, i) => {
        const match = featureTitle(r.text)!;
        const stop = Math.min(titles[i + 1]?.y ?? 792, ...breaks.filter((y) => y > r.y));
        const entry = {
          ...novaEntrada('caracteristicas'),
          nome: fit(match[1]),
          descricao: fit(text(p, x0, x1, r.y + 9, stop - 4), 10000),
        };
        const list =
          norm(match[2]) === 'feat'
            ? c.talentos
            : norm(match[2]) === 'species' || speciesSources.has(norm(match[2]))
              ? c.tracos
              : c.caracteristicas;
        if (['other', 'custom', 'background'].includes(norm(match[2])))
          entry.descricao = fit(
            'Origem no PDF: ' + match[2].trim() + '\n' + entry.descricao,
            10000,
          );
        list.push(entry);
        lastFeature[col] = entry;
      });
    }
  }
  c.historia.anotacoes = fit(c.historia.anotacoes, 10000, 'Referência de combate');
  warn(
    'Recursos e estados não impressos (usos, recuperações e efeitos ativos) precisam de revisão manual. As descrições das características foram preservadas.',
  );
  const errors = validarFicha({ nome: name, versao_esquema: 1, conteudo: c });
  if (errors.length)
    throw Error(
      'Os dados do PDF excedem os limites da ficha: ' +
        errors
          .slice(0, 3)
          .map((e) => `${e.campo}: ${e.mensagem}`)
          .join(' '),
    );
  return {
    name,
    content: c,
    warnings: [...warnings],
    pages: pages.length,
    found: [
      { label: 'Personagem', value: name },
      { label: 'Classe', value: c.classes.map((x) => `${x.nome} ${x.nivel}`).join(' / ') },
      { label: 'Atributos', value: '6 valores' },
      {
        label: 'PV / CA',
        value: `${c.combate.pvAtuais}/${c.combate.pvMaximos} · CA ${c.combate.ca}`,
      },
      { label: 'Ataques', value: String(c.ataques.length) },
      { label: 'Magias', value: String(c.magias.length) },
      { label: 'Itens', value: String(c.inventario.itens.length) },
      {
        label: 'Características, traços e talentos',
        value: String(c.caracteristicas.length + c.tracos.length + c.talentos.length),
      },
    ],
  };
}
