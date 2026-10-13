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

test('multiclasse separa classes, subclasses e todos os dados de vida impressos', () => {
  const p = basics();
  p.items.find((i) => i.text === 'Bárbaro 4')!.text = 'Druida 4 | Clérigo 3';
  p.items.find((i) => i.text === 'Berserker')!.text = 'Estrelas | Vida';
  p.items.find((i) => i.text === '4D12')!.text = '3D8 | 4D8';
  const { content } = parseRoll20Pdf([p]);
  assert.deepEqual(
    content.classes.map(({ nome, nivel, subclasse }) => ({ nome, nivel, subclasse })),
    [
      { nome: 'Druida', nivel: 4, subclasse: 'Estrelas' },
      { nome: 'Clérigo', nivel: 3, subclasse: 'Vida' },
    ],
  );
  assert.equal(
    content.combate.dadosVida.reduce((sum, d) => sum + d.maximo, 0),
    7,
  );
  assert.ok(content.combate.dadosVida.every((d) => d.dado === 'd8'));
});

test('deslocamento reconhece unidade impressa junto do número', () => {
  const p = basics();
  p.items.find((i) => i.text === '--')!.text = '40 ft.';
  const result = parseRoll20Pdf([p]);
  assert.equal(result.content.combate.deslocamento, 40);
  assert.equal(result.content.combate.unidade, 'pes');
  assert.ok(!result.warnings.some((w) => /Deslocamento vazio/.test(w)));
});

test('ataques sem bônus e continuação da tabela não desaparecem nem contaminam o ataque anterior', () => {
  const attacks = page([
    t('COMBAT REFERENCE', 220, 14),
    t('ATTACKS', 280, 180),
    t('NAME', 26, 207),
    t('ATK/DC', 131, 207),
    t('DAMAGE', 173, 207),
    t('RANGE', 244, 207),
    t('NOTES', 307, 207),
    t('Raio', 26, 223),
    t('+6', 131, 223),
    t('1d6 fire', 173, 223),
    t('Cura', 26, 250),
    t('—', 131, 250),
    t('2d8+3', 173, 250),
    t('Toque', 244, 250),
    t('Recupera vida.', 307, 250),
  ]);
  const next = page([
    t('NAME', 26, 3),
    t('ATK/DC', 131, 3),
    t('DAMAGE', 173, 3),
    t('RANGE', 244, 3),
    t('NOTES', 307, 3),
    t('Sugestão', 26, 21),
    t('WIS 13', 131, 21),
    t('—', 173, 21),
    t('30 feet', 244, 21),
    t('Descrição da sugestão.', 307, 21),
    t('ACTIONS', 280, 80),
  ]);
  const { content } = parseRoll20Pdf([basics(), attacks, next]);
  assert.deepEqual(
    content.ataques.map((a) => a.nome),
    ['Raio', 'Cura', 'Sugestão'],
  );
  assert.equal(content.ataques[0].dano, '1d6');
  assert.equal(content.ataques[1].tipo, 'bonus');
  assert.equal(content.ataques[1].valor, 0);
  assert.match(content.ataques[1].observacoes, /Sem jogada de ataque/);
  assert.equal(content.ataques[1].dano, '2d8+3');
  assert.equal(content.ataques[2].valor, 13);
  assert.doesNotMatch(content.ataques[0].observacoes, /Recupera/);
});

