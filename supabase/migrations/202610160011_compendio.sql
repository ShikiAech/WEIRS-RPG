BEGIN;

-- Identidade do conceito é estável. Conteúdo e vínculos pertencem a uma revisão;
-- publicar congela essa revisão, inclusive suas tabelas filhas.
CREATE TABLE public.compendio_conjuntos_regras (
  codigo text PRIMARY KEY CHECK(codigo ~ '^[a-z0-9-]+$'),
  nome_pt text NOT NULL CHECK(length(btrim(nome_pt)) BETWEEN 1 AND 120),
  edicao text NOT NULL,
  publicado boolean NOT NULL DEFAULT false
);
INSERT INTO public.compendio_conjuntos_regras VALUES
  ('dnd-5e-2024','D&D 5e 2024','2024',true);

CREATE TABLE public.compendio_fontes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL CHECK(length(btrim(titulo)) BETWEEN 1 AND 240),
  edicao text NOT NULL DEFAULT '',
  idioma text NOT NULL DEFAULT 'pt-BR',
  origem text NOT NULL DEFAULT 'nao-revisada'
    CHECK(origem IN ('oficial','adaptacao-weirs','terceiro','homebrew','nao-revisada')),
  autoria text NOT NULL DEFAULT '',
  referencia_url text NOT NULL DEFAULT '',
  atribuicao text NOT NULL DEFAULT '',
  caminho text NOT NULL DEFAULT '',
  commit_fonte text NOT NULL DEFAULT '',
  hash_fonte text NOT NULL DEFAULT ''
);
CREATE TABLE public.compendio_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK(tipo IN ('classe','subclasse','especie','linhagem',
    'antecedente','talento','caracteristica','magia','equipamento','idioma',
    'criatura','pacote','maestria','propriedade_arma','servico','moeda')),
  slug text NOT NULL CHECK(length(slug) BETWEEN 1 AND 240),
  ativo boolean NOT NULL DEFAULT true,
  revisao_atual_id uuid,
  UNIQUE(tipo,slug)
);
CREATE TABLE public.compendio_revisoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registro_id uuid NOT NULL REFERENCES public.compendio_registros(id),
  numero integer NOT NULL CHECK(numero > 0),
  conjunto_regras_codigo text NOT NULL REFERENCES public.compendio_conjuntos_regras(codigo),
  fonte_id uuid NOT NULL REFERENCES public.compendio_fontes(id),
  nome_pt text NOT NULL CHECK(length(btrim(nome_pt)) BETWEEN 1 AND 240),
  nome_original text NOT NULL DEFAULT '',
  descricao_pt text NOT NULL DEFAULT '',
  descricao_html text NOT NULL DEFAULT '',
  estado text NOT NULL DEFAULT 'rascunho' CHECK(estado IN ('rascunho','publicado')),
  revisado_2024 boolean NOT NULL DEFAULT false,
  automacao text NOT NULL DEFAULT 'manual' CHECK(automacao IN ('manual','parcial','completa')),
  caminho_fonte text NOT NULL DEFAULT '',
  ancora_fonte text NOT NULL DEFAULT '',
  hash_fonte text NOT NULL DEFAULT '',
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(registro_id,numero),
  UNIQUE(registro_id,id)
);
ALTER TABLE public.compendio_registros ADD CONSTRAINT compendio_revisao_propria
  FOREIGN KEY(id,revisao_atual_id) REFERENCES public.compendio_revisoes(registro_id,id);
CREATE INDEX compendio_revisoes_origem ON public.compendio_revisoes(registro_id);
CREATE INDEX compendio_revisoes_consulta
  ON public.compendio_revisoes(conjunto_regras_codigo,estado,fonte_id);

