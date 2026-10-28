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
