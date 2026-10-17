import type {
  CreationCatalog,
  CreationDraft,
  CreationPreview,
  CompendiumRepository,
} from '../../../../packages/contracts/character-creation';
export interface StepProps {
  draft: CreationDraft;
  catalog: CreationCatalog;
  preview: CreationPreview;
  repository: CompendiumRepository;
  onChange: (draft: CreationDraft) => void;
}
