import type {
  CompendiumRepository,
  CreationDraft,
  CreationCatalog,
} from '../../../packages/contracts/character-creation';
import {
  COMPENDIUM_KINDS,
  type CompendiumKind,
  type CompendiumRef,
} from '../../../packages/contracts/compendium';
import { CompendiumError } from '../../../packages/compendium/errors';

type Validator = (value: unknown) => boolean;
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const string: Validator = (value) => typeof value === 'string';
const number: Validator = (value) => typeof value === 'number' && Number.isFinite(value);
const boolean: Validator = (value) => typeof value === 'boolean';
const nullable =
  (validate: Validator): Validator =>
  (value) =>
    value === null || validate(value);
const array =
  (validate?: Validator): Validator =>
  (value) =>
    Array.isArray(value) && (!validate || value.every(validate));
const shape =
  (fields: Record<string, Validator>): Validator =>
  (value) =>
    isObject(value) && Object.entries(fields).every(([key, validate]) => validate(value[key]));
const reference = shape({
  recordId: (value) => string(value) && !!value,
  revisionId: (value) => string(value) && !!value,
});
const origin: Validator = (value) =>
  ['oficial', 'adaptacao-weirs', 'terceiro', 'homebrew', 'nao-revisada'].includes(value as string);
const summary = shape({
  ref: reference,
  kind: (value) => COMPENDIUM_KINDS.includes(value as CompendiumKind),
  slug: string,
  name: string,
  originalName: string,
  sourceId: string,
  sourceTitle: string,
  ruleSetId: (value) => string(value) && !!value,
  revision: (value) => number(value) && Number.isInteger(value) && (value as number) >= 1,
  reviewed2024: boolean,
  automation: (value) => ['manual', 'parcial', 'completa'].includes(value as string),
  origin,
});
const source = shape({
  id: string,
  title: string,
  edition: string,
  language: string,
  origin,
  author: string,
  referenceUrl: string,
  attribution: string,
  path: string,
  commit: string,
  hash: string,
});
// Validate the required payload structure for each kind as well as common detail fields.
// Optional mechanics retain the decoder's existing validation and compatibility rules.
const payloads: Record<CompendiumKind, Validator> = {
  classe: shape({
    hitDie: number,
    fixedHitPoints: number,
    primaryAbilities: array(string),
    multiclassAbilities: array(),
    levels: array(),
    proficiencies: array(),
  }),
  subclasse: shape({ classRef: reference, acquisitionLevel: number, levels: array() }),
  especie: shape({
    creatureType: string,
    defaultSize: string,
    sizes: array(),
    age: string,
    movements: array(),
    senses: array(),
  }),
  linhagem: shape({
    speciesRef: reference,
    inheritTraits: boolean,
    sizes: array(),
    movements: array(),
  }),
  antecedente: shape({ abilities: array(string), distribution: string, abilityLimit: number }),
  talento: shape({
    category: string,
    repeatable: boolean,
    prerequisiteText: string,
    requirementsComplete: boolean,
  }),
  caracteristica: shape({ category: string, manualDecision: boolean }),
  magia: shape({
    circle: number,
    school: string,
    castingTime: string,
    range: string,
    rangeFeet: nullable(number),
    duration: string,
    durationSeconds: nullable(number),
    concentration: boolean,
    ritual: boolean,
    components: shape({
      verbal: boolean,
      somatic: boolean,
      material: string,
      costCopper: nullable(number),
      consumed: boolean,
    }),
    classRefs: array(reference),
    damages: array(),
    scales: array(),
  }),
  equipamento: shape({
    category: string,
    weight: nullable(number),
    weightUnit: string,
    cost: nullable(number),
    currencyRef: nullable(reference),
    requiresAttunement: boolean,
  }),
  pacote: shape({ items: array(), notes: string }),
  criatura: shape({
    creatureType: string,
    size: string,
    armorClass: nullable(number),
    armorClassText: string,
    hitPointFormula: nullable(string),
    abilities: isObject,
    challenge: nullable(string),
    actions: array(),
  }),
  idioma: shape({ category: string, origin: string }),
  maestria: shape({ key: string }),
  propriedade_arma: shape({ key: string }),
  servico: shape({ cost: number, currencyRef: reference, unit: string }),
  moeda: shape({ code: string, symbol: string, copperValue: nullable(number) }),
};
const detail: Validator = (value) =>
  isObject(value) &&
  summary(value) &&
  shape({ description: string, descriptionHtml: string, aliases: array(string), source })(value) &&
  payloads[value.kind as CompendiumKind](value.data);
