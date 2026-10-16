import type { ImportIssue } from '../../packages/contracts/compendium';
import type { ResolvedCatalog } from './resolved';

export function validateCatalog(catalog: ResolvedCatalog): ImportIssue[] {
  const issues = [...catalog.issues],
    refs = new Set(catalog.entries.map((e) => e.ref.revisionId));
  for (const e of catalog.entries) {
    const fail = (message: string) =>
      issues.push({
        code: 'INVALID_SOURCE',
        severity: 'error',
        path: e.sourcePath,
        pointer: e.pointer,
        revisionId: e.ref.revisionId,
        message,
      } as ImportIssue);
    if (!e.name.trim() || !e.source) fail('Nome ou fonte ausente.');
    if (e.kind === 'especie' && !e.data.movements.length) fail('Espécie sem deslocamento.');
    if (e.kind === 'magia' && (!Number.isInteger(e.data.circle) || !e.data.school))
      fail('Magia sem círculo/escola válidos.');
    if (
      e.kind === 'classe' &&
      (![6, 8, 10, 12].includes(e.data.hitDie) || e.data.levels.length !== 20)
    )
      fail('Classe sem dado ou progressão.');
  }
  for (const grant of catalog.grants) {
    if (
      !refs.has(grant.ownerRevisionId) ||
      (grant.targetRef && !refs.has(grant.targetRef.revisionId))
    )
      issues.push({
        code: 'UNRESOLVED_REFERENCE',
        severity: 'error',
        path: '',
        pointer: grant.key,
        revisionId: grant.ownerRevisionId,
        message: 'Destino de concessão ausente.',
      });
  }
  return issues;
}
