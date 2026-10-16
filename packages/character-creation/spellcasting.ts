import type {
  CreationCatalog,
  CreationDraft,
  SpellcastingBreakdown,
} from '../contracts/character-creation';
import { resolveState, type CreationState } from './state';
export function resolveSpellcasting(
  catalog: CreationCatalog,
  draft: CreationDraft,
  state: CreationState = resolveState(catalog, draft),
): SpellcastingBreakdown {
  const result: SpellcastingBreakdown = {
    profiles: [],
    effectiveCasterLevel: 0,
    slots: [],
    pactSlots: [],
    problems: [],
  };
  const active = state.concessions.instances.flatMap((instance) =>
    catalog.castingProfiles
      .filter(
        (p) =>
          p.ownerRevisionId === instance.entry.ref.revisionId && instance.level >= p.firstLevel,
      )
      .map((definition) => ({ instance, definition })),
  );
  const normal = active.filter((p) => p.definition.type === 'conjuracao');
  for (const { instance, definition: p } of active) {
    const key = `${instance.id}/casting:${p.id}`,
      chosen = draft.castingAbilities.filter((a) => a.profileId === key);
    const ability = chosen[0]?.ability ?? (p.abilities.length === 1 ? p.abilities[0] : null);
    if (chosen.length > 1 || !ability || !p.abilities.includes(ability))
      result.problems.push({
        code: 'CASTING_ABILITY',
        field: `castingAbilities.${key}`,
        message: 'Escolha um atributo de conjuração permitido.',
        sourceRevisionId: p.ownerRevisionId,
      });
    const progress = p.progression.find((l) => l.level === instance.level);
    if (!progress && p.type !== 'concedida')
      result.problems.push({
        code: 'CASTING_PROGRESSION',
        field: key,
        message: 'A progressão de conjuração deste nível ainda precisa de revisão.',
        sourceRevisionId: p.ownerRevisionId,
      });
    const maximumCircle =
      progress?.maximumCircle ??
      Math.max(
        0,
        ...p.slots.filter((s) => s.level === instance.level).map((s) => s.circle),
        ...p.spells
          .filter((s) => s.level <= instance.level)
          .map((s) => {
            const e = catalog.entries.find((e) => e.ref.revisionId === s.spellRef.revisionId);
            return e?.kind === 'magia' ? e.data.circle : 0;
          }),
      );
    const row = {
      id: key,
      ownerRevisionId: p.ownerRevisionId,
      ability,
      maximumCircle,
      prepared: progress?.prepared ?? 0,
      known: progress?.known ?? 0,
      cantrips: progress?.cantrips ?? 0,
      type: p.type,
    };
    result.profiles.push(row);
    if (p.type === 'conjuracao') {
      const contribution = (instance.level * p.contributionNumerator) / p.contributionDenominator;
      result.effectiveCasterLevel +=
        p.rounding === 'cima' ? Math.ceil(contribution) : Math.floor(contribution);
      if (normal.length === 1)
        result.slots = p.slots
          .filter((s) => s.level === instance.level)
          .map(({ circle, total }) => ({ circle, total }));
    } else if (p.type === 'pacto')
      for (const slot of p.slots.filter((s) => s.level === instance.level)) {
        const old = result.pactSlots.find((s) => s.circle === slot.circle);
        if (old) old.total += slot.total;
        else result.pactSlots.push({ circle: slot.circle, total: slot.total });
      }
    const selected = draft.spellSelections.filter((s) => s.profileId === key),
      seen = new Set<string>();
    let cantrips = 0,
      prepared = 0,
      known = 0;
    for (const selection of selected) {
      const e = catalog.entries.find(
        (e) =>
          e.ref.revisionId === selection.spellRef.revisionId &&
          e.ref.recordId === selection.spellRef.recordId,
      );
      const fixed = p.spells.some(
        (s) => s.spellRef.revisionId === e?.ref.revisionId && s.level <= instance.level,
      );
      const classRef =
        instance.entry.kind === 'subclasse' ? instance.entry.data.classRef : instance.entry.ref;
      if (
        !e ||
        e.kind !== 'magia' ||
        seen.has(e.ref.recordId) ||
        (!fixed &&
          (e.data.circle > maximumCircle ||
            !e.data.classRefs.some((c) => c.revisionId === classRef.revisionId)))
      ) {
        result.problems.push({
          code: 'SPELL_NOT_AVAILABLE',
          field: key,
          message: 'A magia não está disponível para esta origem e nível.',
        });
        continue;
      }
      seen.add(e.ref.recordId);
      if (fixed) continue;
      if (e.data.circle === 0) cantrips++;
      else {
        known++;
        if (selection.prepared) prepared++;
      }
    }
    if (
      cantrips > row.cantrips ||
      (progress?.prepared !== null && prepared > row.prepared) ||
      (progress?.known !== null && known > row.known)
    )
      result.problems.push({
        code: 'SPELL_LIMIT',
        field: key,
        message:
          'A seleção excede a quantidade de truques, magias conhecidas ou preparadas desta origem.',
      });
  }
  if (normal.length > 1) {
    result.slots = catalog.multiclassSlots
      .filter((s) => s.level === result.effectiveCasterLevel)
      .map(({ circle, total }) => ({ circle, total }));
    if (!result.slots.length && result.effectiveCasterLevel > 0)
      result.problems.push({
        code: 'MULTICLASS_SLOTS',
        field: 'spellSelections',
        message: 'A tabela de espaços de multiclasse não está disponível.',
      });
  }
  if (
    draft.spellSelections.some((s) => !result.profiles.some((p) => p.id === s.profileId)) ||
    draft.castingAbilities.some((s) => !result.profiles.some((p) => p.id === s.profileId))
  )
    result.problems.push({
      code: 'UNKNOWN_CASTING_PROFILE',
      field: 'spellSelections',
      message: 'Uma seleção pertence a uma origem de conjuração removida.',
    });
  return result;
}