CREATE FUNCTION private.compendio_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND private.eh_admin()
$$;
CREATE FUNCTION private.compendio_visivel(p_revisao uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.compendio_admin() OR EXISTS(
    SELECT 1 FROM public.compendio_revisoes WHERE id=p_revisao AND estado='publicado')
$$;
REVOKE ALL ON FUNCTION private.compendio_admin(),private.compendio_visivel(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon;
GRANT EXECUTE ON FUNCTION private.compendio_admin(),private.compendio_visivel(uuid) TO anon,authenticated;

CREATE FUNCTION public.normalizar_busca_compendio(p_texto text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path='' AS $$
  SELECT translate(lower(coalesce(p_texto,'')),
    'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')
$$;
ALTER TABLE public.compendio_revisoes ADD COLUMN busca tsvector
  GENERATED ALWAYS AS (to_tsvector('simple'::regconfig,
    public.normalizar_busca_compendio(nome_pt || ' ' || nome_original))) STORED;
CREATE INDEX compendio_busca ON public.compendio_revisoes USING gin(busca);

-- Gramática numérica limitada: os dados não contêm SQL, JavaScript ou eval.
CREATE FUNCTION private.formula_compendio_valida(p jsonb, profundidade integer DEFAULT 0)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE operacao text; partes jsonb; keys text[];
BEGIN
  IF p IS NULL THEN RETURN true; END IF;
  IF profundidade>12 OR pg_column_size(p)>4096 OR jsonb_typeof(p)<>'object' THEN RETURN false; END IF;
  operacao:=p->>'op';
  SELECT array_agg(k ORDER BY k) INTO keys FROM jsonb_object_keys(p) k;
  IF operacao='constant' THEN
    RETURN keys=ARRAY['op','value'] AND jsonb_typeof(p->'value')='number'
      AND (p->>'value')::numeric BETWEEN -9999 AND 9999;
  ELSIF operacao IN ('ability_score','ability_modifier') THEN
    RETURN coalesce(keys=ARRAY['ability','op'] AND p->>'ability' IN ('for','des','con','int','sab','car'),false);
  ELSIF operacao IN ('level','class_level','proficiency') THEN
    RETURN keys=ARRAY['op'];
  ELSIF operacao IN ('add','subtract','multiply','minimum','maximum','floor','ceil') THEN
    IF keys<>ARRAY['args','op'] OR jsonb_typeof(p->'args')<>'array' THEN RETURN false; END IF;
    IF jsonb_array_length(p->'args') NOT BETWEEN 1 AND 12 THEN RETURN false; END IF;
    IF operacao IN ('floor','ceil') AND jsonb_array_length(p->'args')<>1 THEN RETURN false; END IF;
    IF operacao='subtract' AND jsonb_array_length(p->'args')<>2 THEN RETURN false; END IF;
    FOR partes IN SELECT value FROM jsonb_array_elements(p->'args') LOOP
      IF NOT coalesce(private.formula_compendio_valida(partes,profundidade+1),false) THEN RETURN false; END IF;
    END LOOP;
    RETURN true;
  END IF;
  RETURN false;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION private.formula_compendio_valida(jsonb,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.formula_compendio_valida(jsonb,integer) TO authenticated;

CREATE TABLE public.compendio_atributos (codigo text PRIMARY KEY,nome_pt text NOT NULL);
INSERT INTO public.compendio_atributos VALUES
 ('for','Força'),('des','Destreza'),('con','Constituição'),('int','Inteligência'),('sab','Sabedoria'),('car','Carisma');
CREATE TABLE public.compendio_pericias (
  codigo text PRIMARY KEY,nome_pt text NOT NULL,
  atributo_codigo text NOT NULL REFERENCES public.compendio_atributos(codigo)
);
INSERT INTO public.compendio_pericias VALUES
 ('acrobacia','Acrobacia','des'),('adestrarAnimais','Adestrar Animais','sab'),
 ('arcanismo','Arcanismo','int'),('atletismo','Atletismo','for'),('atuacao','Atuação','car'),
 ('enganacao','Enganação','car'),('furtividade','Furtividade','des'),('historia','História','int'),
 ('intimidacao','Intimidação','car'),('intuicao','Intuição','sab'),('investigacao','Investigação','int'),
 ('medicina','Medicina','sab'),('natureza','Natureza','int'),('percepcao','Percepção','sab'),
 ('persuasao','Persuasão','car'),('prestidigitacao','Prestidigitação','des'),
 ('religiao','Religião','int'),('sobrevivencia','Sobrevivência','sab');
CREATE TABLE public.compendio_tamanhos(codigo text PRIMARY KEY,nome_pt text NOT NULL);
INSERT INTO public.compendio_tamanhos VALUES
 ('minusculo','Minúsculo'),('pequeno','Pequeno'),('medio','Médio'),
 ('grande','Grande'),('enorme','Enorme'),('imenso','Imenso');
CREATE TABLE public.compendio_tipos_criatura(codigo text PRIMARY KEY,nome_pt text NOT NULL);
INSERT INTO public.compendio_tipos_criatura VALUES
 ('aberracao','Aberração'),('besta','Besta'),('celestial','Celestial'),('construto','Construto'),
 ('corruptor','Corruptor'),('dragao','Dragão'),('elemental','Elemental'),('fada','Fada'),
 ('gigante','Gigante'),('humanoide','Humanoide'),('limo','Limo'),('monstruosidade','Monstruosidade'),
 ('morto-vivo','Morto-vivo'),('planta','Planta');
CREATE TABLE public.compendio_tipos_dano(codigo text PRIMARY KEY,nome_pt text NOT NULL);
INSERT INTO public.compendio_tipos_dano VALUES
 ('acido','Ácido'),('concussao','Concussão'),('cortante','Cortante'),('eletrico','Elétrico'),
 ('energetico','Energético'),('fogo','Fogo'),('frio','Frio'),('necrotico','Necrótico'),
 ('perfurante','Perfurante'),('psiquico','Psíquico'),('radiante','Radiante'),
 ('trovejante','Trovejante'),('veneno','Veneno');
CREATE TABLE public.compendio_condicoes(codigo text PRIMARY KEY,nome_pt text NOT NULL,descricao_pt text NOT NULL DEFAULT '');
CREATE TABLE public.compendio_categorias_talento(codigo text PRIMARY KEY,nome_pt text NOT NULL);
INSERT INTO public.compendio_categorias_talento VALUES
 ('origem','Origem'),('geral','Geral'),('estilo-luta','Estilo de Luta'),('dadiva-epica','Dádiva Épica'),
 ('marca-dragao','Marca do Dragão'),('pacto-planar','Pacto Planar'),('dom-sombrio','Dom Sombrio');
CREATE TABLE public.compendio_categorias_equipamento(codigo text PRIMARY KEY,nome_pt text NOT NULL);
INSERT INTO public.compendio_categorias_equipamento VALUES
 ('basico','Básico'),('arma-simples','Arma simples'),('arma-marcial','Arma marcial'),
 ('armadura-leve','Armadura leve'),('armadura-media','Armadura média'),('armadura-pesada','Armadura pesada'),
 ('escudo','Escudo'),('ferramenta','Ferramenta'),('magico','Item mágico'),('veiculo','Veículo');

CREATE TABLE public.compendio_importacoes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), commit_fonte text NOT NULL,
 versao_importador text NOT NULL, hash_manifesto text NOT NULL UNIQUE,
 relatorio jsonb NOT NULL DEFAULT '{}', criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.compendio_pendencias(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 revisao_id uuid REFERENCES public.compendio_revisoes(id),
 importacao_id uuid REFERENCES public.compendio_importacoes(id),
 codigo text NOT NULL,mensagem text NOT NULL,caminho text NOT NULL DEFAULT '',
 ponteiro text NOT NULL DEFAULT '',severidade text NOT NULL CHECK(severidade IN ('error','warning')),
 resolvida boolean NOT NULL DEFAULT false
);
CREATE INDEX compendio_pendencias_revisao ON public.compendio_pendencias(revisao_id) WHERE NOT resolvida;

-- Registro interno das tabelas filhas: usado somente pelas proteções da migração.
CREATE TABLE private.compendio_dominios(nome text PRIMARY KEY,tipos text NOT NULL,principal boolean NOT NULL);
REVOKE ALL ON private.compendio_dominios FROM PUBLIC,anon,authenticated;

-- Cada definição abaixo é código desta migração, nunca texto recebido do cliente.
-- Todas as tabelas têm revisão proprietária; os vínculos apontam a entidades reais.
DO $dominios$
DECLARE d record; chave text;
BEGIN
 FOR d IN SELECT * FROM (VALUES
 ('compendio_moedas','moeda',true,$def$
   codigo text NOT NULL,simbolo text NOT NULL,valor_cobre numeric(14,4) CHECK(valor_cobre>0)$def$),
 ('compendio_idiomas','idioma',true,$def$
   categoria text NOT NULL DEFAULT 'comum',origem_pt text NOT NULL DEFAULT ''$def$),
 ('compendio_maestrias','maestria',true,$def$
   chave text NOT NULL$def$),
 ('compendio_propriedades_arma','propriedade_arma',true,$def$
   chave text NOT NULL$def$),
 ('compendio_equipamentos','equipamento',true,$def$
   categoria_codigo text NOT NULL REFERENCES public.compendio_categorias_equipamento(codigo),
   peso numeric(12,4) CHECK(peso>=0),unidade_peso text NOT NULL DEFAULT 'kg' CHECK(unidade_peso IN ('kg','lb')),
   custo numeric(14,4) CHECK(custo>=0),moeda_revisao_id uuid REFERENCES public.compendio_moedas(revisao_id),
   requer_sintonia boolean NOT NULL DEFAULT false$def$),
 ('compendio_armas','equipamento',false,$def$
   alcance_tipo text NOT NULL CHECK(alcance_tipo IN ('corpo-a-corpo','distancia')),
   alcance_normal_pes integer CHECK(alcance_normal_pes>=0),
   alcance_longo_pes integer CHECK(alcance_longo_pes>=alcance_normal_pes),
   maestria_revisao_id uuid REFERENCES public.compendio_maestrias(revisao_id),
   critico_minimo integer NOT NULL DEFAULT 20 CHECK(critico_minimo BETWEEN 1 AND 20),
   FOREIGN KEY(revisao_id) REFERENCES public.compendio_equipamentos(revisao_id)$def$),
 ('compendio_armaduras','equipamento',false,$def$
   ca_base integer NOT NULL CHECK(ca_base BETWEEN 0 AND 99),
   adicionar_destreza boolean NOT NULL DEFAULT true,limite_destreza integer CHECK(limite_destreza>=0),
   forca_minima integer CHECK(forca_minima BETWEEN 0 AND 30),
   desvantagem_furtividade boolean NOT NULL DEFAULT false,
   FOREIGN KEY(revisao_id) REFERENCES public.compendio_equipamentos(revisao_id)$def$),
 ('compendio_escudos','equipamento',false,$def$
   bonus_ca integer NOT NULL DEFAULT 2 CHECK(bonus_ca BETWEEN 0 AND 99),
   FOREIGN KEY(revisao_id) REFERENCES public.compendio_equipamentos(revisao_id)$def$),
 ('compendio_ferramentas','equipamento',false,$def$
   atributo_codigo text REFERENCES public.compendio_atributos(codigo),utilizacao_pt text NOT NULL DEFAULT '',
   FOREIGN KEY(revisao_id) REFERENCES public.compendio_equipamentos(revisao_id)$def$),
 ('compendio_itens_magicos','equipamento',false,$def$
   raridade text NOT NULL,limite_cargas integer CHECK(limite_cargas>=0),
   FOREIGN KEY(revisao_id) REFERENCES public.compendio_equipamentos(revisao_id)$def$),
 ('compendio_veiculos','equipamento',false,$def$
   capacidade_kg numeric CHECK(capacidade_kg>=0),velocidade_pes numeric CHECK(velocidade_pes>=0),
   tripulacao_minima integer CHECK(tripulacao_minima>=0),
   FOREIGN KEY(revisao_id) REFERENCES public.compendio_equipamentos(revisao_id)$def$),
 ('compendio_arma_propriedades','equipamento',false,$def$
   propriedade_revisao_id uuid NOT NULL REFERENCES public.compendio_propriedades_arma(revisao_id),
   valor numeric,UNIQUE(revisao_id,propriedade_revisao_id),
   FOREIGN KEY(revisao_id) REFERENCES public.compendio_armas(revisao_id)$def$),
 ('compendio_equipamento_danos','equipamento',false,$def$
   ordem integer NOT NULL DEFAULT 0,formula_dados text NOT NULL CHECK(length(formula_dados) BETWEEN 1 AND 120),
   tipo_dano_codigo text NOT NULL REFERENCES public.compendio_tipos_dano(codigo),
   atributo_codigo text REFERENCES public.compendio_atributos(codigo),
   FOREIGN KEY(revisao_id) REFERENCES public.compendio_equipamentos(revisao_id)$def$),
 ('compendio_classes','classe',true,$def$
   dado_vida integer NOT NULL CHECK(dado_vida IN (6,8,10,12)),
   pv_fixo integer GENERATED ALWAYS AS (dado_vida/2+1) STORED$def$),
 ('compendio_subclasses','subclasse',true,$def$
   classe_revisao_id uuid NOT NULL REFERENCES public.compendio_classes(revisao_id),
   nivel_aquisicao integer NOT NULL DEFAULT 3 CHECK(nivel_aquisicao BETWEEN 1 AND 20)$def$),
 ('compendio_classe_atributos','classe',false,$def$
   atributo_codigo text NOT NULL REFERENCES public.compendio_atributos(codigo),
   papel text NOT NULL CHECK(papel IN ('primario','multiclasse')),
   grupo_alternativo integer NOT NULL DEFAULT 0,valor_minimo integer CHECK(valor_minimo BETWEEN 1 AND 30),
   FOREIGN KEY(revisao_id) REFERENCES public.compendio_classes(revisao_id),
   UNIQUE(revisao_id,atributo_codigo,papel)$def$),
 ('compendio_classe_niveis','classe',false,$def$
   nivel integer NOT NULL CHECK(nivel BETWEEN 1 AND 20),
   FOREIGN KEY(revisao_id) REFERENCES public.compendio_classes(revisao_id),UNIQUE(revisao_id,nivel)$def$),
 ('compendio_subclasse_niveis','subclasse',false,$def$
   nivel integer NOT NULL CHECK(nivel BETWEEN 1 AND 20),
   FOREIGN KEY(revisao_id) REFERENCES public.compendio_subclasses(revisao_id),UNIQUE(revisao_id,nivel)$def$),
 ('compendio_especies','especie',true,$def$
   tipo_criatura_codigo text NOT NULL DEFAULT 'humanoide' REFERENCES public.compendio_tipos_criatura(codigo),
   tamanho_codigo text NOT NULL DEFAULT 'medio' REFERENCES public.compendio_tamanhos(codigo),
   idade_pt text NOT NULL DEFAULT ''$def$),
 ('compendio_linhagens','linhagem',true,$def$
   especie_revisao_id uuid NOT NULL REFERENCES public.compendio_especies(revisao_id),
   herdar_tracos boolean NOT NULL DEFAULT true$def$),
 ('compendio_especie_tamanhos','especie,linhagem',false,$def$
   tamanho_codigo text NOT NULL REFERENCES public.compendio_tamanhos(codigo),
   forma_codigo text NOT NULL DEFAULT 'normal',padrao boolean NOT NULL DEFAULT false,
   UNIQUE(revisao_id,tamanho_codigo,forma_codigo)$def$),
 ('compendio_deslocamentos','especie,linhagem,criatura',false,$def$
   modo text NOT NULL CHECK(modo IN ('terrestre','voo','natacao','escalada','escavacao')),
   distancia numeric(10,3) NOT NULL CHECK(distancia BETWEEN 0 AND 99999),
   unidade text NOT NULL CHECK(unidade IN ('pes','metros')),
   forma_codigo text NOT NULL DEFAULT 'normal',condicao_pt text NOT NULL DEFAULT '',
   pairar boolean NOT NULL DEFAULT false$def$),
 ('compendio_sentidos','especie,linhagem,criatura',false,$def$
   tipo text NOT NULL,distancia_pes numeric(10,3) CHECK(distancia_pes>=0),
   condicao_pt text NOT NULL DEFAULT ''$def$),
 ('compendio_caracteristicas','caracteristica',true,$def$
   categoria text NOT NULL DEFAULT 'traco',decisao_manual boolean NOT NULL DEFAULT false$def$),
 ('compendio_talentos','talento',true,$def$
   categoria_codigo text NOT NULL REFERENCES public.compendio_categorias_talento(codigo),
   repetivel boolean NOT NULL DEFAULT false$def$),
 ('compendio_antecedentes','antecedente',true,$def$
   distribuicao_atributos text NOT NULL DEFAULT '2-1-ou-1-1-1'
     CHECK(distribuicao_atributos IN ('2-1-ou-1-1-1','personalizada','nenhuma')),
   limite_atributo integer NOT NULL DEFAULT 20 CHECK(limite_atributo BETWEEN 1 AND 30)$def$),
 ('compendio_antecedente_atributos','antecedente',false,$def$
   atributo_codigo text NOT NULL REFERENCES public.compendio_atributos(codigo),
   FOREIGN KEY(revisao_id) REFERENCES public.compendio_antecedentes(revisao_id),
   UNIQUE(revisao_id,atributo_codigo)$def$),
 ('compendio_magias','magia',true,$def$
   circulo integer NOT NULL CHECK(circulo BETWEEN 0 AND 9),escola text NOT NULL,
   tempo_pt text NOT NULL DEFAULT '',alcance_pt text NOT NULL DEFAULT '',
   alcance_pes numeric CHECK(alcance_pes>=0),duracao_pt text NOT NULL DEFAULT '',
   duracao_segundos integer CHECK(duracao_segundos>=0),
   concentracao boolean NOT NULL DEFAULT false,ritual boolean NOT NULL DEFAULT false,
   area_tipo text,area_pes numeric CHECK(area_pes>=0),
   salvaguarda_atributo text REFERENCES public.compendio_atributos(codigo)$def$),
 ('compendio_magia_componentes','magia',false,$def$
   verbal boolean NOT NULL DEFAULT false,somatico boolean NOT NULL DEFAULT false,material_pt text NOT NULL DEFAULT '',
   custo_cobre numeric CHECK(custo_cobre>=0),consumido boolean NOT NULL DEFAULT false,
   FOREIGN KEY(revisao_id) REFERENCES public.compendio_magias(revisao_id),UNIQUE(revisao_id)$def$),
 ('compendio_magia_classes','magia',false,$def$
   classe_revisao_id uuid NOT NULL REFERENCES public.compendio_classes(revisao_id),
   sempre_preparada boolean NOT NULL DEFAULT false,
   FOREIGN KEY(revisao_id) REFERENCES public.compendio_magias(revisao_id),UNIQUE(revisao_id,classe_revisao_id)$def$),
 ('compendio_magia_danos','magia',false,$def$
   ordem integer NOT NULL DEFAULT 0,formula_dados text NOT NULL CHECK(length(formula_dados) BETWEEN 1 AND 120),
   tipo_dano_codigo text REFERENCES public.compendio_tipos_dano(codigo),
   FOREIGN KEY(revisao_id) REFERENCES public.compendio_magias(revisao_id)$def$),
 ('compendio_magia_escalas','magia',false,$def$
   nivel integer NOT NULL CHECK(nivel BETWEEN 1 AND 20),
   base text NOT NULL CHECK(base IN ('personagem','circulo')),
   formula_dados text NOT NULL CHECK(length(formula_dados) BETWEEN 1 AND 120),
   FOREIGN KEY(revisao_id) REFERENCES public.compendio_magias(revisao_id),UNIQUE(revisao_id,nivel,base)$def$),
 ('compendio_proficiencias','classe,subclasse,especie,linhagem,antecedente,talento,caracteristica',false,$def$
   tipo text NOT NULL CHECK(tipo IN ('pericia','salvaguarda','equipamento','categoria','idioma')),
   pericia_codigo text REFERENCES public.compendio_pericias(codigo),
   atributo_codigo text REFERENCES public.compendio_atributos(codigo),
   equipamento_revisao_id uuid REFERENCES public.compendio_equipamentos(revisao_id),
   categoria_codigo text REFERENCES public.compendio_categorias_equipamento(codigo),
   idioma_revisao_id uuid REFERENCES public.compendio_idiomas(revisao_id),
   CHECK(num_nonnulls(pericia_codigo,atributo_codigo,equipamento_revisao_id,categoria_codigo,idioma_revisao_id)=1),
   CHECK((tipo='pericia')=(pericia_codigo IS NOT NULL)),
   CHECK((tipo='salvaguarda')=(atributo_codigo IS NOT NULL)),
   CHECK((tipo='equipamento')=(equipamento_revisao_id IS NOT NULL)),
   CHECK((tipo='categoria')=(categoria_codigo IS NOT NULL)),
   CHECK((tipo='idioma')=(idioma_revisao_id IS NOT NULL))$def$),
 ('compendio_classe_proficiencias','classe',false,$def$
   proficiencia_id uuid NOT NULL,
   aquisicao text NOT NULL CHECK(aquisicao IN ('inicial','multiclasse','ambas')),
   FOREIGN KEY(revisao_id) REFERENCES public.compendio_classes(revisao_id),
   FOREIGN KEY(proficiencia_id,revisao_id) REFERENCES public.compendio_proficiencias(id,revisao_id),
   UNIQUE(revisao_id,proficiencia_id,aquisicao)$def$),
 ('compendio_requisitos','classe,subclasse,especie,linhagem,antecedente,talento,caracteristica',false,$def$
   pai_id uuid,operador text NOT NULL CHECK(operador IN ('todos','qualquer','nivel','nivel-classe','atributo',
     'proficiencia','caracteristica','talento','especie','linhagem','escolha','repeticoes')),
   atributo_codigo text REFERENCES public.compendio_atributos(codigo),
   alvo_revisao_id uuid REFERENCES public.compendio_revisoes(id),
   minimo integer CHECK(minimo>=0),escolha_chave text,
   proficiencia_id uuid,
   FOREIGN KEY(proficiencia_id,revisao_id) REFERENCES public.compendio_proficiencias(id,revisao_id),
   FOREIGN KEY(pai_id,revisao_id) REFERENCES public.compendio_requisitos(id,revisao_id)$def$),
 ('compendio_grupos_escolha','classe,subclasse,especie,linhagem,antecedente,talento,caracteristica,pacote',false,$def$
   chave text NOT NULL,nome_pt text NOT NULL,minimo integer NOT NULL DEFAULT 1 CHECK(minimo>=0),
   maximo integer NOT NULL DEFAULT 1 CHECK(maximo>=minimo AND maximo<=100),
   tipo_opcao text,categoria_talento_codigo text REFERENCES public.compendio_categorias_talento(codigo),
   requisito_id uuid,
   FOREIGN KEY(requisito_id,revisao_id) REFERENCES public.compendio_requisitos(id,revisao_id),
   nivel integer NOT NULL DEFAULT 1 CHECK(nivel BETWEEN 1 AND 20),
   UNIQUE(revisao_id,chave)$def$),
 ('compendio_opcoes_escolha','classe,subclasse,especie,linhagem,antecedente,talento,caracteristica,pacote',false,$def$
   grupo_id uuid NOT NULL,nome_pt text NOT NULL,tipo text NOT NULL,
   alvo_revisao_id uuid REFERENCES public.compendio_revisoes(id),
   atributo_codigo text REFERENCES public.compendio_atributos(codigo),
   proficiencia_id uuid,
   FOREIGN KEY(proficiencia_id,revisao_id) REFERENCES public.compendio_proficiencias(id,revisao_id),
   valor text,quantidade numeric NOT NULL DEFAULT 1 CHECK(quantidade>0),
   FOREIGN KEY(grupo_id,revisao_id) REFERENCES public.compendio_grupos_escolha(id,revisao_id),
   CHECK(num_nonnulls(alvo_revisao_id,atributo_codigo,proficiencia_id,valor)=1)$def$),
 ('compendio_concessoes','classe,subclasse,especie,linhagem,antecedente,talento,caracteristica',false,$def$
   chave text NOT NULL,tipo text NOT NULL,
   alvo_revisao_id uuid REFERENCES public.compendio_revisoes(id),
   grupo_id uuid,requisito_id uuid,
   FOREIGN KEY(requisito_id,revisao_id) REFERENCES public.compendio_requisitos(id,revisao_id),
   nivel integer NOT NULL DEFAULT 1 CHECK(nivel BETWEEN 1 AND 20),
   aquisicao text NOT NULL DEFAULT 'ambas' CHECK(aquisicao IN ('inicial','multiclasse','ambas')),
   quantidade integer NOT NULL DEFAULT 1 CHECK(quantidade>0),
   FOREIGN KEY(grupo_id,revisao_id) REFERENCES public.compendio_grupos_escolha(id,revisao_id),
   CHECK(num_nonnulls(alvo_revisao_id,grupo_id)=1),UNIQUE(revisao_id,chave)$def$),
 ('compendio_efeitos','classe,subclasse,especie,linhagem,antecedente,talento,caracteristica,equipamento',false,$def$
   chave text NOT NULL,tipo text NOT NULL CHECK(tipo IN ('atributo','ca_formula','ca_bonus','pv_bonus',
     'pv_por_nivel','deslocamento','resistencia','imunidade','vulnerabilidade','sentido','recurso',
     'proficiencia','idioma','ataque_bonus','critico','iniciativa_bonus','percepcao_bonus')),
   formula jsonb CHECK(private.formula_compendio_valida(formula)),
   requisito_id uuid,
   FOREIGN KEY(requisito_id,revisao_id) REFERENCES public.compendio_requisitos(id,revisao_id),
   nivel integer NOT NULL DEFAULT 1 CHECK(nivel BETWEEN 1 AND 20),
   acumulacao text NOT NULL DEFAULT 'somar' CHECK(acumulacao IN ('somar','maximo','substituir','alternativa')),
   condicao_pt text NOT NULL DEFAULT '',UNIQUE(revisao_id,chave)$def$),
 ('compendio_efeito_atributos','classe,subclasse,especie,linhagem,antecedente,talento,caracteristica,equipamento',false,$def$
   efeito_id uuid NOT NULL,atributo_codigo text NOT NULL REFERENCES public.compendio_atributos(codigo),
   aumento integer NOT NULL,limite integer NOT NULL DEFAULT 20 CHECK(limite BETWEEN 1 AND 30),
   FOREIGN KEY(efeito_id,revisao_id) REFERENCES public.compendio_efeitos(id,revisao_id)$def$),
 ('compendio_efeito_defesas','classe,subclasse,especie,linhagem,talento,caracteristica,equipamento',false,$def$
   efeito_id uuid NOT NULL,tipo_dano_codigo text REFERENCES public.compendio_tipos_dano(codigo),
   sem_armadura boolean NOT NULL DEFAULT false,permite_escudo boolean NOT NULL DEFAULT true,
   FOREIGN KEY(efeito_id,revisao_id) REFERENCES public.compendio_efeitos(id,revisao_id)$def$),
 ('compendio_efeito_recursos','classe,subclasse,especie,linhagem,talento,caracteristica,equipamento',false,$def$
   efeito_id uuid NOT NULL,nome_pt text NOT NULL,
   recuperacao text NOT NULL CHECK(recuperacao IN ('curto','longo','manual')),
   FOREIGN KEY(efeito_id,revisao_id) REFERENCES public.compendio_efeitos(id,revisao_id)$def$),
 ('compendio_efeito_proficiencias','classe,subclasse,especie,linhagem,antecedente,talento,caracteristica',false,$def$
   efeito_id uuid NOT NULL,proficiencia_id uuid NOT NULL,
   FOREIGN KEY(proficiencia_id,revisao_id) REFERENCES public.compendio_proficiencias(id,revisao_id),
   grau text NOT NULL CHECK(grau IN ('meia','proficiente','especializacao')),
   FOREIGN KEY(efeito_id,revisao_id) REFERENCES public.compendio_efeitos(id,revisao_id)$def$),
 ('compendio_perfis_conjuracao','classe,subclasse,especie,linhagem,talento,caracteristica',false,$def$
   chave text NOT NULL,tipo text NOT NULL CHECK(tipo IN ('conjuracao','pacto','concedida')),
   metodo text NOT NULL CHECK(metodo IN ('preparadas','conhecidas','grimorio','fixas')),
   contribuicao_numerador integer NOT NULL DEFAULT 0 CHECK(contribuicao_numerador BETWEEN 0 AND 1),
   contribuicao_denominador integer NOT NULL DEFAULT 1 CHECK(contribuicao_denominador IN (1,2,3)),
   arredondamento text NOT NULL DEFAULT 'baixo' CHECK(arredondamento IN ('baixo','cima')),
   nivel_inicial integer NOT NULL DEFAULT 1 CHECK(nivel_inicial BETWEEN 1 AND 20),
   UNIQUE(revisao_id,chave)$def$),
 ('compendio_perfil_atributos','classe,subclasse,especie,linhagem,talento,caracteristica',false,$def$
   perfil_id uuid NOT NULL,atributo_codigo text NOT NULL REFERENCES public.compendio_atributos(codigo),
   FOREIGN KEY(perfil_id,revisao_id) REFERENCES public.compendio_perfis_conjuracao(id,revisao_id),
   UNIQUE(perfil_id,atributo_codigo)$def$),
 ('compendio_conjuracao_progressao','classe,subclasse,especie,linhagem,talento,caracteristica',false,$def$
   perfil_id uuid NOT NULL,nivel integer NOT NULL CHECK(nivel BETWEEN 1 AND 20),
   truques integer NOT NULL DEFAULT 0 CHECK(truques>=0),magias_preparadas integer CHECK(magias_preparadas>=0),
   magias_conhecidas integer CHECK(magias_conhecidas>=0),circulo_maximo integer CHECK(circulo_maximo BETWEEN 0 AND 9),
   FOREIGN KEY(perfil_id,revisao_id) REFERENCES public.compendio_perfis_conjuracao(id,revisao_id),
   UNIQUE(perfil_id,nivel)$def$),
 ('compendio_espacos_magia','classe,subclasse,especie,linhagem,talento,caracteristica',false,$def$
   perfil_id uuid NOT NULL,nivel integer NOT NULL CHECK(nivel BETWEEN 1 AND 20),
   circulo integer NOT NULL CHECK(circulo BETWEEN 1 AND 9),total integer NOT NULL CHECK(total BETWEEN 0 AND 99),
   FOREIGN KEY(perfil_id,revisao_id) REFERENCES public.compendio_perfis_conjuracao(id,revisao_id),
   UNIQUE(perfil_id,nivel,circulo)$def$),
 ('compendio_magias_concedidas','classe,subclasse,especie,linhagem,talento,caracteristica',false,$def$
   perfil_id uuid NOT NULL,magia_revisao_id uuid NOT NULL REFERENCES public.compendio_magias(revisao_id),
   nivel integer NOT NULL DEFAULT 1 CHECK(nivel BETWEEN 1 AND 20),
   sempre_preparada boolean NOT NULL DEFAULT true,usa_espacos boolean NOT NULL DEFAULT true,
   usos_proprios integer CHECK(usos_proprios>=0),recuperacao text CHECK(recuperacao IN ('curto','longo','manual')),
   FOREIGN KEY(perfil_id,revisao_id) REFERENCES public.compendio_perfis_conjuracao(id,revisao_id),
   UNIQUE(perfil_id,magia_revisao_id,nivel)$def$),
 ('compendio_pacotes','pacote',true,$def$
   observacoes_pt text NOT NULL DEFAULT ''$def$),
 ('compendio_pacote_itens','pacote',false,$def$
   equipamento_revisao_id uuid REFERENCES public.compendio_equipamentos(revisao_id),
   moeda_revisao_id uuid REFERENCES public.compendio_moedas(revisao_id),
   quantidade numeric NOT NULL CHECK(quantidade>0),
   CHECK(num_nonnulls(equipamento_revisao_id,moeda_revisao_id)=1),
   FOREIGN KEY(revisao_id) REFERENCES public.compendio_pacotes(revisao_id)$def$),
 ('compendio_opcoes_equipamento','classe,antecedente',false,$def$
   chave text NOT NULL,nome_pt text NOT NULL,pacote_revisao_id uuid NOT NULL REFERENCES public.compendio_pacotes(revisao_id),
   aquisicao text NOT NULL DEFAULT 'inicial' CHECK(aquisicao IN ('inicial','multiclasse','ambas')),
   UNIQUE(revisao_id,chave)$def$),
 ('compendio_criaturas','criatura',true,$def$
   tipo_criatura_codigo text NOT NULL REFERENCES public.compendio_tipos_criatura(codigo),
   tamanho_codigo text NOT NULL REFERENCES public.compendio_tamanhos(codigo),
   ca integer CHECK(ca>=0),pv_formula text,forca integer,destreza integer,constituicao integer,
   inteligencia integer,sabedoria integer,carisma integer,desafio text$def$),
 ('compendio_criatura_acoes','criatura',false,$def$
   nome_pt text NOT NULL,tipo text NOT NULL CHECK(tipo IN ('acao','bonus','reacao','traco','lendaria')),
   descricao_pt text NOT NULL,bonus_ataque integer,cd integer,
   FOREIGN KEY(revisao_id) REFERENCES public.compendio_criaturas(revisao_id)$def$),
 ('compendio_criatura_defesas','criatura',false,$def$
   tipo text NOT NULL CHECK(tipo IN ('resistencia','imunidade','vulnerabilidade')),
   tipo_dano_codigo text REFERENCES public.compendio_tipos_dano(codigo),
   condicao_codigo text REFERENCES public.compendio_condicoes(codigo),
   CHECK(num_nonnulls(tipo_dano_codigo,condicao_codigo)=1),
   FOREIGN KEY(revisao_id) REFERENCES public.compendio_criaturas(revisao_id)$def$),
 ('compendio_criatura_ataques','criatura',false,$def$
   acao_id uuid NOT NULL,formula_dados text NOT NULL,tipo_dano_codigo text REFERENCES public.compendio_tipos_dano(codigo),
   FOREIGN KEY(acao_id,revisao_id) REFERENCES public.compendio_criatura_acoes(id,revisao_id)$def$),
 ('compendio_servicos','servico',true,$def$
   custo numeric NOT NULL CHECK(custo>=0),moeda_revisao_id uuid NOT NULL REFERENCES public.compendio_moedas(revisao_id),
   unidade_cobranca text NOT NULL$def$),
 ('compendio_aliases','classe,subclasse,especie,linhagem,antecedente,talento,caracteristica,magia,equipamento,idioma,criatura,pacote,maestria,propriedade_arma,servico,moeda',false,$def$
   nome text NOT NULL CHECK(length(btrim(nome)) BETWEEN 1 AND 240),
   idioma text NOT NULL DEFAULT 'pt-BR',UNIQUE(revisao_id,nome)$def$),
 ('compendio_referencias_legadas','classe,subclasse,especie,linhagem,antecedente,talento,caracteristica,magia,equipamento,idioma,criatura,pacote,maestria,propriedade_arma,servico,moeda',false,$def$
   legado_id uuid NOT NULL UNIQUE,caminho text NOT NULL DEFAULT '',ancora text NOT NULL DEFAULT ''$def$)
 ) AS dados(nome,tipos,principal,definicao) LOOP
   -- Subtipos têm o mesmo PK da entidade de domínio; relações têm sua identidade.
   IF d.principal OR d.nome IN ('compendio_armas','compendio_armaduras','compendio_escudos',
      'compendio_ferramentas','compendio_itens_magicos','compendio_veiculos') THEN
     chave:='revisao_id uuid PRIMARY KEY REFERENCES public.compendio_revisoes(id)';
   ELSE
     chave:='id uuid PRIMARY KEY DEFAULT gen_random_uuid(),revisao_id uuid NOT NULL REFERENCES public.compendio_revisoes(id),UNIQUE(id,revisao_id)';
   END IF;
   EXECUTE format('CREATE TABLE public.%I (%s,%s)',d.nome,chave,d.definicao);
   INSERT INTO private.compendio_dominios VALUES(d.nome,d.tipos,d.principal);
   IF chave LIKE 'id %' THEN
     EXECUTE format('CREATE INDEX ON public.%I(revisao_id)',d.nome);
   END IF;
 END LOOP;
END $dominios$;

CREATE FUNCTION private.proteger_dominio_compendio() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p uuid; estado text; tipo text; destino text;
BEGIN
  IF TG_OP='DELETE' THEN p:=OLD.revisao_id; ELSE p:=NEW.revisao_id; END IF;
  IF TG_OP='UPDATE' AND NEW.revisao_id<>OLD.revisao_id THEN
    RAISE EXCEPTION 'A origem da entrada é imutável.' USING ERRCODE='WC001';
  END IF;
  SELECT r.estado,c.tipo INTO estado,tipo FROM public.compendio_revisoes r
    JOIN public.compendio_registros c ON c.id=r.registro_id WHERE r.id=p FOR UPDATE OF r;
  IF estado='publicado' THEN
    RAISE EXCEPTION 'Crie uma nova revisão para alterar conteúdo publicado.' USING ERRCODE='WC003';
  END IF;
  IF tipo IS NULL OR NOT(tipo=ANY(string_to_array(TG_ARGV[0],','))) THEN
    RAISE EXCEPTION 'Entidade incompatível com o registro.' USING ERRCODE='WC001';
  END IF;
  IF TG_TABLE_NAME='compendio_concessoes' AND TG_OP<>'DELETE' THEN
    IF NEW.alvo_revisao_id IS NOT NULL THEN
      SELECT c.tipo INTO destino FROM public.compendio_revisoes r
        JOIN public.compendio_registros c ON c.id=r.registro_id WHERE r.id=NEW.alvo_revisao_id;
      IF destino IS NOT NULL AND destino<>NEW.tipo THEN
        RAISE EXCEPTION 'Tipo de concessão incompatível com o destino.' USING ERRCODE='WC001';
      END IF;
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.proteger_dominio_compendio() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.validar_publicacao_compendio(p uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.compendio_revisoes; tipo text; tabela text; completo boolean;
  d record; a record; invalido boolean;
BEGIN
  SELECT * INTO r FROM public.compendio_revisoes WHERE id=p;
  PERFORM 1 FROM public.compendio_fontes WHERE id=r.fonte_id FOR SHARE;
  SELECT c.tipo INTO tipo FROM public.compendio_registros c WHERE c.id=r.registro_id;
  SELECT nome INTO tabela FROM private.compendio_dominios
    WHERE principal AND tipo=ANY(string_to_array(tipos,','));
  IF tabela IS NULL THEN
    RAISE EXCEPTION 'Domínio não cadastrado.' USING ERRCODE='WC001';
  END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE revisao_id=$1)',tabela) INTO completo USING p;
  IF NOT completo OR EXISTS(SELECT 1 FROM public.compendio_pendencias
    WHERE revisao_id=p AND severidade='error' AND NOT resolvida) THEN
    RAISE EXCEPTION 'Conteúdo com dados ou referências pendentes.' USING ERRCODE='WC001';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.compendio_conjuntos_regras
    WHERE codigo=r.conjunto_regras_codigo AND publicado) THEN
    RAISE EXCEPTION 'Conjunto de regras não publicado.' USING ERRCODE='WC001';
  END IF;
  IF EXISTS(SELECT 1 FROM public.compendio_grupos_escolha g WHERE g.revisao_id=p AND g.minimo>(
    (SELECT count(*) FROM public.compendio_opcoes_escolha o WHERE o.grupo_id=g.id)
    + CASE WHEN g.categoria_talento_codigo IS NULL THEN 0 ELSE
      (SELECT count(*) FROM public.compendio_talentos t JOIN public.compendio_revisoes tr ON tr.id=t.revisao_id
       WHERE t.categoria_codigo=g.categoria_talento_codigo AND tr.estado='publicado'
       AND tr.conjunto_regras_codigo=r.conjunto_regras_codigo) END)) THEN
    RAISE EXCEPTION 'Grupo sem opções suficientes.' USING ERRCODE='WC001';
  END IF;
  IF tipo='especie' AND NOT EXISTS(SELECT 1 FROM public.compendio_deslocamentos WHERE revisao_id=p) THEN
    RAISE EXCEPTION 'Espécie sem deslocamento definido.' USING ERRCODE='WC001';
  END IF;
  IF tipo='classe' AND r.automacao='completa' AND
    (SELECT count(*) FROM public.compendio_classe_niveis WHERE revisao_id=p)<>20 THEN
    RAISE EXCEPTION 'Progressão da classe incompleta.' USING ERRCODE='WC001';
  END IF;
  IF tipo='equipamento' THEN
    SELECT CASE categoria_codigo
      WHEN 'arma-simples' THEN 'compendio_armas' WHEN 'arma-marcial' THEN 'compendio_armas'
      WHEN 'armadura-leve' THEN 'compendio_armaduras' WHEN 'armadura-media' THEN 'compendio_armaduras'
      WHEN 'armadura-pesada' THEN 'compendio_armaduras' WHEN 'escudo' THEN 'compendio_escudos'
      WHEN 'ferramenta' THEN 'compendio_ferramentas' WHEN 'magico' THEN 'compendio_itens_magicos'
      WHEN 'veiculo' THEN 'compendio_veiculos' ELSE NULL END INTO tabela
      FROM public.compendio_equipamentos WHERE revisao_id=p;
    IF tabela IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE revisao_id=$1)',tabela) INTO completo USING p;
      IF NOT completo THEN RAISE EXCEPTION 'Estatísticas do equipamento ausentes.' USING ERRCODE='WC001'; END IF;
    END IF;
  END IF;
  -- Verifica todos os destinos de revisão das entidades, não somente os nomes.
  FOR d IN SELECT nome FROM private.compendio_dominios LOOP
    FOR a IN SELECT attname FROM pg_catalog.pg_attribute
      WHERE attrelid=format('public.%I',d.nome)::regclass AND attnum>0 AND NOT attisdropped
      AND attname LIKE '%\_revisao\_id' ESCAPE '\' LOOP
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I x
        JOIN public.compendio_revisoes alvo ON alvo.id=x.%I
        WHERE x.revisao_id=$1 AND alvo.id<>$1 AND
        (alvo.estado<>''publicado'' OR alvo.conjunto_regras_codigo<>$2))',d.nome,a.attname)
        INTO invalido USING p,r.conjunto_regras_codigo;
      IF invalido THEN
        RAISE EXCEPTION 'Destino não publicado ou de outro conjunto de regras.' USING ERRCODE='WC001';
      END IF;
    END LOOP;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION private.validar_publicacao_compendio(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.proteger_revisao_compendio() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP<>'INSERT' AND OLD.estado='publicado' THEN
    RAISE EXCEPTION 'Revisão publicada é imutável.' USING ERRCODE='WC003';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF TG_OP='INSERT' AND NEW.estado<>'rascunho' THEN
    RAISE EXCEPTION 'Crie o rascunho antes de publicar.' USING ERRCODE='WC001';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.registro_id<>OLD.registro_id OR NEW.numero<>OLD.numero) THEN
    RAISE EXCEPTION 'Identidade da revisão é imutável.' USING ERRCODE='WC001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER compendio_proteger_revisao BEFORE INSERT OR UPDATE OR DELETE ON public.compendio_revisoes
  FOR EACH ROW EXECUTE FUNCTION private.proteger_revisao_compendio();

