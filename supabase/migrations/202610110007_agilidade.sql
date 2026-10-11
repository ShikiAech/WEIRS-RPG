BEGIN;

ALTER TABLE public.cenas_mapa
 ADD COLUMN fundo_x numeric NOT NULL DEFAULT 0 CHECK(fundo_x BETWEEN -100 AND 100),
 ADD COLUMN fundo_y numeric NOT NULL DEFAULT 0 CHECK(fundo_y BETWEEN -100 AND 100),
 ADD COLUMN fundo_escala numeric NOT NULL DEFAULT 1 CHECK(fundo_escala BETWEEN 0.1 AND 10);
CREATE FUNCTION private.aura_mapa_valida(v jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF v IS NULL OR v='null'::jsonb THEN RETURN true; END IF;
 IF jsonb_typeof(v)<>'object' OR (v-ARRAY['raio','cor'])<>'{}'::jsonb
  OR jsonb_typeof(v->'raio') IS DISTINCT FROM 'number' OR jsonb_typeof(v->'cor') IS DISTINCT FROM 'string'
  OR coalesce(v->>'cor','') !~ '^#[0-9a-fA-F]{6}$' THEN RETURN false; END IF;
 RETURN (v->>'raio')::numeric BETWEEN 0.25 AND 20;
END $$;
ALTER TABLE public.tokens_mapa ADD COLUMN aura jsonb DEFAULT NULL CHECK(private.aura_mapa_valida(aura));

CREATE TABLE public.areas_mapa (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 campanha_id uuid NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
 cena_id uuid NOT NULL REFERENCES public.cenas_mapa(id) ON DELETE CASCADE,
 usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 token_id uuid REFERENCES public.tokens_mapa(id) ON DELETE CASCADE,
 versao integer NOT NULL DEFAULT 1 CHECK(versao>=1),
 nome text NOT NULL CHECK(length(btrim(nome)) BETWEEN 1 AND 120),
 forma text NOT NULL CHECK(forma IN ('circulo','cone','quadrado','linha')),
 x numeric NOT NULL CHECK(x BETWEEN 0 AND 100),
 y numeric NOT NULL CHECK(y BETWEEN 0 AND 100),
 tamanho numeric NOT NULL CHECK(tamanho BETWEEN 0.25 AND 100),
 largura numeric NOT NULL DEFAULT 1 CHECK(largura BETWEEN 0.1 AND 20),
 angulo numeric NOT NULL DEFAULT 0 CHECK(angulo BETWEEN -360 AND 360),
 cor text NOT NULL DEFAULT '#ff6633' CHECK(cor ~ '^#[0-9a-fA-F]{6}$')
);
CREATE INDEX areas_cena ON public.areas_mapa(cena_id);
ALTER TABLE public.areas_mapa ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.areas_mapa FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.areas_mapa TO authenticated;
CREATE FUNCTION private.area_mapa_visivel(a public.areas_mapa) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.cena_visivel(a.cena_id,a.campanha_id) AND (
  private.papel_na_campanha(a.campanha_id)='mestre' OR a.token_id IS NULL OR
  EXISTS(SELECT 1 FROM public.tokens_mapa t WHERE t.id=a.token_id AND t.cena_id=a.cena_id AND t.campanha_id=a.campanha_id AND NOT t.oculto))
$$;
CREATE POLICY areas_leitura ON public.areas_mapa FOR SELECT TO authenticated USING(private.area_mapa_visivel(areas_mapa));
CREATE FUNCTION private.controla_area_mapa(a public.areas_mapa) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.area_mapa_visivel(a) AND (a.usuario_id=auth.uid() OR
  EXISTS(SELECT 1 FROM public.tokens_mapa t WHERE t.id=a.token_id AND t.cena_id=a.cena_id AND t.campanha_id=a.campanha_id AND private.controla_token_mapa(t)))
$$;
CREATE FUNCTION private.validar_area_mapa(a public.areas_mapa,c public.cenas_mapa) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF a.campanha_id<>c.campanha_id OR a.cena_id<>c.id OR a.x>c.largura OR a.y>c.altura THEN
  RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Área fora do mapa.';
 END IF;
 IF a.token_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tokens_mapa t WHERE t.id=a.token_id AND t.cena_id=a.cena_id AND t.campanha_id=a.campanha_id) THEN
  RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Token da área indisponível.';
 END IF;
