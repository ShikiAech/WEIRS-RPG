import type { CompendiumSource, ImportIssue } from '../../packages/contracts/compendium';
import { canonical, conceptId, normalizeName, revisionId, stableId } from './identity';
import type {
  CatalogDraftRecord,
  IdentityRegistry,
  ImportedCatalog,
  ImportedSource,
} from './model';

export function normalizeSources(
  sources: ImportedSource[],
  registry: IdentityRegistry,
): ImportedCatalog {
  const identityRegistry: IdentityRegistry = {
    records: { ...registry.records },
    aliases: { ...registry.aliases },
  };
  const provenance = new Map<string, CompendiumSource>();
  const records = new Map<string, CatalogDraftRecord>();
  const issues: ImportIssue[] = [];
  for (const source of [...sources].sort(
    (a, b) => Number(a.format === 'json') - Number(b.format === 'json'),
  )) {
    for (const record of source.records) {
      const id = conceptId(record.key, identityRegistry);
      const sourceId = stableId(
        'compendio:fonte:' + source.path + ':' + record.book + ':' + source.hash,
      );
      if (!provenance.has(sourceId))
        provenance.set(sourceId, {
          id: sourceId,
          title: record.book,
          edition: /2024/.test(record.book) ? '2024' : 'revisao-pendente',
          language: 'pt-BR',
          origin: /homebrew/i.test(record.publisher) ? 'homebrew' : 'nao-revisada',
          author: record.publisher,
          referenceUrl: '',
          attribution: '',
          path: source.path,
          commit: source.commit,
          hash: source.hash,
        });
      const previous = records.get(id);
      if (previous && previous.kind !== record.kind)
        throw Error('Identidade compartilhada entre tipos incompatíveis: ' + record.key);
      const alternatives = previous
        ? [
            ...previous.alternatives,
            {
              sourcePath: previous.sourcePath,
              pointer: previous.pointer,
              payload: previous.payload,
              sourceId: previous.sourceId,
              sourceHash: previous.sourceHash,
            },
          ]
        : [];
      if (
        previous &&
        previous.sourceFormat === source.format &&
        canonical(previous.payload) !== canonical(record.payload)
      ) {
        issues.push({
          code: 'AMBIGUOUS_IDENTITY',
          severity: 'error',
          path: source.path,
          pointer: record.pointer,
          message: 'Duas variantes compartilham uma identidade sem decisão editorial.',
          revisionId: previous.revisionId,
        });
      }
      const legacyIds = [
        ...new Set([...(previous?.legacyIds ?? []), ...(record.legacyId ? [record.legacyId] : [])]),
      ];
      records.set(id, {
        ...record,
        id,
        revisionId: revisionId(id, {
          payload: record.payload,
          name: record.name,
          description: record.description,
          sourceId,
        }),
        sourceId,
        sourcePath: source.path,
        sourceHash: source.hash,
        sourceFormat: source.format,
        alternatives,
        legacyIds,
      });
    }
  }
  const result = [...records.values()];
  // Keep the identity manifest keyed independently from translations and descriptions.
  for (const record of result) {
    if (!normalizeName(record.name))
      issues.push({
        code: 'INVALID_SOURCE',
        severity: 'error',
        path: record.sourcePath,
        pointer: record.pointer,
        message: 'Registro sem nome utilizável.',
      });
    if (
      record.parentKey &&
      !identityRegistry.records[record.parentKey] &&
      !identityRegistry.aliases?.[record.parentKey]
    )
      issues.push({
        code: 'UNRESOLVED_REFERENCE',
        severity: 'error',
        path: record.sourcePath,
        pointer: record.pointer,
        message: 'Origem da característica ou linhagem não encontrada: ' + record.parentKey,
      });
  }
  return { sources: [...provenance.values()], records: result, identityRegistry, issues };
}