CREATE FUNCTION private.concluir_publicacao_compendio() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM private.validar_publicacao_compendio(NEW.id);
  UPDATE public.compendio_registros c SET revisao_atual_id=NEW.id WHERE c.id=NEW.registro_id
    AND (c.revisao_atual_id IS NULL OR
      NEW.numero>(SELECT r.numero FROM public.compendio_revisoes r WHERE r.id=c.revisao_atual_id));
  RETURN NEW;
END $$;
-- Disparado ao final do statement: permite publicar grafos com ciclos legítimos,
-- como classe/lista de magias, em uma única transação.
CREATE CONSTRAINT TRIGGER compendio_validar_publicacao AFTER UPDATE ON public.compendio_revisoes
  DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW
  WHEN(NEW.estado='publicado' AND OLD.estado<>'publicado')
  EXECUTE FUNCTION private.concluir_publicacao_compendio();

CREATE FUNCTION private.proteger_registro_compendio() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.id<>OLD.id OR NEW.tipo<>OLD.tipo THEN
    RAISE EXCEPTION 'Identidade do conceito é imutável.' USING ERRCODE='WC001';
  END IF;
  IF NEW.revisao_atual_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.compendio_revisoes r WHERE r.id=NEW.revisao_atual_id
      AND r.registro_id=NEW.id AND r.estado='publicado') THEN
    RAISE EXCEPTION 'A revisão corrente precisa estar publicada.' USING ERRCODE='WC001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER compendio_proteger_registro BEFORE UPDATE ON public.compendio_registros
  FOR EACH ROW EXECUTE FUNCTION private.proteger_registro_compendio();

