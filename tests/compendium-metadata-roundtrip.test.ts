import test from 'node:test';
import assert from 'node:assert/strict';
import type { FeatureDefinition, SpeciesDefinition } from '../packages/contracts/compendium';
import type { ResolvedCatalog } from '../tools/compendium-import/resolved';
import { catalogTables, generateSeed } from '../tools/compendium-import/sql';
import { decodeCatalog } from '../packages/compendium/decode';
import { classData, entry, fixture, id } from './fixtures/creation';
import { compendiumFixture } from './sql/compendium-fixture';

const formRules: NonNullable<SpeciesDefinition['formRules']> = [
  { form: 'experimental', armorClass: 19, permitsShield: false, hitPointMultiplier: 0.75 },
  { form: 'reserva', armorClass: 0, permitsShield: true, falseLifeMultiplier: 3 },
];
const formEffects: NonNullable<FeatureDefinition['formEffects']> = {
  form: 'experimental',
  armorClassBonus: 0,
  resistances: ['frio', 'radiante'],
  movements: [
    {
      id: id(71),
      mode: 'voo',
      distance: 45,
      unit: 'pes',
      form: 'experimental',
      condition: 'teste',
      hover: false,
    },
  ],
  attack: {
    name: "Pulso d'água",
    ability: 'int',
    dice: '2d6',
    damageType: 'frio',
    normalRangeFeet: 0,
    longRangeFeet: 90,
    category: 'simples',
  },
};
const spellPrerequisite: NonNullable<FeatureDefinition['spellPrerequisite']> = {
  classRef: entry(3, 'classe', classData()).ref,
  circle: 0,
  dealsDamage: false,
  minimumRangeFeet: 0,
  requiresAttackRoll: true,
};
const skillBonuses: NonNullable<FeatureDefinition['skillBonuses']> = [
  { skills: ['historia', 'religiao'], ability: 'car', minimum: 0 },
  { skills: [], ability: 'int', minimum: 2 },
];

function metadataCatalog(commit = 'commit-original'): ResolvedCatalog {
  const base = fixture();
  base.species.data.formRules = structuredClone(formRules);
  const feature = entry(
    4,
    'caracteristica',
    {
      category: 'traco',
      manualDecision: false,
      parentRef: base.species.ref,
      formEffects: structuredClone(formEffects),
      spellPrerequisite: structuredClone(spellPrerequisite),
      skillBonuses: structuredClone(skillBonuses),
    },
    'Metadados novos',
  );
  const empty = entry(
    5,
    'caracteristica',
    {
      category: 'traco',
      manualDecision: false,
      skillBonuses: [],
      formEffects: { form: 'vazia', movements: [], resistances: [] },
    },
    'Metadados vazios',
  );
  const source = {
    ...base.species.source,
    commit,
    path: 'fonte/teste.json',
    hash: 'hash-imutavel',
  };
  return {
    ...base.catalog,
    entries: [...base.catalog.entries, feature, empty].map((e) => ({
      ...e,
      source,
      key: e.ref.recordId,
      legacyIds: [],
      sourcePath: source.path,
      pointer: e.ref.recordId,
      sourceHash: source.hash,
    })),
    sources: [source],
    issues: [],
    origins: [],
    progressionCells: [],
    requirements: [
      {
        id: id(70),
        ownerRevisionId: feature.ref.revisionId,
        parentId: null,
        operator: 'ausente',
        targetRef: empty.ref,
        ability: null,
        minimum: null,
        choiceKey: null,
        proficiencyId: null,
      },
    ],
  };
}

function decodedRows(c: ResolvedCatalog, tables = Object.fromEntries(catalogTables(c))) {
  return decodeCatalog({
    records: c.entries.map((e) => ({
      id: e.ref.revisionId,
      registro_id: e.ref.recordId,
      tipo: e.kind,
      nome_pt: e.name,
      fonte_id: e.sourceId,
      fonte: e.source,
    })),
    tables,
  });
}

function assertMetadata(catalog: ReturnType<typeof decodeCatalog>) {
  const species = catalog.entries.find((e) => e.kind === 'especie')!;
  const feature = catalog.entries.find((e) => e.ref.revisionId === id(1004))!;
  const empty = catalog.entries.find((e) => e.ref.revisionId === id(1005))!;
  assert.equal(species.kind, 'especie');
  assert.equal(feature.kind, 'caracteristica');
  assert.equal(empty.kind, 'caracteristica');
  if (
    species.kind !== 'especie' ||
    feature.kind !== 'caracteristica' ||
    empty.kind !== 'caracteristica'
  )
    throw Error('Tipos incorretos');
  assert.deepEqual(species.data.formRules, formRules);
  assert.deepEqual(feature.data.formEffects, formEffects);
  assert.deepEqual(feature.data.spellPrerequisite, spellPrerequisite);
  assert.deepEqual(feature.data.skillBonuses, skillBonuses);
  assert.deepEqual(empty.data.skillBonuses, []);
  assert.deepEqual(empty.data.formEffects, { form: 'vazia', movements: [], resistances: [] });
}

