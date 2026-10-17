import type { Ability } from './sheets';

export const COMPENDIUM_KINDS = [
  'classe',
  'subclasse',
  'especie',
  'linhagem',
  'antecedente',
  'talento',
  'caracteristica',
  'magia',
  'equipamento',
  'idioma',
  'criatura',
  'pacote',
  'maestria',
  'propriedade_arma',
  'servico',
  'moeda',
] as const;
export type CompendiumKind = (typeof COMPENDIUM_KINDS)[number];
export type AutomationCoverage = 'manual' | 'parcial' | 'completa';
export type ContentOrigin =
  'oficial' | 'adaptacao-weirs' | 'terceiro' | 'homebrew' | 'nao-revisada';
export interface CompendiumRef {
  recordId: string;
  revisionId: string;
}
export interface CompendiumSource {
  id: string;
  title: string;
  edition: string;
  language: string;
  origin: ContentOrigin;
  author: string;
  referenceUrl: string;
  attribution: string;
  path: string;
  commit: string;
  hash: string;
}
export interface CompendiumSummary {
  ref: CompendiumRef;
  kind: CompendiumKind;
  slug: string;
  name: string;
  originalName: string;
  sourceId: string;
  sourceTitle: string;
  ruleSetId: string;
  revision: number;
  reviewed2024: boolean;
  automation: AutomationCoverage;
  origin: ContentOrigin;
  circle?: number;
  school?: string;
  ritual?: boolean;
  concentration?: boolean;
  legacyIds?: string[];
}
export interface CompendiumQuery {
  kind?: CompendiumKind;
  ruleSetId: string;
  query?: string;
  sourceId?: string;
  parentRevisionId?: string;
  classRevisionId?: string;
  level?: number;
  circle?: number;
  cursor?: string;
  limit?: number;
}
export interface CompendiumPage {
  entries: CompendiumSummary[];
  nextCursor: string | null;
}

export type NumericFormula =
  | { op: 'constant'; value: number }
  | { op: 'ability_score' | 'ability_modifier'; ability: Ability }
  | { op: 'level' | 'class_level' | 'proficiency' }
  | {
      op: 'add' | 'subtract' | 'multiply' | 'floor' | 'ceil' | 'minimum' | 'maximum';
      args: NumericFormula[];
    };
