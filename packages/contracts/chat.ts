export type RollMode = 'normal' | 'vantagem' | 'desvantagem';
export type SheetAction =
  | 'ataque'
  | 'dano'
  | 'magia'
  | 'magia_ataque'
  | 'atributo'
  | 'resistencia'
  | 'pericia'
  | 'iniciativa'
  | 'morte'
  | 'magia_dano'
  | 'dado_vida';
export type ChatCommand =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'rolagem'; expressao: string; rotulo?: string; secreta?: boolean }
  | {
      tipo: 'acao';
      ficha_id: string;
      versao: number;
      entrada_id: string;
      acao: SheetAction;
      modo: RollMode;
      secreta?: boolean;
    };
export type RollTerm = {
  sinal: number;
  subtotal: number;
  valor?: number;
  faces?: number;
  dados?: number[];
  selecionados?: number[];
};
export type RollResult = {
  regras: number;
  expressao?: string;
  total?: number;
  termos?: RollTerm[];
  cd?: number;
  origem?: {
    ficha_id: string;
    ficha_nome: string;
    versao: number;
    entrada_id: string;
    acao: SheetAction;
    modo: RollMode;
  };
};
export type ChatMessage = {
  id: string;
  campanha_id: string;
  sequencia: number;
  autor_id: string | null;
  autor_nome: string;
  tipo: ChatCommand['tipo'];
  texto: string;
  rotulo: string;
  resultado: RollResult | null;
  criado_em: string;
  secreta?: boolean;
  revelada_id?: string | null;
};
export type ChatStatus = 'conectando' | 'ao_vivo' | 'reconectando';
export type ChatRepository = {
  history(campaign: string, before?: number): Promise<ChatMessage[]>;
  since(campaign: string, after: number): Promise<ChatMessage[]>;
  send(campaign: string, request: string, command: ChatCommand): Promise<ChatMessage>;
  reveal(campaign: string, message: string): Promise<ChatMessage>;
  onRole?: (role: string, campaign: string) => void;
  subscribe(
    campaign: string,
    onMessage: (message: ChatMessage) => void,
    onStatus: (status: ChatStatus) => void,
  ): () => void;
};
