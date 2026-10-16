import type { CreationCatalog } from '../../packages/contracts/character-creation';
import type { ResolvedCatalog } from './resolved';
import { publicationIds } from './sql';
export interface PublishedSnapshot {
  schemaVersion: 1;
  mode: 'demonstracao';
  catalog: CreationCatalog;
}
export function exportPublishedSnapshot(c: ResolvedCatalog): PublishedSnapshot {
  const allowed = new Set(publicationIds(c));
  const owned = <T extends { ownerRevisionId: string }>(items: T[]) =>
    items.filter((i) => allowed.has(i.ownerRevisionId));
  return {
    schemaVersion: 1,
    mode: 'demonstracao',
    catalog: {
      ruleSetId: c.ruleSetId,
      entries: c.entries.filter((e) => allowed.has(e.ref.revisionId)),
      requirements: owned(c.requirements),
      choices: owned(c.choices),
      grants: owned(c.grants),
      effects: owned(c.effects),
      proficiencies: owned(c.proficiencies),
      castingProfiles: owned(c.castingProfiles),
      equipmentOptions: owned(c.equipmentOptions),
      multiclassSlots: c.multiclassSlots,
    },
  };
}
