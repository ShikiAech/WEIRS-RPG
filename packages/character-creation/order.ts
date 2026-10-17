import type { CreationCatalog } from '../contracts/character-creation';
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => compare(a.id, b.id));
export function orderedCatalog(c: CreationCatalog): CreationCatalog {
  return {
    ...c,
    entries: [...c.entries]
      .sort((a, b) => compare(a.ref.revisionId, b.ref.revisionId))
      .map((e) =>
        e.kind === 'pacote'
          ? { ...e, data: { ...e.data, items: byId(e.data.items) } }
          : e.kind === 'classe'
            ? {
                ...e,
                data: {
                  ...e.data,
                  proficiencies: [...e.data.proficiencies].sort((a, b) =>
                    compare(a.proficiencyId, b.proficiencyId),
                  ),
                },
              }
            : e,
      ),
    choices: byId(c.choices).map((g) => ({ ...g, options: byId(g.options) })),
    grants: byId(c.grants).sort((a, b) => a.level - b.level || compare(a.id, b.id)),
    requirements: byId(c.requirements),
    effects: byId(c.effects),
    proficiencies: byId(c.proficiencies),
    equipmentOptions: byId(c.equipmentOptions),
    castingProfiles: byId(c.castingProfiles).map((p) => ({
      ...p,
      spells: [...p.spells].sort(
        (a, b) => a.level - b.level || compare(a.spellRef.revisionId, b.spellRef.revisionId),
      ),
    })),
    multiclassSlots: [...c.multiclassSlots].sort(
      (a, b) => a.level - b.level || a.circle - b.circle,
    ),
  };
}
