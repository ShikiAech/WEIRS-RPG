import { criarConteudo } from '../sheets/modelo.js';
export type SheetContent = ReturnType<typeof criarConteudo>;
export interface SheetRecord {
  id: string;
  campanha_id: string;
  proprietario_id: string;
  nome: string;
  conteudo: SheetContent;
  versao_esquema: 1;
  versao: number;
  criado_em: string;
  atualizado_em: string;
}
export interface CampaignMembership {
  campanha_id: string;
  usuario_id: string;
  papel: 'jogador' | 'mestre' | 'espectador';
}
export interface CampaignRecord {
  id: string;
  nome: string;
}
export interface SheetRepository {
  list(): Promise<SheetRecord[]>;
  campaigns(): Promise<{ campaigns: CampaignRecord[]; memberships: CampaignMembership[] }>;
  get(id: string): Promise<SheetRecord>;
  create(
    campaignId: string,
    name: string,
    content: SheetContent,
    requestId?: string,
  ): Promise<SheetRecord>;
  save(record: SheetRecord, name: string, content: SheetContent): Promise<SheetRecord>;
  remove(id: string): Promise<void>;
}
