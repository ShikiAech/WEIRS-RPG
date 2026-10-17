import type { CreationCatalog, CreationDraft } from '../contracts/character-creation';
import type { CompendiumRef } from '../contracts/compendium';

/** A class order adds a distinct cantrip to the class's existing repertoire. */
export function additionalCantripConflict(
  catalog: CreationCatalog,
  draft: CreationDraft,
  profileId: string,
  spellRef: CompendiumRef,
): boolean {
  const definition = catalog.castingProfiles.find((p) => profileId.endsWith(`/casting:${p.id}`));
  const owner = catalog.entries.find((e) => e.ref.revisionId === definition?.ownerRevisionId);
  if (
    definition?.type !== 'concedida' ||
    owner?.kind !== 'caracteristica' ||
    owner.data.category !== 'escolha-classe' ||
    !owner.data.parentRef ||
    !definition.listClassRefs?.some((r) => r.revisionId === owner.data.parentRef!.revisionId)
  )
    return false;
  const spell = catalog.entries.find(
    (e) => e.ref.recordId === spellRef.recordId && e.ref.revisionId === spellRef.revisionId,
  );
  if (spell?.kind !== 'magia' || spell.data.circle !== 0) return false;
  const root = profileId.split('/')[0];
  return draft.spellSelections.some(
    (s) =>
      s.profileId !== profileId &&
      s.spellRef.recordId === spellRef.recordId &&
      s.profileId.startsWith(root + '/casting:') &&
      catalog.castingProfiles.some(
        (p) =>
          s.profileId.endsWith(`/casting:${p.id}`) &&
          p.ownerRevisionId === owner.data.parentRef!.revisionId,
      ),
  );
}
