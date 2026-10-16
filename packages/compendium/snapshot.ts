import type { CreationCatalog, CompendiumRepository } from '../contracts/character-creation';
import type { CompendiumEntry, CompendiumSummary } from '../contracts/compendium';
import { CompendiumError } from './errors';

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const check = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('Consulta cancelada.', 'AbortError');
};
export function createSnapshotRepository(
  load: () => Promise<{ schemaVersion: 1; mode: 'demonstracao'; catalog: CreationCatalog }>,
): CompendiumRepository {
  let pending: Promise<CreationCatalog> | undefined;
  async function catalog(signal?: AbortSignal) {
    check(signal);
    pending ??= load()
      .then((s) => {
        if (s.schemaVersion !== 1 || s.mode !== 'demonstracao' || !Array.isArray(s.catalog.entries))
          throw new CompendiumError('UNAVAILABLE');
        return s.catalog;
      })
      .catch((e) => {
        pending = undefined;
        throw e instanceof CompendiumError ? e : new CompendiumError('UNAVAILABLE');
      });
    const c = await pending;
    check(signal);
    return c;
  }
  function summary(e: CompendiumEntry): CompendiumSummary {
    const { description, descriptionHtml, data, source, aliases, ...rest } = e;
    return {
      ...rest,
      ...(e.kind === 'magia'
        ? {
            circle: e.data.circle,
            school: e.data.school,
            ritual: e.data.ritual,
            concentration: e.data.concentration,
          }
        : {}),
    };
  }
  return {
    async list(q, signal) {
      const c = await catalog(signal),
        limit = q.limit ?? 24;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        throw new CompendiumError('INVALID_QUERY');
      const parent = (e: CompendiumEntry) =>
        e.kind === 'subclasse'
          ? e.data.classRef
          : e.kind === 'linhagem'
            ? e.data.speciesRef
            : e.kind === 'caracteristica'
              ? e.data.parentRef
              : null;
      const sorted = c.entries
        .filter(
          (e) =>
            e.ruleSetId === q.ruleSetId &&
            (!q.kind || e.kind === q.kind) &&
            (!q.sourceId || e.sourceId === q.sourceId) &&
            (!q.query ||
              normalize(e.name + ' ' + e.originalName + ' ' + e.aliases.join(' ')).includes(
                normalize(q.query),
              )) &&
            (!q.parentRevisionId || parent(e)?.revisionId === q.parentRevisionId) &&
            (q.circle === undefined || (e.kind === 'magia' && e.data.circle === q.circle)) &&
            (!q.classRevisionId ||
              (e.kind === 'magia' &&
                e.data.classRefs.some((r) => r.revisionId === q.classRevisionId))),
        )
        .sort(
          (a, b) =>
            normalize(a.name).localeCompare(normalize(b.name)) ||
            a.ref.recordId.localeCompare(b.ref.recordId),
        );
      let offset = 0;
      if (q.cursor) {
        const index = sorted.findIndex((e) => e.ref.recordId === q.cursor);
        if (index < 0) throw new CompendiumError('INVALID_QUERY');
        offset = index + 1;
      }
      const slice = sorted.slice(offset, offset + limit);
      check(signal);
      return {
        entries: slice.map(summary),
        nextCursor: offset + limit < sorted.length ? slice.at(-1)!.ref.recordId : null,
      };
    },
    async get(ref, signal) {
      const c = await catalog(signal),
        entry = c.entries.find(
          (e) => e.ref.recordId === ref.recordId && e.ref.revisionId === ref.revisionId,
        );
      if (!entry) throw new CompendiumError('NOT_FOUND');
      return structuredClone(entry);
    },
    async getContext(ref,signal){const c=await catalog(signal);if(!c.entries.some(e=>e.ref.recordId===ref.recordId&&e.ref.revisionId===ref.revisionId))throw new CompendiumError('NOT_FOUND');return c;},
    async getCreationCatalog(draft, signal) {
      const c = await catalog(signal);
      if (c.ruleSetId !== draft.ruleSetId) throw new CompendiumError('NOT_FOUND');
      return c;
    },
  };
}
