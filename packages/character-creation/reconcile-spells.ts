import type { CreationCatalog, CreationDraft } from '../contracts/character-creation';
import { additionalCantripConflict } from './additional-cantrips';
import { profileGrantedSpells } from './casting-grants';
import { resolveSpellcasting } from './spellcasting';
import { resolveState } from './state';

export interface SpellSelectionChange {
  selection: CreationDraft['spellSelections'][number];
  name: string;
  origin: string;
  reason: string;
  action: 'removed' | 'unprepared';
}

export function reconcileSpellSelections(
  catalog: CreationCatalog,
  draft: CreationDraft,
): { draft: CreationDraft; changes: SpellSelectionChange[] } {
  type Selection = CreationDraft['spellSelections'][number];
  type Row = { index: number; original: Selection; value: Selection };
  let rows: Row[] = draft.spellSelections.map((selection, index) => ({
    index,
    original: selection,
    value: selection,
  }));
  let current = draft;
  const changes = new Map<number, SpellSelectionChange>();

  // Removing a spell can also remove features that require knowing that spell.
  // Each pass either removes a selection or clears a prepared flag, so it terminates.
  for (;;) {
    const state = resolveState(catalog, current);
    const casting = resolveSpellcasting(catalog, current, state);
    const contexts = new Map(
      casting.profiles.map((profile) => {
        const definition = catalog.castingProfiles.find(
          (p) => p.ownerRevisionId === profile.ownerRevisionId && profile.id.endsWith(`:${p.id}`),
        );
        const instance = state.concessions.instances.find(
          (i) => profile.id === `${i.id}/casting:${definition?.id}`,
        );
        return [
          profile.id,
          {
            profile,
            definition,
            progress: definition?.progression.find((p) => p.level === instance?.level),
            fixed: profileGrantedSpells(catalog, state, instance, definition),
          },
        ];
      }),
    );
    const describe = (row: Row, reason: string, action: SpellSelectionChange['action']) => {
      const entry = catalog.entries.find((e) => e.ref.recordId === row.original.spellRef.recordId);
      const definition = catalog.castingProfiles.find((p) =>
        row.original.profileId.endsWith(`/casting:${p.id}`),
      );
      const owner = catalog.entries.find((e) => e.ref.revisionId === definition?.ownerRevisionId);
      changes.set(row.index, {
        selection: row.original,
        name: entry?.name ?? 'Magia indisponível',
        origin: owner?.name ?? 'Origem de conjuração removida',
        reason,
        action,
      });
    };
    const seen = new Map<string, Set<string>>();
    const legal = rows.filter((row) => {
      const context = contexts.get(row.value.profileId);
      const entry = catalog.entries.find(
        (e) =>
          e.ref.recordId === row.value.spellRef.recordId &&
          e.ref.revisionId === row.value.spellRef.revisionId,
      );
      let reason = '';
      if (!context) reason = 'Esta origem de conjuração foi removida pelas escolhas atuais.';
      else if (!entry || entry.kind !== 'magia')
        reason = 'A versão selecionada desta magia não está mais disponível no compêndio.';
      else if (context.fixed.some((spell) => spell.spellRef.revisionId === entry.ref.revisionId))
        reason =
          'Esta magia é concedida automaticamente e continuará disponível sem ocupar uma escolha.';
      else if (entry.data.circle > context.profile.maximumCircle)
        reason = `O círculo ${entry.data.circle} excede o círculo máximo ${context.profile.maximumCircle} desta origem.`;
      else if (entry.data.circle === 0 && context.profile.cantrips === 0)
        reason = 'Esta origem não permite escolher truques neste nível.';
      else if (
        !context.profile.selectable ||
        !entry.data.classRefs.some((ref) =>
          context.profile.listClassRevisionIds?.includes(ref.revisionId),
        )
      ) {
        const lists = (context.profile.listClassRevisionIds ?? [])
          .map((revisionId) => catalog.entries.find((e) => e.ref.revisionId === revisionId)?.name)
          .filter(Boolean);
        reason = lists.length
          ? `Esta magia não pertence à lista de ${lists.join(' ou ')} permitida nesta origem.`
          : 'A lista de magias desta origem ainda não foi escolhida.';
      }
      const selected = seen.get(row.value.profileId) ?? new Set<string>();
      if (!reason && selected.has(row.value.spellRef.recordId))
        reason = 'Esta magia já foi escolhida nesta origem.';
      if (reason) {
        describe(row, reason, 'removed');
        return false;
      }
      selected.add(row.value.spellRef.recordId);
      seen.set(row.value.profileId, selected);
      return true;
    });

    const enforceLimits = (candidates: Row[], report: boolean): Row[] => {
      const counts = new Map<string, { cantrips: number; known: number; prepared: number }>();
      return candidates.flatMap((row) => {
        const context = contexts.get(row.value.profileId)!;
        const { profile, definition, progress } = context;
        const knownLimit = progress?.known === null ? null : profile.known;
        const preparedLimit = progress?.prepared === null ? null : profile.prepared;
        const spell = catalog.entries.find(
          (entry) => entry.ref.revisionId === row.value.spellRef.revisionId,
        )!;
        if (spell.kind !== 'magia') return [];
        const count = counts.get(profile.id) ?? { cantrips: 0, known: 0, prepared: 0 };
        let reason = '';
        let value = row.value;
        if (spell.data.circle === 0) {
          if (count.cantrips >= profile.cantrips)
            reason = `O limite de ${profile.cantrips} truques desta origem foi reduzido ou já foi preenchido por escolhas anteriores.`;
        } else if (knownLimit != null && count.known >= knownLimit) {
          const repertoire =
            definition?.method === 'grimorio' ? 'magias no grimório' : 'magias conhecidas';
          reason = `O limite de ${knownLimit} ${repertoire} desta origem foi reduzido ou já foi preenchido por escolhas anteriores.`;
        } else if (value.prepared && preparedLimit != null && count.prepared >= preparedLimit) {
          reason = `O limite de ${preparedLimit} magias preparadas desta origem foi reduzido ou já foi preenchido por escolhas anteriores.`;
          if (definition?.method === 'grimorio') {
            value = { ...value, prepared: false };
            if (report) describe(row, reason, 'unprepared');
            reason = '';
          }
        }
        if (reason) {
          if (report) describe(row, reason, 'removed');
          return [];
        }
        if (spell.data.circle === 0) count.cantrips++;
        else {
          count.known++;
          if (value.prepared) count.prepared++;
        }
        counts.set(profile.id, count);
        return [{ ...row, value }];
      });
    };

    // Only class spells that survive their own quotas invalidate an additional cantrip.
    // Remove those conflicts before they can consume the additional origin's quota.
    const base = {
      ...current,
      spellSelections: enforceLimits(legal, false).map((row) => row.value),
    };
    const distinct = legal.filter((row) => {
      if (!additionalCantripConflict(catalog, base, row.value.profileId, row.value.spellRef))
        return true;
      describe(
        row,
        'O truque adicional deve ser diferente dos truques já conhecidos pela classe.',
        'removed',
      );
      return false;
    });
    const next = enforceLimits(distinct, true);
    if (next.length === rows.length && next.every((row, index) => row.value === rows[index].value))
      break;
    rows = next;
    current = { ...draft, spellSelections: rows.map((row) => row.value) };
  }

  return {
    draft: current,
    changes: [...changes.entries()].sort(([a], [b]) => a - b).map(([, change]) => change),
  };
}
