import type {
  ChoiceGroupDefinition,
  CompendiumKind,
  CompendiumPayloadMap,
  ProficiencyDefinition,
} from '../../packages/contracts/compendium';
import type { CatalogDraftRecord } from './model';
import type { ResolvedCatalog, ResolvedEntry } from './resolved';

/** Factories retain the importer's stable identities and source provenance. */
export interface CuratedContext {
  catalog: ResolvedCatalog;
  records: CatalogDraftRecord[];
  raw: Map<string, CatalogDraftRecord>;
  byKey: Map<string, ResolvedEntry>;
  synthetic<K extends CompendiumKind>(
    parent: CatalogDraftRecord,
    key: string,
    kind: K,
    name: string,
    data: CompendiumPayloadMap[K],
  ): ResolvedEntry;
  group(
    owner: ResolvedEntry,
    key: string,
    name: string,
    minimum?: number,
    maximum?: number,
    level?: number,
  ): ChoiceGroupDefinition;
  proficiency(
    owner: ResolvedEntry,
    key: string,
    data: Omit<ProficiencyDefinition, 'id' | 'ownerRevisionId'>,
    acquisition?: 'inicial' | 'multiclasse' | 'ambas',
    direct?: boolean,
  ): string;
  grant(owner: ResolvedEntry, target: ResolvedEntry, key: string, level?: number): unknown;
  find(kind: CompendiumKind, name: string, preferJson?: boolean): ResolvedEntry | undefined;
}
