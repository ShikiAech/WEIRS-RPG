import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCompendiumRepository, CompendiumError } from '../apps/web/lib/compendium';
import { fixture, id } from './fixtures/creation';

function creationFixture() {
  const { draft, cls } = fixture();
  draft.speciesRef = null;
  draft.backgroundRef = null;
  const missing = { recordId: id(40), revisionId: id(1040) };
  draft.spellSelections = [
    {
      profileId: `class:${draft.classes[0].id}/casting:${id(30)}`,
      spellRef: missing,
      prepared: true,
    },
  ];
  const raw = {
    records: [
      {
        id: cls.ref.revisionId,
        registro_id: cls.ref.recordId,
        tipo: 'classe',
        nome_pt: 'Mago',
        conjunto_regras_codigo: 'dnd-5e-2024',
      },
    ],
    tables: {},
  };
  return { draft, cls, missing, raw };
}

function responseRepository(data: unknown, error: unknown = null) {
  const client = {
    rpc(_name: string, args: Record<string, unknown>) {
      const catalog = data as { records?: { id: string }[] } | null;
      const requested = args.p_revisoes as string[];
      const response = Array.isArray(catalog?.records)
        ? { ...catalog, records: catalog.records.filter((record) => requested.includes(record.id)) }
        : data;
      return Object.assign(Promise.resolve({ data: response, error }), {
        abortSignal() {
          return this;
        },
      });
    },
  } as unknown as SupabaseClient;
  return createCompendiumRepository(client);
}

const hasCode = (code: CompendiumError['code']) => (error: unknown) =>
  error instanceof CompendiumError && error.code === code;

test('catálogo de criação permite magia selecionada ausente e conserva a origem carregada', async () => {
  const { draft, cls, missing, raw } = creationFixture();
  const catalog = await responseRepository(raw).getCreationCatalog(draft);
  assert.deepEqual(
    catalog.entries.map((entry) => entry.ref),
    [cls.ref],
  );
  assert.ok(!catalog.entries.some((entry) => entry.ref.revisionId === missing.revisionId));
  assert.equal(draft.spellSelections.length, 1, 'carregar não altera o rascunho');
});

test('magias selecionadas disponíveis continuam sendo solicitadas e carregadas', async () => {
  const { draft, cls, missing: spellRef, raw } = creationFixture();
  raw.records.push({
    id: spellRef.revisionId,
    registro_id: spellRef.recordId,
    tipo: 'magia',
    nome_pt: 'Luz',
    conjunto_regras_codigo: 'dnd-5e-2024',
  });
  const catalog = await responseRepository(raw).getCreationCatalog(draft);
  assert.deepEqual(
    catalog.entries.map((entry) => entry.ref),
    [cls.ref, spellRef],
  );
  assert.equal(
    catalog.entries.find((entry) => entry.ref.recordId === spellRef.recordId)?.kind,
    'magia',
  );
});

test('consultas diretas de magia e contexto continuam estritas para referências ausentes', async () => {
  const { missing, raw } = creationFixture();
  const repository = responseRepository(raw);
  await assert.rejects(repository.get(missing), hasCode('NOT_FOUND'));
  await assert.rejects(repository.getContext!(missing), hasCode('NOT_FOUND'));
});

test('catálogo de criação não tolera uma origem ausente', async () => {
  const { draft, raw } = creationFixture();
  draft.speciesRef = { recordId: id(50), revisionId: id(1050) };
  await assert.rejects(responseRepository(raw).getCreationCatalog(draft), hasCode('NOT_FOUND'));
});

test('catálogo de criação não tolera um registro de escolha ausente mesmo que seja uma magia', async () => {
  const { draft, missing, raw } = creationFixture();
  draft.choices = [
    {
      groupId: id(60),
      sourceInstanceId: 'species',
      values: [{ type: 'record', ref: missing }],
    },
  ];
  await assert.rejects(responseRepository(raw).getCreationCatalog(draft), hasCode('NOT_FOUND'));
});

test('falha de transporte continua indisponível e preserva as escolhas do rascunho', async () => {
  const { draft } = creationFixture();
  const before = structuredClone(draft);
  await assert.rejects(
    responseRepository(null, new Error('Falha de rede')).getCreationCatalog(draft),
    hasCode('UNAVAILABLE'),
  );
  assert.deepEqual(draft, before);
});

test('resposta não decodificável continua indisponível e preserva as escolhas', async () => {
  const { draft } = creationFixture();
  const before = structuredClone(draft);
  await assert.rejects(
    responseRepository({ records: null, tables: {} }).getCreationCatalog(draft),
    hasCode('UNAVAILABLE'),
  );
  assert.deepEqual(draft, before);
});

test('cancelamento não é confundido com magia ausente', async () => {
  const { draft, raw } = creationFixture();
  const before = structuredClone(draft);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(responseRepository(raw).getCreationCatalog(draft, controller.signal), {
    name: 'AbortError',
  });
  assert.deepEqual(draft, before);
});

test('selective reader falls back only when the new RPC is not installed', async () => {
  const { draft, raw } = creationFixture();
  for (const code of ['PGRST202', '57014', '42501']) {
    const calls: string[] = [];
    const client = {
      rpc(name: string) {
        calls.push(name);
        const response =
          name === 'obter_compendio_seletivo'
            ? { data: null, error: { code } }
            : { data: raw, error: null };
        return Object.assign(Promise.resolve(response), {
          abortSignal() {
            return this;
          },
        });
      },
    } as unknown as SupabaseClient;
    const result = createCompendiumRepository(client).getCreationCatalog(draft);
    if (code === 'PGRST202') {
      assert.equal((await result).entries.length, 1);
      assert.deepEqual(calls, ['obter_compendio_seletivo', 'obter_compendio']);
    } else {
      await assert.rejects(result, hasCode('UNAVAILABLE'));
      assert.deepEqual(calls, ['obter_compendio_seletivo']);
    }
  }
});
