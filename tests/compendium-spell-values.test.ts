import test from 'node:test';
import assert from 'node:assert/strict';
import { spellToSheet } from '../packages/compendium/sheet-adapter';
import { criarConteudo, novaEntrada, validarFicha } from '../packages/sheets/modelo.js';
import { formulasMagia, sincronizarMagias } from '../packages/sheets/magias.js';
import { actionCatalog } from '../apps/web/features/session/action-favorites';
import { resolveCreation } from '../packages/character-creation/resolve';
import type { SheetContent, SheetRecord } from '../packages/contracts/sheets';
import { entry, fixture, id } from './fixtures/creation';

const reaction =
  'Uma Reação, que você realiza em resposta a sofrer dano de uma criatura que você possa ver a até 18 metros [60 pés] de você';
const spell = () =>
  entry(
    700,
    'magia',
    {
      circle: 1,
      school: 'Evocação',
      castingTime: reaction,
      range: '18 metros [60 pés]',
      rangeFeet: 60,
      duration: 'Instantânea',
      durationSeconds: null,
      concentration: false,
      ritual: false,
      components: {
        verbal: true,
        somatic: true,
        material: 'um cristal de 50 PO, consumido pela magia',
        costCopper: 5000,
        consumed: true,
      },
      classRefs: [],
      damages: [{ id: id(701), order: 0, dice: '2d10', damageType: 'fogo' }],
      scales: [],
    },
    'Repreensão Infernal',
  );

const cantrip = () => {
  const s = spell();
  s.name = 'Raio de Fogo';
  s.data.circle = 0;
  s.data.castingTime = 'Uma Ação';
  s.data.damages[0].dice = '1d10';
  s.data.scales = [
    { level: 11, basis: 'personagem', dice: '3d10' },
    { level: 5, basis: 'personagem', dice: '2d10' },
    { level: 17, basis: 'personagem', dice: '4d10' },
    { level: 1, basis: 'circulo', dice: '9d10' },
  ];
  return s;
};

test('truques importados usam a maior progressão de personagem já alcançada', () => {
  const s = cantrip();
  for (const [level, dice] of [
    [1, '1d10'],
    [4, '1d10'],
    [5, '2d10'],
    [10, '2d10'],
    [11, '3d10'],
    [16, '3d10'],
    [17, '4d10'],
    [20, '4d10'],
  ] as const) {
    assert.equal(spellToSheet(s, '', { characterLevel: level }).danos![0].dado, dice);
  }
  assert.equal(spellToSheet(s, '').danos![0].dado, '1d10');
  assert.equal(s.data.damages[0].dice, '1d10');
  assert.deepEqual(
    s.data.scales.map((scale) => scale.dice),
    ['3d10', '2d10', '4d10', '9d10'],
  );
});

test('escala por espaço e parcelas múltiplas mantêm o dano base para edição manual', () => {
  const s = spell();
  s.data.scales = [{ level: 2, basis: 'circulo', dice: '3d10' }];
  assert.equal(spellToSheet(s, '', { characterLevel: 17 }).danos![0].dado, '2d10');
  const multiple = cantrip();
  multiple.data.damages.push({ id: id(702), order: 1, dice: '1d6', damageType: 'frio' });
  assert.deepEqual(
    spellToSheet(multiple, '', { characterLevel: 17 }).danos!.map((d) => d.dado),
    ['1d10', '1d6'],
  );
});

test('magia importada conserva todo o gatilho de reação e pode ser salva na ficha', () => {
  const c = criarConteudo() as SheetContent;
  c.magias.push(spellToSheet(spell(), ''));
  assert.equal(c.magias[0].tempo, reaction);
  assert.equal(c.magias[0].alcance, '18 metros [60 pés]');
  assert.equal(c.magias[0].material, 'um cristal de 50 PO, consumido pela magia');
  assert.deepEqual(validarFicha({ nome: 'Mago', versao_esquema: 1, conteudo: c }), []);
});