CREATE FUNCTION private.proteger_fonte_compendio() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.compendio_revisoes WHERE fonte_id=OLD.id AND estado='publicado') THEN
    RAISE EXCEPTION 'Procedência publicada é imutável; cadastre uma nova fonte.' USING ERRCODE='WC003';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER compendio_proteger_fonte BEFORE UPDATE OR DELETE ON public.compendio_fontes
  FOR EACH ROW EXECUTE FUNCTION private.proteger_fonte_compendio();
REVOKE ALL ON FUNCTION private.proteger_fonte_compendio() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.publicar_compendio_lote(p_revisoes uuid[]) RETURNS SETOF public.compendio_revisoes
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT private.compendio_admin() THEN
    RAISE EXCEPTION 'Administração global necessária.' USING ERRCODE='WC002';
  END IF;
  IF p_revisoes IS NULL OR cardinality(p_revisoes) NOT BETWEEN 1 AND 10000
    OR (SELECT count(DISTINCT x) FROM unnest(p_revisoes) x)<>cardinality(p_revisoes) THEN
    RAISE EXCEPTION 'Lista de revisões inválida.' USING ERRCODE='WC001';
  END IF;
  PERFORM 1 FROM public.compendio_revisoes WHERE id=ANY(p_revisoes) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.compendio_revisoes WHERE id=ANY(p_revisoes))<>cardinality(p_revisoes) THEN
    RAISE EXCEPTION 'Revisão indisponível.' USING ERRCODE='WC001';
  END IF;
  UPDATE public.compendio_revisoes SET estado='publicado' WHERE id=ANY(p_revisoes) AND estado='rascunho';
  RETURN QUERY SELECT * FROM public.compendio_revisoes WHERE id=ANY(p_revisoes);
