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
  // Preserve unfinished edits without changing the numeric draft used by the rules and server.
  classLevelInputs?: Record<string, string>;
  attempt?: CreationRequest;
}
const drafts = new Map<string, CreatorDraft>();
const storagePrefix = 'weirs-rpg:creation-draft:';
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
const ref = (value: unknown) =>
  object(value) && typeof value.recordId === 'string' && typeof value.revisionId === 'string';
const nullableRef = (value: unknown) => value === null || ref(value);
const list = (value: unknown, valid: (item: unknown) => boolean) =>
  Array.isArray(value) && value.every(valid);
const scores = (value: unknown) => object(value) && Object.values(value).every(number);

// Check structure, not rule validity: unfinished or out-of-range edits must survive a reload too.
function draftShape(value: unknown): value is CreationDraft {
  if (
    !object(value) ||
    typeof value.id !== 'string' ||
    value.engineVersion !== 1 ||
    typeof value.ruleSetId !== 'string' ||
    !object(value.abilities)
  )
    return false;
  const a = value.abilities;
  return (
    (a.mode === 'external' || a.mode === 'rolls') &&
    list(a.sets, (set) => list(set, number)) &&
    (a.selectedSet === null || Number.isInteger(a.selectedSet)) &&
    scores(a.assignment) &&
    scores(a.external) &&
    scores(a.backgroundBonuses) &&
    nullableRef(value.speciesRef) &&
    nullableRef(value.lineageRef) &&
    nullableRef(value.backgroundRef) &&
    (value.size === null || typeof value.size === 'string') &&
    typeof value.form === 'string' &&
    list(
      value.classes,
      (row) =>
        object(row) &&
        typeof row.id === 'string' &&
        ref(row.classRef) &&
        nullableRef(row.subclassRef) &&
        number(row.level),
    ) &&
    list(
      value.levels,
      (row) =>
        object(row) &&
        number(row.totalLevel) &&
        typeof row.classEntryId === 'string' &&
        ['fixed', 'roll', 'external'].includes(String(row.hitPointMethod)) &&
        (row.hitPointRoll === null || number(row.hitPointRoll)),
    ) &&
    list(
      value.choices,
      (choice) =>
        object(choice) &&
        typeof choice.groupId === 'string' &&
        typeof choice.sourceInstanceId === 'string' &&
        list(
          choice.values,
          (v) =>
            object(v) &&
            (v.type === 'option'
              ? typeof v.optionId === 'string'
              : v.type === 'record'
                ? ref(v.ref)
                : v.type === 'ability'
                  ? typeof v.ability === 'string' && number(v.amount)
                  : v.type === 'proficiency'
                    ? typeof v.proficiencyId === 'string'
                    : v.type === 'text' && typeof v.value === 'string'),
        ),
    ) &&
    list(
      value.equipmentOptions,
      (row) =>
        object(row) && typeof row.ownerRevisionId === 'string' && typeof row.optionId === 'string',
    ) &&
    (value.equippedRefs === undefined || list(value.equippedRefs, ref)) &&
    list(
      value.spellSelections,
      (row) =>
        object(row) &&
        typeof row.profileId === 'string' &&
        ref(row.spellRef) &&
        typeof row.prepared === 'boolean',
    ) &&
    list(
      value.castingAbilities,
      (row) => object(row) && typeof row.profileId === 'string' && typeof row.ability === 'string',
    )
  );
}

function creatorShape(value: unknown): value is CreatorDraft {
  if (
    !object(value) ||
    !draftShape(value.draft) ||
    typeof value.name !== 'string' ||
    typeof value.campaignId !== 'string' ||
    typeof value.requestId !== 'string' ||
    !value.requestId ||
    !Number.isInteger(value.step) ||
    Number(value.step) < 0 ||
    Number(value.step) > 6
  )
    return false;
  if (
    value.classLevelInputs !== undefined &&
    (!object(value.classLevelInputs) ||
      !Object.values(value.classLevelInputs).every((input) => typeof input === 'string'))
  )
    return false;
  const attempt = value.attempt;
  return (
    attempt === undefined ||
    (object(attempt) &&
      attempt.requestId === value.requestId &&
      typeof attempt.campaignId === 'string' &&
      typeof attempt.name === 'string' &&
      draftShape(attempt.draft) &&
      object(attempt.expectedSheet))
  );
}

function removeStored(key: string) {
  try {
    sessionStorage.removeItem(storagePrefix + key);
  } catch {
    // Private browsing/storage policies can make session storage unavailable.
  }
}

function restoreDraft(key: string, account: string, campaign: string): CreatorDraft | undefined {
  try {
    const json = sessionStorage.getItem(storagePrefix + key);
    if (!json) return;
    const saved: unknown = JSON.parse(json);
    if (
      object(saved) &&
      saved.version === 1 &&
      saved.account === account &&
      saved.campaign === campaign &&
      creatorShape(saved.value)
    ) {
      drafts.set(key, saved.value);
      return saved.value;
    }
    removeStored(key);
  } catch {
    removeStored(key);
  }
}

let temporary: { name: string; content: SheetContent } | null = null;
export function clearCreationDrafts() {
  drafts.clear();
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(storagePrefix)) sessionStorage.removeItem(key);
    }
  } catch {
    // The memory fallback still clears when browser storage is blocked.
  }
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
  const key = JSON.stringify([account, campaign]);
  const [value, setValue] = useState<CreatorDraft>(
    () =>
      drafts.get(key) ??
      restoreDraft(key, account, campaign) ?? {
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
    try {
      sessionStorage.setItem(
        storagePrefix + key,
        JSON.stringify({ version: 1, account, campaign, value: result }),
      );
    } catch {
      // Retain the in-memory draft when storage is blocked or its quota is exceeded.
    }
    setValue(result);
  };
  return {
    value,
    update,
    clear: () => {
      drafts.delete(key);
      removeStored(key);
    },
    dirty: drafts.has(key),
  };
}
