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
  const backgrounds = sources
    .flatMap((s) => s.records)
    .filter((r) => r.payload.type === 'background');
  const jsonSpells = sources
    .filter((s) => s.format === 'json')
    .flatMap((s) => s.records)
    .filter((r) => r.payload.type === 'spell');
  const spellBook = (book: string) =>
    normalizeName(book.replace(/,\s*pp?\.?\s*\d+(?:\s*[-–]\s*\d+)?(?:\s*\(\d+\))?\s*$/i, ''));
  const smite = jsonSpells.find(
    (record) => record.key === 'magia:json:player-s-handbook:divine-smite',
  );
  const previousSmiteKey = 'magia:curated:divine-smite-2024';
  if (smite && registry.records[previousSmiteKey] && !identityRegistry.aliases?.[smite.key])
    (identityRegistry.aliases ??= {})[smite.key] = previousSmiteKey;
  for (const legacy of sources.filter((s) => s.format === 'html').flatMap((s) => s.records)) {
    if (legacy.kind !== 'magia') continue;
    const matches = jsonSpells.filter(
      (r) => normalizeName(r.originalName) === normalizeName(legacy.originalName),
    );
    // One current JSON concept replaces the legacy spell; explicitly supplied
    // variants remain separate. Prefer the same book when several exist.
    const sameBook = matches.filter((r) => spellBook(r.book) === spellBook(legacy.book));
    const candidates = sameBook.length ? sameBook : matches;
    const primary = candidates.filter((r) => !/:variant:\d+$/.test(r.key));
    if (primary.length === 1 && !identityRegistry.aliases?.[primary[0].key])
      (identityRegistry.aliases ??= {})[primary[0].key] = legacy.key;
  }
  // JSON becomes authoritative without replacing concept IDs used by saved sheets.
  // These are local translation changes, scoped to a parent to avoid homonyms.
  const classNames: Record<string, string> = {
    atirador: 'pistoleiro',
    'psionico-ua': 'psionista-psion',
  };
  const translatedNames: Record<string, string> = {
    armadureiro: 'armeiro',
    'arvore-do-mundo': 'arvore-mundial',
    'caminho-da-arvore-do-mundo': 'caminho-da-arvore-mundial',
    'patrono-arquifada': 'patrono-arquifeerico',
    'patrono-grande-antigo': 'patrono-do-antigo',
    'patrono-fiend': 'patrono-infernal',
    'patrono-lamina-maldita': 'patrono-da-lamina-amaldicoada',
    'dominio-do-trapaca': 'dominio-do-engano',
    bandeirante: 'bannerete',
    'guerreiro-psi': 'guerreiro-psiquico',
    'cavaleiro-do-inferno': 'cavaleiro-infernal',
    'rebento-dos-tres': 'descendente-dos-tres',
    'lamina-animica': 'lamina-da-alma',
    'dancarino-das-laminas': 'lamina-cantante',
    'guerreiro-da-sombra': 'guerreiro-das-sombras',
    'guerreiro-da-intoxicacao': 'guerreiro-da-embriaguez',
    'juramento-dos-ancioes': 'juramento-dos-antigos',
    'juramento-do-guardiao-de-magias': 'juramento-do-guardiao-arcano',
    'quebra-juramento': 'quebrador-de-juramento',
    'mestre-das-feras': 'mestre-das-bestas',
    'espreitador-da-penumbra': 'perseguidor-sombrio',
    'guardiao-do-vazio': 'guarda-do-vazio',
    'feiticaria-do-fogo-magico': 'feiticaria-de-fogo-magico',
    'feiticaria-do-caos-selvagem': 'feiticaria-da-magia-selvagem',
    'mira-certeira': 'atirador-certeiro',
    'dobrador-psi': 'distorcedor-psiquico',
    'explosao-agonizante': 'rajada-agonizante',
    'visao-do-diabo': 'visao-demoniaca',
    'dadiva-das-profundezas': 'dom-das-profundezas',
    'dadiva-dos-protetores': 'dom-dos-protetores',
    'investimento-do-mestre-da-corrente': 'investidura-do-mestre-da-corrente',
    'licoes-dos-primeiros': 'licoes-dos-primogenitos',
    'mascara-de-muitos-rostos': 'mascara-de-muitas-faces',
    'mestre-de-miriades-de-formas': 'mestre-das-inumeras-formas',
    'visoes-enevoadas': 'visoes-nebulosas',
    'salto-sobrenatural': 'salto-extraplanar',
    'explosao-repelente': 'rajada-repulsora',
    'visao-de-bruxa': 'visao-da-bruxa',
    'companheiro-primal': 'companheiro-primitivo',
  };
  const nameKey = (name: string) => {
    const key = normalizeName(name).replace(/-ua$/, '');
    return translatedNames[key] ?? key;
  };
  const allRecords = sources.flatMap((s) => s.records);
  const legacyClasses = sources.filter((s) => s.format === 'html').flatMap((s) => s.records);
  const mappedParents = new Map<string, string>();
  const replacedFeatures = new Set<string>();
  const claimedLegacy = new Set<string>();
  for (const kind of ['classe', 'subclasse', 'caracteristica'] as const) {
    for (const record of allRecords.filter(
      (r) => r.kind === kind && ['class', 'subclass', 'class-feature'].includes(r.payload.type),
    )) {
      const parent = record.parentKey ? mappedParents.get(record.parentKey) : undefined;
      if (record.parentKey && !parent) continue;
      const targetName =
        kind === 'classe'
          ? (classNames[normalizeName(record.name)] ?? nameKey(record.name))
          : nameKey(record.name);
      const candidates = legacyClasses.filter(
        (r) =>
          r.kind === kind &&
          !claimedLegacy.has(r.key) &&
          (kind === 'classe' || r.parentKey === parent) &&
          nameKey(r.name) === targetName &&
          (kind !== 'caracteristica' || r.level === record.level),
      );
      if (candidates.length !== 1) continue;
      const match = candidates[0];
      claimedLegacy.add(match.key);
      if (!identityRegistry.aliases?.[record.key])
        (identityRegistry.aliases ??= {})[record.key] = match.key;
      mappedParents.set(record.key, match.key);
      if (kind === 'classe')
        for (const key of Object.keys(registry.records).filter((key) =>
          key.startsWith(match.key + ':package:'),
        )) {
          const jsonKey = record.key + key.slice(match.key.length);
          (identityRegistry.aliases ??= {})[jsonKey] = key;
        }
      if (kind === 'caracteristica') replacedFeatures.add(match.key);
    }
  }
  // Levelled features of a JSON-owned parent are replaced as a complete set.
  // Curated children (plans, class choices and equipment packages) keep the
  // identity namespace of their reconciled parent as well.
  for (const [jsonKey, legacyKey] of [...mappedParents].sort((a, b) => b[0].length - a[0].length))
    for (const key of Object.keys(registry.records).filter((key) =>
      key.startsWith(legacyKey + ':'),
    )) {
      const derived = jsonKey + key.slice(legacyKey.length);
      if (!identityRegistry.aliases?.[derived]) (identityRegistry.aliases ??= {})[derived] = key;
    }
  // Levelled features of a JSON-owned parent are replaced as a complete set.
  // Unlevelled legacy options (invocations, maneuvers, plans) remain supplemental.
  const authoritativeParents = new Set(mappedParents.values());
  const suppressed = new Set(
    legacyClasses
      .filter(
        (r) =>
          r.kind === 'caracteristica' &&
          r.level !== undefined &&
          authoritativeParents.has(r.parentKey ?? '') &&
          !replacedFeatures.has(r.key),
      )
      .map((r) => r.key),
  );
  for (const source of sources.filter((s) => s.format === 'html')) {
    for (const record of source.records) {
      if (
        record.kind !== 'antecedente' ||
        record.payload.type !== 'legacy' ||
        identityRegistry.aliases?.[record.key]
      )
        continue;
      const names = [record.name, record.originalName, record.payload.entry.metadata.nome]
        .filter(Boolean)
        .map(normalizeName);
      const matches = backgrounds.filter(
        (b) =>
          [b.name, b.originalName].some((n) => names.includes(normalizeName(n))) &&
          (record.book === 'Acervo Weirs — fonte em revisão' ||
            normalizeName(record.book) === normalizeName(b.book)),
      );
      if (matches.length === 1 && !identityRegistry.aliases?.[matches[0].key])
        (identityRegistry.aliases ??= {})[matches[0].key] = record.key;
    }
  }
  const provenance = new Map<string, CompendiumSource>();
  const records = new Map<string, CatalogDraftRecord>();
  const issues: ImportIssue[] = [];
  for (const source of [...sources].sort(
    (a, b) => Number(a.format === 'json') - Number(b.format === 'json'),
  )) {
    for (const record of source.records) {
      if (suppressed.has(record.key)) continue;
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
      const supersededId =
        registry.records[record.key] ?? stableId('compendio:conceito:' + record.key);
      const supersededIds = [
        ...new Set([
          ...(previous?.supersededIds ?? []),
          ...(supersededId && supersededId !== id ? [supersededId] : []),
        ]),
      ];
      if (previous && previous.kind !== record.kind)
        throw Error('Identidade compartilhada entre tipos incompatíveis: ' + record.key);
      const alternatives = previous
        ? [
            ...previous.alternatives,
            {
              sourcePath: previous.sourcePath,
              name: previous.name,
              originalName: previous.originalName,
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
        ...(supersededIds.length ? { supersededIds } : {}),
      });
    }
  }
  const result = [...records.values()];
  const recordForIdentity = new Map(result.map((r) => [r.id, r]));
  for (const record of result) {
    if (!record.parentKey) continue;
    const parent = recordForIdentity.get(conceptId(record.parentKey, identityRegistry));
    if (parent) record.parentKey = parent.key;
  }
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
  const activeIds = new Set(result.map((r) => r.id));
  const retiredRecordIds = [
    ...new Set([...suppressed].map((key) => conceptId(key, identityRegistry))),
  ].filter((id) => !activeIds.has(id));
  return {
    sources: [...provenance.values()],
    records: result,
    identityRegistry,
    issues,
    retiredRecordIds,
  };
}