test('metadados opcionais sobrevivem às tabelas relacionais e ao decoder sem perder zero/false/vazio', () => {
  assertMetadata(decodedRows(metadataCatalog()));
});

test('decoder mantém compatibilidade com colunas ausentes e NULL de linhas antigas', () => {
  for (const value of [undefined, null]) {
    const c = metadataCatalog();
    const tables = Object.fromEntries(catalogTables(c));
    for (const row of tables.compendio_especies) {
      if (value === undefined) delete row.regras_forma;
      else row.regras_forma = value;
    }
    for (const row of tables.compendio_caracteristicas) {
      row.efeitos_forma = value;
      row.pre_requisito_magia = value;
      row.bonus_pericias = value;
      if (value === undefined) {
        delete row.efeitos_forma;
        delete row.pre_requisito_magia;
        delete row.bonus_pericias;
      }
    }
    for (const e of decodedRows(c, tables).entries) {
      if (e.kind === 'especie') assert.equal(e.data.formRules, undefined);
      if (e.kind === 'caracteristica') {
        assert.equal(e.data.formEffects, undefined);
        assert.equal(e.data.spellPrerequisite, undefined);
        assert.equal(e.data.skillBonuses, undefined);
      }
    }
  }
});

test('PostgreSQL executa seed duas vezes e devolve metadados novos pela RPC pública', async () => {
  const f = await compendiumFixture();
  try {
    await f.db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [f.admin]);
    const c = metadataCatalog();
    const sql = generateSeed(c);
    await f.db.exec(sql);
    await f.db.exec(sql);
    const raw = (
      await f.anonymous('SELECT obter_compendio($1,NULL) AS c', [
        c.entries.map((e) => e.ref.revisionId),
      ])
    )[0].c;
    assertMetadata(decodeCatalog(raw));
    assert.equal(decodeCatalog(raw).requirements.find((r) => r.id === id(70))?.operator, 'ausente');
    const actual = (
      await f.db.query<any>(
        "SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.compendio_requisitos'::regclass AND contype='c'",
      )
    ).rows;
    assert.ok(actual.some((r) => r.definition.includes('ausente')));
    assert.equal(
      (
        await f.db.query<any>(
          "SELECT to_regprocedure('public.registrar_criacao_personagem(uuid,uuid,text,uuid,jsonb,jsonb,jsonb)') AS name",
        )
      ).rows[0].name,
      null,
    );
    const legacy = await f.species('Espécie sem metadados');
    await f.publish(legacy.revisionId);
    const legacyRaw = (
      await f.anonymous('SELECT obter_compendio($1,NULL) AS c', [[legacy.revisionId]])
    )[0].c;
    const legacyEntry = decodeCatalog(legacyRaw).entries[0];
    assert.equal(legacyEntry.kind, 'especie');
    if (legacyEntry.kind === 'especie') assert.equal(legacyEntry.data.formRules, undefined);
    const draft = await f.draft('caracteristica', 'Validação JSONB');
    for (const [column, bad] of [
      ['efeitos_forma', []],
      ['pre_requisito_magia', []],
      ['bonus_pericias', {}],
    ] as const) {
      await assert.rejects(
        f.db.query(
          `INSERT INTO compendio_caracteristicas(revisao_id,${column}) VALUES($1,$2::jsonb)`,
          [draft.revisionId, JSON.stringify(bad)],
        ),
        { code: '23514' },
      );
    }
    const species = await f.draft('especie');
    await assert.rejects(
      f.db.query('INSERT INTO compendio_especies(revisao_id,regras_forma) VALUES($1,$2::jsonb)', [
        species.revisionId,
        '{}',
      ]),
      { code: '23514' },
    );
    const operators = [
      'todos',
      'qualquer',
      'nivel',
      'nivel-classe',
      'atributo',
      'proficiencia',
      'caracteristica',
      'talento',
      'especie',
      'linhagem',
      'escolha',
      'repeticoes',
      'ausente',
    ];
    for (const operator of operators)
      await f.db.query('INSERT INTO compendio_requisitos(revisao_id,operador) VALUES($1,$2)', [
        draft.revisionId,
        operator,
      ]);
    await assert.rejects(
      f.db.query('INSERT INTO compendio_requisitos(revisao_id,operador) VALUES($1,$2)', [
        draft.revisionId,
        'nao-suportado',
      ]),
      { code: '23514' },
    );
    await assert.rejects(
      f.db.query('INSERT INTO compendio_requisitos(revisao_id,operador,minimo) VALUES($1,$2,-1)', [
        draft.revisionId,
        'ausente',
      ]),
      { code: '23514' },
    );
  } finally {
    await f.db.close();
  }
});

