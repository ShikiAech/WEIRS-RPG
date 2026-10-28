BEGIN;
-- Detached effects expose world geometry only, never their former source's
-- offsets or rotation. Normalize every write, including RPC RETURNING rows.
CREATE FUNCTION private.normalizar_ancora_area_mapa() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.token_id IS NULL THEN
  NEW.ancora_dx:=NULL; NEW.ancora_dy:=NULL;
  NEW.ancora_rotacao:=0; NEW.ancora_angulo:=0; NEW.acompanhar_rotacao:=false;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.normalizar_ancora_area_mapa() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER normalizar_ancora_area BEFORE INSERT OR UPDATE ON public.areas_mapa
 FOR EACH ROW EXECUTE FUNCTION private.normalizar_ancora_area_mapa();
-- Existing detached rows pass through the same invariant; geometry is untouched.
UPDATE public.areas_mapa SET versao=versao+1 WHERE token_id IS NULL AND
 (ancora_dx IS NOT NULL OR ancora_dy IS NOT NULL OR ancora_rotacao<>0 OR ancora_angulo<>0 OR acompanhar_rotacao);
ALTER TABLE private.operacoes_mapa ADD COLUMN cena_id uuid, ADD COLUMN camada_id uuid, ADD COLUMN exclusao_legada boolean NOT NULL DEFAULT false;
-- Backfill old deletion receipts from historical full entity receipts, without
-- exposing their payloads. Seeded layer identity is immutable, unlike its name.
UPDATE private.operacoes_mapa deletion SET exclusao_legada=true
 WHERE deletion.comando->>'tipo' IN ('token_excluir','area_excluir');
WITH recovered AS (
 SELECT DISTINCT ON (deletion.usuario_id,deletion.pedido_id)
 deletion.usuario_id,deletion.pedido_id,(entity.value->>'cena_id')::uuid cena_id
 FROM private.operacoes_mapa deletion
 JOIN private.operacoes_mapa history ON history.campanha_id=deletion.campanha_id
 CROSS JOIN LATERAL jsonb_each(history.resposta) entity
 WHERE deletion.exclusao_legada AND entity.key IN ('token','area')
 AND entity.value->>'id'=deletion.comando->>'id'
 AND entity.value->>'cena_id' IS NOT NULL
 ORDER BY deletion.usuario_id,deletion.pedido_id,history.criado_em DESC
)
UPDATE private.operacoes_mapa receipt SET cena_id=recovered.cena_id,
 camada_id=(SELECT id FROM public.camadas_mapa WHERE cena_id=recovered.cena_id AND finalidade='jogadores')
 FROM recovered WHERE receipt.usuario_id=recovered.usuario_id AND receipt.pedido_id=recovered.pedido_id;
CREATE FUNCTION private.recibo_exclusao_mapa(r private.operacoes_mapa) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT r.usuario_id=auth.uid() AND private.papel_na_campanha(r.campanha_id) IN ('mestre','jogador')
 AND (NOT r.mestre OR private.papel_na_campanha(r.campanha_id)='mestre')
 AND r.comando->>'tipo' IN ('token_excluir','area_excluir')
 AND r.resposta=jsonb_build_object('excluido',r.comando->>'id')
 AND (private.papel_na_campanha(r.campanha_id)='mestre'
 OR (r.cena_id IS NOT NULL AND private.cena_visivel(r.cena_id,r.campanha_id) AND private.camada_visivel(r.camada_id,r.cena_id))
 -- An unrecoverable pre-upgrade receipt can reveal only the deleted ID already
 -- present in this actor's exact request. No entity, asset or historical row is replayed.
 OR (r.exclusao_legada AND r.cena_id IS NULL AND r.camada_id IS NULL))