END $$;
CREATE FUNCTION public.publicar_compendio(p_revisao uuid) RETURNS SETOF public.compendio_revisoes
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT * FROM public.publicar_compendio_lote(ARRAY[p_revisao])
$$;
REVOKE ALL ON FUNCTION public.publicar_compendio(uuid),public.publicar_compendio_lote(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.publicar_compendio(uuid),public.publicar_compendio_lote(uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION private.proteger_revisao_compendio(),private.concluir_publicacao_compendio(),
  private.proteger_registro_compendio() FROM PUBLIC,anon,authenticated;

-- Todas as relações usam a mesma política de publicação do proprietário.
DO $politicas$
DECLARE d record; nome text;
BEGIN
 FOR d IN SELECT * FROM private.compendio_dominios LOOP
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',d.nome);
   EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',d.nome);
   EXECUTE format('GRANT SELECT ON public.%I TO anon,authenticated',d.nome);
   EXECUTE format('GRANT INSERT,UPDATE,DELETE ON public.%I TO authenticated',d.nome);
   EXECUTE format('CREATE POLICY compendio_leitura ON public.%I FOR SELECT TO anon,authenticated
     USING(private.compendio_visivel(revisao_id))',d.nome);
   EXECUTE format('CREATE POLICY compendio_manutencao ON public.%I FOR ALL TO authenticated
     USING(private.compendio_admin()) WITH CHECK(private.compendio_admin())',d.nome);
   EXECUTE format('CREATE TRIGGER compendio_proteger_dominio BEFORE INSERT OR UPDATE OR DELETE ON public.%I
     FOR EACH ROW EXECUTE FUNCTION private.proteger_dominio_compendio(%L)',d.nome,d.tipos);
 END LOOP;
 FOREACH nome IN ARRAY ARRAY['compendio_atributos','compendio_pericias','compendio_tamanhos',
   'compendio_tipos_criatura','compendio_tipos_dano','compendio_condicoes',
   'compendio_categorias_talento','compendio_categorias_equipamento',
   'compendio_conjuntos_regras','compendio_registros','compendio_revisoes','compendio_fontes',
   'compendio_importacoes','compendio_pendencias'] LOOP
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',nome);
   EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',nome);
   EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',nome);
   EXECUTE format('CREATE POLICY compendio_manutencao ON public.%I FOR ALL TO authenticated
     USING(private.compendio_admin()) WITH CHECK(private.compendio_admin())',nome);
   IF nome NOT IN ('compendio_importacoes','compendio_pendencias') THEN
     EXECUTE format('GRANT SELECT ON public.%I TO anon',nome);
   END IF;
   IF nome NOT IN ('compendio_registros','compendio_revisoes','compendio_fontes',
      'compendio_importacoes','compendio_pendencias','compendio_conjuntos_regras') THEN
     EXECUTE format('CREATE POLICY compendio_leitura ON public.%I FOR SELECT TO anon,authenticated USING(true)',nome);
   END IF;
 END LOOP;
END $politicas$;
CREATE POLICY compendio_leitura ON public.compendio_conjuntos_regras FOR SELECT TO anon,authenticated
  USING(publicado OR private.compendio_admin());
CREATE POLICY compendio_leitura ON public.compendio_revisoes FOR SELECT TO anon,authenticated
  USING(estado='publicado' OR private.compendio_admin());
CREATE POLICY compendio_leitura ON public.compendio_registros FOR SELECT TO anon,authenticated
  USING(private.compendio_admin() OR EXISTS(SELECT 1 FROM public.compendio_revisoes r
    WHERE r.registro_id=compendio_registros.id AND r.estado='publicado'));
CREATE POLICY compendio_leitura ON public.compendio_fontes FOR SELECT TO anon,authenticated
  USING(private.compendio_admin() OR EXISTS(SELECT 1 FROM public.compendio_revisoes r
    WHERE r.fonte_id=compendio_fontes.id AND r.estado='publicado'));

CREATE VIEW public.compendio_indice WITH(security_invoker=true) AS
 SELECT r.id AS revisao_id,r.registro_id,c.tipo,c.slug,r.nome_pt,r.nome_original,
   r.conjunto_regras_codigo,r.fonte_id,r.numero,r.revisado_2024,r.automacao,
   f.titulo AS fonte_titulo,f.origem,f.referencia_url,
   m.circulo,m.escola,m.ritual,m.concentracao
 FROM public.compendio_revisoes r JOIN public.compendio_registros c
   ON c.id=r.registro_id AND c.revisao_atual_id=r.id
 JOIN public.compendio_fontes f ON f.id=r.fonte_id
 LEFT JOIN public.compendio_magias m ON m.revisao_id=r.id
 WHERE r.estado='publicado' AND c.ativo;
GRANT SELECT ON public.compendio_indice TO anon,authenticated;

COMMIT;
