import type {
  CreationCatalog,
  CreationDraft,
  CreationPreview,
  CompendiumRepository,
} from '../../../../packages/contracts/character-creation';
import type { CompendiumEntry } from '../../../../packages/contracts/compendium';
export interface StepProps {
  draft: CreationDraft;
  catalog: CreationCatalog;
  preview: CreationPreview;
  repository: CompendiumRepository;
  classLevelInputs?: Record<string, string>;
  spellEntries?: Map<string, CompendiumEntry>;
  onChange: (
    draft: CreationDraft | ((current: CreationDraft) => CreationDraft),
    classLevelInputs?: Record<string, string>,
  ) => void;
}
