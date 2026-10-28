import test from 'node:test';
import assert from 'node:assert/strict';
import type { CompendiumRepository } from '../packages/contracts/character-creation';
import { createCachedCompendiumRepository } from '../apps/web/lib/compendium-cache';
import { fixture } from './fixtures/creation';
const query = { ruleSetId: 'dnd-5e-2024' };
function backend() {
  let calls = 0;
  let fail = false;
  const { catalog } = fixture();
  const repository: CompendiumRepository = {
    async list() {
      calls++;
      if (fail) throw Error('offline');
      return { entries: [], nextCursor: null };
    },
    async get() {
      calls++;
      return catalog.entries[0];
    },
    async getContext() {
      calls++;
      return catalog;
    },
    async getCreationCatalog() {
      calls++;
      return catalog;
    },
  };
  return {
    repository,
    calls: () => calls,
    fail: (value: boolean) => {
      fail = value;
    },
  };
}
test('cache reuses successes, separates full query pagination and repositories, expires and bounds LRU', async () => {
  const b = backend();
  let now = 0;
  const r = createCachedCompendiumRepository(b.repository, {
    now: () => now,
    maxEntries: 2,
    ttlMs: 10,
  });
  await r.list(query);
  await r.list({ ...query });
  assert.equal(b.calls(), 1);
  await r.list({ ...query, cursor: 'page2' });
  assert.equal(b.calls(), 2);
  await r.list({ ...query, parentRevisionId: 'parent' });
  assert.equal(b.calls(), 3);
  await r.list(query);
  assert.equal(b.calls(), 4);
  now = 11;
  await r.list(query);
  assert.equal(b.calls(), 5);
  await createCachedCompendiumRepository(b.repository).list(query);
  assert.equal(b.calls(), 6);
});
test('cache coalesces consumers and cancellation only cancels the abandoned subscriber', async () => {
  let complete!: (value: any) => void;
  let calls = 0;
  let signal!: AbortSignal;
  const b = backend();
  b.repository.list = (_q, s) => {
    calls++;
    signal = s!;
    return new Promise((resolve) => {
      complete = resolve;
    });
  };
  const r = createCachedCompendiumRepository(b.repository);
  const a = new AbortController(),
    c = new AbortController();
  const first = r.list(query, a.signal),
    second = r.list(query, c.signal);
  await Promise.resolve();
  a.abort();
  await assert.rejects(first, { name: 'AbortError' });
  assert.equal(signal.aborted, false);
  complete({ entries: [], nextCursor: null });
  await second;
  await r.list(query);
  assert.equal(calls, 1);
});
test('cache retries rejection, all-consumer abort and malformed results', async () => {
  const b = backend(),
    r = createCachedCompendiumRepository(b.repository);
  b.fail(true);
  await assert.rejects(r.list(query));
  b.fail(false);
  await r.list(query);
  assert.equal(b.calls(), 2);
  let calls = 0;
  b.repository.list = async () => {
    calls++;
    return null as any;
  };
  const malformed = createCachedCompendiumRepository(b.repository);
  await assert.rejects(malformed.list(query));
  await assert.rejects(malformed.list(query));
  assert.equal(calls, 2);
  let aborted = false;
  b.repository.list = (_q, signal) =>
    new Promise((_resolve, reject) =>
      signal!.addEventListener('abort', () => {
        aborted = true;
        reject(new DOMException('', 'AbortError'));
      }),
    );
  const pending = createCachedCompendiumRepository(b.repository),
    a = new AbortController(),
    c = new AbortController();
  const one = pending.list(query, a.signal),
    two = pending.list(query, c.signal);
  await Promise.resolve();
  a.abort();
  c.abort();
  await Promise.all([assert.rejects(one), assert.rejects(two)]);
  assert.equal(aborted, true);
});
test('catalog keys use sorted deduplicated reference sets, rules and immutable revisions', async () => {
  const b = backend(),
    r = createCachedCompendiumRepository(b.repository),
    { draft, catalog } = fixture();
  await r.getCreationCatalog(draft);
  await r.getCreationCatalog({ ...draft, step: 5 } as any);
  assert.equal(b.calls(), 1);
  const ref = catalog.entries[0].ref;
  await r.get(ref);
  await r.get({ ...ref });
  assert.equal(b.calls(), 2);
  await r.get({ ...ref, revisionId: 'changed' });
  assert.equal(b.calls(), 3);
});
test('cache rejects malformed list entries instead of retaining them', async () => {
  const b = backend();
  let calls = 0;
  b.repository.list = async () => {
    calls++;
    return { entries: [{} as any], nextCursor: null };
  };
  const r = createCachedCompendiumRepository(b.repository);
  await assert.rejects(r.list(query));
  await assert.rejects(r.list(query));
  assert.equal(calls, 2);
});
test('cache normalizes reference order and duplication while isolating class/source/rules and preserving pinned revisions through TTL', async () => {
  const b = backend();
  let now = 0;
  const r = createCachedCompendiumRepository(b.repository, { now: () => now, ttlMs: 10 });
  const { draft, catalog } = fixture(),
    ref = catalog.entries[0].ref;
  const a = {
    ...draft,
    choices: [
      {
        groupId: 'g',
        sourceInstanceId: 'x',
        values: [
          { type: 'record' as const, ref },
          { type: 'record' as const, ref: catalog.entries[1].ref },
        ],
      },
    ],
  };
  await r.getCreationCatalog(a);
  await r.getCreationCatalog({
    ...a,
    choices: [
      { ...a.choices[0], values: [...a.choices[0].values].reverse().concat(a.choices[0].values) },
    ],
  });
  assert.equal(b.calls(), 1);
  for (const filter of [
    { classRevisionId: 'class' },
    { sourceId: 'source' },
    { circle: 0 },
    { ruleSetId: 'other' },
  ])
    await r.list({ ...query, ...filter });
  assert.equal(b.calls(), 5);
  await r.get(ref);
  now = 100;
  await r.get(ref);
  assert.equal(b.calls(), 6);
});

