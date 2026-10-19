import type { CatalogDraftRecord } from './model';
import type { CuratedContext } from './curated-context';
import type { ResolvedEntry } from './resolved';
import { normalizeName, stableId } from './identity';

/** Permanent knowledge and training only; creating a magic item remains a play action. */
export function curateArtificerChoices(ctx: CuratedContext) {
  const { catalog, raw, synthetic, proficiency, group } = ctx;
  const artificer = catalog.entries.find((e) => e.kind === 'classe' && e.name === 'Artífice');
  if (!artificer) return;

  // The same class's HTML says Inventor; data/classes.json calls it Funileiro.
  const fixedTools = ['Ferramentas de Funileiro', 'Ferramentas de Ladrão'];
  for (const name of fixedTools) {
    const tool = ctx.find('equipamento', name);
    if (tool)
      proficiency(
        artificer,
        normalizeName(name),
        { type: 'equipamento', equipment: tool.ref },
        'inicial',
      );
  }
  const artisan = group(
    artificer,
    'ferramenta-artesao',
    'Ferramenta de artesão da classe inicial',
    1,
    1,
    1,
  );
  artisan.acquisition = 'inicial';
  for (const tool of catalog.entries) {
    const source = raw.get(tool.key)?.payload;
    if (
      tool.kind !== 'equipamento' ||
      source?.type !== 'equipment' ||
      source.category !== 'ferramenta:artesao' ||
      fixedTools.includes(tool.name)
    )
      continue;
    artisan.options.push({
      id: stableId(artisan.id + ':' + tool.key),
      groupId: artisan.id,
      name: tool.name,
      type: 'proficiencia',
      targetRef: null,
      ability: null,
      proficiencyId: proficiency(
        artificer,
        'artesao:' + tool.key,
        { type: 'equipamento', equipment: tool.ref },
        'inicial',
        false,
      ),
      value: null,
      quantity: 1,
    });
  }

  // Final Eberron: Forge of the Artificer, Tinker's Magic (2025-11-20):
  // https://www.dndbeyond.com/posts/2106-whats-new-with-the-artificer-in-eberron-forge-of
  // Match the original English identity, retaining the local card's name Reparar.
  const mending = catalog.entries.find(
    (e) => e.kind === 'magia' && e.data.circle === 0 && e.originalName.toLowerCase() === 'mending',
  );
  const casting = catalog.castingProfiles.find(
    (p) => p.ownerRevisionId === artificer.ref.revisionId && p.key === 'classe',
  );
  if (mending && casting)
    casting.spells.push({
      spellRef: mending.ref,
      level: 1,
      alwaysPrepared: true,
      usesSlots: false,
      ownUses: null,
      recovery: null,
    });

  const replicate = catalog.entries.find(
    (e) =>
      e.kind === 'caracteristica' &&
      e.name === 'Replicar Item Mágico' &&
      e.data.parentRef?.revisionId === artificer.ref.revisionId,
  );
  const source = replicate && raw.get(replicate.key);
  if (!source) return;
  const section =
    source.payload.type === 'section'
      ? source.payload
      : source.alternatives.find((a) => a.payload.type === 'section')?.payload;
  if (section?.type !== 'section') return;
  const tables = section.tables.filter(
    (t) => normalizeName(t[0]?.[0] ?? '') === 'plano-de-item-magico',
  );
  if (tables.length !== 4) {
    catalog.issues.push({
      code: 'UNSUPPORTED_MECHANIC',
      severity: 'warning',
      path: source.sourcePath,
      pointer: source.pointer,
      revisionId: artificer.ref.revisionId,
      message:
        'As quatro tabelas de planos do Artífice precisam de conferência antes da importação.',
    });
    return;
  }
  const known = new Map<string, ResolvedEntry>();
  const makePlan = (
    name: string,
    level: number,
    attunement: string,
    provenance: CatalogDraftRecord,
    identity = normalizeName(name),
  ) => {
    if (known.has(identity)) return;
    const key = artificer.key + ':curated:plano:' + identity;
    const plan = synthetic(provenance, key, 'caracteristica', 'Plano: ' + name, {
      category: 'plano-item-magico',
      parentRef: artificer.ref,
      optional: true,
      manualDecision: false,
    });
    plan.description = `Plano conhecido de ${name}. Requer nível ${level} de Artífice. Sintonia do item: ${attunement}. A criação do item segue Replicar Item Mágico.`;
    plan.descriptionHtml = '<p>' + plan.description + '</p>';
    catalog.requirements.push({
      id: stableId(plan.ref.revisionId + ':req:nivel-artifice'),
      ownerRevisionId: plan.ref.revisionId,
      parentId: null,
      operator: 'nivel-classe',
      targetRef: artificer.ref,
      minimum: level,
      ability: null,
      choiceKey: null,
      proficiencyId: null,
    });
    known.set(identity, plan);
  };
  for (const [index, table] of tables.entries()) {
    const level = [2, 6, 10, 14][index];
    for (const [name, attunement] of table.slice(1)) {
      if (!name || /^Item (?:mágico Comum|Maravilhoso)/i.test(name)) continue;
      makePlan(name, level, attunement, source);
    }
  }

  // Only concrete cards with an explicit source type and rarity qualify for generic rows.
  // The HTML recommendation Bolsa dos Cestos and JSON recommendation Bolsa de Carga
  // identify the same plan; keep its local table name and earliest level instead of duplicating it.
  const bagAlias = new Map([['bolsa-de-carga', 'bolsa-dos-cestos']]);
  for (const item of [...catalog.entries]) {
    const provenance = raw.get(item.key),
      payload = provenance?.payload;
    if (
      item.kind !== 'equipamento' ||
      !provenance ||
      payload?.type !== 'equipment' ||
      !payload.category.startsWith('magico:')
    )
      continue;
    const input = payload.input,
      type = typeof input.tipo === 'string' ? input.tipo : '';
    const rarity = typeof input.raridade === 'string' ? normalizeName(input.raridade) : '';
    if (
      !/^Item Maravilhoso(?:\s*\(|$)/i.test(type) ||
      !['incomum', 'raro'].includes(rarity) ||
      /po[cç][aã]o|pergaminho|amaldi[cç]oad|maldi[cç][aã]o|cursed/i.test(
        [item.name, item.description, type].join(' '),
      )
    )
      continue;
    const identity = bagAlias.get(normalizeName(item.name)) ?? normalizeName(item.name);
    makePlan(
      item.name,
      rarity === 'incomum' ? 10 : 14,
      input.sintonizacao === true ? 'Sim' : 'Não',
      provenance,
      identity,
    );
  }
  catalog.issues.push({
    code: 'INCOMPLETE_RULESET',
    severity: 'warning',
    path: source.sourcePath,
    pointer: source.pointer,
    revisionId: artificer.ref.revisionId,
    message:
      'Planos de item mágico Comum: o acervo não contém item específico elegível; a Poção de Cura Comum é excluída pela fonte. Os genéricos de Item Maravilhoso oferecem somente os itens específicos com tipo e raridade comprovados no acervo.',
  });

  let previous = 0;
  const cells = catalog.progressionCells
    .filter(
      (cell) =>
        cell.ownerRevisionId === artificer.ref.revisionId &&
        normalizeName(cell.heading) === 'planos-conhecidos' &&
        /^\d+$/.test(cell.value),
    )
    .sort((a, b) => a.row - b.row);
  for (const cell of cells) {
    const total = Number(cell.value),
      count = total - previous;
    if (count <= 0) continue;
    previous = total;
    const g = group(
      artificer,
      'planos-' + cell.row,
      'Planos conhecidos do nível ' + cell.row,
      count,
      count,
      cell.row,
    );
    for (const plan of known.values())
      g.options.push({
        id: stableId(g.id + ':' + plan.key),
        groupId: g.id,
        name: plan.name.replace(/^Plano: /, ''),
        type: 'caracteristica',
        targetRef: plan.ref,
        ability: null,
        proficiencyId: null,
        value: null,
        quantity: 1,
      });
  }
}
