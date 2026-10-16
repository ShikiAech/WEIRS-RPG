import type { Ability, SheetContent } from './sheets';
import type {
  ChoiceGroupDefinition,
  CompendiumEntry,
  CompendiumPage,
  CompendiumQuery,
  CompendiumRef,
  EffectDefinition,
  EquipmentOptionDefinition,
  GrantDefinition,
  ProficiencyDefinition,
  RequirementDefinition,
  SpellcastingProfileDefinition,
} from './compendium';

export type AbilityScores = Record<Ability, number>;
export interface CreationClass {
  id: string;
  classRef: CompendiumRef;
  subclassRef: CompendiumRef | null;
  level: number;
}
export interface CreationLevel {
  totalLevel: number;
  classEntryId: string;
  hitPointMethod: 'fixed' | 'roll' | 'external';
  hitPointRoll: number | null;
}
export type CreationChoiceValue =
  | { type: 'option'; optionId: string }
  | { type: 'record'; ref: CompendiumRef }
  | { type: 'ability'; ability: Ability; amount: number }
  | { type: 'proficiency'; proficiencyId: string }
  | { type: 'text'; value: string };
export interface CreationChoice {
  groupId: string;
  sourceInstanceId: string;
  values: CreationChoiceValue[];
}
export interface CreationDraft {
  id: string;
  engineVersion: 1;
  ruleSetId: string;
  abilities: {
    mode: 'rolls' | 'external';
    sets: number[][];
    selectedSet: number | null;
    assignment: Partial<Record<Ability, number>>;
    external: Partial<Record<Ability, number>>;
    backgroundBonuses: Partial<Record<Ability, number>>;
  };
  speciesRef: CompendiumRef | null;
  lineageRef: CompendiumRef | null;
  backgroundRef: CompendiumRef | null;
  size: string | null;
  form: string;
  classes: CreationClass[];
  levels: CreationLevel[];
  choices: CreationChoice[];
  equipmentOptions: { ownerRevisionId: string; optionId: string }[];
  spellSelections: { profileId: string; spellRef: CompendiumRef; prepared: boolean }[];
  castingAbilities: { profileId: string; ability: Ability }[];
}
export interface CreationCatalog {
  ruleSetId: string;
  entries: CompendiumEntry[];
  requirements: RequirementDefinition[];
  choices: ChoiceGroupDefinition[];
  grants: GrantDefinition[];
  effects: EffectDefinition[];
  proficiencies: ProficiencyDefinition[];
  castingProfiles: SpellcastingProfileDefinition[];
  equipmentOptions: EquipmentOptionDefinition[];
  multiclassSlots: { level: number; circle: number; total: number }[];
}
export interface CreationProblem {
  code: string;
  field: string;
  message: string;
  sourceRevisionId?: string;
}
export interface CreationContribution {
  id: string;
  sourceRevisionId: string;
  sourceInstanceId: string;
  grantId: string | null;
  target: string;
  name: string;
  amount: number | null;
}
export interface HitPointBreakdown {
  total: number;
  levels: {
    totalLevel: number;
    classEntryId: string;
    die: number;
    roll: number;
    constitution: number;
    bonus: number;
    gain: number;
  }[];
  hitDice: { die: number; quantity: number }[];
  problems: CreationProblem[];
}
export interface DefenseBreakdown {
  armorClass: number;
  formula: string;
  movements: { mode: string; feet: number; meters: number }[];
  problems: CreationProblem[];
}
export interface SpellcastingBreakdown {
  profiles: {
    id: string;
    ownerRevisionId: string;
    ability: Ability | null;
    maximumCircle: number;
    prepared: number;
    known: number;
    cantrips: number;
    type: 'conjuracao' | 'pacto' | 'concedida';
  }[];
  effectiveCasterLevel: number;
  slots: { circle: number; total: number }[];
  pactSlots: { circle: number; total: number }[];
  problems: CreationProblem[];
}
export interface CreationPreview {
  problems: CreationProblem[];
  baseAbilities: Partial<AbilityScores>;
  abilities: Partial<AbilityScores>;
  proficiencyBonus: number;
  hitPoints: HitPointBreakdown;
  defenses: DefenseBreakdown;
  spellcasting: SpellcastingBreakdown;
  contributions: CreationContribution[];
  sheet: SheetContent | null;
}
export interface CreationSnapshot {
  schemaVersion: 1;
  draft: CreationDraft;
  contributions: CreationContribution[];
}
export interface CompendiumRepository {
  list(query: CompendiumQuery, signal?: AbortSignal): Promise<CompendiumPage>;
  get(ref: CompendiumRef, signal?: AbortSignal): Promise<CompendiumEntry>;
  getContext(ref: CompendiumRef, signal?: AbortSignal): Promise<CreationCatalog>;
  getCreationCatalog(draft: CreationDraft, signal?: AbortSignal): Promise<CreationCatalog>;
}
