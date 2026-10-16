import { createHash } from 'node:crypto';
import { stableId } from '../content-import/index';
import type { IdentityRegistry } from './model';

export const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
export const normalizeName = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Property order/formatting do not alter the identity of a revision's payload. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export function conceptId(key: string, registry: IdentityRegistry): string {
  const seen = new Set<string>();
  while (registry.aliases?.[key]) {
    if (seen.has(key)) throw Error('Ciclo de aliases de identidade: ' + key);
    seen.add(key);
    key = registry.aliases[key];
  }
  return (registry.records[key] ??= stableId('compendio:conceito:' + key));
}
export const revisionId = (id: string, payload: unknown) =>
  stableId('compendio:revisao:' + id + ':' + hash(canonical(payload)));
export { stableId };
