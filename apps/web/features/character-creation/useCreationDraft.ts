import { useRef, useState } from 'react';
import type { CreationDraft } from '../../../../packages/contracts/character-creation';
import type { SheetContent } from '../../../../packages/contracts/sheets';
import type { CreationRequest } from '../../../../packages/character-creation/server';
export interface CreatorDraft {
  draft: CreationDraft;
  name: string;
  campaignId: string;
  step: number;
  requestId: string;
  attempt?: CreationRequest;
}
const drafts = new Map<string, CreatorDraft>();
let temporary: { name: string; content: SheetContent } | null = null;
export function clearCreationDrafts() {
  drafts.clear();
  temporary = null;
}
export function openTemporaryCreation(name: string, content: SheetContent) {
  temporary = { name, content };
}
export function temporaryCreation() {
  return temporary;
}
export function clearTemporaryCreation() {
  temporary = null;
}
export function blankCreation(): CreationDraft {
  return {
    id: crypto.randomUUID(),
    engineVersion: 1,
    ruleSetId: 'dnd-5e-2024',
    abilities: {
      mode: 'external',
      sets: [],
      selectedSet: null,
      assignment: {},
      external: {},
      backgroundBonuses: {},
    },
    speciesRef: null,
    lineageRef: null,
    backgroundRef: null,
    size: null,
    form: '',
    classes: [],
    levels: [],
    choices: [],
    equipmentOptions: [],
    spellSelections: [],
    castingAbilities: [],
  };
}
export function useCreationDraft(account: string, campaign: string) {
  const key = `${account}:${campaign}`;
  const [value, setValue] = useState<CreatorDraft>(
    () =>
      drafts.get(key) ?? {
        draft: blankCreation(),
        name: '',
        campaignId: campaign,
        step: 0,
        requestId: crypto.randomUUID(),
      },
  );
  const current = useRef(value);
  current.current = value;
  const update = (next: CreatorDraft | ((current: CreatorDraft) => CreatorDraft)) => {
    const result = typeof next === 'function' ? next(current.current) : next;
    current.current = result;
    drafts.set(key, result);
    setValue(result);
  };
  return { value, update, clear: () => drafts.delete(key), dirty: drafts.has(key) };
}
