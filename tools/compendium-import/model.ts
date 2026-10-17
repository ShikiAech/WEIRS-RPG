import type { ContentEntry } from '../../packages/contracts/content';
import type {
  CompendiumKind,
  CompendiumSource,
  ImportIssue,
} from '../../packages/contracts/compendium';

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export interface BackgroundInput {
  name: string;
  name_pt: string;
  book: string;
  publisher: string;
  description: string;
  ability_scores: string[];
  feat: string;
  skill_proficiencies: string[];
  tool_proficiencies: string[];
  equipment: { option_a: string[]; option_b: string[] };
  tags: string[];
}
export interface FeatInput {
  name: string;
  name_pt: string;
  book: string;
  publisher: string;
  type: string;
  description: string;
  tags: string[];
  prerequisite?: string;
  ability_scores?: string[];
}
export interface TraitInput {
  name: string;
  description: string;
}
export interface LineageInput {
  name_pt: string;
  description?: string;
  description_title?: string;
  traits_title?: string;
  traits: TraitInput[];
}
export interface RaceInput {
  name_pt: string;
  book: string;
  img: JsonValue[];
  description_title: string;
  description: string;
  type: string;
  size: string;
  speed: string;
  age: string;
  traits_title: string;
  traits: TraitInput[];
  tags: string[];
  subraces?: LineageInput[];
}
export type SourcePayload =
  | { type: 'background'; input: BackgroundInput }
  | { type: 'feat'; input: FeatInput }
  | { type: 'species'; input: RaceInput }
  | { type: 'lineage'; input: LineageInput }
  | { type: 'trait'; input: TraitInput }
  | { type: 'legacy'; entry: ContentEntry }
  | { type: 'section'; html: string; category: string; tables: string[][][] }
  | { type: 'equipment'; category: string; input: JsonObject };
export interface SourceRecord {
  key: string;
  parentKey?: string;
  kind: CompendiumKind;
  name: string;
  originalName: string;
  description: string;
  descriptionHtml: string;
  book: string;
  publisher: string;
  pointer: string;
  anchor: string;
  legacyId?: string;
  level?: number;
  payload: SourcePayload;
}
export interface ImportedSource {
  path: string;
  hash: string;
  commit: string;
  format: 'json' | 'html';
  records: SourceRecord[];
}
export interface IdentityRegistry {
  records: Record<string, string>;
  aliases?: Record<string, string>;
}
export interface CatalogDraftRecord extends SourceRecord {
  id: string;
  revisionId: string;
  sourceId: string;
  sourcePath: string;
  sourceHash: string;
  sourceFormat: 'json' | 'html';
  alternatives: { sourcePath: string; pointer: string; payload: SourcePayload;sourceId?:string;sourceHash?:string }[];
  legacyIds: string[];
}
export interface ImportedCatalog {
  sources: CompendiumSource[];
  records: CatalogDraftRecord[];
  identityRegistry: IdentityRegistry;
  issues: ImportIssue[];
}
