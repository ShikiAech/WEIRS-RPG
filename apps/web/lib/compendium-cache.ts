import type {
  CompendiumRepository,
  CreationDraft,
} from '../../../packages/contracts/character-creation';
import {
  COMPENDIUM_KINDS,
  type CompendiumKind,
  type CompendiumRef,
} from '../../../packages/contracts/compendium';

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
function creationKey(draft: CreationDraft) {
  return [
    draft.ruleSetId,
    references([
      draft.speciesRef,
      draft.lineageRef,
      draft.backgroundRef,
      ...draft.classes.flatMap((c) => [c.classRef, c.subclassRef]),
      ...draft.choices.flatMap((c) =>
        c.values.flatMap((v) => (v.type === 'record' ? [v.ref] : [])),
      ),
    ]),
    references(draft.spellSelections.map((s) => s.spellRef)),
  ];
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
          current.expires = immutable ? Infinity : now() + ttl;
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
    getCreationCatalog: (draft, signal) =>
      request('creation', creationKey(draft), false, signal, (s) =>
        repository.getCreationCatalog(draft, s),
      ),
  };
}