test('carga incremental preserva commit da fonte publicada e rejeita toda outra divergência editorial', async () => {
  const f = await compendiumFixture();
  try {
    await f.db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [f.admin]);
    const original = metadataCatalog();
    await f.db.exec(generateSeed(original));
    const next = metadataCatalog('commit-novo');
    const newSource = { ...next.sources[0], id: id(901), path: 'fonte/nova.json' };
    next.sources.push(newSource);
    await f.db.exec(generateSeed(next));
    await f.db.exec(generateSeed(next));
    assert.deepEqual(
      (
        await f.db.query<any>(
          'SELECT id,commit_fonte FROM compendio_fontes WHERE id=ANY($1) ORDER BY id',
          [[id(900), id(901)]],
        )
      ).rows,
      [
        { id: id(900), commit_fonte: 'commit-original' },
        { id: id(901), commit_fonte: 'commit-novo' },
      ],
    );
    for (const field of [
      'title',
      'edition',
      'language',
      'origin',
      'author',
      'referenceUrl',
      'attribution',
      'path',
      'hash',
    ] as const) {
      const changed = structuredClone(next);
      (changed.sources[0] as any)[field] =
        field === 'origin' ? 'oficial' : field === 'language' ? 'en-US' : `alterado-${field}`;
      await assert.rejects(f.db.exec(generateSeed(changed)), { code: 'WC004' }, field);
      await f.db.exec('ROLLBACK');
    }
    const changed = structuredClone(next);
    changed.entries[0].name = 'Alteração editorial indevida';
    await assert.rejects(f.db.exec(generateSeed(changed)), { code: 'WC004' });
    await f.db.exec('ROLLBACK');
    assert.equal(
      (await f.db.query<any>('SELECT commit_fonte FROM compendio_fontes WHERE id=$1', [id(900)]))
        .rows[0].commit_fonte,
      'commit-original',
    );
  } finally {
    await f.db.close();
  }
});

test('opção de magia preserva qualificador nao-preparada sem admitir outros alvos ambíguos', async () => {
  const f = await compendiumFixture();
  try {
    const owner = await f.draft('caracteristica');
    const spell = await f.draft('magia');
    const groupId = crypto.randomUUID();
    await f.db.query(
      'INSERT INTO compendio_grupos_escolha(id,revisao_id,chave,nome_pt) VALUES($1,$2,$3,$4)',
      [groupId, owner.revisionId, 'tomo', 'Tomo'],
    );
    const insertOption = (
      type: string,
      target: string | null,
      ability: string | null,
      proficiency: string | null,
      value: string | null,
      quantity = 1,
    ) =>
      f.db.query(
        'INSERT INTO compendio_opcoes_escolha(revisao_id,grupo_id,nome_pt,tipo,alvo_revisao_id,atributo_codigo,proficiencia_id,valor,quantidade) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [owner.revisionId, groupId, 'Escolha', type, target, ability, proficiency, value, quantity],
      );
    await insertOption('magia', spell.revisionId, null, null, 'nao-preparada');
    for (const args of [
      ['magia', spell.revisionId, null, null, 'outra'],
      ['caracteristica', spell.revisionId, null, null, 'nao-preparada'],
      ['magia', spell.revisionId, 'for', null, 'nao-preparada'],
      ['magia', spell.revisionId, null, crypto.randomUUID(), 'nao-preparada'],
      ['atributo', null, 'for', null, 'nao-preparada'],
    ] as const)
      await assert.rejects(insertOption(args[0], args[1], args[2], args[3], args[4]), {
        code: '23514',
      });
    await assert.rejects(insertOption('magia', spell.revisionId, null, null, 'nao-preparada', 0), {
      code: '23514',
    });
    await insertOption('magia', spell.revisionId, null, null, null);
    await insertOption('atributo', null, 'for', null, null);
    await insertOption('valor', null, null, null, 'exotraje');
  } finally {
    await f.db.close();
  }
});