test('validação de texto de magia aceita metadados longos e mantém limites finitos', () => {
  const c = criarConteudo() as SheetContent;
  const s = {
    ...novaEntrada('magias'),
    nome: 'Magia',
    tempo: reaction,
    alcance: 'a'.repeat(121),
    duracao: 'd'.repeat(121),
  };
  c.magias.push(s);
  const validate = () => validarFicha({ nome: 'Mago', versao_esquema: 1, conteudo: c });
  assert.deepEqual(validate(), []);
  s.tempo = 't'.repeat(10001);
  assert.ok(validate().some((e) => e.campo === 'magias.0.tempo'));
  s.tempo = reaction;
  s.nome = 'n'.repeat(121);
  assert.ok(validate().some((e) => e.campo === 'magias.0.nome'));
});

test('parcelas tipadas importadas habilitam dano de combate sem colidir entre cópias', () => {
  const source = spell();
  source.data.castingTime = 'Uma Ação';
  source.data.damages.unshift({ id: id(702), order: 1, dice: '1d6', damageType: null });
  const c = criarConteudo() as SheetContent;
  c.magias.push(spellToSheet(source, ''), spellToSheet(source, ''));
  const imported = sincronizarMagias(c);
  assert.deepEqual(
    formulasMagia(imported.magias[0], {} as Record<string, number>).map((d) => [d.formula, d.tipo]),
    [
      ['2d10', 'fogo'],
      ['1d6', ''],
    ],
  );
  assert.equal(imported.magias[0].dano, '2d10+1d6');
  assert.equal(imported.magias[0].tipoDano, 'fogo');
  assert.deepEqual(validarFicha({ nome: 'Mago', versao_esquema: 1, conteudo: imported }), []);
  assert.ok(
    actionCatalog({ conteudo: imported } as SheetRecord).some(
      (a) => a.acao === 'magia_dano' && a.entrada_id === imported.magias[0].id,
    ),
  );
  assert.deepEqual(
    source.data.damages.map((d) => d.id),
    [id(702), id(701)],
  );
});

test('projeção de criação conserva dano importado com identificadores determinísticos', () => {
  const f = fixture();
  const s = spell();
  s.data.castingTime = 'Uma Ação';
  f.catalog.entries.push(s);
  f.catalog.castingProfiles.push({
    id: id(710),
    ownerRevisionId: f.species.ref.revisionId,
    key: 'inata',
    type: 'concedida',
    method: 'fixas',
    contributionNumerator: 0,
    contributionDenominator: 1,
    rounding: 'baixo',
    firstLevel: 1,
    abilities: ['car'],
    progression: [],
    slots: [],
    spells: [
      {
        spellRef: s.ref,
        level: 1,
        alwaysPrepared: true,
        usesSlots: false,
        ownUses: null,
        recovery: null,
      },
    ],
  });
  const first = resolveCreation(f.catalog, f.draft);
  assert.deepEqual(first.problems, []);
  assert.equal(first.sheet!.magias[0].dano, '2d10');
  assert.deepEqual(first, resolveCreation(f.catalog, f.draft));
});

test('criação aplica progressão de truque pelo nível total e conserva projeção determinística', () => {
  for (const [level, dice] of [
    [1, '1d10'],
    [5, '2d10'],
    [11, '3d10'],
    [17, '4d10'],
  ] as const) {
    const f = fixture();
    const s = cantrip();
    f.draft.classes[0].level = level;
    f.draft.levels = Array.from({ length: level }, (_, index) => ({
      totalLevel: index + 1,
      classEntryId: f.draft.classes[0].id,
      hitPointMethod: 'fixed',
      hitPointRoll: null,
    }));
    f.catalog.entries.push(s);
    f.catalog.castingProfiles.push({
      id: id(710),
      ownerRevisionId: f.species.ref.revisionId,
      key: 'inata',
      type: 'concedida',
      method: 'fixas',
      contributionNumerator: 0,
      contributionDenominator: 1,
      rounding: 'baixo',
      firstLevel: 1,
      abilities: ['car'],
      progression: [],
      slots: [],
      spells: [
        {
          spellRef: s.ref,
          level: 1,
          alwaysPrepared: true,
          usesSlots: false,
          ownUses: null,
          recovery: null,
        },
      ],
    });
    const first = resolveCreation(f.catalog, f.draft);
    assert.deepEqual(first.problems, []);
    assert.equal(first.sheet!.magias[0].dano, dice);
    assert.deepEqual(first, resolveCreation(f.catalog, f.draft));
  }
});
