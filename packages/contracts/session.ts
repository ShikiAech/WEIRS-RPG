import type { SheetRecord } from './sheets';
import type { ChatMessage } from './chat';
export type Combatant = {
  id: string;
  ficha_id?: string;
  nome: string;
  iniciativa: number;
  ca: number;
  pvAtuais: number;
  pvMaximos: number;
  pvTemporarios?: number;
  condicoes?: { id: string; nome: string }[];
  concentracao?: string;
};
export type Offer = { id: string; nome: string; preco: number; venda: number; estoque: number };
export type SessionState = {
  campanha_id: string;
  versao: number;
  estado: {
    combate: { ativo: boolean; rodada: number; turno: string; participantes: Combatant[] };
    loja: { aberta: boolean; nome: string; ofertas: Offer[] };
  };
};
export type SessionCommand = Record<string, unknown> & { tipo: string; versao: number };
export type SessionResponse = { mesa: SessionState; ficha?: SheetRecord; mensagem: ChatMessage };
