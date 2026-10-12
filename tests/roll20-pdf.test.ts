import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoll20Pdf, type PdfPage, type PdfText } from '../packages/sheets/roll20-pdf';
import { calcularFicha } from '../packages/sheets/calculos.js';
import { validarFicha } from '../packages/sheets/modelo.js';

function t(text: string, x: number, y: number, width = text.length * 4): PdfText {
  return { text, x, y, width, height: 8 };
}
function page(items: PdfText[]): PdfPage {
  return { width: 612, height: 792, items };
}
function basics(): PdfPage {
  return {
    ...page([
      t('Viajante', 36, 23),
      t('NAME', 36, 41),
      t('Soldado', 27, 52),
      t('BACKGROUND', 27, 65),
      t('Bárbaro 4', 149, 52),
      t('CLASS', 149, 65),
      t('Oni', 27, 84),
      t('SPECIES', 27, 97),
      t('Berserker', 149, 84),
      t('SUBCLASS', 149, 97),
      t('HIT POINTS', 407, 31),
      t('ARMOR CLASS', 343, 33),
      t('15', 349, 49),
      t('29', 403, 70),
      t('CURRENT', 398, 89),
      t('31', 445, 74),
      t('MAX', 444, 89),
      t('4D12', 488, 78),
      t('0/6500', 285, 76),
      t('PROFICIENCY BONUS', 27, 142),
      t('+2', 60, 175),
      t('INITIATIVE', 273, 143),
      t('+2', 281, 159),
      t('SPEED', 369, 143),
      t('--', 373, 159),
      t('SIZE', 462, 143),
      t('Medium', 449, 160),
      t('PASSIVE PERCEPTION', 526, 143),
      t('12', 551, 159),
      t('INTELLIGENCE', 156, 142),
      t('-1', 162, 170),
      t('8', 197, 176),
      t('-1 Saving Throw', 150, 219),
      t('-1 Arcana', 150, 235),
      t('-1 Investigation', 150, 258),
      t('STRENGTH', 46, 225),
      t('+4', 42, 253),
      t('18', 78, 259),
      t('+6 Saving Throw', 31, 307),
      t('+6 Athletics', 31, 324),
      t('DEXTERITY', 46, 343),
      t('+2', 42, 371),
      t('14', 78, 377),
      t('+2 Saving Throw', 31, 425),
      t('+2 Acrobatics', 31, 442),
      t('WISDOM', 156, 303),
      t('+0', 162, 331),
      t('10', 197, 337),
      t('+0 Saving Throw', 150, 385),
      t('+2 Perception', 150, 436),
      t('CONSTITUTION', 27, 477),
      t('+3', 42, 505),
      t('16', 78, 511),
      t('+5 Saving Throw', 31, 559),
      t('CHARISMA', 156, 464),
      t('-1', 162, 492),
      t('8', 197, 498),
      t('-1 Saving Throw', 150, 546),
      t('+1 Intimidation', 150, 579),
    ]),
    inkAt: (_x, y) => [311, 328, 440, 563, 583].some((v) => Math.abs(y - v) < 3),
  };
}

test('PDF impresso recupera identidade, números, proficiências e preserva bônus calculados', () => {
  const result = parseRoll20Pdf([basics()]);
  assert.equal(result.name, 'Viajante');
  assert.equal(result.content.classes[0].nivel, 4);
  assert.equal(result.content.classes[0].subclasse, 'Berserker');
  assert.equal(result.content.identidade.especie, 'Oni');
  assert.equal(result.content.combate.ca, 15);
  assert.equal(result.content.combate.pvAtuais, 29);
  assert.equal(result.content.combate.pvMaximos, 31);
  assert.equal(result.content.atributos.for.valor, 18);
  assert.equal(result.content.atributos.con.resistenciaProficiente, true);
  assert.equal(result.content.pericias.atletismo.grau, 'proficiente');
  assert.equal(result.content.pericias.intimidacao.grau, 'proficiente');
  assert.equal(calcularFicha(result.content).pericias.intimidacao, 1);
  assert.equal(calcularFicha(result.content).iniciativa, 2);
  assert.ok(result.warnings.some((w) => /deslocamento/i.test(w)));
  assert.deepEqual(
    validarFicha({ nome: result.name, versao_esquema: 1, conteudo: result.content }),
    [],
  );
});

