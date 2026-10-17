BEGIN;
CREATE FUNCTION private.referencia_criacao_valida(r jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 RETURN coalesce(jsonb_typeof(r)='object' AND (r->>'recordId')::uuid IS NOT NULL AND (r->>'revisionId')::uuid IS NOT NULL AND (SELECT count(*) FROM jsonb_object_keys(r))=2,false);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
CREATE FUNCTION private.snapshot_criacao_valido(s jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE d jsonb; a jsonb; x jsonb; v jsonb; k text;
BEGIN
 IF coalesce((jsonb_typeof(s)<>'object' OR s->>'schemaVersion'<>'1'),true) THEN RETURN false; END IF;
 d:=s->'draft'; a:=d->'abilities';
 IF coalesce((jsonb_typeof(d)<>'object' OR (d->>'id')::uuid IS NULL OR d->>'engineVersion'<>'1' OR coalesce(d->>'ruleSetId','')!~'^[a-z0-9-]{1,80}$' OR a->>'mode' NOT IN ('rolls','external')),true) THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['classes','levels','choices','equipmentOptions','spellSelections','castingAbilities'] LOOP
  IF coalesce((jsonb_typeof(d->k)<>'array' OR jsonb_array_length(d->k)>CASE WHEN k IN ('classes','levels') THEN 20 WHEN k='choices' THEN 500 WHEN k='spellSelections' THEN 1000 ELSE 100 END),true) THEN RETURN false; END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['external','assignment','backgroundBonuses'] LOOP
  IF coalesce((jsonb_typeof(a->k)<>'object'),true) THEN RETURN false; END IF;
  FOR x IN SELECT jsonb_build_object('k',key,'v',value) FROM jsonb_each(a->k) LOOP
   IF coalesce((x->>'k' NOT IN ('for','des','con','int','sab','car') OR jsonb_typeof(x->'v')<>'number' OR (x->>'v')::numeric<>trunc((x->>'v')::numeric) OR (x->>'v')::numeric NOT BETWEEN CASE WHEN k='external' THEN 1 ELSE 0 END AND CASE WHEN k='external' THEN 30 WHEN k='assignment' THEN 5 ELSE 3 END),true) THEN RETURN false; END IF;
  END LOOP;
 END LOOP;
 IF coalesce((jsonb_typeof(a->'sets')<>'array' OR jsonb_array_length(a->'sets')>2 OR NOT (a->'selectedSet'='null'::jsonb OR a->>'selectedSet' IN ('0','1'))),true) THEN RETURN false; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(a->'sets') LOOP
  IF coalesce((jsonb_typeof(x)<>'array' OR jsonb_array_length(x)>6),true) THEN RETURN false; END IF;
  FOR v IN SELECT value FROM jsonb_array_elements(x) LOOP
   IF coalesce((jsonb_typeof(v)<>'number' OR v::text!~'^([3-9]|1[0-8])$'),true) THEN RETURN false; END IF;
  END LOOP;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['speciesRef','lineageRef','backgroundRef'] LOOP
  IF coalesce((NOT (d->k='null'::jsonb OR private.referencia_criacao_valida(d->k))),true) THEN RETURN false; END IF;
 END LOOP;
 IF coalesce((NOT (d->'size'='null'::jsonb OR jsonb_typeof(d->'size')='string' AND length(d->>'size')<=80) OR jsonb_typeof(d->'form')<>'string' OR length(d->>'form')>120),true) THEN RETURN false; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(d->'classes') LOOP
  IF coalesce(((x->>'id')::uuid IS NULL OR NOT private.referencia_criacao_valida(x->'classRef') OR NOT (x->'subclassRef'='null'::jsonb OR private.referencia_criacao_valida(x->'subclassRef')) OR x->>'level'!~'^([1-9]|1[0-9]|20)$'),true) THEN RETURN false; END IF;
 END LOOP;
 FOR x IN SELECT value FROM jsonb_array_elements(d->'levels') LOOP
  IF coalesce(((x->>'classEntryId')::uuid IS NULL OR x->>'totalLevel'!~'^([1-9]|1[0-9]|20)$' OR x->>'hitPointMethod' NOT IN ('fixed','roll','external') OR NOT (x->'hitPointRoll'='null'::jsonb OR x->>'hitPointRoll'~'^([1-9]|1[0-2])$')),true) THEN RETURN false; END IF;
 END LOOP;
 FOR x IN SELECT value FROM jsonb_array_elements(d->'choices') LOOP
  IF coalesce(((x->>'groupId')::uuid IS NULL OR jsonb_typeof(x->'sourceInstanceId')<>'string' OR length(x->>'sourceInstanceId')>4096 OR jsonb_typeof(x->'values')<>'array' OR jsonb_array_length(x->'values')>100),true) THEN RETURN false; END IF;
  FOR v IN SELECT value FROM jsonb_array_elements(x->'values') LOOP
   IF coalesce((NOT CASE v->>'type' WHEN 'record' THEN private.referencia_criacao_valida(v->'ref') WHEN 'option' THEN (v->>'optionId')::uuid IS NOT NULL WHEN 'proficiency' THEN (v->>'proficiencyId')::uuid IS NOT NULL WHEN 'ability' THEN v->>'ability' IN ('for','des','con','int','sab','car') AND v->>'amount'~'^[1-3]$' WHEN 'text' THEN jsonb_typeof(v->'value')='string' AND length(v->>'value')<=1000 ELSE false END),true) THEN RETURN false; END IF;
  END LOOP;
 END LOOP;
 FOR x IN SELECT value FROM jsonb_array_elements(d->'equipmentOptions') LOOP
  IF coalesce(((x->>'ownerRevisionId')::uuid IS NULL OR (x->>'optionId')::uuid IS NULL),true) THEN RETURN false; END IF;
 END LOOP;
 IF d ? 'equippedRefs' THEN
  IF coalesce((jsonb_typeof(d->'equippedRefs')<>'array' OR jsonb_array_length(d->'equippedRefs')>100),true) THEN RETURN false; END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(d->'equippedRefs') LOOP IF NOT private.referencia_criacao_valida(x) THEN RETURN false; END IF; END LOOP;
 END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(d->'spellSelections') LOOP
  IF coalesce((jsonb_typeof(x->'profileId')<>'string' OR length(x->>'profileId')>4096 OR NOT private.referencia_criacao_valida(x->'spellRef') OR jsonb_typeof(x->'prepared')<>'boolean'),true) THEN RETURN false; END IF;
 END LOOP;
 FOR x IN SELECT value FROM jsonb_array_elements(d->'castingAbilities') LOOP
  IF coalesce((jsonb_typeof(x->'profileId')<>'string' OR length(x->>'profileId')>4096 OR x->>'ability' NOT IN ('for','des','con','int','sab','car')),true) THEN RETURN false; END IF;
 END LOOP;
 IF coalesce((jsonb_typeof(s->'contributions')<>'array' OR jsonb_array_length(s->'contributions')>1000),true) THEN RETURN false; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(s->'contributions') LOOP
  IF coalesce(((x->>'id')::uuid IS NULL OR (x->>'sourceRevisionId')::uuid IS NULL OR jsonb_typeof(x->'sourceInstanceId')<>'string' OR length(x->>'sourceInstanceId')>4096 OR NOT (x->'grantId'='null'::jsonb OR (x->>'grantId')::uuid IS NOT NULL) OR jsonb_typeof(x->'name')<>'string' OR length(x->>'name')>240 OR jsonb_typeof(x->'target')<>'string' OR length(x->>'target')>80 OR NOT (x->'amount'='null'::jsonb OR jsonb_typeof(x->'amount')='number' AND abs((x->>'amount')::numeric)<=1000000)),true) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION private.referencia_criacao_valida(jsonb),private.snapshot_criacao_valido(jsonb) FROM PUBLIC,anon,authenticated;

CREATE TABLE public.ficha_criacoes(
 ficha_id uuid PRIMARY KEY REFERENCES public.fichas(id) ON DELETE CASCADE,
 conjunto_regras_codigo text NOT NULL REFERENCES public.compendio_conjuntos_regras(codigo),
 versao_motor integer NOT NULL CHECK(versao_motor=1),
 rascunho jsonb NOT NULL,validada_servidor boolean NOT NULL DEFAULT true,
 criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ficha_criacao_classes(
 ficha_id uuid NOT NULL REFERENCES public.ficha_criacoes(ficha_id) ON DELETE CASCADE,
 id uuid NOT NULL,classe_revisao_id uuid NOT NULL REFERENCES public.compendio_classes(revisao_id),
 subclasse_revisao_id uuid REFERENCES public.compendio_subclasses(revisao_id),nivel integer NOT NULL CHECK(nivel BETWEEN 1 AND 20),PRIMARY KEY(ficha_id,id)
);
CREATE TABLE public.ficha_criacao_niveis(
 ficha_id uuid NOT NULL,total integer NOT NULL CHECK(total BETWEEN 1 AND 20),classe_id uuid NOT NULL,
 metodo text NOT NULL CHECK(metodo IN ('fixed','roll','external')),resultado integer CHECK(resultado BETWEEN 1 AND 12),PRIMARY KEY(ficha_id,total),
 FOREIGN KEY(ficha_id,classe_id) REFERENCES public.ficha_criacao_classes(ficha_id,id) ON DELETE CASCADE
);
CREATE TABLE public.ficha_criacao_escolhas(
 ficha_id uuid NOT NULL REFERENCES public.ficha_criacoes(ficha_id) ON DELETE CASCADE,
 instancia_origem text NOT NULL,grupo_id uuid NOT NULL REFERENCES public.compendio_grupos_escolha(id),valores jsonb NOT NULL CHECK(jsonb_typeof(valores)='array'),PRIMARY KEY(ficha_id,instancia_origem,grupo_id)
);
CREATE TABLE public.ficha_criacao_concessoes(
 ficha_id uuid NOT NULL REFERENCES public.ficha_criacoes(ficha_id) ON DELETE CASCADE,id uuid NOT NULL,
 origem_revisao_id uuid NOT NULL REFERENCES public.compendio_revisoes(id),instancia_origem text NOT NULL,
 concessao_id uuid REFERENCES public.compendio_concessoes(id),destino text NOT NULL,nome_pt text NOT NULL,quantidade numeric,
 PRIMARY KEY(ficha_id,id),UNIQUE(ficha_id,instancia_origem)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['ficha_criacoes','ficha_criacao_classes','ficha_criacao_niveis','ficha_criacao_escolhas','ficha_criacao_concessoes'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY criacao_leitura ON public.%I FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.fichas f WHERE f.id=ficha_id))',t);
 END LOOP;
END $$;
CREATE TABLE private.criacao_pedidos(usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,pedido_id uuid NOT NULL,ficha_id uuid NOT NULL,pedido jsonb NOT NULL,PRIMARY KEY(usuario_id,pedido_id));
ALTER TABLE private.criacao_pedidos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.criacao_pedidos FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.gravar_relacoes_criacao(p_ficha uuid,d jsonb,c jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 INSERT INTO public.ficha_criacoes(ficha_id,conjunto_regras_codigo,versao_motor,rascunho) VALUES(p_ficha,d->>'ruleSetId',(d->>'engineVersion')::int,d);
 INSERT INTO public.ficha_criacao_classes SELECT p_ficha,(x->>'id')::uuid,(x#>>'{classRef,revisionId}')::uuid,(x#>>'{subclassRef,revisionId}')::uuid,(x->>'level')::int FROM jsonb_array_elements(d->'classes') x;
 INSERT INTO public.ficha_criacao_niveis SELECT p_ficha,(x->>'totalLevel')::int,(x->>'classEntryId')::uuid,x->>'hitPointMethod',(x->>'hitPointRoll')::int FROM jsonb_array_elements(d->'levels') x;
 INSERT INTO public.ficha_criacao_escolhas SELECT p_ficha,x->>'sourceInstanceId',(x->>'groupId')::uuid,x->'values' FROM jsonb_array_elements(d->'choices') x;
 INSERT INTO public.ficha_criacao_concessoes SELECT p_ficha,(x->>'id')::uuid,(x->>'sourceRevisionId')::uuid,x->>'sourceInstanceId',(x->>'grantId')::uuid,x->>'target',x->>'name',(x->>'amount')::numeric FROM jsonb_array_elements(c) x;
END $$;
REVOKE ALL ON FUNCTION private.gravar_relacoes_criacao(uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.registrar_criacao_personagem(p_usuario uuid,p_campanha uuid,p_nome text,p_pedido uuid,p_rascunho jsonb,p_conteudo jsonb,p_concessoes jsonb) RETURNS public.fichas
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE anterior private.criacao_pedidos; f public.fichas; pedido jsonb; x jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.membros_campanha WHERE campanha_id=p_campanha AND usuario_id=p_usuario AND papel IN ('jogador','mestre')) THEN RAISE EXCEPTION 'Acesso indisponível' USING ERRCODE='WF002'; END IF;
 IF p_pedido IS NULL OR p_usuario IS NULL OR p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 1 AND 120 OR NOT private.conteudo_valido(p_conteudo) OR NOT private.snapshot_criacao_valido(p_conteudo->'criacao') OR p_conteudo#>'{criacao,draft}' IS DISTINCT FROM p_rascunho OR p_conteudo#>'{criacao,contributions}' IS DISTINCT FROM p_concessoes THEN RAISE EXCEPTION 'Conteúdo de criação inválido' USING ERRCODE='WF003'; END IF;
 pedido:=jsonb_build_object('campanha',p_campanha,'nome',btrim(p_nome),'rascunho',p_rascunho,'conteudo',p_conteudo,'concessoes',p_concessoes);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_usuario::text||p_pedido::text,0));
 SELECT * INTO anterior FROM private.criacao_pedidos WHERE usuario_id=p_usuario AND pedido_id=p_pedido;
 IF FOUND THEN
  IF anterior.pedido IS DISTINCT FROM pedido THEN RAISE EXCEPTION 'Tentativa já utilizada' USING ERRCODE='WF001'; END IF;
  SELECT * INTO f FROM public.fichas WHERE id=anterior.ficha_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ficha indisponível' USING ERRCODE='WF002'; END IF;
  RETURN f;
 END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_concessoes) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.compendio_revisoes WHERE id=(x->>'sourceRevisionId')::uuid AND estado='publicado' AND conjunto_regras_codigo=p_rascunho->>'ruleSetId') THEN RAISE EXCEPTION 'Referência não publicada' USING ERRCODE='WF003'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rascunho->'classes') selected_class LEFT JOIN public.compendio_revisoes r ON r.id=(selected_class#>>'{classRef,revisionId}')::uuid AND r.registro_id=(selected_class#>>'{classRef,recordId}')::uuid AND r.estado='publicado' WHERE r.id IS NULL) THEN RAISE EXCEPTION 'Classe não publicada' USING ERRCODE='WF003'; END IF;
 INSERT INTO public.fichas(id,campanha_id,proprietario_id,nome,conteudo,versao_esquema) VALUES(p_pedido,p_campanha,p_usuario,p_nome,p_conteudo,1) RETURNING * INTO f;
 PERFORM private.gravar_relacoes_criacao(f.id,p_rascunho,p_concessoes);
 INSERT INTO private.criacao_pedidos VALUES(p_usuario,p_pedido,f.id,pedido);
 RETURN f;
END $$;
REVOKE ALL ON FUNCTION public.registrar_criacao_personagem(uuid,uuid,text,uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_criacao_personagem(uuid,uuid,text,uuid,jsonb,jsonb,jsonb) TO service_role;

CREATE FUNCTION private.validar_historico_criacao() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;
BEGIN
 IF NEW.conteudo ? 'criacao' AND NOT private.snapshot_criacao_valido(NEW.conteudo->'criacao') THEN RAISE EXCEPTION 'Histórico de criação inválido' USING ERRCODE='WF003'; END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(NEW.conteudo->'magias') LOOP
  IF s ? 'compendioRef' AND NOT private.referencia_criacao_valida(s->'compendioRef') THEN RAISE EXCEPTION 'Referência de magia inválida' USING ERRCODE='WF003'; END IF;
 END LOOP;
 IF TG_OP='UPDATE' AND OLD.conteudo->'criacao' IS DISTINCT FROM NEW.conteudo->'criacao' AND EXISTS(SELECT 1 FROM public.ficha_criacoes WHERE ficha_id=OLD.id) THEN RAISE EXCEPTION 'O histórico de criação é imutável; edite os campos da ficha.' USING ERRCODE='WF003'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER weirs_validar_historico_criacao BEFORE INSERT OR UPDATE OF conteudo ON public.fichas FOR EACH ROW EXECUTE FUNCTION private.validar_historico_criacao();
REVOKE ALL ON FUNCTION private.validar_historico_criacao() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.recuperar_criacao_personagem(p_pedido uuid,p_campanha uuid,p_nome text,p_rascunho jsonb,p_previa jsonb) RETURNS public.fichas
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE anterior private.criacao_pedidos; f public.fichas;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Acesso indisponível' USING ERRCODE='WF002'; END IF;
 SELECT * INTO anterior FROM private.criacao_pedidos WHERE usuario_id=auth.uid() AND pedido_id=p_pedido;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF anterior.pedido->>'campanha' IS DISTINCT FROM p_campanha::text OR anterior.pedido->>'nome' IS DISTINCT FROM btrim(p_nome) OR anterior.pedido->'rascunho' IS DISTINCT FROM p_rascunho OR (anterior.pedido->'conteudo')-'criacao' IS DISTINCT FROM p_previa THEN RAISE EXCEPTION 'Tentativa já utilizada' USING ERRCODE='WF001'; END IF;
 SELECT * INTO f FROM public.fichas WHERE id=anterior.ficha_id;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.membros_campanha WHERE campanha_id=f.campanha_id AND usuario_id=auth.uid() AND papel IN ('jogador','mestre')) THEN RAISE EXCEPTION 'Acesso indisponível' USING ERRCODE='WF002'; END IF;
 RETURN f;
END $$;
REVOKE ALL ON FUNCTION public.recuperar_criacao_personagem(uuid,uuid,text,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.recuperar_criacao_personagem(uuid,uuid,text,jsonb,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.copiar_ficha_campanha(p_origem uuid,p_versao integer,p_campanha uuid,p_pedido uuid)
RETURNS public.fichas LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE origem public.fichas; copia public.fichas; recibo private.copias_ficha;
BEGIN
  PERFORM 1 FROM public.administradores WHERE usuario_id=auth.uid() FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Acesso indisponível' USING ERRCODE='WF002'; END IF;
  IF p_pedido IS NULL OR p_versao IS NULL THEN RAISE EXCEPTION 'Tentativa inválida' USING ERRCODE='WF003'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_pedido::text,0));
  SELECT * INTO recibo FROM private.copias_ficha WHERE usuario_id=auth.uid() AND pedido_id=p_pedido;
  IF FOUND THEN
    IF recibo.origem_id IS DISTINCT FROM p_origem OR recibo.destino_id IS DISTINCT FROM p_campanha THEN
      RAISE EXCEPTION 'Tentativa já utilizada' USING ERRCODE='WF003';
    END IF;
    IF recibo.versao_origem IS DISTINCT FROM p_versao THEN RAISE EXCEPTION 'Conflito de edição' USING ERRCODE='WF001'; END IF;
    SELECT * INTO copia FROM public.fichas WHERE id=recibo.ficha_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cópia indisponível' USING ERRCODE='WF002'; END IF;
    RETURN copia;
  END IF;
  SELECT * INTO origem FROM public.fichas WHERE id=p_origem FOR SHARE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.campanhas WHERE id=p_campanha) THEN
    RAISE EXCEPTION 'Acesso indisponível' USING ERRCODE='WF002';
  END IF;
  IF origem.campanha_id=p_campanha THEN RAISE EXCEPTION 'Selecione outra campanha' USING ERRCODE='WF003'; END IF;
  IF origem.versao<>p_versao THEN RAISE EXCEPTION 'Conflito de edição' USING ERRCODE='WF001'; END IF;
  INSERT INTO public.membros_campanha(campanha_id,usuario_id,papel)
    VALUES(p_campanha,origem.proprietario_id,'jogador') ON CONFLICT(campanha_id,usuario_id) DO NOTHING;
  INSERT INTO public.fichas(campanha_id,proprietario_id,nome,conteudo,versao_esquema)
    VALUES(p_campanha,origem.proprietario_id,origem.nome,origem.conteudo,origem.versao_esquema) RETURNING * INTO copia;
  IF EXISTS(SELECT 1 FROM public.ficha_criacoes WHERE ficha_id=origem.id AND validada_servidor) THEN
    PERFORM private.gravar_relacoes_criacao(copia.id,origem.conteudo#>'{criacao,draft}',origem.conteudo#>'{criacao,contributions}');
  END IF;
  INSERT INTO private.copias_ficha VALUES(auth.uid(),p_pedido,p_origem,p_versao,p_campanha,copia.id);
  RETURN copia;
END $$;
COMMIT;




