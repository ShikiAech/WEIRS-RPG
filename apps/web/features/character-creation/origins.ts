import type {
  CreationCatalog,
  CreationDraft,
} from '../../../../packages/contracts/character-creation';
import { resolveConcessions } from '../../../../packages/character-creation/concessions';
import { resolveSpellcasting } from '../../../../packages/character-creation/spellcasting';
export function pruneDependentChoices(
  catalog: CreationCatalog,
  draft: CreationDraft,
): CreationDraft {
  const active = resolveConcessions(catalog, draft);
  const choices = draft.choices.filter((c) =>
    active.choices.some((a) => a.instance.id === c.sourceInstanceId && a.group.id === c.groupId),
  );
  const equipmentOptions = draft.equipmentOptions.filter((s) =>
    active.instances.some(
      (i) =>
        i.entry.ref.revisionId === s.ownerRevisionId &&
        catalog.equipmentOptions.some(
          (o) =>
            o.id === s.optionId &&
            o.ownerRevisionId === s.ownerRevisionId &&
            (o.acquisition === 'ambas' || o.acquisition === i.acquisition),
        ),
    ),
  );
  const next = { ...draft, choices, equipmentOptions };
  const profiles = new Set(resolveSpellcasting(catalog, next).profiles.map((p) => p.id));
  const owned = new Set(
    active.instances.flatMap((i) =>
      i.entry.kind === 'equipamento'
        ? [i.entry.ref.revisionId]
        : i.entry.kind === 'pacote'
          ? i.entry.data.items.flatMap((item) =>
              item.equipmentRef ? [item.equipmentRef.revisionId] : [],
            )
          : [],
    ),
  );
  return {
    ...next,
    spellSelections: next.spellSelections.filter((s) => profiles.has(s.profileId)),
    castingAbilities: next.castingAbilities.filter((s) => profiles.has(s.profileId)),
    equippedRefs: next.equippedRefs?.filter((r) => owned.has(r.revisionId)),
  };
}
export function clearOrigins(
  draft: CreationDraft,
  prefixes: string[],
  owners: string[] = [],
  catalog?: CreationCatalog,
): CreationDraft {
  const belongs = (id: string) => prefixes.some((p) => id === p || id.startsWith(p + '/'));
  const nodes = catalog ? resolveConcessions(catalog, draft).instances : [];
  const removed = new Set(
    nodes
      .filter((n) => belongs(n.id))
      .flatMap((n) =>
        n.entry.kind === 'equipamento'
          ? [n.entry.ref.revisionId]
          : n.entry.kind === 'pacote'
            ? n.entry.data.items.flatMap((i) => (i.equipmentRef ? [i.equipmentRef.revisionId] : []))
            : [],
      ),
  );
  const retained = new Set(
    nodes
      .filter((n) => !belongs(n.id))
      .flatMap((n) =>
        n.entry.kind === 'equipamento'
          ? [n.entry.ref.revisionId]
          : n.entry.kind === 'pacote'
            ? n.entry.data.items.flatMap((i) => (i.equipmentRef ? [i.equipmentRef.revisionId] : []))
            : [],
      ),
  );
  const removedOwners = new Set([
    ...owners,
    ...nodes.filter((n) => belongs(n.id)).map((n) => n.entry.ref.revisionId),
  ]);
  return {
    ...draft,
    choices: draft.choices.filter((c) => !belongs(c.sourceInstanceId)),
    equipmentOptions: draft.equipmentOptions.filter((o) => !removedOwners.has(o.ownerRevisionId)),
    spellSelections: draft.spellSelections.filter((s) => !belongs(s.profileId)),
    castingAbilities: draft.castingAbilities.filter((s) => !belongs(s.profileId)),
    equippedRefs: draft.equippedRefs?.filter(
      (r) => !removed.has(r.revisionId) || retained.has(r.revisionId),
    ),
  };
}