test('inventário separa colunas, converte o peso da pilha em kg por unidade e mantém descrições', () => {
  const inventory = page([
    t('INVENTORY', 269, 27),
    t('EQUIPMENT', 282, 58),
    t('NAME', 52, 75),
    t('WT.', 249, 75),
    t('QTY', 280, 75),
    t('Glaive', 52, 92),
    t('6 lbs', 245, 92),
    t('1', 285, 92),
    t('Melee Weapon · Martial', 25, 106),
    t('Reach. Extends reach.', 25, 125),
    t('Tocha', 52, 155),
    t('10 lbs', 244, 155),
    t('10', 282, 155),
    t('Simple Melee Weapon', 25, 169),
    t('A Torch burns for 1 hour.', 25, 182),
    t('MAGIC ITEM ATTUNEMENT', 254, 210),
    t('POSSESSIONS', 270, 245),
    t('Corda', 25, 280),
    t('5 lbs', 248, 280),
    t('1', 288, 280),
    t('Rope description.', 25, 298),
    t('Caixa de Fogo', 307, 280),
    t('1 lb', 534, 280),
    t('1', 570, 280),
    t('Tinderbox description.', 307, 298),
  ]);
  inventory.inkAt = (_x, y) => Math.abs(y - 96) < 3;
  const result = parseRoll20Pdf([basics(), inventory]);
  assert.equal(result.content.inventario.itens.length, 4);
  const [weapon, torch, rope, box] = result.content.inventario.itens;
  assert.equal(weapon.tipo, 'arma');
  assert.equal(weapon.equipado, true);
  assert.equal(weapon.peso, 2.72155);
  assert.equal(torch.quantidade, 10);
  assert.equal(torch.peso, 0.45359);
  assert.match(rope.descricao!, /Rope description/);
  assert.doesNotMatch(rope.descricao!, /Tinderbox/);
  assert.match(box.descricao!, /Tinderbox/);
});

test('ataques usam a referência completa, preservam nome em duas linhas, CD e alcance', () => {
  const attacks = page([
    t('COMBAT REFERENCE', 220, 14),
    t('ATTACKS', 280, 180),
    t('NAME', 26, 207),
    t('ATK/DC', 131, 207),
    t('DAMAGE', 173, 207),
    t('RANGE', 244, 207),
    t('NOTES', 307, 207),
    t('Machado de Mão - Uma', 26, 223),
    t('Mão', 26, 234),
    t('+6', 131, 223),
    t('1d6 slashing', 173, 223),
    t('5 ft.', 244, 223),
    t('Repreensão Infernal', 26, 260),
    t('DEX 10', 131, 260),
    t('2d10 fire', 173, 260),
    t('60 feet', 244, 260),
    t('The target saves.', 307, 260),
    t('WEAPON MASTERIES', 250, 320),
    t('NAME', 26, 340),
    t('Glaive', 26, 355),
  ]);
  const result = parseRoll20Pdf([basics(), attacks]);
  assert.equal(result.content.ataques.length, 2);
  assert.equal(result.content.ataques[0].nome, 'Machado de Mão - Uma Mão');
  assert.equal(result.content.ataques[0].dano, '1d6');
  assert.equal(result.content.ataques[1].tipo, 'cd');
  assert.equal(result.content.ataques[1].valor, 10);
  assert.match(result.content.ataques[1].observacoes, /60 feet/);
  assert.match(result.content.ataques[1].observacoes, /DEX/);
  assert.match(result.content.historia.anotacoes, /WEAPON MASTERIES/);
});

