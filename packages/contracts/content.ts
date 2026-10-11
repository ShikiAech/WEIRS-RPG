export type ContentKind = 'magia' | 'talento' | 'antecedente' | 'classe' | 'especie';
export interface ContentEntry {
  id: string;
  slug: string;
  kind: ContentKind;
  name: string;
  sourcePath: string;
  sourceUrl: string;
  sourceLabel: string;
  revision: string;
  edition: 'revisao-pendente';
  metadata: Record<string, string>;
  descriptionHtml: string;
}
export type ContentSummary = Omit<ContentEntry, 'descriptionHtml'>;
export interface CampaignSession {
  id: string;
  title: string;
  preview: string;
  descriptionHtml: string;
  sourceAnchor: string;
}
export interface CampaignBiography {
  id: string;
  name: string;
  descriptionHtml: string;
}
export interface CampaignContent {
  id: string;
  slug: string;
  name: string;
  sourceUrl: string;
  descriptionHtml: string;
  sessions: CampaignSession[];
  biographies: CampaignBiography[];
}
export interface ContentBundle {
  entries: ContentEntry[];
  campaigns: CampaignContent[];
  manifest: {
    schemaVersion: 1;
    sources: { path: string; sha256: string; bytes: number }[];
    warnings: string[];
  };
}
