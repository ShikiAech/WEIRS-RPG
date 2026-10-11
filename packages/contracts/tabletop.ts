export type MapRect = { x: number; y: number; w: number; h: number };
export type MapDrawing = { id: string; cor: string; pontos: { x: number; y: number }[] };
export type MapPing = {
  id: string;
  campanha_id: string;
  cena_id: string;
  usuario_id: string;
  nome: string;
  x: number;
  y: number;
  criado_em: string;
};
export type SceneRecord = {
  id: string;
  campanha_id: string;
  nome: string;
  versao: number;
  largura: number;
  altura: number;
  unidade: number;
  grade: boolean;
  publicada: boolean;
  ativa: boolean;
  fundo_id: string | null;
  nevoa: boolean;
  revelacoes: MapRect[];
  desenhos: MapDrawing[];
};
export type TokenRecord = {
  id: string;
  campanha_id: string;
  cena_id: string;
  versao: number;
  nome: string;
  x: number;
  y: number;
  tamanho: number;
  cor: string;
  rotacao: number;
  oculto: boolean;
  bloqueado: boolean;
  ficha_id: string | null;
  controlador_id: string | null;
  imagem_id: string | null;
  combate_id: string | null;
};
export type AssetRecord = {
  id: string;
  campanha_id: string;
  nome: string;
  caminho: string;
  mime: string;
  tamanho: number;
  visibilidade: 'campanha' | 'mestre';
  estado: 'pendente' | 'pronto' | 'excluindo';
};
export type ScenePatch = Partial<
  Pick<
    SceneRecord,
    | 'nome'
    | 'largura'
    | 'altura'
    | 'unidade'
    | 'grade'
    | 'publicada'
    | 'fundo_id'
    | 'nevoa'
    | 'revelacoes'
    | 'desenhos'
  >
>;
export type TokenPatch = Partial<
  Pick<
    TokenRecord,
    | 'nome'
    | 'x'
    | 'y'
    | 'tamanho'
    | 'cor'
    | 'rotacao'
    | 'oculto'
    | 'bloqueado'
    | 'ficha_id'
    | 'controlador_id'
    | 'imagem_id'
    | 'combate_id'
  >
>;
export type MapCommand =
  | ({ tipo: 'cena_criar'; nome: string; largura: number; altura: number } & Partial<
      Pick<SceneRecord, 'unidade' | 'grade' | 'publicada' | 'fundo_id'>
    >)
  | { tipo: 'cena_atualizar'; id: string; versao: number; patch: ScenePatch }
  | { tipo: 'cena_excluir' | 'cena_ativar'; id: string; versao: number }
  | ({
      tipo: 'token_criar';
      cena_id: string;
      nome: string;
      x: number;
      y: number;
      tamanho: number;
      cor: string;
    } & Partial<Omit<TokenPatch, 'nome' | 'x' | 'y' | 'tamanho' | 'cor'>>)
  | { tipo: 'token_atualizar'; id: string; versao: number; patch: TokenPatch }
  | { tipo: 'token_excluir'; id: string; versao: number }
  | {
      tipo: 'arquivo_registrar';
      id: string;
      nome: string;
      mime: string;
      tamanho: number;
      visibilidade: 'campanha' | 'mestre';
    }
  | { tipo: 'arquivo_finalizar' | 'arquivo_preparar_exclusao' | 'arquivo_excluir'; id: string };
export type MapResponse = {
  cena?: SceneRecord;
  token?: TokenRecord;
  asset?: AssetRecord;
  excluido?: string;
};
