import { criarConteudo } from '../sheets/modelo.js';
export type Ability = 'for' | 'des' | 'con' | 'int' | 'sab' | 'car';
export interface EquipmentItem {
  id: string;
  nome: string;
  quantidade: number;
  peso: number;
  equipado: boolean;
  cargasMaximas: number;
  cargasGastas: number;
  observacoes: string;
  tipo?: 'basico' | 'arma' | 'armadura' | 'escudo';
  descricao?: string;
  categoriaArma?: 'simples' | 'marcial';
  alcanceArma?: 'corpo-a-corpo' | 'distancia';
  critico?: number;
  categoriaArmadura?: 'leve' | 'media' | 'pesada';
  forcaMinima?: number;
  caBase?: number;
  limiteDestreza?: number | null;
  adicionarDestreza?: boolean;
  desvantagemFurtividade?: boolean;
  bonusCa?: number;
  outrosBonus?: number;
}
export interface AttackDamage {
  id: string;
  dado: string;
  atributo: Ability | '';
  tipo: string;
}
export interface EquipmentAttack {
  id: string;
  nome: string;
  tipo: string;
  valor: number;
  dano: string;
  tipoDano: string;
  observacoes: string;
  itemId?: string;
  atributo?: Ability;
  bonus?: number;
  proficiente?: boolean;
  danos?: AttackDamage[];
  critico?: number;
}
export interface SheetResource {
  id: string;
  nome: string;
  maximo: number;
  gastos: number;
  recuperacao: string;
  itemId?: string;
}
export interface SheetNamedEntry {
  id: string;
  nome: string;
}
export interface SheetTextEntry extends SheetNamedEntry {
  descricao: string;
}
type BaseContent = ReturnType<typeof criarConteudo>;
export type SheetSpell = BaseContent['magias'][number] & {
  compendioId?: string;
  compendioRef?: import('./compendium').CompendiumRef;
  origemCriacao?: string;
  dano?: string;
  tipoDano?: string;
  bonusAtaque?: number;
  cd?: number;
  salvaguardaAtributo?: Ability | '';
  danos?: AttackDamage[];
};
export type SheetContent = Omit<
  BaseContent,
  | 'pericias'
  | 'inventario'
  | 'ataques'
  | 'recursos'
  | 'magias'
  | 'conjuracao'
  | 'combate'
  | 'caracteristicas'
  | 'tracos'
  | 'talentos'
  | 'idiomas'
> & {
  pericias: Record<string, BaseContent['pericias'][string] & { descricao?: string }>;
  criacao?: import('./character-creation').CreationSnapshot;
  caracteristicas: SheetTextEntry[];
  tracos: SheetTextEntry[];
  talentos: SheetTextEntry[];
  idiomas: SheetNamedEntry[];
  combate: Omit<BaseContent['combate'], 'dadosVida' | 'deslocamentosAdicionais' | 'condicoes'> & {
    dadosVida: { id: string; dado: string; maximo: number; gastos: number }[];
    deslocamentosAdicionais: { id: string; nome: string; valor: number }[];
    condicoes: SheetNamedEntry[];
  };
  inventario: Omit<BaseContent['inventario'], 'itens' | 'sintonizados'> & {
    itens: EquipmentItem[];
    sintonizados: { id: string; nome: string; itemId: string }[];
  };
  ataques: EquipmentAttack[];
  recursos: SheetResource[];
  magias: SheetSpell[];
  conjuracao: Omit<BaseContent['conjuracao'], 'espacos'> & {
    espacos: { circulo: number; total: number; gastos: number; ativo?: boolean }[];
  };
};
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
export interface CampaignAccess {
  campaigns: CampaignRecord[];
  memberships: CampaignMembership[];
  admin: boolean;
}
export interface SheetRepository {
  list(): Promise<SheetRecord[]>;
  campaigns(): Promise<CampaignAccess>;
  availableCampaigns(): Promise<CampaignAccess>;
  joinCampaign(id: string): Promise<CampaignMembership>;
  copyToCampaign(record: SheetRecord, campaignId: string, requestId: string): Promise<SheetRecord>;
  get(id: string): Promise<SheetRecord>;
  create(
    campaignId: string,
    name: string,
    content: SheetContent,
    requestId?: string,
  ): Promise<SheetRecord>;
  createFromChoices(
    request: import('../character-creation/server').CreationRequest,
  ): Promise<SheetRecord>;
  save(record: SheetRecord, name: string, content: SheetContent): Promise<SheetRecord>;
  remove(id: string): Promise<void>;
}