test('magias associam a descrição inteira ao intervalo da linha, mesmo com nome centralizado', () => {
  const spells = page([
    t('SPELLS & SPELLCASTING', 220, 14),
    t('CANTRIPS & SPELLS', 250, 130),
    t('LVL', 14, 159),
    t('NAME', 25, 159),
    t('RANGE', 114, 159),
    t('NOTES', 204, 159),
    t('Primeira frase da magia longa.', 205, 177),
    t('Uma segunda frase.', 205, 198),
    t('0', 15, 230),
    t('Taumaturgia', 25, 223),
    t('Action', 25, 237),
    t('30 feet', 115, 230),
    t('V', 172, 228, 5),
    t('S', 182, 228, 5),
    t('Última frase da primeira magia.', 205, 280),
    t('Descrição da segunda magia.', 205, 299),
    t('0', 15, 321),
    t('Raio de Fogo', 25, 315),
    t('Action', 25, 328),
    t('120 feet', 115, 321),
    t('V', 172, 319, 5),
    t('S', 182, 319, 5),
    t('Dano em níveis superiores.', 205, 346),
  ]);
  spells.rules = [
    { x0: 14, x1: 598, y: 173 },
    { x0: 14, x1: 598, y: 296 },
    { x0: 14, x1: 598, y: 358 },
  ];
  spells.ringAt = (x, y) => x < 180 || y > 300;
  const result = parseRoll20Pdf([basics(), spells]);
  assert.equal(result.content.magias.length, 2);
  assert.match(result.content.magias[0].descricao, /^Primeira frase/);
  assert.match(result.content.magias[0].descricao, /Última frase/);
  assert.doesNotMatch(result.content.magias[0].descricao, /segunda magia/);
  assert.equal(result.content.magias[0].verbal, true);
  assert.equal(result.content.magias[0].somatico, false);
  assert.equal(result.content.magias[1].somatico, true);
  assert.equal(result.content.conjuracao.perfis.length, 0);
  assert.ok(result.warnings.some((w) => /conjuração/i.test(w)));
});

test('características mantêm colunas separadas, categorias e continuação na página seguinte', () => {
  const features = page([
    t('BACKSTORY, PERSONALITY & FEATURES', 150, 24),
    t('BACKSTORY & PERSONALITY', 250, 70),
    t('História do personagem.', 14, 105),
    t('CLASS FEATURES', 270, 185),
    t('Frenesi (Class)', 14, 203),
    t('Descrição do frenesi.', 14, 220),
    t('Fúria (Class)', 307, 203),
    t('Descrição da fúria.', 307, 220),
  ]);
  const continuation = page([
    t('Continuação da fúria.', 307, 30),
    t('SPECIES TRAITS', 270, 90),
    t('Legado (Species)', 14, 110),
    t('Descrição do legado.', 14, 130),
    t('OTHER FEATURES', 270, 170),
    t('Atacante (Feat)', 14, 190),
    t('Descrição do talento.', 14, 210),
  ]);
  const result = parseRoll20Pdf([basics(), features, continuation]);
  assert.equal(result.content.caracteristicas.length, 2);
  assert.match(result.content.caracteristicas[1].descricao, /Continuação da fúria/);
  assert.doesNotMatch(result.content.caracteristicas[0].descricao, /fúria/);
  assert.equal(result.content.tracos.length, 1);
  assert.equal(result.content.talentos.length, 1);
  assert.match(result.content.historia.historia, /História do personagem/);
});

