import { useMemo } from 'react';
import type { CompendiumRepository } from '../../../../packages/contracts/character-creation';
import type { CompendiumQuery } from '../../../../packages/contracts/compendium';
import { useCompendium } from '../../lib/use-compendium';

// Keep each repository query scoped to one permitted list, including pagination.
// The combined cursor also remembers duplicates already displayed across lists.
export function useSpellOptions(
  repository: CompendiumRepository,
  query: CompendiumQuery,
  lists: string[],
) {
  const listKey = JSON.stringify([...new Set(lists)].sort());
  const scoped = useMemo<CompendiumRepository>(
    () => ({
      ...repository,
      async list(query, signal) {
        const ids: string[] = JSON.parse(listKey);
        if (!ids.length) return { entries: [], nextCursor: null };
        const state: { cursors: (string | null)[]; seen: string[] } = query.cursor
          ? JSON.parse(query.cursor)
          : { cursors: ids.map(() => undefined), seen: [] };
        const pages = await Promise.all(
          ids.map((classRevisionId, index) =>
            state.cursors[index] === null
              ? Promise.resolve({ entries: [], nextCursor: null })
              : repository.list(
                  { ...query, classRevisionId, cursor: state.cursors[index] ?? undefined },
                  signal,
                ),
          ),
        );
        const seen = new Set(state.seen);
        const entries = pages
          .flatMap((page) => page.entries)
          .filter((entry) => {
            if (seen.has(entry.ref.recordId)) return false;
            seen.add(entry.ref.recordId);
            return true;
          })
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        const cursors = pages.map((page) => page.nextCursor);
        return {
          entries,
          nextCursor: cursors.some(Boolean) ? JSON.stringify({ cursors, seen: [...seen] }) : null,
        };
      },
    }),
    [repository, listKey],
  );
  return useCompendium(scoped, { ...query, classRevisionId: listKey });
}
