import type { CreationCatalog } from '../../packages/contracts/character-creation';
import type { Ability } from '../../packages/contracts/sheets';
import type {
  CompendiumEntry,
  EffectDefinition,
  CompendiumSource,
  ImportIssue,
} from '../../packages/contracts/compendium';
import type { CatalogDraftRecord, JsonObject } from './model';

export type ResolvedEntry = CompendiumEntry & {
  key: string;
  legacyIds: string[];
  sourcePath: string;
  pointer: string;
  sourceHash: string;
};
export interface ResolvedCatalog extends Omit<CreationCatalog, 'entries'> {
  entries: ResolvedEntry[];
  sources: CompendiumSource[];
  issues: ImportIssue[];
  origins: CatalogDraftRecord[];
  progressionCells: {
    ownerRevisionId: string;
    table: number;
    row: number;
    column: number;
    heading: string;
    value: string;
  }[];
}
export interface CompendiumCuration {
  aliases: {
    names: { name: string; target: string; kind: string; context?: string }[];
    categories: { code: string; names: string[] }[];
  };
  requirements: { abilityNames: Record<string, Ability>; skillAliases: Record<string, string> };
  effects: {
    entries: (Partial<EffectDefinition> & {
      name?: string;
      originalName?: string;
      parent?: string;
      key: string;
      type: EffectDefinition['type'];
    })[];
  };
  progressions: {
    multiclassSlots: number[][];
    classes: Record<
      string,
      {
        abilities: Ability[];
        alternative?: boolean;
        denominator: number;
        rounding?: 'baixo' | 'cima';
        castingAbility?: Ability;
        pact?: boolean;
        multiclassProficiencies?: string[];
        multiclassSkillCount?: number;
      }
    >;
  };
  spellLists: { classAliases: Record<string, string> };
}