export interface MovementDefinition {
  id: string;
  mode: 'terrestre' | 'voo' | 'natacao' | 'escalada' | 'escavacao';
  distance: number;
  unit: 'pes' | 'metros';
  form: string;
  condition: string;
  hover: boolean;
}
export interface SizeDefinition {
  code: string;
  form: string;
  default: boolean;
}
export interface ProficiencyDefinition {
  id: string;
  ownerRevisionId: string;
  type: 'pericia' | 'salvaguarda' | 'equipamento' | 'categoria' | 'idioma';
  skill?: string;
  ability?: Ability;
  equipment?: CompendiumRef;
  category?: string;
  language?: CompendiumRef;
}
export interface ClassLevelDefinition {
  level: number;
}
export interface ClassDefinition {
  subclassLevel?: number;
  hitDie: 6 | 8 | 10 | 12;
  fixedHitPoints: number;
  primaryAbilities: Ability[];
  multiclassAbilities: { ability: Ability; minimum: number; alternativeGroup: number }[];
  levels: ClassLevelDefinition[];
  proficiencies: { proficiencyId: string; acquisition: 'inicial' | 'multiclasse' | 'ambas' }[];
}
export interface SubclassDefinition {
  classRef: CompendiumRef;
  acquisitionLevel: number;
  levels: ClassLevelDefinition[];
}
export interface SpeciesDefinition {
  formRules?: {
    form: string;
    armorClass: number;
    permitsShield: boolean;
    hitPointMultiplier?: number;
    falseLifeMultiplier?: number;
  }[];
  lineageRequired?: boolean;
  creatureType: string;
  defaultSize: string;
  sizes: SizeDefinition[];
  age: string;
  movements: MovementDefinition[];
  senses: { type: string; distanceFeet: number | null; condition: string }[];
}
export interface LineageDefinition {
  speciesRef: CompendiumRef;
  inheritTraits: boolean;
  sizes: SizeDefinition[];
  movements: MovementDefinition[];
}
export interface BackgroundDefinition {
  abilities: Ability[];
  distribution: '2-1-ou-1-1-1' | 'personalizada' | 'nenhuma';
  abilityLimit: number;
}
export interface FeatDefinition {
  category: string;
  repeatable: boolean;
  prerequisiteText: string;
  requirementsComplete: boolean;
}
export interface FeatureDefinition {
  spellPrerequisite?: {
    classRef: CompendiumRef;
    circle: number;
    dealsDamage?: boolean;
    minimumRangeFeet?: number;
    requiresAttackRoll?: boolean;
  };
  skillBonuses?: { skills: string[]; ability: Ability; minimum: number }[];
  formEffects?: {
    form: string;
    movements?: MovementDefinition[];
    armorClassBonus?: number;
    resistances?: string[];
    attack?: {
      name: string;
      ability: Ability;
      dice: string;
      damageType: string;
      normalRangeFeet: number;
      longRangeFeet: number;
      category: 'simples' | 'marcial';
    };
  };
  category: string;
  manualDecision: boolean;
  parentRef?: CompendiumRef;
  level?: number | null;
  optional?: boolean;
}
export interface SpellDamageDefinition {
  id: string;
  order: number;
  dice: string;
  damageType: string | null;
}
export interface SpellDefinition {
  circle: number;
  school: string;
  castingTime: string;
  range: string;
  rangeFeet: number | null;
  duration: string;
  durationSeconds: number | null;
  concentration: boolean;
  ritual: boolean;
  components: {
    verbal: boolean;
    somatic: boolean;
    material: string;
    costCopper: number | null;
    consumed: boolean;
  };
  classRefs: CompendiumRef[];
  damages: SpellDamageDefinition[];
  scales: { level: number; basis: 'personagem' | 'circulo'; dice: string }[];
}
export interface EquipmentDefinition {
  category: string;
  variantOf?: CompendiumRef;
  weight: number | null;
  weightUnit: 'kg' | 'lb';
  cost: number | null;
  currencyRef: CompendiumRef | null;
  requiresAttunement: boolean;
  weapon?: {
    rangeType: 'corpo-a-corpo' | 'distancia';
    normalRangeFeet: number | null;
    longRangeFeet: number | null;
    masteryRef: CompendiumRef | null;
    criticalMinimum: number;
    propertyRefs: CompendiumRef[];
    damages: { dice: string; damageType: string; ability: Ability | null }[];
  };
  armor?: {
    baseAc: number;
    addDexterity: boolean;
    dexterityLimit: number | null;
    strengthMinimum: number | null;
    stealthDisadvantage: boolean;
  };
  shield?: { acBonus: number };
  tool?: { ability: Ability | null; usage: string };
  magicItem?: { rarity: string; maximumCharges: number | null };
  vehicle?: { capacityKg: number | null; speedFeet: number | null; minimumCrew: number | null };
}
export interface PackageDefinition {
  items: {
    id: string;
    equipmentRef: CompendiumRef | null;
    currencyRef: CompendiumRef | null;
    quantity: number;
  }[];
  notes: string;
}
export interface CreatureDefinition {
  creatureType: string;
  size: string;
  armorClass: number | null;
  armorClassText: string;
  hitPointFormula: string | null;
  abilities: Partial<Record<Ability, number>>;
  challenge: string | null;
  actions: {
    id: string;
    name: string;
    type: string;
    description: string;
    attackBonus: number | null;
    saveDc: number | null;
  }[];
}
export interface CompendiumPayloadMap {
  classe: ClassDefinition;
  subclasse: SubclassDefinition;
  especie: SpeciesDefinition;
  linhagem: LineageDefinition;
  antecedente: BackgroundDefinition;
  talento: FeatDefinition;
  caracteristica: FeatureDefinition;
  magia: SpellDefinition;
  equipamento: EquipmentDefinition;
  pacote: PackageDefinition;
  criatura: CreatureDefinition;
  idioma: { category: string; origin: string };
  maestria: { key: string };
  propriedade_arma: { key: string };
  servico: { cost: number; currencyRef: CompendiumRef; unit: string };
  moeda: { code: string; symbol: string; copperValue: number | null };
}
export type CompendiumEntry<K extends CompendiumKind = CompendiumKind> = {
  [T in K]: CompendiumSummary & {
    kind: T;
    description: string;
    descriptionHtml: string;
    aliases: string[];
    source: CompendiumSource;
    data: CompendiumPayloadMap[T];
  };
}[K];