$$;
REVOKE ALL ON FUNCTION private.recibo_exclusao_mapa(private.operacoes_mapa) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.operar_mapa_base(p_campanha uuid,p_pedido uuid,p_comando jsonb) RETURNS jsonb
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
 IF tipo LIKE 'cena_%' OR tipo='tokens_duplicar' THEN
  IF papel<>'mestre' THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Somente o mestre administra cenas e tokens.'; END IF;
 END IF;
 IF tipo NOT IN ('cena_criar','token_criar','tokens_lote','tokens_duplicar','area_criar') THEN v_id:=(p_comando->>'id')::uuid; END IF;
 IF tipo IN ('token_atualizar','token_excluir') THEN
  SELECT * INTO t FROM public.tokens_mapa WHERE tokens_mapa.id=v_id AND campanha_id=p_campanha FOR UPDATE;
  IF NOT FOUND AND tipo='token_excluir' AND r.pedido_id IS NOT NULL AND private.recibo_exclusao_mapa(r) THEN RETURN r.resposta; END IF;
  IF NOT FOUND OR (papel<>'mestre' AND NOT coalesce(private.controla_token_mapa(t),false)) THEN
   RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Este token não pode ser movimentado por você.';
  END IF;
  IF papel<>'mestre' AND tipo='token_atualizar' AND ((p_comando->'patch')-ARRAY['x','y','rotacao','elevacao'])<>'{}'::jsonb THEN
   RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Você pode apenas movimentar o seu token.';
  END IF;
 END IF;
 IF tipo IN ('area_atualizar','area_excluir') THEN
  SELECT * INTO area FROM public.areas_mapa WHERE id=v_id AND campanha_id=p_campanha FOR UPDATE;
  IF NOT FOUND AND tipo='area_excluir' AND r.pedido_id IS NOT NULL AND private.recibo_exclusao_mapa(r) THEN RETURN r.resposta; END IF;
  IF NOT FOUND OR (papel<>'mestre' AND NOT coalesce(private.controla_area_mapa(area),false)) THEN
   RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Esta área não pode ser alterada por você.';
  END IF;
 END IF;
 IF tipo='area_criar' THEN
  SELECT * INTO c FROM public.cenas_mapa WHERE id=(p_comando->>'cena_id')::uuid AND campanha_id=p_campanha;
  IF NOT FOUND OR (papel<>'mestre' AND NOT private.cena_visivel(c.id,p_campanha)) THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Cena indisponível.'; END IF;
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
 IF r.pedido_id IS NOT NULL THEN IF papel<>'mestre' AND r.cena_id IS NOT NULL AND NOT private.cena_visivel(r.cena_id,p_campanha) THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Cena indisponível.'; END IF; PERFORM private.validar_recibo_mapa(r.resposta,p_campanha); RETURN r.resposta; END IF;
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
    IF jsonb_typeof(patch) IS DISTINCT FROM 'object' OR (patch-ARRAY['nome','largura','altura','unidade','grade','publicada','fundo_id','fundo_x','fundo_y','fundo_escala','nevoa','revelacoes','desenhos','modo_visao'])<>'{}'::jsonb THEN
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
   IF EXISTS(SELECT 1 FROM public.paredes_mapa wall WHERE wall.cena_id=c.id AND (greatest(wall.x1,wall.x2)>c.largura OR greatest(wall.y1,wall.y2)>c.altura)) OR EXISTS(SELECT 1 FROM public.objetos_mapa obj WHERE obj.cena_id=c.id AND (obj.x+obj.w>c.largura OR obj.y+obj.h>c.altura)) THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='O novo tamanho corta paredes ou objetos.'; END IF;
   FOR t IN SELECT * FROM public.tokens_mapa WHERE cena_id=c.id LOOP PERFORM private.validar_token_mapa(t,c); END LOOP;
   FOR area IN SELECT * FROM public.areas_mapa WHERE cena_id=c.id LOOP PERFORM private.validar_area_mapa(area,c); END LOOP;
   IF c.ativa THEN UPDATE public.cenas_mapa SET ativa=false,versao=versao+1 WHERE campanha_id=p_campanha AND ativa AND cenas_mapa.id<>c.id; END IF;
   IF tipo='cena_atualizar' AND patch ? 'desenhos' THEN UPDATE public.cenas_mapa SET desenhos=c.desenhos WHERE id=c.id; END IF;
   UPDATE public.cenas_mapa SET nome=btrim(c.nome),largura=c.largura,altura=c.altura,unidade=c.unidade,grade=c.grade,publicada=c.publicada,
    ativa=c.ativa,fundo_id=c.fundo_id,fundo_x=c.fundo_x,fundo_y=c.fundo_y,fundo_escala=c.fundo_escala,modo_visao=c.modo_visao,nevoa=c.nevoa,revelacoes=c.revelacoes,versao=versao+1 WHERE cenas_mapa.id=c.id RETURNING * INTO c;
   resposta:=jsonb_build_object('cena',to_jsonb(c));
  END IF;
 ELSIF tipo IN ('token_criar','token_atualizar','token_excluir') THEN
  IF tipo='token_criar' THEN
   IF (p_comando-ARRAY['tipo','cena_id','nome','x','y','tamanho','cor','rotacao','oculto','bloqueado','ficha_id','controlador_id','imagem_id','combate_id','aura','camada_id','elevacao','visao','alcance_visao'])<>'{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Campos de token inválidos.';
   END IF;
   t.id:=gen_random_uuid(); t.campanha_id:=p_campanha; t.cena_id:=(p_comando->>'cena_id')::uuid; t.versao:=1;
   t.rotacao:=0; t.oculto:=false; t.bloqueado:=false; t.tamanho:=1; t.cor:='#d4af37'; t.visao:=true; t.alcance_visao:=60; t.elevacao:=0; SELECT id INTO t.camada_id FROM public.camadas_mapa WHERE cena_id=t.cena_id AND finalidade='jogadores';
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
   IF jsonb_typeof(patch) IS DISTINCT FROM 'object' OR (patch-ARRAY['nome','x','y','tamanho','cor','rotacao','oculto','bloqueado','ficha_id','controlador_id','imagem_id','combate_id','aura','camada_id','elevacao','visao','alcance_visao'])<>'{}'::jsonb THEN
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
   IF patch ? 'elevacao' THEN PERFORM private.numero_mapa(patch->'elevacao',-10000,10000); END IF;
   IF patch ? 'alcance_visao' THEN PERFORM private.numero_mapa(patch->'alcance_visao',0,1000); END IF;
   IF patch ? 'visao' AND jsonb_typeof(patch->'visao')<>'boolean' THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Visão inválida.'; END IF;
   t:=jsonb_populate_record(t,patch);
   IF papel<>'mestre' AND t.imagem_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.arquivos_mapa asset WHERE asset.id=t.imagem_id AND private.arquivo_visivel(asset)) THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Imagem indisponível.'; END IF;
   SELECT * INTO c FROM public.cenas_mapa WHERE cenas_mapa.id=t.cena_id AND campanha_id=p_campanha;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Cena indisponível.'; END IF;
   PERFORM private.validar_token_mapa(t,c);
   IF NOT EXISTS(SELECT 1 FROM public.camadas_mapa l WHERE l.id=t.camada_id AND l.cena_id=t.cena_id) THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Camada inválida.'; END IF;
   IF papel<>'mestre' AND tipo='token_criar' THEN
    IF p_comando ?| ARRAY['oculto','bloqueado','combate_id','visao','alcance_visao'] THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Campos administrativos são exclusivos do mestre.'; END IF;
    IF NOT private.cena_visivel(c.id,p_campanha) OR t.ficha_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.fichas f WHERE f.id=t.ficha_id AND f.proprietario_id=u AND f.campanha_id=p_campanha) OR t.oculto OR t.bloqueado OR t.combate_id IS NOT NULL OR (t.controlador_id IS NOT NULL AND t.controlador_id<>u) OR NOT private.camada_visivel(t.camada_id,t.cena_id) OR EXISTS(SELECT 1 FROM public.camadas_mapa l WHERE l.id=t.camada_id AND l.bloqueada) THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Crie apenas o token do seu personagem em uma camada disponível.'; END IF;
   END IF;
   IF tipo='token_criar' THEN
    INSERT INTO public.tokens_mapa SELECT t.* RETURNING * INTO t;
   ELSE
    UPDATE public.tokens_mapa SET nome=btrim(t.nome),x=t.x,y=t.y,tamanho=t.tamanho,cor=t.cor,rotacao=t.rotacao,oculto=t.oculto,bloqueado=t.bloqueado,
     ficha_id=t.ficha_id,controlador_id=t.controlador_id,imagem_id=t.imagem_id,combate_id=t.combate_id,aura=t.aura,camada_id=t.camada_id,elevacao=t.elevacao,visao=t.visao,alcance_visao=t.alcance_visao,versao=versao+1 WHERE tokens_mapa.id=t.id RETURNING * INTO t;
   END IF;
   resposta:=jsonb_build_object('token',to_jsonb(t));
  END IF;
 ELSIF tipo IN ('area_criar','area_atualizar','area_excluir') THEN
  IF tipo='area_criar' THEN
   IF (p_comando-ARRAY['tipo','cena_id','token_id','nome','forma','x','y','tamanho','largura','angulo','cor','camada_id','acompanhar_rotacao'])<>'{}'::jsonb THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Campos de área inválidos.'; END IF;
   IF (SELECT count(*) FROM public.areas_mapa WHERE cena_id=c.id)>=100 THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Limite de 100 áreas atingido.'; END IF;
   area.id:=gen_random_uuid(); area.campanha_id:=p_campanha; area.cena_id:=c.id; area.usuario_id:=u;
   area.versao:=1; area.largura:=1; area.angulo:=0; area.cor:='#ff6633'; area.acompanhar_rotacao:=false; area.ancora_rotacao:=0; area.ancora_angulo:=0; SELECT id INTO area.camada_id FROM public.camadas_mapa WHERE cena_id=c.id AND finalidade='jogadores';
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
   IF jsonb_typeof(patch) IS DISTINCT FROM 'object' OR (patch-ARRAY['token_id','nome','forma','x','y','tamanho','largura','angulo','cor','camada_id','acompanhar_rotacao'])<>'{}'::jsonb THEN
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
   IF NOT private.camada_visivel(area.camada_id,area.cena_id) OR (papel<>'mestre' AND EXISTS(SELECT 1 FROM public.camadas_mapa l WHERE l.id=area.camada_id AND l.bloqueada)) THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Camada indisponível.'; END IF;
   IF area.token_id IS NOT NULL THEN area.ancora_angulo:=area.angulo; SELECT area.x-anchor.x,area.y-anchor.y,anchor.rotacao INTO area.ancora_dx,area.ancora_dy,area.ancora_rotacao FROM public.tokens_mapa anchor WHERE anchor.id=area.token_id; END IF;
   IF papel<>'mestre' AND area.token_id IS NOT NULL AND (tipo='area_criar' OR area.token_id IS DISTINCT FROM token_anterior)
    AND NOT EXISTS(SELECT 1 FROM public.tokens_mapa token
    WHERE token.id=area.token_id AND token.cena_id=c.id AND token.campanha_id=p_campanha AND private.controla_token_mapa(token)) THEN
    RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Você não controla o token desta área.';
   END IF;
   IF tipo='area_criar' THEN INSERT INTO public.areas_mapa SELECT area.* RETURNING * INTO area;
   ELSE UPDATE public.areas_mapa SET nome=btrim(area.nome),forma=area.forma,x=area.x,y=area.y,tamanho=area.tamanho,
    largura=area.largura,angulo=area.angulo,cor=area.cor,token_id=area.token_id,camada_id=area.camada_id,ancora_dx=area.ancora_dx,ancora_dy=area.ancora_dy,ancora_rotacao=area.ancora_rotacao,ancora_angulo=area.ancora_angulo,acompanhar_rotacao=area.acompanhar_rotacao,versao=versao+1 WHERE id=area.id RETURNING * INTO area;
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
   OR EXISTS(SELECT 1 FROM public.cenas_mapa WHERE fundo_id=a.id) OR EXISTS(SELECT 1 FROM public.tokens_mapa WHERE imagem_id=a.id) OR EXISTS(SELECT 1 FROM public.objetos_mapa WHERE imagem_id=a.id) THEN
   RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Remova os vínculos do arquivo antes de excluí-lo.';
  END IF;
  -- The campaign lock excludes concurrent link creation. Once tombstoned,
  -- every map binding and upload/finalization path rejects this asset.
  UPDATE public.arquivos_mapa SET estado='excluindo' WHERE arquivos_mapa.id=a.id RETURNING * INTO a;
  resposta:=jsonb_build_object('asset',to_jsonb(a));
 ELSIF tipo='arquivo_excluir' THEN
  IF a.estado<>'excluindo' OR (p_comando-ARRAY['tipo','id'])<>'{}'::jsonb
   OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='weirs-mesa' AND name=a.caminho)
   OR EXISTS(SELECT 1 FROM public.cenas_mapa WHERE fundo_id=a.id) OR EXISTS(SELECT 1 FROM public.tokens_mapa WHERE imagem_id=a.id) OR EXISTS(SELECT 1 FROM public.objetos_mapa WHERE imagem_id=a.id) THEN
   RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Remova os vínculos e o objeto antes de excluir o registro.';
  END IF;
  DELETE FROM public.arquivos_mapa WHERE arquivos_mapa.id=a.id; resposta:=jsonb_build_object('excluido',a.id);
 END IF;
 INSERT INTO private.operacoes_mapa(usuario_id,pedido_id,campanha_id,comando,resposta,mestre,cena_id,camada_id) VALUES(u,p_pedido,p_campanha,p_comando,resposta,papel='mestre',coalesce(t.cena_id,area.cena_id,c.id),coalesce(t.camada_id,area.camada_id));
 RETURN resposta;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR not_null_violation OR check_violation OR foreign_key_violation OR unique_violation THEN
 RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Confira os dados e os limites do mapa.';