END $$;
REVOKE ALL ON FUNCTION private.aura_mapa_valida(jsonb),private.area_mapa_visivel(public.areas_mapa),private.controla_area_mapa(public.areas_mapa),private.validar_area_mapa(public.areas_mapa,public.cenas_mapa) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.area_mapa_visivel(public.areas_mapa) TO authenticated;

CREATE OR REPLACE FUNCTION public.operar_mapa(p_campanha uuid,p_pedido uuid,p_comando jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 u uuid:=auth.uid(); papel text; tipo text:=p_comando->>'tipo'; v_id uuid; patch jsonb;
 c public.cenas_mapa; t public.tokens_mapa; a public.arquivos_mapa; r private.operacoes_mapa;
 resposta jsonb; meta jsonb; n numeric; k text;
 area public.areas_mapa; item jsonb; child jsonb; child_response jsonb; resultados jsonb:='[]'; excluidos jsonb:='[]';
 ids uuid[]:='{}'; i integer:=0; dx numeric; dy numeric; token_anterior uuid;
BEGIN
 SELECT m.papel INTO papel FROM public.membros_campanha m WHERE m.campanha_id=p_campanha AND m.usuario_id=u FOR SHARE;
 IF u IS NULL OR papel IS NULL OR papel='espectador' THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Sem permissão para alterar a mesa.'; END IF;
 IF p_pedido IS NULL OR jsonb_typeof(p_comando) IS DISTINCT FROM 'object' OR octet_length(p_comando::text)>131072
  OR tipo NOT IN ('cena_criar','cena_atualizar','cena_ativar','cena_excluir','token_criar','token_atualizar','token_excluir','tokens_lote','tokens_duplicar','area_criar','area_atualizar','area_excluir','arquivo_registrar','arquivo_finalizar','arquivo_preparar_exclusao','arquivo_excluir')
  OR tipo IS NULL THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Operação inválida.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text||p_pedido::text,0));
 -- Campaign serialization also keeps ownership checks consistent with receipt delivery.
 PERFORM 1 FROM public.campanhas WHERE id=p_campanha FOR UPDATE;
 SELECT * INTO r FROM private.operacoes_mapa WHERE usuario_id=u AND pedido_id=p_pedido;
 IF FOUND THEN
  IF r.campanha_id<>p_campanha OR r.comando<>p_comando THEN RAISE EXCEPTION USING ERRCODE='WV004',MESSAGE='Tentativa já usada.'; END IF;
  IF r.mestre AND papel<>'mestre' THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Permissão de mestre encerrada.'; END IF;
 END IF;
 IF tipo LIKE 'cena_%' OR tipo IN ('token_criar','token_excluir','tokens_lote','tokens_duplicar') THEN
  IF papel<>'mestre' THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Somente o mestre administra cenas e tokens.'; END IF;
 END IF;
 IF tipo NOT IN ('cena_criar','token_criar','tokens_lote','tokens_duplicar','area_criar') THEN v_id:=(p_comando->>'id')::uuid; END IF;
 IF tipo='token_atualizar' THEN
  SELECT * INTO t FROM public.tokens_mapa WHERE tokens_mapa.id=v_id AND campanha_id=p_campanha FOR UPDATE;
  IF NOT FOUND OR (papel<>'mestre' AND NOT coalesce(private.controla_token_mapa(t),false)) THEN
   RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Este token não pode ser movimentado por você.';
  END IF;
  IF papel<>'mestre' AND ((p_comando->'patch')-ARRAY['x','y','rotacao'])<>'{}'::jsonb THEN
   RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Você pode apenas movimentar o seu token.';
  END IF;
 END IF;
 IF tipo IN ('area_atualizar','area_excluir') THEN
  SELECT * INTO area FROM public.areas_mapa WHERE id=v_id AND campanha_id=p_campanha FOR UPDATE;
  IF NOT FOUND AND tipo='area_excluir' AND r.pedido_id IS NOT NULL THEN RETURN r.resposta; END IF;
  IF NOT FOUND OR (papel<>'mestre' AND NOT coalesce(private.controla_area_mapa(area),false)) THEN
   RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Esta área não pode ser alterada por você.';
  END IF;
 END IF;
 IF tipo='area_criar' THEN
  SELECT * INTO c FROM public.cenas_mapa WHERE id=(p_comando->>'cena_id')::uuid AND campanha_id=p_campanha;
  IF NOT FOUND OR (papel<>'mestre' AND NOT c.publicada) THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Cena indisponível.'; END IF;
  IF papel<>'mestre' AND p_comando->>'token_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tokens_mapa token
   WHERE token.id=(p_comando->>'token_id')::uuid AND token.cena_id=c.id AND token.campanha_id=p_campanha AND private.controla_token_mapa(token)) THEN
   RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Você não controla o token desta área.';
  END IF;
 END IF;
 IF tipo IN ('arquivo_finalizar','arquivo_preparar_exclusao','arquivo_excluir') THEN
  SELECT * INTO a FROM public.arquivos_mapa WHERE arquivos_mapa.id=v_id AND campanha_id=p_campanha FOR UPDATE;
  IF NOT FOUND AND tipo='arquivo_excluir' AND r.pedido_id IS NOT NULL THEN RETURN r.resposta; END IF;
  IF NOT FOUND OR (papel<>'mestre' AND (a.usuario_id<>u OR a.visibilidade='mestre')) THEN
   RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Arquivo indisponível.';
  END IF;
 END IF;
 IF tipo='arquivo_registrar' AND p_comando->>'visibilidade'='mestre' AND papel<>'mestre' THEN
  RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Somente mestres podem guardar arquivos privados.';
 END IF;
 IF r.pedido_id IS NOT NULL THEN RETURN r.resposta; END IF;
 IF (SELECT count(*) FROM private.operacoes_mapa WHERE usuario_id=u AND campanha_id=p_campanha AND criado_em>clock_timestamp()-interval '10 seconds')>=120 THEN
  RAISE EXCEPTION USING ERRCODE='WV006',MESSAGE='Muitas alterações. Aguarde alguns segundos.';
 END IF;
 IF tipo IN ('tokens_lote','tokens_duplicar') THEN
  IF (tipo='tokens_lote' AND ((p_comando-ARRAY['tipo','cena_id','itens'])<>'{}'::jsonb OR jsonb_typeof(p_comando->'itens') IS DISTINCT FROM 'array'))
   OR (tipo='tokens_duplicar' AND ((p_comando-ARRAY['tipo','cena_id','tokens','dx','dy'])<>'{}'::jsonb OR jsonb_typeof(p_comando->'tokens') IS DISTINCT FROM 'array')) THEN
   RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Lote inválido.';
  END IF;
  meta:=CASE WHEN tipo='tokens_lote' THEN p_comando->'itens' ELSE p_comando->'tokens' END;
  IF jsonb_array_length(meta) NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Selecione entre 1 e 40 tokens.'; END IF;
  SELECT * INTO c FROM public.cenas_mapa WHERE id=(p_comando->>'cena_id')::uuid AND campanha_id=p_campanha FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Cena indisponível.'; END IF;
  IF tipo='tokens_duplicar' THEN
   dx:=private.numero_mapa(p_comando->'dx',-100,100); dy:=private.numero_mapa(p_comando->'dy',-100,100);
   IF (SELECT count(*) FROM public.tokens_mapa WHERE cena_id=c.id)+jsonb_array_length(meta)>200 THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Limite de tokens atingido.'; END IF;
  END IF;
  -- Validate the entire selection before applying its first member.
  FOR item IN SELECT value FROM jsonb_array_elements(meta) LOOP
   IF jsonb_typeof(item)<>'object' OR item->>'id' IS NULL OR (item->>'id')::uuid=ANY(ids) THEN
    RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Lote com token repetido ou inválido.';
   END IF;
   IF (tipo='tokens_lote' AND (item->>'tipo' NOT IN ('token_atualizar','token_excluir') OR item->>'tipo' IS NULL))
    OR (tipo='tokens_duplicar' AND (item-ARRAY['id','versao'])<>'{}'::jsonb) THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Operação de lote inválida.'; END IF;
   ids:=array_append(ids,(item->>'id')::uuid);
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(meta) LOOP
   SELECT * INTO t FROM public.tokens_mapa WHERE id=(item->>'id')::uuid AND cena_id=c.id AND campanha_id=p_campanha FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Token indisponível nesta cena.'; END IF;
   IF tipo='tokens_duplicar' THEN
    IF private.numero_mapa(item->'versao',1,2147483647)<>t.versao THEN RAISE EXCEPTION USING ERRCODE='WV001',MESSAGE='O token foi alterado.'; END IF;
    child:=(to_jsonb(t)-ARRAY['id','campanha_id','versao','combate_id'])||jsonb_build_object('tipo','token_criar','x',t.x+dx,'y',t.y+dy,'combate_id',NULL);
   ELSE child:=item;
   END IF;
   i:=i+1;
   -- Child receipts and the outer receipt commit together; an invalid later item rolls all back.
   child_response:=public.operar_mapa(p_campanha,md5(p_pedido::text||':token-lote:'||i::text)::uuid,child);
   IF child_response ? 'token' THEN resultados:=resultados||jsonb_build_array(child_response->'token'); END IF;
   IF child_response ? 'excluido' THEN excluidos:=excluidos||jsonb_build_array(child_response->'excluido'); END IF;
  END LOOP;
  resposta:=jsonb_build_object('tokens',resultados,'excluidos',excluidos);
 ELSIF tipo='cena_criar' THEN
  IF (p_comando-ARRAY['tipo','nome','largura','altura','unidade','grade','publicada','fundo_id'])<>'{}'::jsonb OR jsonb_typeof(p_comando->'nome') IS DISTINCT FROM 'string'
   OR (SELECT count(*) FROM public.cenas_mapa WHERE campanha_id=p_campanha)>=30 THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Cena inválida ou limite de cenas atingido.'; END IF;
  n:=private.numero_mapa(p_comando->'largura',4,100); IF n<>trunc(n) THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Use células inteiras.'; END IF;
  c.largura:=n;
  n:=private.numero_mapa(p_comando->'altura',4,100); IF n<>trunc(n) THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Use células inteiras.'; END IF;
  c.altura:=n;
  IF (p_comando ? 'grade' AND jsonb_typeof(p_comando->'grade')<>'boolean')
   OR (p_comando ? 'publicada' AND jsonb_typeof(p_comando->'publicada')<>'boolean') THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Configuração inválida.'; END IF;
  INSERT INTO public.cenas_mapa(campanha_id,nome,largura,altura,unidade,grade,publicada,fundo_id,ativa)
   VALUES(p_campanha,btrim(p_comando->>'nome'),c.largura,c.altura,private.numero_mapa(coalesce(p_comando->'unidade','5'),0.01,1000),
    coalesce((p_comando->>'grade')::boolean,true),coalesce((p_comando->>'publicada')::boolean,false),(p_comando->>'fundo_id')::uuid,
    coalesce((p_comando->>'publicada')::boolean,false) AND NOT EXISTS(SELECT 1 FROM public.cenas_mapa WHERE campanha_id=p_campanha AND ativa)) RETURNING * INTO c;
  IF c.fundo_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.arquivos_mapa arquivo WHERE arquivo.id=c.fundo_id AND arquivo.campanha_id=p_campanha
   AND arquivo.estado='pronto' AND arquivo.mime LIKE 'image/%' AND (arquivo.visibilidade='campanha' OR NOT c.publicada)) THEN
   RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Fundo indisponível para os jogadores.';
  END IF;
  resposta:=jsonb_build_object('cena',to_jsonb(c));
 ELSIF tipo IN ('cena_atualizar','cena_ativar','cena_excluir') THEN
  IF (p_comando-ARRAY['tipo','id','versao','patch'])<>'{}'::jsonb THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Campos inválidos.'; END IF;
  SELECT * INTO c FROM public.cenas_mapa WHERE cenas_mapa.id=v_id AND campanha_id=p_campanha FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Cena indisponível.'; END IF;
  IF private.numero_mapa(p_comando->'versao',1,2147483647)<>c.versao THEN RAISE EXCEPTION USING ERRCODE='WV001',MESSAGE='A cena foi alterada.'; END IF;
  IF tipo='cena_excluir' THEN
   DELETE FROM public.cenas_mapa WHERE cenas_mapa.id=v_id; resposta:=jsonb_build_object('excluido',v_id);
  ELSE
   IF tipo='cena_ativar' THEN
    c.ativa:=true; c.publicada:=true;
   ELSE
    patch:=p_comando->'patch';
    IF jsonb_typeof(patch) IS DISTINCT FROM 'object' OR (patch-ARRAY['nome','largura','altura','unidade','grade','publicada','fundo_id','fundo_x','fundo_y','fundo_escala','nevoa','revelacoes','desenhos'])<>'{}'::jsonb THEN
     RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Campos de cena inválidos.';
    END IF;
    FOR k IN SELECT jsonb_object_keys(patch) LOOP
     IF k IN ('largura','altura') THEN
      n:=private.numero_mapa(patch->k,4,100); IF n<>trunc(n) THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Use células inteiras.'; END IF;
     ELSIF k='unidade' THEN PERFORM private.numero_mapa(patch->k,0.01,1000);
     ELSIF k IN ('fundo_x','fundo_y') THEN PERFORM private.numero_mapa(patch->k,-100,100);
     ELSIF k='fundo_escala' THEN PERFORM private.numero_mapa(patch->k,0.1,10);
     ELSIF k IN ('grade','publicada','nevoa') AND jsonb_typeof(patch->k)<>'boolean' THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Configuração inválida.';
     ELSIF k='nome' AND jsonb_typeof(patch->k)<>'string' THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Nome inválido.';
     END IF;
    END LOOP;
    c:=jsonb_populate_record(c,patch);
    IF NOT c.publicada THEN c.ativa:=false; END IF;
   END IF;
   IF c.fundo_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.arquivos_mapa arquivo WHERE arquivo.id=c.fundo_id AND arquivo.campanha_id=p_campanha
    AND arquivo.estado='pronto' AND arquivo.mime LIKE 'image/%' AND (arquivo.visibilidade='campanha' OR NOT c.publicada)) THEN
    RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Fundo indisponível para os jogadores.';
   END IF;
   PERFORM private.validar_geometria_mapa(c);
   FOR t IN SELECT * FROM public.tokens_mapa WHERE cena_id=c.id LOOP PERFORM private.validar_token_mapa(t,c); END LOOP;
   FOR area IN SELECT * FROM public.areas_mapa WHERE cena_id=c.id LOOP PERFORM private.validar_area_mapa(area,c); END LOOP;
   IF c.ativa THEN UPDATE public.cenas_mapa SET ativa=false,versao=versao+1 WHERE campanha_id=p_campanha AND ativa AND cenas_mapa.id<>c.id; END IF;
   UPDATE public.cenas_mapa SET nome=btrim(c.nome),largura=c.largura,altura=c.altura,unidade=c.unidade,grade=c.grade,publicada=c.publicada,
    ativa=c.ativa,fundo_id=c.fundo_id,fundo_x=c.fundo_x,fundo_y=c.fundo_y,fundo_escala=c.fundo_escala,nevoa=c.nevoa,revelacoes=c.revelacoes,desenhos=c.desenhos,versao=versao+1 WHERE cenas_mapa.id=c.id RETURNING * INTO c;
   resposta:=jsonb_build_object('cena',to_jsonb(c));
  END IF;
 ELSIF tipo IN ('token_criar','token_atualizar','token_excluir') THEN
  IF tipo='token_criar' THEN
   IF (p_comando-ARRAY['tipo','cena_id','nome','x','y','tamanho','cor','rotacao','oculto','bloqueado','ficha_id','controlador_id','imagem_id','combate_id','aura'])<>'{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Campos de token inválidos.';
   END IF;
   t.id:=gen_random_uuid(); t.campanha_id:=p_campanha; t.cena_id:=(p_comando->>'cena_id')::uuid; t.versao:=1;
   t.rotacao:=0; t.oculto:=false; t.bloqueado:=false; t.tamanho:=1; t.cor:='#d4af37';
   patch:=p_comando-ARRAY['tipo','cena_id'];
   IF (SELECT count(*) FROM public.tokens_mapa WHERE cena_id=t.cena_id)>=200 THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Limite de tokens atingido.'; END IF;
  ELSE
   IF (p_comando-ARRAY['tipo','id','versao','patch'])<>'{}'::jsonb THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Campos inválidos.'; END IF;
   SELECT * INTO t FROM public.tokens_mapa WHERE tokens_mapa.id=v_id AND campanha_id=p_campanha FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Token indisponível.'; END IF;
   IF private.numero_mapa(p_comando->'versao',1,2147483647)<>t.versao THEN RAISE EXCEPTION USING ERRCODE='WV001',MESSAGE='O token foi alterado.'; END IF;
   patch:=p_comando->'patch';
  END IF;
  IF tipo='token_excluir' THEN
   DELETE FROM public.tokens_mapa WHERE tokens_mapa.id=t.id; resposta:=jsonb_build_object('excluido',t.id);
  ELSE
   IF jsonb_typeof(patch) IS DISTINCT FROM 'object' OR (patch-ARRAY['nome','x','y','tamanho','cor','rotacao','oculto','bloqueado','ficha_id','controlador_id','imagem_id','combate_id','aura'])<>'{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Campos de token inválidos.';
   END IF;
   FOR k IN SELECT jsonb_object_keys(patch) LOOP
    IF k IN ('x','y') THEN PERFORM private.numero_mapa(patch->k,0,100);
    ELSIF k='tamanho' THEN PERFORM private.numero_mapa(patch->k,0.25,10);
    ELSIF k='rotacao' THEN PERFORM private.numero_mapa(patch->k,-360,360);
    ELSIF k='aura' AND NOT private.aura_mapa_valida(patch->k) THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Aura inválida.';
    ELSIF k IN ('oculto','bloqueado') AND jsonb_typeof(patch->k)<>'boolean' THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Configuração inválida.';
    ELSIF k IN ('nome','cor') AND jsonb_typeof(patch->k)<>'string' THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Texto inválido.';
    END IF;
   END LOOP;
   t:=jsonb_populate_record(t,patch);
   SELECT * INTO c FROM public.cenas_mapa WHERE cenas_mapa.id=t.cena_id AND campanha_id=p_campanha;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Cena indisponível.'; END IF;
   PERFORM private.validar_token_mapa(t,c);
   IF tipo='token_criar' THEN
    INSERT INTO public.tokens_mapa SELECT t.* RETURNING * INTO t;
   ELSE
    UPDATE public.tokens_mapa SET nome=btrim(t.nome),x=t.x,y=t.y,tamanho=t.tamanho,cor=t.cor,rotacao=t.rotacao,oculto=t.oculto,bloqueado=t.bloqueado,
     ficha_id=t.ficha_id,controlador_id=t.controlador_id,imagem_id=t.imagem_id,combate_id=t.combate_id,aura=t.aura,versao=versao+1 WHERE tokens_mapa.id=t.id RETURNING * INTO t;
   END IF;
   resposta:=jsonb_build_object('token',to_jsonb(t));
  END IF;
 ELSIF tipo IN ('area_criar','area_atualizar','area_excluir') THEN
  IF tipo='area_criar' THEN
   IF (p_comando-ARRAY['tipo','cena_id','token_id','nome','forma','x','y','tamanho','largura','angulo','cor'])<>'{}'::jsonb THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Campos de área inválidos.'; END IF;
   IF (SELECT count(*) FROM public.areas_mapa WHERE cena_id=c.id)>=100 THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Limite de 100 áreas atingido.'; END IF;
   area.id:=gen_random_uuid(); area.campanha_id:=p_campanha; area.cena_id:=c.id; area.usuario_id:=u;
   area.versao:=1; area.largura:=1; area.angulo:=0; area.cor:='#ff6633';
   patch:=p_comando-ARRAY['tipo','cena_id'];
  ELSE
   IF (p_comando-ARRAY['tipo','id','versao','patch'])<>'{}'::jsonb THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Campos inválidos.'; END IF;
   IF private.numero_mapa(p_comando->'versao',1,2147483647)<>area.versao THEN RAISE EXCEPTION USING ERRCODE='WV001',MESSAGE='A área foi alterada.'; END IF;
   SELECT * INTO c FROM public.cenas_mapa WHERE id=area.cena_id AND campanha_id=p_campanha;
   patch:=p_comando->'patch';
  END IF;
  IF tipo='area_excluir' THEN
   DELETE FROM public.areas_mapa WHERE id=area.id;
   resposta:=jsonb_build_object('excluido',area.id);
  ELSE
   IF jsonb_typeof(patch) IS DISTINCT FROM 'object' OR (patch-ARRAY['token_id','nome','forma','x','y','tamanho','largura','angulo','cor'])<>'{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Campos de área inválidos.';
   END IF;
   FOR k IN SELECT jsonb_object_keys(patch) LOOP
    IF k IN ('x','y') THEN PERFORM private.numero_mapa(patch->k,0,100);
    ELSIF k='tamanho' THEN PERFORM private.numero_mapa(patch->k,0.25,100);
    ELSIF k='largura' THEN PERFORM private.numero_mapa(patch->k,0.1,20);
    ELSIF k='angulo' THEN PERFORM private.numero_mapa(patch->k,-360,360);
    ELSIF k IN ('nome','forma','cor') AND jsonb_typeof(patch->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Texto inválido.';
    END IF;
   END LOOP;
   token_anterior:=area.token_id;
   area:=jsonb_populate_record(area,patch);
   PERFORM private.validar_area_mapa(area,c);
   IF papel<>'mestre' AND area.token_id IS NOT NULL AND (tipo='area_criar' OR area.token_id IS DISTINCT FROM token_anterior)
    AND NOT EXISTS(SELECT 1 FROM public.tokens_mapa token
    WHERE token.id=area.token_id AND token.cena_id=c.id AND token.campanha_id=p_campanha AND private.controla_token_mapa(token)) THEN
    RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Você não controla o token desta área.';
   END IF;
   IF tipo='area_criar' THEN INSERT INTO public.areas_mapa SELECT area.* RETURNING * INTO area;
   ELSE UPDATE public.areas_mapa SET nome=btrim(area.nome),forma=area.forma,x=area.x,y=area.y,tamanho=area.tamanho,
    largura=area.largura,angulo=area.angulo,cor=area.cor,token_id=area.token_id,versao=versao+1 WHERE id=area.id RETURNING * INTO area;
   END IF;
   resposta:=jsonb_build_object('area',to_jsonb(area));
  END IF;
 ELSIF tipo='arquivo_registrar' THEN
  IF (p_comando-ARRAY['tipo','id','nome','mime','tamanho','visibilidade'])<>'{}'::jsonb OR jsonb_typeof(p_comando->'nome') IS DISTINCT FROM 'string'
   OR jsonb_typeof(p_comando->'mime') IS DISTINCT FROM 'string' OR jsonb_typeof(p_comando->'visibilidade') IS DISTINCT FROM 'string'
   OR p_comando->>'visibilidade' NOT IN ('campanha','mestre') OR p_comando->>'mime' NOT IN ('image/png','image/jpeg','image/webp','application/pdf') THEN
   RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Arquivo inválido.';
  END IF;
  n:=private.numero_mapa(p_comando->'tamanho',1,5242880);
  IF n<>trunc(n) OR (SELECT coalesce(sum(tamanho),0) FROM public.arquivos_mapa WHERE campanha_id=p_campanha)+n>104857600
   OR (SELECT count(*) FROM public.arquivos_mapa WHERE campanha_id=p_campanha)>=100 THEN
   RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Limite de 100 MB ou 100 arquivos atingido nesta campanha.';
  END IF;
  INSERT INTO public.arquivos_mapa(id,campanha_id,usuario_id,nome,caminho,mime,tamanho,visibilidade)
   VALUES(v_id,p_campanha,u,btrim(p_comando->>'nome'),p_campanha::text||'/'||v_id::text,p_comando->>'mime',n,p_comando->>'visibilidade') RETURNING * INTO a;
  resposta:=jsonb_build_object('asset',to_jsonb(a));
 ELSIF tipo='arquivo_finalizar' THEN
  IF (p_comando-ARRAY['tipo','id'])<>'{}'::jsonb THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Campos inválidos.'; END IF;
  IF a.estado='excluindo' THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='A exclusão deste arquivo já foi iniciada.'; END IF;
  SELECT metadata INTO meta FROM storage.objects WHERE bucket_id='weirs-mesa' AND name=a.caminho;
  IF NOT FOUND OR meta->>'mimetype' IS DISTINCT FROM a.mime OR private.numero_mapa(meta->'size',1,5242880)<>a.tamanho THEN
   RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Upload ausente ou diferente do arquivo reservado.';
  END IF;
  UPDATE public.arquivos_mapa SET estado='pronto' WHERE arquivos_mapa.id=a.id RETURNING * INTO a;
  resposta:=jsonb_build_object('asset',to_jsonb(a));
 ELSIF tipo='arquivo_preparar_exclusao' THEN
  IF (p_comando-ARRAY['tipo','id'])<>'{}'::jsonb
   OR EXISTS(SELECT 1 FROM public.cenas_mapa WHERE fundo_id=a.id) OR EXISTS(SELECT 1 FROM public.tokens_mapa WHERE imagem_id=a.id) THEN
   RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Remova os vínculos do arquivo antes de excluí-lo.';
  END IF;
  -- The campaign lock excludes concurrent link creation. Once tombstoned,
  -- every map binding and upload/finalization path rejects this asset.
  UPDATE public.arquivos_mapa SET estado='excluindo' WHERE arquivos_mapa.id=a.id RETURNING * INTO a;
  resposta:=jsonb_build_object('asset',to_jsonb(a));
 ELSIF tipo='arquivo_excluir' THEN
  IF a.estado<>'excluindo' OR (p_comando-ARRAY['tipo','id'])<>'{}'::jsonb
   OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='weirs-mesa' AND name=a.caminho)
   OR EXISTS(SELECT 1 FROM public.cenas_mapa WHERE fundo_id=a.id) OR EXISTS(SELECT 1 FROM public.tokens_mapa WHERE imagem_id=a.id) THEN
   RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Remova os vínculos e o objeto antes de excluir o registro.';
  END IF;
  DELETE FROM public.arquivos_mapa WHERE arquivos_mapa.id=a.id; resposta:=jsonb_build_object('excluido',a.id);
 END IF;
 INSERT INTO private.operacoes_mapa(usuario_id,pedido_id,campanha_id,comando,resposta,mestre) VALUES(u,p_pedido,p_campanha,p_comando,resposta,papel='mestre');
 RETURN resposta;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR not_null_violation OR check_violation OR foreign_key_violation OR unique_violation THEN
 RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Confira os dados e os limites do mapa.';
END $$;

REVOKE ALL ON FUNCTION public.operar_mapa(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.operar_mapa(uuid,uuid,jsonb) TO authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.areas_mapa;
 END IF;
END $$;
COMMIT;