test('características aceitam classe, subclasse, espécie e outras origens sem misturar descrições', () => {
  const p = basics();
  const features = page([
    t('BACKSTORY, PERSONALITY & FEATURES', 150, 24),
    t('CLASS FEATURES', 270, 70),
    t('Fúria (Bárbaro)', 14, 90),
    t('Descrição da fúria.', 14, 105),
    t('Frenesi (Berserker)', 14, 140),
    t('Descrição do frenesi.', 14, 155),
    t('SPECIES TRAITS', 270, 200),
    t('Visão (Oni)', 14, 220),
    t('Descrição da visão.', 14, 240),
    t('OTHER FEATURES', 270, 280),
    t('Atacante (Feat)', 14, 300),
    t('Descrição do talento.', 14, 315),
    t('Manobra (Other)', 14, 350),
    t('Descrição da manobra.', 14, 365),
    t('Herança (Background)', 307, 300),
    t('Descrição da herança.', 307, 315),
    t('Ajuste (Custom)', 307, 350),
    t('Descrição do ajuste.', 307, 365),
  ]);
  const { content } = parseRoll20Pdf([p, features]);
  assert.deepEqual(
    content.caracteristicas.map((f) => f.nome),
    ['Fúria', 'Frenesi', 'Manobra', 'Herança', 'Ajuste'],
  );
  assert.deepEqual(
    content.tracos.map((f) => f.nome),
    ['Visão'],
  );
  assert.deepEqual(
    content.talentos.map((f) => f.nome),
    ['Atacante'],
  );
  assert.doesNotMatch(content.talentos[0].descricao, /manobra/);
  assert.doesNotMatch(content.caracteristicas[0].descricao, /frenesi/);
});

test('magias com coluna PR mantêm limites na quebra de página, componentes e preparação', () => {
  const spells = page([
    t('SPELLS & SPELLCASTING', 220, 32),
    t('CANTRIPS & SPELLS', 267, 174),
    t('LVL', 14, 200),
    t('PR.', 29, 200),
    t('NAME', 49, 200),
    t('RANGE', 136, 200),
    t('V', 194, 194, 3),
    t('S', 205, 194, 3),
    t('M', 214, 194, 4),
    t('NOTES', 226, 200),
    t('1', 16, 714),
    t('Proteção', 47, 707),
    t('Action', 47, 721),
    t('V', 194, 712, 3),
    t('S', 205, 712, 3),
    t('Descrição anterior.', 227, 695),
    t('1', 16, 747.25),
    t('Detectar Magia', 47, 748),
    t('1 hora', 47, 761),
    t('V', 194, 751, 3),
    t('S', 205, 751, 3),
    t('R', 199, 761, 3),
    t('Descrição da detecção.', 227, 747.5),
  ]);
  spells.rules = [214.5, 692, 744.5].map((y) => ({ x0: 14, x1: 598, y }));
  spells.inkAt = (x, y) => Math.abs(x - 28) < 2 && Math.abs(y - 718) < 2;
  spells.ringAt = (x, y) => x < 202 && y > 745;
  const next = page([
    t('LVL', 14, 3),
    t('PR.', 29, 3),
    t('NAME', 49, 3),
    t('RANGE', 136, 3),
    t('V', 194, 1, 3),
    t('NOTES', 226, 3),
    t('Continuação da detecção.', 227, 22),
  ]);
  const { content } = parseRoll20Pdf([basics(), spells, next]);
  assert.deepEqual(
    content.magias.map((m) => m.nome),
    ['Proteção', 'Detectar Magia'],
  );
  assert.equal(content.magias[0].preparada, true);
  assert.equal(content.magias[1].preparada, false);
  assert.equal(content.magias[1].tempo, '1 hora');
  assert.equal(content.magias[1].verbal, true);
  assert.equal(content.magias[1].somatico, false);
  assert.equal(content.magias[1].ritual, true);
  assert.equal(content.magias[1].descricao, 'Descrição da detecção.\nContinuação da detecção.');
  assert.doesNotMatch(content.magias[0].descricao, /detecção|S M/);
});

test('sentidos não são sobrescritos por notas de ataques nas páginas de continuação', () => {
  const combat = page([
    t('COMBAT REFERENCE', 220, 24),
    t('SENSES', 260, 77),
    t('PROFICIENCIES', 437, 77),
    t('PASSIVE', 240, 96),
    t('PERCEPTION', 240, 105),
    t('12', 305, 105),
    t('DARKVISION', 240, 132),
    t('60 ft', 305, 132),
    t('ATTACKS', 280, 180),
  ]);
  const next = page([t('Notas de outra ação.', 310, 90)]);
  const { content } = parseRoll20Pdf([basics(), combat, next]);
  assert.equal(content.combate.sentidos, 'DARKVISION 60 ft');
});

