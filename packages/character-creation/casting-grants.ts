import type { CreationCatalog } from '../contracts/character-creation';
import type { SpellcastingProfileDefinition } from '../contracts/compendium';
import type { CreationInstance } from './concessions';
import type { CreationState } from './state';

/** A selected spell belongs to its closest casting origin, preserving separate quotas. */
export function profileGrantedSpells(
  catalog: CreationCatalog,
  state: CreationState,
  instance: CreationInstance | undefined,
  definition: SpellcastingProfileDefinition | undefined,
): SpellcastingProfileDefinition['spells'] {
  if (!instance || !definition) return [];
  const latest = new Map<string, SpellcastingProfileDefinition['spells'][number]>();
  for (const spell of definition.spells.filter((s) => s.level <= instance.level)) {
    const previous = latest.get(spell.spellRef.recordId);
    if (!previous || previous.level < spell.level) latest.set(spell.spellRef.recordId, spell);
  }
  const spells = [...latest.values()];
  const nestedOrigins = state.concessions.instances.filter(
    (i) =>
      i.id.startsWith(instance.id + '/') &&
      catalog.castingProfiles.some((p) => p.ownerRevisionId === i.entry.ref.revisionId),
  );
  for (const selected of state.concessions.instances) {
    if (
      selected.entry.kind !== 'magia' ||
      !selected.id.startsWith(instance.id + '/') ||
      nestedOrigins.some((i) => selected.id.startsWith(i.id + '/'))
    )
      continue;
    if (!spells.some((s) => s.spellRef.recordId === selected.entry.ref.recordId))
      spells.push({
        spellRef: selected.entry.ref,
        level: 1,
        alwaysPrepared: true,
        usesSlots: selected.entry.data.circle > 0,
        ownUses: null,
        recovery: null,
      });
  }
  return spells;
}