for (const operation of ['getContext', 'getCreationCatalog'] as const) {
  test(`${operation} rejects incomplete catalogs and retries the healthy response`, async () => {
    const { catalog, draft } = fixture();
    for (const missing of Object.keys(catalog)) {
      const b = backend();
      let calls = 0;
      const malformed = { ...catalog } as Record<string, unknown>;
      delete malformed[missing];
      b.repository[operation] = async () => (++calls === 1 ? malformed : catalog) as any;
      const repository = createCachedCompendiumRepository(b.repository);
      const request = () =>
        operation === 'getContext'
          ? repository.getContext(catalog.entries[0].ref)
          : repository.getCreationCatalog(draft);
      await assert.rejects(request(), `missing catalog ${missing}`);
      assert.deepEqual(await request(), catalog);
      await request();
      assert.equal(calls, 2, `retry/reuse after missing catalog ${missing}`);
    }
    const b = backend();
    let calls = 0;
    b.repository[operation] = async () => (++calls === 1 ? { entries: [] } : catalog) as any;
    const repository = createCachedCompendiumRepository(b.repository);
    const request = () =>
      operation === 'getContext'
        ? repository.getContext(catalog.entries[0].ref)
        : repository.getCreationCatalog(draft);
    await assert.rejects(request());
    assert.deepEqual(await request(), catalog);
    assert.equal(calls, 2);
  });
}
test('detail rejects summaries, missing detail fields and empty payloads before retrying', async () => {
  const { catalog } = fixture(),
    entry = catalog.entries[0];
  for (const missing of ['data', 'source', 'description', 'descriptionHtml', 'aliases']) {
    const malformed = { ...entry } as Record<string, unknown>;
    delete malformed[missing];
    const b = backend();
    let calls = 0;
    b.repository.get = async () => (++calls === 1 ? malformed : entry) as any;
    const repository = createCachedCompendiumRepository(b.repository);
    await assert.rejects(repository.get(entry.ref), `missing detail ${missing}`);
    assert.deepEqual(await repository.get(entry.ref), entry);
    await repository.get(entry.ref);
    assert.equal(calls, 2);
  }
  const b = backend();
  let calls = 0;
  b.repository.get = async () => (++calls === 1 ? { ...entry, data: {} } : entry) as any;
  const repository = createCachedCompendiumRepository(b.repository);
  await assert.rejects(repository.get(entry.ref));
  assert.deepEqual(await repository.get(entry.ref), entry);
  assert.equal(calls, 2);
});
test('list rejects incomplete summaries and malformed pages before retrying', async () => {
  const entry = fixture().catalog.entries[0];
  for (const malformed of [
    { entries: [{ ref: entry.ref, kind: entry.kind, name: entry.name }], nextCursor: null },
    { entries: [entry] },
    { entries: [entry], nextCursor: 3 },
    { entries: [{ ...entry, revision: 'one' }], nextCursor: null },
  ]) {
    const b = backend();
    let calls = 0;
    const healthy = { entries: [entry], nextCursor: null };
    b.repository.list = async () => (++calls === 1 ? malformed : healthy) as any;
    const repository = createCachedCompendiumRepository(b.repository);
    await assert.rejects(repository.list(query));
    assert.deepEqual(await repository.list(query), healthy);
    await repository.list(query);
    assert.equal(calls, 2);
  }
});

