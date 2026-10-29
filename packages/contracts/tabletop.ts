export type MapRect = { x: number; y: number; w: number; h: number };
export type MapDrawing = { id: string; cor: string; pontos: { x: number; y: number }[] };
export type MapAura = { raio: number; cor: string };
export type AreaShape = 'circulo' | 'cone' | 'quadrado' | 'linha';
export type AreaRecord = {
  camada_id?: string;
  ancora_dx?: number | null;
  ancora_dy?: number | null;
  ancora_rotacao?: number;
  ancora_angulo?: number;
  acompanhar_rotacao?: boolean;
  id: string;
  campanha_id: string;
  cena_id: string;
  versao: number;
  usuario_id: string;
  token_id: string | null;
  nome: string;
  forma: AreaShape;
  x: number;
  y: number;
  tamanho: number;
  largura: number;
  angulo: number;
  cor: string;
};
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
  modo_visao?: 'manual' | 'automatica';
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
  fundo_x: number;
  fundo_y: number;
  fundo_escala: number;
  nevoa: boolean;
  revelacoes: MapRect[];
  desenhos: MapDrawing[];
};
export type TokenRecord = {
  camada_id?: string;
  elevacao?: number;
  visao?: boolean;
  alcance_visao?: number;
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
  aura: MapAura | null;
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
    | 'fundo_x'
    | 'fundo_y'
    | 'fundo_escala'
    | 'nevoa'
    | 'revelacoes'
    | 'desenhos'
    | 'modo_visao'
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
    | 'aura'
    | 'camada_id'
    | 'elevacao'
    | 'visao'
    | 'alcance_visao'
  >
>;
export type AreaPatch = Partial<
  Pick<
    AreaRecord,
    | 'nome'
    | 'forma'
    | 'x'
    | 'y'
    | 'tamanho'
    | 'largura'
    | 'angulo'
    | 'cor'
    | 'token_id'
    | 'camada_id'
    | 'acompanhar_rotacao'
  >
>;
export type TokenBatchItem =
  | { tipo: 'token_atualizar'; id: string; versao: number; patch: TokenPatch }
  | { tipo: 'token_excluir'; id: string; versao: number };
export type LayerRecord = {
  finalidade?: 'mapa' | 'jogadores' | 'mestre' | null;
  id: string;
  campanha_id: string;
  cena_id: string;
  versao: number;
  nome: string;
  ordem: number;
  visivel: boolean;
  bloqueada: boolean;
};
export type WallRecord = {
  id: string;
  campanha_id: string;
  cena_id: string;
  versao: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  porta: boolean;
  aberta: boolean;
};
export type PlacedObject = {
  id: string;
  campanha_id: string;
  cena_id: string;
  camada_id: string;
  versao: number;
  nome: string;
  x: number;
  y: number;
  w: number;
  h: number;
  imagem_id: string | null;
  desenho: MapDrawing | null;
  oculto: boolean;
};
export type SceneAssignment = {
  campanha_id: string;
  usuario_id: string;
  cena_id: string;
  seguir_usuario_id: string | null;
  versao: number;
};
export type MapSnapshot = {
  cena: SceneRecord;
  revisao: number;
  atual: string[];
  explorada: string[];
  sem_fonte: boolean;
  tokens: TokenRecord[];
  areas: AreaRecord[];
  objetos: PlacedObject[];
  camadas: LayerRecord[];
  paredes: WallRecord[];
  atribuicoes: SceneAssignment[];
  assets: AssetRecord[];
};
export type MapInvalidation = {
  campanha_id: string;
  usuario_id: string;
  revisao: number;
  revisao_fundo?: number;
};
export type MapCommand =
  | { tipo: 'desenhos_limpar'; cena_id: string; itens: { id: string; versao: number }[] }
  | {
      tipo: 'camada_criar';
      cena_id: string;
      nome: string;
      ordem?: number;
      visivel?: boolean;
      bloqueada?: boolean;
    }
  | {
      tipo: 'camada_atualizar';
      id: string;
      versao: number;
      patch: Partial<Pick<LayerRecord, 'nome' | 'ordem' | 'visivel' | 'bloqueada'>>;
    }
  | ({ tipo: 'parede_criar'; cena_id: string } & Pick<WallRecord, 'x1' | 'y1' | 'x2' | 'y2'> &
      Partial<Pick<WallRecord, 'porta' | 'aberta'>>)
  | {
      tipo: 'parede_atualizar';
      id: string;
      versao: number;
      patch: Partial<Pick<WallRecord, 'x1' | 'y1' | 'x2' | 'y2' | 'porta' | 'aberta'>>;
    }
  | { tipo: 'parede_excluir' | 'objeto_excluir'; id: string; versao: number }
  | ({ tipo: 'objeto_criar'; cena_id: string } & Omit<
      PlacedObject,
      'id' | 'campanha_id' | 'cena_id' | 'versao'
    >)
  | {
      tipo: 'objeto_atualizar';
      id: string;
      versao: number;
      patch: Partial<Omit<PlacedObject, 'id' | 'campanha_id' | 'cena_id' | 'versao'>>;
    }
  | {
      tipo: 'camada_transferir';
      cena_id: string;
      camada_id: string;
      itens: { tipo: 'token' | 'area' | 'objeto'; id: string; versao: number }[];
    }
  | {
      tipo: 'cena_atribuir';
      versoes?: { usuario_id: string; versao: number }[];
      cena_id: string;
      usuarios: string[];
      seguir_usuario_id?: string | null;
    }
  | { tipo: 'exploracao_limpar'; cena_id: string }
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
  | { tipo: 'tokens_lote'; cena_id: string; itens: TokenBatchItem[] }
  | {
      tipo: 'tokens_duplicar';
      cena_id: string;
      tokens: { id: string; versao: number }[];
      dx: number;
      dy: number;
    }
  | ({
      tipo: 'area_criar';
      cena_id: string;
      nome: string;
      forma: AreaShape;
      x: number;
      y: number;
      tamanho: number;
      cor: string;
    } & Partial<
      Pick<AreaRecord, 'largura' | 'angulo' | 'token_id' | 'camada_id' | 'acompanhar_rotacao'>
    >)
  | { tipo: 'area_atualizar'; id: string; versao: number; patch: AreaPatch }
  | { tipo: 'area_excluir'; id: string; versao: number }
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
  camada?: LayerRecord;
  parede?: WallRecord;
  objeto?: PlacedObject;
  cena?: SceneRecord;
  token?: TokenRecord;
  tokens?: TokenRecord[];
  area?: AreaRecord;
  asset?: AssetRecord;
  excluido?: string;
  excluidos?: string[];
};