test('PDF sem texto, documento diferente e coordenadas inválidas falham sem produzir ficha', () => {
  for (const pages of [
    [],
    [page([])],
    [page([t('Relatório', 10, 10)])],
    [{ ...basics(), width: 0 }],
  ])
    assert.throws(() => parseRoll20Pdf(pages), /PDF|Roll20|layout/i);
});
test('páginas de continuação podem começar com itens e traços a 21 pontos do topo', () => {
  const inventory = page([
    t('INVENTORY', 269, 27),
    t('EQUIPMENT', 282, 58),
    t('Tocha', 52, 92),
    t('1 lb', 245, 92),
    t('1', 285, 92),
    t('Torch description.', 25, 110),
  ]);
  const next = page([
    t('NAME WT. QTY', 25, 3),
    t('Óleo', 25, 21),
    t('2 lbs', 248, 21),
    t('2', 287, 21),
    t('Oil description.', 25, 45),
  ]);
  const features = page([
    t('BACKSTORY, PERSONALITY & FEATURES', 150, 24),
    t('CLASS FEATURES', 270, 70),
    t('Fúria (Class)', 307, 90),
    t('Rage description.', 307, 110),
  ]);
  const traits = page([
    t('SPECIES TRAITS', 274, 3),
    t('Legado (Species)', 14, 21),
    t('Legacy description.', 14, 35),
    t('Devorador (Species)', 307, 21),
    t('Soul description.', 307, 35),
  ]);
  const result = parseRoll20Pdf([basics(), inventory, next, features, traits]);
  assert.equal(result.content.inventario.itens.length, 2);
  assert.equal(result.content.inventario.itens[1].nome, 'Óleo');
  assert.doesNotMatch(result.content.inventario.itens[0].descricao!, /Oil/);
  assert.equal(result.content.tracos.length, 2);
  assert.doesNotMatch(result.content.caracteristicas[0].descricao, /Soul/);
});
test('descrições de magia e inventário continuam mesmo quando a página seguinte não tem entrada nova', () => {
  const spells = page([
    t('SPELLS & SPELLCASTING', 220, 14),
    t('CANTRIPS & SPELLS', 250, 130),
    t('0', 15, 230),
    t('Luz', 25, 223),
    t('Action', 25, 237),
    t('Descrição inicial.', 205, 260),
  ]);
  spells.rules = [
    { x0: 14, x1: 598, y: 173 },
    { x0: 14, x1: 598, y: 780 },
  ];
  const spellMore = page([
    t('LVL NAME RANGE NOTES', 14, 3),
    t('Descrição continuada da magia.', 205, 21),
  ]);
  const inventory = page([
    t('INVENTORY', 269, 27),
    t('EQUIPMENT', 282, 58),
    t('Tocha', 52, 92),
    t('1 lb', 245, 92),
    t('1', 285, 92),
    t('Descrição inicial do item.', 25, 110),
  ]);
  const itemMore = page([
    t('NAME WT. QTY', 25, 3),
    t('Descrição continuada do item.', 25, 21),
    t('WEIGHT', 270, 200),
  ]);
  const result = parseRoll20Pdf([basics(), spells, spellMore, inventory, itemMore]);
  assert.match(result.content.magias[0].descricao, /Descrição continuada da magia/);
  assert.match(result.content.inventario.itens[0].descricao!, /Descrição continuada do item/);
  assert.doesNotMatch(result.content.inventario.itens[0].descricao!, /WEIGHT/);
});
test('três posições de sintonia da mesma linha mantêm nomes exatos e vínculos independentes', () => {
  const inventory = page([
    t('INVENTORY', 269, 27),
    t('EQUIPMENT', 282, 58),
    t('Espada', 52, 92),
    t('1 lb', 245, 92),
    t('1', 285, 92),
    t('Espada Longa', 52, 150),
    t('1 lb', 245, 150),
    t('1', 285, 150),
    t('Anel', 52, 208),
    t('1 lb', 245, 208),
    t('1', 285, 208),
    t('MAGIC ITEM ATTUNEMENT', 254, 260),
    t('Espada Longa', 44, 285),
    t('Anel', 230, 285),
    t('Espada', 417, 285),
    t('POSSESSIONS', 270, 310),
  ]);
  const result = parseRoll20Pdf([basics(), inventory]);
  assert.equal(result.content.inventario.sintonizados.length, 3);
  assert.equal(result.content.inventario.sintonizados[0].nome, 'Espada Longa');
  assert.equal(
    result.content.inventario.sintonizados[0].itemId,
    result.content.inventario.itens[1].id,
  );
});
test('atributo e bônus de conjuração explicitamente impressos viram um perfil editável', () => {
  const second = page([
    t('CANTRIPS & PREPARED SPELLS', 160, 142),
    t('INT', 33, 36),
    t('+3', 33, 62),
    t('15', 33, 90),
    t('+7', 33, 117),
  ]);
  const result = parseRoll20Pdf([basics(), second]);
  assert.equal(result.content.conjuracao.perfis[0].atributo, 'int');
  const profile = calcularFicha(result.content).perfis[result.content.conjuracao.perfis[0].id];
  assert.deepEqual(profile, { modificador: 3, cd: 15, ataque: 7 });
});
test('marcação de equipado é independente em cada coluna', () => {
  const inventory = page([
    t('INVENTORY', 269, 27),
    t('EQUIPMENT', 282, 58),
    t('Esquerda', 52, 92),
    t('1 lb', 245, 92),
    t('1', 285, 92),
    t('Direita', 338, 92),
    t('1 lb', 531, 92),
    t('1', 571, 92),
  ]);
  inventory.inkAt = (x, y) => x < 100 && Math.abs(y - 96) < 3;
  const result = parseRoll20Pdf([basics(), inventory]);
  assert.equal(result.content.inventario.itens[0].equipado, true);
  assert.equal(result.content.inventario.itens[1].equipado, false);
});
test('bônus acima da proficiência simples não inventa especialização', () => {
  const p = basics();
  p.items.find((i) => i.text === '+6 Athletics')!.text = '+8 Athletics';
  const result = parseRoll20Pdf([p]);
  assert.equal(result.content.pericias.atletismo.grau, 'proficiente');
  assert.equal(calcularFicha(result.content).pericias.atletismo, 8);
  assert.ok(result.warnings.some((w) => /especialização/.test(w)));
});
