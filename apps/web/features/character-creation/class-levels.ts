import type {
  CreationCatalog,
  CreationDraft,
} from '../../../../packages/contracts/character-creation';

export function commitClassLevels(
  draft: CreationDraft,
  catalog: CreationCatalog,
  inputs: Record<string, string> | undefined,
  focusedInputId?: string,
): CreationDraft {
  let next = draft;
  for (const cls of draft.classes) {
    const input = inputs?.[cls.id];
    if (input === undefined || focusedInputId === `creation-class-level-${cls.id}`) continue;
    const n = Number(input);
    if (!Number.isInteger(n) || n < 1 || n > 20 || n === cls.level) continue;
    const subclass = catalog.entries.find((e) => e.ref.revisionId === cls.subclassRef?.revisionId);
    const existing = next.levels.filter((level) => level.classEntryId === cls.id);
    const removed = new Set(existing.slice(n));
    const levels = next.levels.filter((level) => !removed.has(level));
    for (let i = existing.length; i < n; i++) {
      levels.push({
        totalLevel: 0,
        classEntryId: cls.id,
        hitPointMethod: 'fixed',
        hitPointRoll: null,
      });
    }
    next = {
      ...next,
      classes: next.classes.map((row) =>
        row.id === cls.id
          ? {
              ...row,
              level: n,
              subclassRef:
                subclass?.kind === 'subclasse' && n < subclass.data.acquisitionLevel
                  ? null
                  : row.subclassRef,
            }
          : row,
      ),
      levels: levels.map((level, i) => ({ ...level, totalLevel: i + 1 })),
    };
  }
  return next;
}