END $$;

CREATE FUNCTION private.validar_recibo_mapa(r jsonb,cid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb;
BEGIN
 IF private.papel_na_campanha(cid)='mestre' THEN RETURN; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(coalesce(r->'tokens','[]')||CASE WHEN r ? 'token' THEN jsonb_build_array(r->'token') ELSE '[]' END) LOOP
 IF NOT EXISTS(SELECT 1 FROM public.tokens_mapa t WHERE t.id=(item->>'id')::uuid AND private.token_visivel(t) AND private.controla_token_mapa(t)) THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='O acesso a este recibo foi encerrado.'; END IF;
 END LOOP;
 IF r ? 'area' AND NOT EXISTS(SELECT 1 FROM public.areas_mapa a WHERE a.id=(r#>>'{area,id}')::uuid AND private.area_mapa_visivel(a)) THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Área indisponível.'; END IF;
 IF r ? 'asset' AND NOT EXISTS(SELECT 1 FROM public.arquivos_mapa a WHERE a.id=(r#>>'{asset,id}')::uuid AND private.arquivo_visivel(a)) THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Arquivo indisponível.'; END IF;
END $$;
CREATE FUNCTION private.mover_ancoras_mapa() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.areas_mapa; c public.cenas_mapa; angle double precision; dx numeric; dy numeric;
BEGIN
 IF NEW.x=OLD.x AND NEW.y=OLD.y AND NEW.rotacao=OLD.rotacao THEN RETURN NEW; END IF;
 SELECT * INTO c FROM public.cenas_mapa WHERE id=NEW.cena_id;
 FOR a IN SELECT * FROM public.areas_mapa WHERE token_id=NEW.id LOOP
 angle:=CASE WHEN a.acompanhar_rotacao THEN (NEW.rotacao-a.ancora_rotacao)*pi()/180 ELSE 0 END;
 dx:=a.ancora_dx*cos(angle)-a.ancora_dy*sin(angle);dy:=a.ancora_dx*sin(angle)+a.ancora_dy*cos(angle);
 UPDATE public.areas_mapa SET x=greatest(0,least(c.largura,NEW.x+dx)),y=greatest(0,least(c.altura,NEW.y+dy)),angulo=CASE WHEN a.acompanhar_rotacao THEN mod(mod(a.ancora_angulo+NEW.rotacao-a.ancora_rotacao,360)+360,360) ELSE a.angulo END,versao=versao+1 WHERE id=a.id RETURNING * INTO a;
 PERFORM private.validar_area_mapa(a,c);
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER mover_ancoras AFTER UPDATE OF x,y,rotacao ON public.tokens_mapa FOR EACH ROW EXECUTE FUNCTION private.mover_ancoras_mapa();
CREATE OR REPLACE FUNCTION public.operar_mapa(p_campanha uuid,p_pedido uuid,p_comando jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tipo text:=p_comando->>'tipo'; papel text; c public.cenas_mapa; l public.camadas_mapa; w public.paredes_mapa; o public.objetos_mapa; original public.objetos_mapa;
 r private.operacoes_mapa; result jsonb; patch jsonb; uid uuid; item jsonb; cid uuid; target uuid; ids uuid[]:='{}'; n integer;
BEGIN
 SELECT m.papel INTO papel FROM public.membros_campanha m WHERE m.campanha_id=p_campanha AND m.usuario_id=auth.uid() FOR SHARE;
 IF papel IS NULL OR papel='espectador' THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Sem permissão para alterar o mapa.'; END IF;
 PERFORM 1 FROM public.campanhas WHERE id=p_campanha FOR UPDATE;
 IF tipo NOT IN ('camada_criar','camada_atualizar','parede_criar','parede_atualizar','parede_excluir','objeto_criar','objeto_atualizar','objeto_excluir','camada_transferir','cena_atribuir','exploracao_limpar','desenhos_limpar') THEN
 RETURN private.operar_mapa_base(p_campanha,p_pedido,p_comando);
 END IF;
 IF papel<>'mestre' THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Somente mestres administram camadas, paredes e atribuições.'; END IF;
 IF p_pedido IS NULL OR jsonb_typeof(p_comando)<>'object' OR octet_length(p_comando::text)>131072 THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Operação inválida.'; END IF;
 SELECT * INTO r FROM private.operacoes_mapa WHERE usuario_id=auth.uid() AND pedido_id=p_pedido;
 IF FOUND THEN IF r.campanha_id<>p_campanha OR r.comando<>p_comando THEN RAISE EXCEPTION USING ERRCODE='WV004',MESSAGE='Tentativa já usada.'; END IF; RETURN r.resposta; END IF;
 IF (SELECT count(*) FROM private.operacoes_mapa WHERE usuario_id=auth.uid() AND campanha_id=p_campanha AND criado_em>clock_timestamp()-interval '10 seconds')>=120 THEN RAISE EXCEPTION USING ERRCODE='WV006',MESSAGE='Muitas alterações. Aguarde alguns segundos.'; END IF;
 IF p_comando-(CASE tipo WHEN 'camada_criar' THEN ARRAY['tipo','cena_id','nome','ordem','visivel','bloqueada'] WHEN 'parede_criar' THEN ARRAY['tipo','cena_id','x1','y1','x2','y2','porta','aberta'] WHEN 'objeto_criar' THEN ARRAY['tipo','cena_id','camada_id','nome','x','y','w','h','imagem_id','desenho','oculto'] WHEN 'camada_transferir' THEN ARRAY['tipo','cena_id','camada_id','itens'] WHEN 'cena_atribuir' THEN ARRAY['tipo','cena_id','usuarios','seguir_usuario_id','versoes'] WHEN 'exploracao_limpar' THEN ARRAY['tipo','cena_id'] WHEN 'desenhos_limpar' THEN ARRAY['tipo','cena_id','itens'] ELSE ARRAY['tipo','id','versao','patch'] END)<>'{}' THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Campos inválidos.'; END IF;
 cid:=(p_comando->>'cena_id')::uuid;
 IF tipo LIKE 'camada_%' AND tipo NOT IN ('camada_criar','camada_transferir') THEN SELECT * INTO l FROM public.camadas_mapa WHERE id=(p_comando->>'id')::uuid AND campanha_id=p_campanha FOR UPDATE; cid:=l.cena_id; END IF;
 IF tipo LIKE 'parede_%' AND tipo<>'parede_criar' THEN SELECT * INTO w FROM public.paredes_mapa WHERE id=(p_comando->>'id')::uuid AND campanha_id=p_campanha FOR UPDATE; cid:=w.cena_id; END IF;
 IF tipo LIKE 'objeto_%' AND tipo<>'objeto_criar' THEN SELECT * INTO o FROM public.objetos_mapa WHERE id=(p_comando->>'id')::uuid AND campanha_id=p_campanha FOR UPDATE; cid:=o.cena_id; END IF;
 SELECT * INTO c FROM public.cenas_mapa WHERE id=cid AND campanha_id=p_campanha FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Cena indisponível.'; END IF;
 patch:=p_comando->'patch';
 IF tipo='camada_criar' THEN
 IF (SELECT count(*) FROM public.camadas_mapa WHERE cena_id=cid)>=40 THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Limite de camadas atingido.'; END IF;
 INSERT INTO public.camadas_mapa(campanha_id,cena_id,nome,ordem,visivel,bloqueada) VALUES(p_campanha,cid,p_comando->>'nome',coalesce((p_comando->>'ordem')::int,0),coalesce((p_comando->>'visivel')::boolean,true),coalesce((p_comando->>'bloqueada')::boolean,false)) RETURNING * INTO l;
 result:=jsonb_build_object('camada',l);
 ELSIF tipo='camada_atualizar' THEN
 IF (p_comando->>'versao')::int IS DISTINCT FROM l.versao THEN RAISE EXCEPTION USING ERRCODE='WV001',MESSAGE='A camada foi alterada.'; END IF;
 IF jsonb_typeof(patch) IS DISTINCT FROM 'object' OR patch-ARRAY['nome','ordem','visivel','bloqueada']<>'{}' THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Camada inválida.'; END IF;
 l:=jsonb_populate_record(l,patch);
 IF l.visivel AND EXISTS(SELECT 1 FROM public.objetos_mapa obj JOIN public.arquivos_mapa a ON a.id=obj.imagem_id WHERE obj.camada_id=l.id AND NOT obj.oculto AND a.visibilidade='mestre') THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='A camada contém imagens exclusivas do mestre.'; END IF;
 UPDATE public.camadas_mapa SET nome=l.nome,ordem=l.ordem,visivel=l.visivel,bloqueada=l.bloqueada,versao=versao+1 WHERE id=l.id RETURNING * INTO l;result:=jsonb_build_object('camada',l);
 ELSIF tipo LIKE 'parede_%' THEN
 IF tipo='parede_criar' THEN
 IF (SELECT count(*) FROM public.paredes_mapa WHERE cena_id=cid)>=300 THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Limite de paredes atingido.'; END IF;
 w.id:=gen_random_uuid();w.campanha_id:=p_campanha;w.cena_id:=cid;w.versao:=1;w.porta:=false;w.aberta:=false;patch:=p_comando-ARRAY['tipo','cena_id'];
 ELSE IF (p_comando->>'versao')::int IS DISTINCT FROM w.versao THEN RAISE EXCEPTION USING ERRCODE='WV001',MESSAGE='A parede foi alterada.'; END IF; END IF;
 IF tipo='parede_excluir' THEN DELETE FROM public.paredes_mapa WHERE id=w.id;result:=jsonb_build_object('excluido',w.id);
 ELSE
 IF jsonb_typeof(patch) IS DISTINCT FROM 'object' OR patch-ARRAY['x1','y1','x2','y2','porta','aberta']<>'{}' THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Parede inválida.'; END IF;
 w:=jsonb_populate_record(w,patch);IF greatest(w.x1,w.x2)>c.largura OR greatest(w.y1,w.y2)>c.altura THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Parede fora do mapa.'; END IF;
 IF tipo='parede_criar' THEN INSERT INTO public.paredes_mapa SELECT w.* RETURNING * INTO w; ELSE UPDATE public.paredes_mapa SET x1=w.x1,y1=w.y1,x2=w.x2,y2=w.y2,porta=w.porta,aberta=w.aberta,versao=versao+1 WHERE id=w.id RETURNING * INTO w; END IF;result:=jsonb_build_object('parede',w);
 END IF;
 ELSIF tipo LIKE 'objeto_%' THEN
 IF tipo='objeto_criar' THEN IF (SELECT count(*) FROM public.objetos_mapa WHERE cena_id=cid)>=200 THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Limite de objetos atingido.'; END IF; o.id:=gen_random_uuid();o.campanha_id:=p_campanha;o.cena_id:=cid;o.versao:=1;o.oculto:=false;patch:=p_comando-ARRAY['tipo','cena_id'];
 ELSE IF (p_comando->>'versao')::int IS DISTINCT FROM o.versao THEN RAISE EXCEPTION USING ERRCODE='WV001',MESSAGE='O objeto foi alterado.'; END IF; END IF;
 IF tipo='objeto_excluir' THEN DELETE FROM public.objetos_mapa WHERE id=o.id;result:=jsonb_build_object('excluido',o.id);
 ELSE
 IF jsonb_typeof(patch) IS DISTINCT FROM 'object' OR patch-ARRAY['nome','x','y','w','h','camada_id','imagem_id','desenho','oculto']<>'{}' THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Objeto inválido.'; END IF;
 original:=o;
 o:=jsonb_populate_record(o,patch);
 IF tipo='objeto_atualizar' AND o.desenho IS NOT NULL AND NOT (patch ? 'desenho') AND patch ?| ARRAY['x','y','w','h'] THEN
  SELECT jsonb_set(o.desenho,'{pontos}',jsonb_agg(jsonb_build_object(
   'x',o.x+((point->>'x')::numeric-original.x)*o.w/original.w,
   'y',o.y+((point->>'y')::numeric-original.y)*o.h/original.h) ORDER BY ordinal)) INTO o.desenho
  FROM jsonb_array_elements(original.desenho->'pontos') WITH ORDINALITY AS points(point,ordinal);
 END IF;
 IF NOT o.oculto AND EXISTS(SELECT 1 FROM public.camadas_mapa layer JOIN public.arquivos_mapa asset ON asset.id=o.imagem_id WHERE layer.id=o.camada_id AND layer.visivel AND asset.visibilidade='mestre') THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Use uma imagem compartilhada nesta camada.'; END IF;
 IF o.desenho IS NOT NULL THEN c.desenhos:=jsonb_build_array(o.desenho);PERFORM private.validar_geometria_mapa(c); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.camadas_mapa WHERE id=o.camada_id AND cena_id=cid) OR o.x+o.w>c.largura OR o.y+o.h>c.altura OR (o.imagem_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.arquivos_mapa WHERE id=o.imagem_id AND campanha_id=p_campanha AND estado='pronto' AND mime LIKE 'image/%')) THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Objeto ou imagem indisponível.'; END IF;
 IF tipo='objeto_criar' THEN INSERT INTO public.objetos_mapa SELECT o.* RETURNING * INTO o; ELSE UPDATE public.objetos_mapa SET nome=o.nome,x=o.x,y=o.y,w=o.w,h=o.h,camada_id=o.camada_id,imagem_id=o.imagem_id,desenho=o.desenho,oculto=o.oculto,versao=versao+1 WHERE id=o.id RETURNING * INTO o; END IF;result:=jsonb_build_object('objeto',o);
 END IF;
 ELSIF tipo='camada_transferir' THEN
 target:=(p_comando->>'camada_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.camadas_mapa WHERE id=target AND cena_id=cid) OR jsonb_typeof(p_comando->'itens') IS DISTINCT FROM 'array' OR jsonb_array_length(p_comando->'itens') NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Transferência inválida.'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_comando->'itens') LOOP
 uid:=(item->>'id')::uuid;
 IF item->>'tipo'='objeto' AND EXISTS(SELECT 1 FROM public.objetos_mapa obj JOIN public.arquivos_mapa asset ON asset.id=obj.imagem_id JOIN public.camadas_mapa dest ON dest.id=target WHERE obj.id=uid AND NOT obj.oculto AND dest.visivel AND asset.visibilidade='mestre') THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='A imagem não está compartilhada.'; END IF;
 IF uid=ANY(ids) THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Objeto repetido.'; END IF;ids:=array_append(ids,uid);
 IF item->>'tipo'='token' THEN UPDATE public.tokens_mapa SET camada_id=target,versao=versao+1 WHERE id=uid AND cena_id=cid AND versao=(item->>'versao')::int;
 ELSIF item->>'tipo'='area' THEN UPDATE public.areas_mapa SET camada_id=target,versao=versao+1 WHERE id=uid AND cena_id=cid AND versao=(item->>'versao')::int;
 ELSIF item->>'tipo'='objeto' THEN UPDATE public.objetos_mapa SET camada_id=target,versao=versao+1 WHERE id=uid AND cena_id=cid AND versao=(item->>'versao')::int;
 ELSE RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Tipo inválido.'; END IF;
 GET DIAGNOSTICS n=ROW_COUNT;IF n<>1 THEN RAISE EXCEPTION USING ERRCODE='WV001',MESSAGE='Um membro da seleção foi alterado.'; END IF;
 END LOOP;result:='{}';
 ELSIF tipo='cena_atribuir' THEN
 IF NOT c.publicada OR jsonb_typeof(p_comando->'usuarios') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Publique a cena antes de enviar participantes.'; END IF;
 target:=(p_comando->>'seguir_usuario_id')::uuid;
 IF target IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.membros_campanha m WHERE m.campanha_id=p_campanha AND m.usuario_id=target AND m.papel='jogador') THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Jogador a seguir indisponível.'; END IF;
 FOR uid IN SELECT value::uuid FROM jsonb_array_elements_text(p_comando->'usuarios') LOOP
 IF NOT EXISTS(SELECT 1 FROM public.membros_campanha WHERE campanha_id=p_campanha AND usuario_id=uid) THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Participante indisponível.'; END IF;
 IF coalesce((SELECT a.versao FROM public.atribuicoes_mapa a WHERE a.campanha_id=p_campanha AND a.usuario_id=uid),0)<>coalesce((SELECT (v->>'versao')::integer FROM jsonb_array_elements(coalesce(p_comando->'versoes','[]'::jsonb)) v WHERE v->>'usuario_id'=uid::text),0) THEN RAISE EXCEPTION USING ERRCODE='WV001',MESSAGE='A atribuição deste participante foi alterada.'; END IF;
 INSERT INTO public.atribuicoes_mapa VALUES(p_campanha,uid,cid,target,1) ON CONFLICT(campanha_id,usuario_id) DO UPDATE SET cena_id=cid,seguir_usuario_id=target,versao=public.atribuicoes_mapa.versao+1;
 END LOOP;result:='{}';
 ELSIF tipo='desenhos_limpar' THEN
 IF jsonb_typeof(p_comando->'itens') IS DISTINCT FROM 'array' OR jsonb_array_length(p_comando->'itens') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Selecione desenhos para limpar.'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_comando->'itens') LOOP
  uid:=(item->>'id')::uuid;
  IF uid=ANY(ids) THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Desenho repetido.'; END IF;
  ids:=array_append(ids,uid);
  DELETE FROM public.objetos_mapa obj USING public.camadas_mapa layer
   WHERE obj.id=uid AND obj.cena_id=cid AND obj.versao=(item->>'versao')::int
   AND obj.desenho IS NOT NULL AND NOT obj.oculto AND layer.id=obj.camada_id AND layer.finalidade='mapa';
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION USING ERRCODE='WV001',MESSAGE='Um desenho foi alterado ou mudou de camada.'; END IF;
 END LOOP;
 result:=jsonb_build_object('excluidos',ids);
 ELSIF tipo='exploracao_limpar' THEN
 DELETE FROM private.visibilidade_mapa WHERE cena_id=cid;UPDATE public.revisoes_mapa SET revisao=revisao+1 WHERE campanha_id=p_campanha;
 INSERT INTO public.invalidacoes_mapa SELECT p_campanha,m.usuario_id,1 FROM public.membros_campanha m WHERE m.campanha_id=p_campanha ON CONFLICT(campanha_id,usuario_id) DO UPDATE SET revisao=public.invalidacoes_mapa.revisao+1;
 result:='{}';
 END IF;
 INSERT INTO private.operacoes_mapa(usuario_id,pedido_id,campanha_id,comando,resposta,mestre) VALUES(auth.uid(),p_pedido,p_campanha,p_comando,result,true);
 RETURN result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR not_null_violation OR check_violation OR foreign_key_violation THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Confira os valores e os limites do mapa.';
END $$;
REVOKE ALL ON FUNCTION private.operar_mapa_base(uuid,uuid,jsonb),private.validar_recibo_mapa(jsonb,uuid),private.mover_ancoras_mapa() FROM PUBLIC,anon,authenticated;
-- Per-recipient invalidations remain readable after membership revocation, and contain no entities.
CREATE TABLE public.invalidacoes_mapa(campanha_id uuid NOT NULL REFERENCES public.campanhas ON DELETE CASCADE,usuario_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,revisao bigint NOT NULL DEFAULT 1,PRIMARY KEY(campanha_id,usuario_id));
ALTER TABLE public.invalidacoes_mapa ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invalidacoes_mapa FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.invalidacoes_mapa TO authenticated;
CREATE POLICY invalidacoes_proprias ON public.invalidacoes_mapa FOR SELECT TO authenticated USING(usuario_id=auth.uid());
CREATE OR REPLACE FUNCTION private.invalidar_mapa() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cid uuid;
BEGIN
 cid:=coalesce(NEW.campanha_id,OLD.campanha_id);
 PERFORM 1 FROM public.campanhas WHERE id=cid FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.campanhas WHERE id=cid) THEN RETURN coalesce(NEW,OLD); END IF;
 INSERT INTO public.revisoes_mapa VALUES(cid,1) ON CONFLICT(campanha_id) DO UPDATE SET revisao=public.revisoes_mapa.revisao+1;
 INSERT INTO public.invalidacoes_mapa SELECT cid,m.usuario_id,1 FROM public.membros_campanha m WHERE m.campanha_id=cid ON CONFLICT(campanha_id,usuario_id) DO UPDATE SET revisao=public.invalidacoes_mapa.revisao+1;
 IF TG_TABLE_NAME='membros_campanha' AND TG_OP='DELETE' THEN INSERT INTO public.invalidacoes_mapa VALUES(cid,OLD.usuario_id,1) ON CONFLICT(campanha_id,usuario_id) DO UPDATE SET revisao=public.invalidacoes_mapa.revisao+1; END IF;
 RETURN coalesce(NEW,OLD);
END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.invalidacoes_mapa; END IF; END $$;
ALTER FUNCTION public.marcar_mapa(uuid,uuid,numeric,numeric) RENAME TO marcar_mapa_anterior;
ALTER FUNCTION public.marcar_mapa_anterior(uuid,uuid,numeric,numeric) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.marcar_mapa_anterior(uuid,uuid,numeric,numeric),private.arquivo_storage_anterior(text,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.marcar_mapa(p_campanha uuid,p_cena uuid,p_x numeric,p_y numeric) RETURNS public.marcadores_mapa LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.cena_visivel(p_cena,p_campanha) OR NOT private.celula_visivel(p_cena,p_x,p_y) THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Este local não está visível.'; END IF;
 RETURN private.marcar_mapa_anterior(p_campanha,p_cena,p_x,p_y);
END $$;
REVOKE ALL ON FUNCTION public.marcar_mapa(uuid,uuid,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marcar_mapa(uuid,uuid,numeric,numeric) TO authenticated;
DROP POLICY marcadores_leitura ON public.marcadores_mapa;
CREATE POLICY marcadores_leitura ON public.marcadores_mapa FOR SELECT TO authenticated USING(private.cena_visivel(cena_id,campanha_id) AND private.celula_visivel(cena_id,x,y) AND criado_em>now()-interval '6 seconds');
GRANT EXECUTE ON FUNCTION private.celula_visivel(uuid,numeric,numeric) TO authenticated;
ALTER TABLE public.objetos_mapa ADD COLUMN origem_desenho text;
-- Convert legacy public drawing blobs once, then keep old clients compatible through a trigger.
CREATE FUNCTION private.converter_desenhos_mapa() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d jsonb; lx numeric; ly numeric; hx numeric; hy numeric; layer uuid; existing uuid;
BEGIN
 SELECT id INTO layer FROM public.camadas_mapa WHERE cena_id=NEW.id AND finalidade='mapa';
 IF layer IS NULL THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Camada padrão indisponível.'; END IF;
 -- Legacy reads intentionally return no drawing IDs. Nonempty writes are
 -- append/upsert patches, so omission cannot mean deletion. Only explicit []
 -- clears converted, nonhidden strokes still in the stable default layer.
 IF NEW.desenhos='[]'::jsonb THEN
  DELETE FROM public.objetos_mapa obj WHERE obj.cena_id=NEW.id AND obj.camada_id=layer
   AND obj.origem_desenho IS NOT NULL AND NOT obj.oculto;
 END IF;
 FOR d IN SELECT value FROM jsonb_array_elements(NEW.desenhos) LOOP
  SELECT min((p->>'x')::numeric),min((p->>'y')::numeric),max((p->>'x')::numeric),max((p->>'y')::numeric) INTO lx,ly,hx,hy FROM jsonb_array_elements(d->'pontos') p;
  -- A hidden or moved stroke reserves its identity across the entire scene.
  -- A stale legacy payload must not recreate it in a public layer.
  SELECT id INTO existing FROM public.objetos_mapa WHERE cena_id=NEW.id AND origem_desenho=d->>'id';
  IF existing IS NULL THEN
   INSERT INTO public.objetos_mapa(campanha_id,cena_id,camada_id,nome,x,y,w,h,desenho,origem_desenho) VALUES(NEW.campanha_id,NEW.id,layer,'Desenho',lx,ly,greatest(.01,hx-lx),greatest(.01,hy-ly),d,d->>'id');
  ELSE
   UPDATE public.objetos_mapa SET x=lx,y=ly,w=greatest(.01,hx-lx),h=greatest(.01,hy-ly),desenho=d,versao=versao+1 WHERE id=existing AND camada_id=layer AND NOT oculto AND desenho IS DISTINCT FROM d;
  END IF;
 END LOOP;
 NEW.desenhos:='[]';RETURN NEW;
END $$;
CREATE TRIGGER converter_desenhos BEFORE UPDATE OF desenhos ON public.cenas_mapa FOR EACH ROW EXECUTE FUNCTION private.converter_desenhos_mapa();
UPDATE public.cenas_mapa SET desenhos=desenhos WHERE desenhos<>'[]'::jsonb;
REVOKE ALL ON FUNCTION private.converter_desenhos_mapa() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.poligono_cobre_celula(poly jsonb,x numeric,y numeric) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE i int;j int;k int; n int:=jsonb_array_length(poly);ax numeric;ay numeric;bx numeric;byy numeric;px numeric;py numeric;inside boolean;rect jsonb:=jsonb_build_array(jsonb_build_array(x,y),jsonb_build_array(x+1,y),jsonb_build_array(x+1,y+1),jsonb_build_array(x,y+1));
BEGIN
 FOR i IN 0..n-1 LOOP
 ax:=(poly->i->>0)::numeric;ay:=(poly->i->>1)::numeric;bx:=(poly->((i+1)%n)->>0)::numeric;byy:=(poly->((i+1)%n)->>1)::numeric;
 IF ax BETWEEN x AND x+1 AND ay BETWEEN y AND y+1 THEN RETURN true; END IF;
 FOR j IN 0..3 LOOP IF private.segmentos_intersectam(ax,ay,bx,byy,(rect->j->>0)::numeric,(rect->j->>1)::numeric,(rect->((j+1)%4)->>0)::numeric,(rect->((j+1)%4)->>1)::numeric) THEN RETURN true; END IF; END LOOP;
 END LOOP;
 FOR k IN 0..3 LOOP
 px:=(rect->k->>0)::numeric;py:=(rect->k->>1)::numeric;inside:=false;j:=n-1;
 FOR i IN 0..n-1 LOOP
 ax:=(poly->i->>0)::numeric;ay:=(poly->i->>1)::numeric;bx:=(poly->j->>0)::numeric;byy:=(poly->j->>1)::numeric;
 IF (ay>py)<>(byy>py) THEN IF px<(bx-ax)*(py-ay)/(byy-ay)+ax THEN inside:=NOT inside; END IF; END IF;j:=i;
 END LOOP;
 IF inside THEN RETURN true; END IF;
 END LOOP;RETURN false;
END $$;
CREATE OR REPLACE FUNCTION private.area_cobre(a public.areas_mapa,px numeric,py numeric) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE x numeric:=floor(px);y numeric:=floor(py);poly jsonb;rotated jsonb;rad double precision:=a.angulo*pi()/180;
BEGIN
 IF a.forma='circulo' THEN RETURN power(a.x-greatest(x,least(x+1,a.x)),2)+power(a.y-greatest(y,least(y+1,a.y)),2)<=a.tamanho*a.tamanho; END IF;
 poly:=CASE a.forma WHEN 'cone' THEN jsonb_build_array(jsonb_build_array(0,0),jsonb_build_array(a.tamanho,-a.tamanho/2),jsonb_build_array(a.tamanho,a.tamanho/2)) WHEN 'linha' THEN jsonb_build_array(jsonb_build_array(0,-a.largura/2),jsonb_build_array(a.tamanho,-a.largura/2),jsonb_build_array(a.tamanho,a.largura/2),jsonb_build_array(0,a.largura/2)) ELSE jsonb_build_array(jsonb_build_array(-a.tamanho/2,-a.tamanho/2),jsonb_build_array(a.tamanho/2,-a.tamanho/2),jsonb_build_array(a.tamanho/2,a.tamanho/2),jsonb_build_array(-a.tamanho/2,a.tamanho/2)) END;
 SELECT jsonb_agg(jsonb_build_array(a.x+(p->>0)::numeric*cos(rad)-(p->>1)::numeric*sin(rad),a.y+(p->>0)::numeric*sin(rad)+(p->>1)::numeric*cos(rad))) INTO rotated FROM jsonb_array_elements(poly) p;
 RETURN private.poligono_cobre_celula(rotated,x,y);
END $$;
CREATE FUNCTION private.objeto_cobre(o public.objetos_mapa,x numeric,y numeric) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE p jsonb;prev jsonb;poly jsonb;
BEGIN
 IF o.desenho IS NULL THEN RETURN o.x<=x+1 AND o.x+o.w>=x AND o.y<=y+1 AND o.y+o.h>=y; END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(o.desenho->'pontos') LOOP
 IF (p->>'x')::numeric BETWEEN x-.0234375 AND x+1.0234375 AND (p->>'y')::numeric BETWEEN y-.0234375 AND y+1.0234375 THEN RETURN true; END IF;
 IF prev IS NOT NULL THEN
 -- A two-vertex polygon supplies both segment orientations; no broad bounding-box eligibility.
 poly:=jsonb_build_array(jsonb_build_array(((prev->>'x')::numeric-x+.0234375)/1.046875,((prev->>'y')::numeric-y+.0234375)/1.046875),jsonb_build_array(((p->>'x')::numeric-x+.0234375)/1.046875,((p->>'y')::numeric-y+.0234375)/1.046875));
 IF private.poligono_cobre_celula(poly,0,0) THEN RETURN true; END IF;
 END IF;prev:=p;
 END LOOP;RETURN false;
END $$;
CREATE OR REPLACE FUNCTION private.objeto_visivel(o public.objetos_mapa) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.camada_visivel(o.camada_id,o.cena_id) AND (private.papel_na_campanha(o.campanha_id)='mestre' OR (NOT o.oculto AND EXISTS(SELECT 1 FROM public.cenas_mapa c WHERE c.id=o.cena_id AND (c.modo_visao='manual' OR EXISTS(SELECT 1 FROM private.visibilidade_mapa v JOIN public.revisoes_mapa r ON r.campanha_id=c.campanha_id CROSS JOIN unnest(v.atual) cell WHERE v.cena_id=c.id AND v.usuario_id=auth.uid() AND v.revisao=r.revisao AND private.objeto_cobre(o,split_part(cell,',',1)::numeric,split_part(cell,',',2)::numeric))))))
$$;
REVOKE ALL ON FUNCTION private.poligono_cobre_celula(jsonb,numeric,numeric),private.objeto_cobre(public.objetos_mapa,numeric,numeric) FROM PUBLIC,anon,authenticated;

DROP POLICY weirs_arquivos_upload ON storage.objects;
CREATE POLICY weirs_arquivos_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='weirs-mesa' AND private.arquivo_storage(name,'criar') AND private.metadados_upload_mapa(name,metadata));
DROP POLICY weirs_arquivos_delete ON storage.objects;
CREATE POLICY weirs_arquivos_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='weirs-mesa' AND private.arquivo_storage(name,'excluir'));
COMMIT;