test('creation reuses loaded option records when selecting a choice from its current catalog', async () => {
  const b = backend();
  const { draft, catalog } = fixture();
  const r = createCachedCompendiumRepository(b.repository);
  draft.speciesRef = null;
  const first = await r.getCreationCatalog(draft);
  const next = {
    ...draft,
    choices: [
      {
        groupId: 'choice',
        sourceInstanceId: 'species',
        values: [{ type: 'record' as const, ref: catalog.entries[0].ref }],
      },
    ],
  };
  assert.equal(await r.getCreationCatalog(next), first);
  assert.equal(b.calls(), 1, 'selecting an already hydrated record needs no new server catalog');
});

test('adding a new selected record fetches only its context and merges rules with the creation catalog', async () => {
  const { catalog, draft, species } = fixture();
  const extra = { ...species, ref: { recordId: 'extra', revisionId: 'extra-revision' } };
  let creationCalls = 0;
  const contexts: string[] = [];
  const repository = backend().repository;
  repository.getCreationCatalog = async () => {
    creationCalls++;
    return catalog;
  };
  repository.getContext = async (ref) => {
    contexts.push(ref.revisionId);
    return { ...catalog, entries: [extra], effects: [] };
  };
  const r = createCachedCompendiumRepository(repository);
  await r.getCreationCatalog(draft);
  const next = {
    ...draft,
    choices: [
      {
        groupId: 'choice',
        sourceInstanceId: 'species',
        values: [{ type: 'record' as const, ref: extra.ref }],
      },
    ],
  };
  const merged = await r.getCreationCatalog(next);
  assert.equal(creationCalls, 1);
  assert.deepEqual(contexts, ['extra-revision']);
  assert.deepEqual(
    merged.entries.map((e) => e.ref),
    [...catalog.entries, extra].map((e) => e.ref),
  );
  assert.equal(draft.choices.length, 0);
});

test('reusing a creation subset does not extend the original freshness window', async () => {
  const b = backend();
  const { draft, catalog } = fixture();
  draft.speciesRef = null;
  let now = 0;
  const r = createCachedCompendiumRepository(b.repository, { now: () => now, ttlMs: 300_000 });
  await r.getCreationCatalog(draft);
  now = 240_000;
  const next = {
    ...draft,
    choices: [
      {
        groupId: 'choice',
        sourceInstanceId: 'species',
        values: [{ type: 'record' as const, ref: catalog.entries[0].ref }],
      },
    ],
  };
  await r.getCreationCatalog(next);
  assert.equal(b.calls(), 1);
  now = 300_001;
  await r.getCreationCatalog(next);
  assert.equal(b.calls(), 2);
});

test('incremental creation loading tolerates only missing optional spells and retains the base expiry', async () => {
  const { CompendiumError } = await import('../packages/compendium/errors');
  const { catalog, draft, species } = fixture();
  const extra = { ...species, ref: { recordId: 'extra', revisionId: 'extra-revision' } };
  let now = 0,
    creationCalls = 0;
  const repository = backend().repository;
  repository.getCreationCatalog = async () => {
    creationCalls++;
    return catalog;
  };
  repository.getContext = async () => ({ ...catalog, entries: [extra] });
  const r = createCachedCompendiumRepository(repository, { ttlMs: 300_000, now: () => now });
  await r.getCreationCatalog(draft);
  now = 240_000;
  const next = {
    ...draft,
    spellSelections: [{ profileId: 'profile', spellRef: extra.ref, prepared: true }],
  };
  await r.getCreationCatalog(next);
  now = 300_001;
  await r.getCreationCatalog(next);
  assert.equal(creationCalls, 2, 'incremental merge must not renew its base rules');

  for (const code of ['NOT_FOUND', 'UNAVAILABLE'] as const) {
    repository.getContext = async () => {
      throw new CompendiumError(code);
    };
    const current = createCachedCompendiumRepository(repository);
    await current.getCreationCatalog(draft);
    const pending = current.getCreationCatalog(next);
    if (code === 'NOT_FOUND') assert.deepEqual((await pending).entries, catalog.entries);
    else
      await assert.rejects(
        pending,
        (e: unknown) => e instanceof CompendiumError && e.code === code,
      );
    const mandatory = {
      ...next,
      choices: [
        {
          groupId: 'g',
          sourceInstanceId: 'species',
          values: [{ type: 'record' as const, ref: extra.ref }],
        },
      ],
    };
    await assert.rejects(
      current.getCreationCatalog(mandatory),
      (e: unknown) => e instanceof CompendiumError && e.code === code,
    );
  }
});