test('perfis múltiplos e espaços normais e de pacto usam os rótulos da tabela', () => {
  const second = page([
    t('CHA /', 25, 29),
    t('INT', 30, 56),
    t('Ability', 63, 48),
    t('-1 / +0', 20, 82),
    t('Modifier', 63, 88),
    t('13 / 14', 24, 123),
    t('Spell Save DC', 63, 121),
    t('+5 / +6', 24, 162),
    t('Spell Attack', 63, 156),
    t('Bonus', 63, 167),
    t('SPELL SLOTS', 251, 56),
    t('Level', 136, 71),
    t('Total', 165, 71),
    t('Expended', 195, 71),
    t('1', 142, 89),
    t('4', 170, 87),
    t('2', 142, 105),
    t('3', 170, 103),
    t('3', 142, 121),
    t('2', 170, 119),
    t('WARLOCK SPELLS', 136, 141),
    t('Level', 136, 153),
    t('Total', 165, 153),
    t('Expended', 195, 153),
    t('3', 142, 167),
    t('2', 170, 167),
    t('CANTRIPS & PREPARED SPELLS', 155, 194),
  ]);
  const { content } = parseRoll20Pdf([basics(), second]);
  assert.deepEqual(
    content.conjuracao.perfis.map((p) => p.atributo),
    ['car', 'int'],
  );
  const computed = calcularFicha(content);
  assert.deepEqual(
    content.conjuracao.perfis.map((p) => computed.perfis[p.id]),
    [
      { modificador: -1, cd: 13, ataque: 5 },
      { modificador: 0, cd: 14, ataque: 6 },
    ],
  );
  assert.deepEqual(
    content.conjuracao.espacos.slice(0, 3).map((s) => s.total),
    [4, 3, 2],
  );
  assert.deepEqual(content.conjuracao.pacto, { circulo: 3, total: 2, gastos: 0 });
});

test('cabeçalho comprimido não mistura antecedente com NAME e mantém as quatro classes', () => {
  const p = basics();
  p.items.find((i) => i.text === 'Bárbaro 4')!.text = 'Warlock 5 | Bard 5 | Barbarian 5 | Rogue 5';
  p.items.find((i) => i.text === 'Berserker')!.text = 'Fiend Patron | Lore | Berserker | Thief';
  for (const i of p.items) if (i.x === 149) i.x = 85;
  const { content } = parseRoll20Pdf([p]);
  assert.equal(content.identidade.antecedente, 'Soldado');
  assert.deepEqual(
    content.classes.map((c) => c.nome),
    ['Warlock', 'Bard', 'Barbarian', 'Rogue'],
  );
  assert.equal(
    content.classes.reduce((sum, c) => sum + c.nivel, 0),
    20,
  );
});

test('bônus de perícias com dois dígitos permanecem na coluna da direita', () => {
  const p = basics();
  p.items = p.items.filter((i) => !i.text.includes('Perception'));
  p.items.push(t('+13', 145, 436), t('Perception', 164, 436));
  const { content } = parseRoll20Pdf([p]);
  assert.equal(calcularFicha(content).pericias.percepcao, 13);
  assert.equal(content.pericias.percepcao.grau, 'proficiente');
});

test('inventário conserva itens de quantidade zero e marcação de equipado na continuação', () => {
  const inventory = page([
    t('INVENTORY', 269, 27),
    t('EQUIPMENT', 282, 58),
    t('Escudo', 52, 92),
    t('1 lb', 245, 92),
    t('1', 285, 92),
  ]);
  const next = page([
    t('Adaga', 52, 21),
    t('1 lb', 245, 21),
    t('1', 285, 21),
    t('Melee Weapon', 25, 35),
    t('MAGIC ITEM ATTUNEMENT', 254, 60),
    t('POSSESSIONS', 270, 90),
    t('Corda', 25, 120),
    t('0 lbs', 245, 120),
    t('0', 285, 120),
  ]);
  next.inkAt = (x, y) => Math.abs(x - 37) < 1 && Math.abs(y - 25) < 1;
  const { content } = parseRoll20Pdf([basics(), inventory, next]);
  assert.equal(content.inventario.itens.length, 3);
  assert.equal(content.inventario.itens[1].equipado, true);
  assert.equal(content.inventario.itens[2].quantidade, 0);
  assert.equal(content.inventario.itens[2].peso, 0);
});
