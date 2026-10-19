import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CompendiumRepository,
  CreationDraft,
} from '../../../packages/contracts/character-creation';
import {
  COMPENDIUM_KINDS,
  type CompendiumQuery,
  type CompendiumRef,
} from '../../../packages/contracts/compendium';
import {
  decodeCatalog,
  summaryFromRow,
  type DatabaseCatalog,
} from '../../../packages/compendium/decode';
import { CompendiumError } from '../../../packages/compendium/errors';
export { CompendiumError } from '../../../packages/compendium/errors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function cancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Consulta cancelada.', 'AbortError');
}
function uuid(value: string) {
  if (!UUID.test(value)) throw new CompendiumError('INVALID_QUERY');
  return value;
}
async function request<T>(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  cancelled(signal);
  try {
    let call = client.rpc(name, args);
    if (signal) call = call.abortSignal(signal);
    const { data, error } = await call;
    cancelled(signal);
    if (error) throw error;
    return data as T;
  } catch (error) {
    cancelled(signal);
    if (error instanceof CompendiumError) throw error;
    throw new CompendiumError('UNAVAILABLE');
  }
}
export function createCompendiumRepository(client: SupabaseClient): CompendiumRepository {
  async function catalog(
    refs: CompendiumRef[],
    rules: string | null,
    signal?: AbortSignal,
    optionalRefs: CompendiumRef[] = [],
  ) {
    const requestedRefs = [...refs, ...optionalRefs];
    requestedRefs.forEach((r) => {
      uuid(r.recordId);
      uuid(r.revisionId);
    });
    const ids = [...new Set(requestedRefs.map((r) => r.revisionId))];
    const raw = await request<DatabaseCatalog>(
      client,
      'obter_compendio',
      { p_revisoes: ids, p_conjunto: rules },
      signal,
    );
    let result;
    try {
      result = decodeCatalog(raw, rules ?? raw.records[0]?.conjunto_regras_codigo ?? 'dnd-5e-2024');
    } catch {
      throw new CompendiumError('UNAVAILABLE');
    }
    if (
      refs.some(
        (ref) =>
          !result.entries.some(
            (e) => e.ref.revisionId === ref.revisionId && e.ref.recordId === ref.recordId,
          ),
      )
    )
      throw new CompendiumError('NOT_FOUND');
    return result;
  }
  return {
    async list(query: CompendiumQuery, signal?: AbortSignal) {
      cancelled(signal);
      if (
        !/^[a-z0-9-]{1,80}$/.test(query.ruleSetId) ||
        (query.kind && !COMPENDIUM_KINDS.includes(query.kind)) ||
        (query.query && query.query.length > 200)
      )
        throw new CompendiumError('INVALID_QUERY');
      const limit = query.limit ?? 24;
      if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        (query.circle !== undefined &&
          (!Number.isInteger(query.circle) || query.circle < 0 || query.circle > 9))
      )
        throw new CompendiumError('INVALID_QUERY');
      let cursor: { name: string; id: string } | null = null;
      if (query.cursor) {
        try {
          cursor = JSON.parse(decodeURIComponent(query.cursor));
          if (
            !cursor ||
            typeof cursor.name !== 'string' ||
            cursor.name.length > 240 ||
            !UUID.test(cursor.id)
          )
            throw Error();
        } catch {
          throw new CompendiumError('INVALID_QUERY');
        }
      }
      const rows = await request<Record<string, any>[]>(
        client,
        'buscar_compendio',
        {
          p_conjunto: query.ruleSetId,
          p_tipo: query.kind ?? null,
          p_busca: query.query?.trim() ?? null,
          p_fonte: query.sourceId ? uuid(query.sourceId) : null,
          p_classe: query.classRevisionId ? uuid(query.classRevisionId) : null,
          p_pai: query.parentRevisionId ? uuid(query.parentRevisionId) : null,
          p_circulo: query.circle ?? null,
          p_apos_nome: cursor?.name ?? null,
          p_apos_registro: cursor?.id ?? null,
          p_limite: limit + 1,
        },
        signal,
      );
      if (!Array.isArray(rows)) throw new CompendiumError('UNAVAILABLE');
      const entries = rows.slice(0, limit).map(summaryFromRow),
        last = entries.at(-1);
      return {
        entries,
        nextCursor:
          rows.length > limit && last
            ? encodeURIComponent(JSON.stringify({ name: last.name, id: last.ref.recordId }))
            : null,
      };
    },
    async get(ref, signal) {
      return (await catalog([ref], null, signal)).entries.find(
        (e) => e.ref.revisionId === ref.revisionId,
      )!;
    },
    async getContext(ref, signal) {
      return catalog([ref], null, signal);
    },
    async getCreationCatalog(draft: CreationDraft, signal) {
      if (!/^[a-z0-9-]{1,80}$/.test(draft.ruleSetId)) throw new CompendiumError('INVALID_QUERY');
      const refs = [
        draft.speciesRef,
        draft.lineageRef,
        draft.backgroundRef,
        ...draft.classes.flatMap((c) => [c.classRef, c.subclassRef]),
        ...draft.choices.flatMap((c) =>
          c.values.flatMap((v) => (v.type === 'record' ? [v.ref] : [])),
        ),
      ].filter((r): r is CompendiumRef => !!r);
      // Missing selected spells must reach reconciliation; origins and choice records remain required.
      return catalog(
        refs,
        draft.ruleSetId,
        signal,
        draft.spellSelections.map((s) => s.spellRef),
      );
    },
  };
}
export async function resolveLegacyCompendiumRef(
  client: SupabaseClient,
  legacyId: string,
  signal?: AbortSignal,
): Promise<CompendiumRef | null> {
  const rows = await request<{ registro_id: string; revisao_id: string }[]>(
    client,
    'referencia_legada_compendio',
    { p_legado: uuid(legacyId) },
    signal,
  );
  return rows[0] ? { recordId: rows[0].registro_id, revisionId: rows[0].revisao_id } : null;
}