export type RequirementOperator =
  | 'todos'
  | 'qualquer'
  | 'nivel'
  | 'nivel-classe'
  | 'atributo'
  | 'proficiencia'
  | 'ausente'
  | 'caracteristica'
  | 'talento'
  | 'especie'
  | 'linhagem'
  | 'escolha'
  | 'repeticoes';
export interface RequirementDefinition {
  id: string;
  ownerRevisionId: string;
  parentId: string | null;
  operator: RequirementOperator;
  ability: Ability | null;
  targetRef: CompendiumRef | null;
  minimum: number | null;
  choiceKey: string | null;
  proficiencyId: string | null;
}
export interface ChoiceGroupDefinition {
  id: string;
  ownerRevisionId: string;
  key: string;
  name: string;
  minimum: number;
  maximum: number;
  acquisition: 'inicial' | 'multiclasse' | 'ambas';
  abilityPoints: number | null;
  abilityLimit: number | null;
  optionKind: CompendiumKind | null;
  featCategory: string | null;
  requirementId: string | null;
  level: number;
  options: ChoiceOptionDefinition[];
}
export interface ChoiceOptionDefinition {
  id: string;
  groupId: string;
  name: string;
  type: string;
  targetRef: CompendiumRef | null;
  ability: Ability | null;
  proficiencyId: string | null;
  value: string | null;
  quantity: number;
}
export interface GrantDefinition {
  id: string;
  ownerRevisionId: string;
  key: string;
  kind: CompendiumKind;
  targetRef: CompendiumRef | null;
  groupId: string | null;
  requirementId: string | null;
  level: number;
  acquisition: 'inicial' | 'multiclasse' | 'ambas';
  quantity: number;
}
export interface EffectDefinition {
  id: string;
  ownerRevisionId: string;
  key: string;
  type:
    | 'atributo'
    | 'ca_formula'
    | 'ca_bonus'
    | 'pv_bonus'
    | 'pv_por_nivel'
    | 'deslocamento'
    | 'resistencia'
    | 'imunidade'
    | 'vulnerabilidade'
    | 'sentido'
    | 'recurso'
    | 'proficiencia'
    | 'idioma'
    | 'ataque_bonus'
    | 'critico'
    | 'iniciativa_bonus'
    | 'percepcao_bonus';
  formula: NumericFormula | null;
  requirementId: string | null;
  level: number;
  stacking: 'somar' | 'maximo' | 'substituir' | 'alternativa';
  condition: string;
  abilities: { ability: Ability; increase: number; limit: number }[];
  defenses: { damageType: string | null; unarmored: boolean; permitsShield: boolean }[];
  resources: { name: string; recovery: 'curto' | 'longo' | 'manual' }[];
  proficiencies: { proficiencyId: string; degree: 'meia' | 'proficiente' | 'especializacao' }[];
}
export interface SpellcastingProfileDefinition {
  listClassRefs?: CompendiumRef[];
  listChoiceKey?: string | null;
  selectionUses?: number | null;
  selectionRecovery?: 'curto' | 'longo' | 'manual' | null;
  id: string;
  ownerRevisionId: string;
  key: string;
  type: 'conjuracao' | 'pacto' | 'concedida';
  method: 'preparadas' | 'conhecidas' | 'grimorio' | 'fixas';
  contributionNumerator: number;
  contributionDenominator: 1 | 2 | 3;
  rounding: 'baixo' | 'cima';
  firstLevel: number;
  abilities: Ability[];
  progression: {
    level: number;
    cantrips: number;
    prepared: number | null;
    known: number | null;
    maximumCircle: number | null;
  }[];
  slots: { level: number; circle: number; total: number }[];
  spells: {
    spellRef: CompendiumRef;
    level: number;
    alwaysPrepared: boolean;
    usesSlots: boolean;
    ownUses: number | null;
    recovery: 'curto' | 'longo' | 'manual' | null;
  }[];
}
export interface EquipmentOptionDefinition {
  id: string;
  ownerRevisionId: string;
  key: string;
  name: string;
  packageRef: CompendiumRef;
  acquisition: 'inicial' | 'multiclasse' | 'ambas';
}
export interface ImportIssue {
  code:
    | 'INVALID_SOURCE'
    | 'UNRESOLVED_REFERENCE'
    | 'AMBIGUOUS_IDENTITY'
    | 'UNSUPPORTED_MECHANIC'
    | 'INCOMPLETE_RULESET';
  severity: 'error' | 'warning';
  path: string;
  pointer: string;
  message: string;
  revisionId?: string;
  candidates?: string[];
}