const catalog = shape({
  ruleSetId: (value) => string(value) && !!value,
  entries: array(detail),
  requirements: array(),
  choices: array(),
  grants: array(),
  effects: array(),
  proficiencies: array(),
  castingProfiles: array(),
  equipmentOptions: array(),
  multiclassSlots: array(),
});
const page = shape({ entries: array(summary), nextCursor: nullable(string) });

type Entry = {
  kind: string;
  controller: AbortController;
  promise: Promise<unknown>;
  subscribers: number;
  ready: boolean;
  value?: unknown;
  expires: number;
};
const abortError = () => new DOMException('Consulta cancelada.', 'AbortError');
const references = (refs: (CompendiumRef | null | undefined)[]) =>
  [...new Set(refs.filter(Boolean).map((ref) => `${ref!.recordId}:${ref!.revisionId}`))].sort();
function creationReferences(draft: CreationDraft) {
  return [
    draft.speciesRef,
    draft.lineageRef,
    draft.backgroundRef,
    ...draft.classes.flatMap((c) => [c.classRef, c.subclassRef]),
    ...draft.choices.flatMap((c) => c.values.flatMap((v) => (v.type === 'record' ? [v.ref] : []))),
  ].filter((ref): ref is CompendiumRef => !!ref);
}
function creationKey(draft: CreationDraft) {
  return [
    draft.ruleSetId,
    references(creationReferences(draft)),
    references(draft.spellSelections.map((s) => s.spellRef)),
  ];
}
function mergeCatalogs(catalogs: CreationCatalog[]): CreationCatalog {
  const unique = <T>(values: T[], key: (value: T) => string) => [
    ...new Map(values.map((v) => [key(v), v])).values(),
  ];
  const byId = <T extends { id: string }>(values: T[]) => unique(values, (v) => v.id);
  return {
    ruleSetId: catalogs[0].ruleSetId,
    entries: unique(
      catalogs.flatMap((c) => c.entries),
      (e) => e.ref.revisionId,
    ),
    requirements: byId(catalogs.flatMap((c) => c.requirements)),
    choices: byId(catalogs.flatMap((c) => c.choices)),
    grants: byId(catalogs.flatMap((c) => c.grants)),
    effects: byId(catalogs.flatMap((c) => c.effects)),
    proficiencies: byId(catalogs.flatMap((c) => c.proficiencies)),
    castingProfiles: byId(catalogs.flatMap((c) => c.castingProfiles)),
    equipmentOptions: byId(catalogs.flatMap((c) => c.equipmentOptions)),
    multiclassSlots: unique(
      catalogs.flatMap((c) => c.multiclassSlots),
      (row) => `${row.level}:${row.circle}`,
    ),
  };
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
/** Scoped to one repository/account lifetime; only successful compendium data is retained. */
export function createCachedCompendiumRepository(
  repository: CompendiumRepository,
  options: { maxEntries?: number; ttlMs?: number; now?: () => number } = {},
): CompendiumRepository {
  const cache = new Map<string, Entry>();
  const max = Math.max(1, options.maxEntries ?? 200),
    ttl = options.ttlMs ?? 300_000,
    now = options.now ?? Date.now;
  function request<T>(
    kind: string,
    key: unknown,
    immutable: boolean,
    signal: AbortSignal | undefined,
    fetch: (signal: AbortSignal) => Promise<T>,
    expiresAt = Infinity,
  ): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortError());
    const id = JSON.stringify([kind, canonical(key)]);
    let entry = cache.get(id);
    if (entry?.ready && entry.expires <= now()) {
      cache.delete(id);
      entry = undefined;
    }
    if (entry) {
      cache.delete(id);
      cache.set(id, entry);
    }
    if (!entry) {
      const controller = new AbortController();
      entry = {
        kind,
        controller,
        promise: Promise.resolve(),
        subscribers: 0,
        ready: false,
        expires: Infinity,
      };
      const current = entry;
      cache.set(id, current);
      current.promise = Promise.resolve()
        .then(() => fetch(controller.signal))
        .then((value) => {
          if (controller.signal.aborted) throw abortError();
          const validate = kind === 'get' ? detail : kind === 'list' ? page : catalog;
          if (!validate(value)) throw new Error('Resposta inválida do compêndio.');
          current.ready = true;
          current.value = value;
          current.expires = Math.min(expiresAt, immutable ? Infinity : now() + ttl);
          while (cache.size > max) {
            const oldest = [...cache].find(([, e]) => e.ready);
            if (!oldest) break;
            cache.delete(oldest[0]);
          }
          return value;
        })
        .catch((error) => {
          if (cache.get(id) === current) cache.delete(id);
          throw error;
        });
    }
    if (entry.ready) return Promise.resolve(entry.value as T);
    const current = entry;
    current.subscribers++;
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) return false;
        settled = true;
        signal?.removeEventListener('abort', abort);
        current.subscribers--;
        return true;
      };
      const abort = () => {
        if (!finish()) return;
        reject(abortError());
        if (!current.subscribers && !current.ready) {
          if (cache.get(id) === current) cache.delete(id);
          current.controller.abort();
        }
      };
      signal?.addEventListener('abort', abort, { once: true });
      current.promise.then(
        (value) => {
          if (finish()) resolve(value as T);
        },
        (error) => {
          if (finish()) reject(error);
        },
      );
    });
  }
  return {
    list: (query, signal) =>
      request('list', query, false, signal, (s) => repository.list(query, s)),
    get: (ref, signal) => request('get', ref, true, signal, (s) => repository.get(ref, s)),
    getContext: (ref, signal) =>
      request('context', ref, true, signal, (s) => repository.getContext(ref, s)),
    getCreationCatalog(draft, signal) {
      if (signal?.aborted) return Promise.reject(abortError());
      const mandatory = creationReferences(draft);
      const refs = [
        ...new Map(
          [...mandatory, ...draft.spellSelections.map((s) => s.spellRef)].map((ref) => [
            `${ref.recordId}:${ref.revisionId}`,
            ref,
          ]),
        ).values(),
      ];
      const required = new Set(references(mandatory));
      const available = (loaded: CreationCatalog, ref: CompendiumRef) =>
        loaded.entries.some(
          (e) => e.ref.recordId === ref.recordId && e.ref.revisionId === ref.revisionId,
        );
      let base: Entry | undefined;
      for (const entry of [...cache.values()].reverse()) {
        if (entry.kind !== 'creation' || !entry.ready || entry.expires <= now()) continue;
        const loaded = entry.value as CreationCatalog;
        if (loaded.ruleSetId !== draft.ruleSetId) continue;
        // Return the same cache entry: selecting another combination never renews its TTL.
        if (refs.every((ref) => available(loaded, ref))) return Promise.resolve(loaded);
        base ??= entry;
      }
      const initial = base;
      return request(
        'creation',
        creationKey(draft),
        false,
        signal,
        async (s) => {
          if (!initial) return repository.getCreationCatalog(draft, s);
          const loaded = initial.value as CreationCatalog;
          const additions = await Promise.all(
            refs
              .filter((ref) => !available(loaded, ref))
              .map(async (ref) => {
                try {
                  const context = await request('context', ref, true, s, (nested) =>
                    repository.getContext(ref, nested),
                  );
                  if (context.ruleSetId !== draft.ruleSetId || !available(context, ref))
                    throw new CompendiumError('NOT_FOUND');
                  return context;
                } catch (error) {
                  // A missing selected spell is reconciled by the engine; origins and choices stay strict.
                  if (
                    !required.has(`${ref.recordId}:${ref.revisionId}`) &&
                    error instanceof CompendiumError &&
                    error.code === 'NOT_FOUND'
                  )
                    return null;
                  throw error;
                }
              }),
          );
          return mergeCatalogs([
            loaded,
            ...additions.filter((c): c is CreationCatalog => c !== null),
          ]);
        },
        initial?.expires,
      );
    },
  };
}
