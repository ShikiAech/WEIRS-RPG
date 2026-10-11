BEGIN;

CREATE TABLE public.arquivos_mapa (
 id uuid PRIMARY KEY,
 campanha_id uuid NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
 usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 nome text NOT NULL CHECK(length(btrim(nome)) BETWEEN 1 AND 160),
 caminho text NOT NULL UNIQUE,
 mime text NOT NULL CHECK(mime IN ('image/png','image/jpeg','image/webp','application/pdf')),
 tamanho integer NOT NULL CHECK(tamanho BETWEEN 1 AND 5242880),
 visibilidade text NOT NULL CHECK(visibilidade IN ('campanha','mestre')),
 estado text NOT NULL DEFAULT 'pendente' CHECK(estado IN ('pendente','pronto','excluindo')),
 criado_em timestamptz NOT NULL DEFAULT now(),
 CHECK(caminho=campanha_id::text||'/'||id::text)
);
CREATE TABLE public.cenas_mapa (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 campanha_id uuid NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
 nome text NOT NULL CHECK(length(btrim(nome)) BETWEEN 1 AND 120),
 versao integer NOT NULL DEFAULT 1 CHECK(versao>=1),
 largura integer NOT NULL CHECK(largura BETWEEN 4 AND 100),
 altura integer NOT NULL CHECK(altura BETWEEN 4 AND 100),
 unidade numeric NOT NULL DEFAULT 5 CHECK(unidade>0 AND unidade<=1000),
 grade boolean NOT NULL DEFAULT true,
 publicada boolean NOT NULL DEFAULT false,
 ativa boolean NOT NULL DEFAULT false CHECK(NOT ativa OR publicada),
 fundo_id uuid REFERENCES public.arquivos_mapa(id),
 nevoa boolean NOT NULL DEFAULT false,
 revelacoes jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(revelacoes)='array'),
 desenhos jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(desenhos)='array')
);
CREATE UNIQUE INDEX cenas_uma_ativa ON public.cenas_mapa(campanha_id) WHERE ativa;
CREATE INDEX cenas_campanha ON public.cenas_mapa(campanha_id);
CREATE TABLE public.tokens_mapa (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 campanha_id uuid NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
 cena_id uuid NOT NULL REFERENCES public.cenas_mapa(id) ON DELETE CASCADE,
 versao integer NOT NULL DEFAULT 1 CHECK(versao>=1),
 nome text NOT NULL CHECK(length(btrim(nome)) BETWEEN 1 AND 120),
 x numeric NOT NULL CHECK(x>=0 AND x<=100),
 y numeric NOT NULL CHECK(y>=0 AND y<=100),
 tamanho numeric NOT NULL DEFAULT 1 CHECK(tamanho BETWEEN 0.25 AND 10),
 cor text NOT NULL DEFAULT '#d4af37' CHECK(cor ~ '^#[0-9a-fA-F]{6}$'),
 rotacao numeric NOT NULL DEFAULT 0 CHECK(rotacao BETWEEN -360 AND 360),
 oculto boolean NOT NULL DEFAULT false,
 bloqueado boolean NOT NULL DEFAULT false,
 ficha_id uuid REFERENCES public.fichas(id) ON DELETE SET NULL,
 controlador_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 imagem_id uuid REFERENCES public.arquivos_mapa(id),
 combate_id uuid
);
CREATE INDEX tokens_cena ON public.tokens_mapa(cena_id);
CREATE FUNCTION private.desvincular_combatentes_mapa() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF (OLD.estado#>'{combate,participantes}') IS NOT DISTINCT FROM (NEW.estado#>'{combate,participantes}') THEN RETURN NEW; END IF;
 UPDATE public.tokens_mapa token SET combate_id=NULL,versao=versao+1
  WHERE token.campanha_id=NEW.campanha_id AND token.combate_id IS NOT NULL
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(OLD.estado#>'{combate,participantes}') p WHERE p->>'id'=token.combate_id::text)
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.estado#>'{combate,participantes}') p WHERE p->>'id'=token.combate_id::text);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.desvincular_combatentes_mapa() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER weirs_desvincular_combatentes_mapa AFTER UPDATE OF estado ON public.mesas FOR EACH ROW EXECUTE FUNCTION private.desvincular_combatentes_mapa();
CREATE TABLE private.operacoes_mapa (
 usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 pedido_id uuid NOT NULL,
 campanha_id uuid NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
 comando jsonb NOT NULL,
 resposta jsonb NOT NULL,
 mestre boolean NOT NULL DEFAULT false,
 criado_em timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(usuario_id,pedido_id)
);
CREATE INDEX operacoes_mapa_limite ON private.operacoes_mapa(usuario_id,campanha_id,criado_em);
ALTER TABLE public.arquivos_mapa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cenas_mapa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tokens_mapa ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.operacoes_mapa ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.arquivos_mapa,public.cenas_mapa,public.tokens_mapa,private.operacoes_mapa FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.arquivos_mapa,public.cenas_mapa,public.tokens_mapa TO authenticated;

CREATE FUNCTION private.cena_visivel(p_cena uuid,p_campanha uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.cenas_mapa c WHERE c.id=p_cena AND c.campanha_id=p_campanha
  AND private.papel_na_campanha(p_campanha) IS NOT NULL
  AND (c.publicada OR private.papel_na_campanha(p_campanha)='mestre'))
$$;
CREATE POLICY cenas_leitura ON public.cenas_mapa FOR SELECT TO authenticated
 USING(private.papel_na_campanha(campanha_id) IS NOT NULL AND (publicada OR private.papel_na_campanha(campanha_id)='mestre'));
CREATE POLICY tokens_leitura ON public.tokens_mapa FOR SELECT TO authenticated
 USING(private.cena_visivel(cena_id,campanha_id) AND (NOT oculto OR private.papel_na_campanha(campanha_id)='mestre'));
CREATE POLICY arquivos_leitura ON public.arquivos_mapa FOR SELECT TO authenticated
 USING(private.papel_na_campanha(campanha_id) IS NOT NULL
  AND (visibilidade='campanha' OR private.papel_na_campanha(campanha_id)='mestre')
  AND (estado='pronto' OR usuario_id=(SELECT auth.uid()) OR private.papel_na_campanha(campanha_id)='mestre'));
REVOKE ALL ON FUNCTION private.cena_visivel(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.cena_visivel(uuid,uuid) TO authenticated;

-- Storage is managed by Supabase. Object paths cannot be chosen independently of a reserved asset.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('weirs-mesa','weirs-mesa',false,5242880,ARRAY['image/png','image/jpeg','image/webp','application/pdf'])
 ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE FUNCTION private.arquivo_storage(p_caminho text,p_acao text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.arquivos_mapa a WHERE a.caminho=p_caminho
  AND private.papel_na_campanha(a.campanha_id) IS NOT NULL
  AND (a.visibilidade='campanha' OR private.papel_na_campanha(a.campanha_id)='mestre')
  AND CASE p_acao
   WHEN 'ler' THEN a.estado='pronto' OR a.usuario_id=auth.uid() OR private.papel_na_campanha(a.campanha_id)='mestre'
   WHEN 'criar' THEN a.estado='pendente' AND a.usuario_id=auth.uid() AND private.papel_na_campanha(a.campanha_id) IN ('jogador','mestre')
   WHEN 'excluir' THEN a.estado='excluindo' AND (private.papel_na_campanha(a.campanha_id)='mestre' OR (a.usuario_id=auth.uid() AND private.papel_na_campanha(a.campanha_id)='jogador'))
    AND NOT EXISTS(SELECT 1 FROM public.cenas_mapa WHERE fundo_id=a.id)
    AND NOT EXISTS(SELECT 1 FROM public.tokens_mapa WHERE imagem_id=a.id)
   ELSE false END)
$$;
REVOKE ALL ON FUNCTION private.arquivo_storage(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.arquivo_storage(text,text) TO authenticated;
CREATE FUNCTION private.metadados_upload_mapa(p_caminho text,p_meta jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.arquivos_mapa;
BEGIN
 SELECT * INTO a FROM public.arquivos_mapa WHERE caminho=p_caminho;
 IF NOT FOUND OR NOT private.arquivo_storage(p_caminho,'criar') THEN RETURN false; END IF;
 IF p_meta ? 'mimetype' AND p_meta->>'mimetype' IS DISTINCT FROM a.mime THEN RETURN false; END IF;
 -- Supabase first probes upload permission before the stream is received (no size).
 -- Its final permission probe includes the measured object size. Reject under-reservation.
 IF p_meta ? 'size' THEN
  IF jsonb_typeof(p_meta->'size') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
  RETURN (p_meta->>'size')::numeric=a.tamanho;
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION private.metadados_upload_mapa(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.metadados_upload_mapa(text,jsonb) TO authenticated;
CREATE POLICY weirs_arquivos_download ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='weirs-mesa' AND private.arquivo_storage(name,'ler'));
CREATE POLICY weirs_arquivos_upload ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='weirs-mesa' AND private.arquivo_storage(name,'criar') AND private.metadados_upload_mapa(name,metadata));
-- No UPDATE policy: upsert/overwrite is forbidden, including for masters.
CREATE POLICY weirs_arquivos_delete ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='weirs-mesa' AND private.arquivo_storage(name,'excluir'));

CREATE FUNCTION private.numero_mapa(v jsonb,minimo numeric,maximo numeric) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE n numeric;
BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Número inválido.'; END IF;
 n:=(v#>>'{}')::numeric;
 IF n<minimo OR n>maximo THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Número fora dos limites.'; END IF;
 RETURN n;
END $$;
CREATE FUNCTION private.validar_geometria_mapa(c public.cenas_mapa) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r jsonb; d jsonb; p jsonb;
BEGIN
 IF c.revelacoes IS NULL OR jsonb_typeof(c.revelacoes)<>'array' OR jsonb_array_length(c.revelacoes)>100
  OR c.desenhos IS NULL OR jsonb_typeof(c.desenhos)<>'array' OR jsonb_array_length(c.desenhos)>100 THEN
  RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Muitas formas no mapa.';
 END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(c.revelacoes) LOOP
  IF jsonb_typeof(r)<>'object' OR (r-ARRAY['x','y','w','h'])<>'{}'::jsonb THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Revelação inválida.'; END IF;
  IF private.numero_mapa(r->'x',0,c.largura)+private.numero_mapa(r->'w',0.1,c.largura)>c.largura
   OR private.numero_mapa(r->'y',0,c.altura)+private.numero_mapa(r->'h',0.1,c.altura)>c.altura THEN
   RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Revelação fora do mapa.';
  END IF;
 END LOOP;
 FOR d IN SELECT value FROM jsonb_array_elements(c.desenhos) LOOP
  IF jsonb_typeof(d)<>'object' OR (d-ARRAY['id','cor','pontos'])<>'{}'::jsonb OR d->>'id' IS NULL
   OR length(d->>'id') NOT BETWEEN 1 AND 80 OR coalesce(d->>'cor','') !~ '^#[0-9a-fA-F]{6}$'
   OR jsonb_typeof(d->'pontos') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'pontos') NOT BETWEEN 2 AND 100 THEN
   RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Desenho inválido.';
  END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(d->'pontos') LOOP
   IF jsonb_typeof(p)<>'object' OR (p-ARRAY['x','y'])<>'{}'::jsonb THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Ponto inválido.'; END IF;
   PERFORM private.numero_mapa(p->'x',0,c.largura); PERFORM private.numero_mapa(p->'y',0,c.altura);
  END LOOP;
 END LOOP;
END $$;
CREATE FUNCTION private.validar_token_mapa(t public.tokens_mapa,c public.cenas_mapa) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF t.campanha_id<>c.campanha_id OR t.cena_id<>c.id OR t.x+t.tamanho>c.largura OR t.y+t.tamanho>c.altura THEN
  RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Token fora do mapa.';
 END IF;
 IF t.ficha_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.fichas WHERE id=t.ficha_id AND campanha_id=t.campanha_id) THEN
  RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Ficha de outra campanha.';
 END IF;
 IF t.controlador_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.membros_campanha WHERE campanha_id=t.campanha_id AND usuario_id=t.controlador_id AND papel IN ('jogador','mestre')) THEN
  RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Controlador indisponível.';
 END IF;
 IF t.imagem_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.arquivos_mapa a WHERE a.id=t.imagem_id AND a.campanha_id=t.campanha_id
  AND a.estado='pronto' AND a.mime LIKE 'image/%' AND (a.visibilidade='campanha' OR (t.oculto OR NOT c.publicada))) THEN
  RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Imagem indisponível para os jogadores.';
 END IF;
 IF t.combate_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.mesas m,jsonb_array_elements(m.estado#>'{combate,participantes}') p
  WHERE m.campanha_id=t.campanha_id AND p->>'id'=t.combate_id::text) THEN
  RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Participante do combate indisponível.';
 END IF;
END $$;
CREATE FUNCTION private.controla_token_mapa(t public.tokens_mapa) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT NOT t.oculto AND NOT t.bloqueado AND EXISTS(SELECT 1 FROM public.cenas_mapa WHERE id=t.cena_id AND publicada)
  AND (t.controlador_id=auth.uid() OR EXISTS(SELECT 1 FROM public.fichas WHERE id=t.ficha_id AND campanha_id=t.campanha_id AND proprietario_id=auth.uid()))
$$;

CREATE FUNCTION public.operar_mapa(p_campanha uuid,p_pedido uuid,p_comando jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 u uuid:=auth.uid(); papel text; tipo text:=p_comando->>'tipo'; v_id uuid; patch jsonb;
 c public.cenas_mapa; t public.tokens_mapa; a public.arquivos_mapa; r private.operacoes_mapa;
 resposta jsonb; meta jsonb; n numeric; k text;
BEGIN
 SELECT m.papel INTO papel FROM public.membros_campanha m WHERE m.campanha_id=p_campanha AND m.usuario_id=u FOR SHARE;
 IF u IS NULL OR papel IS NULL OR papel='espectador' THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Sem permissão para alterar a mesa.'; END IF;
 IF p_pedido IS NULL OR jsonb_typeof(p_comando) IS DISTINCT FROM 'object' OR octet_length(p_comando::text)>131072
  OR tipo NOT IN ('cena_criar','cena_atualizar','cena_ativar','cena_excluir','token_criar','token_atualizar','token_excluir','arquivo_registrar','arquivo_finalizar','arquivo_preparar_exclusao','arquivo_excluir')
  OR tipo IS NULL THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Operação inválida.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text||p_pedido::text,0));
 -- Campaign serialization also keeps ownership checks consistent with receipt delivery.
 PERFORM 1 FROM public.campanhas WHERE id=p_campanha FOR UPDATE;
 SELECT * INTO r FROM private.operacoes_mapa WHERE usuario_id=u AND pedido_id=p_pedido;
 IF FOUND THEN
  IF r.campanha_id<>p_campanha OR r.comando<>p_comando THEN RAISE EXCEPTION USING ERRCODE='WV004',MESSAGE='Tentativa já usada.'; END IF;
  IF r.mestre AND papel<>'mestre' THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Permissão de mestre encerrada.'; END IF;
 END IF;
 IF tipo LIKE 'cena_%' OR tipo IN ('token_criar','token_excluir') THEN
  IF papel<>'mestre' THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Somente o mestre administra cenas e tokens.'; END IF;
 END IF;
 IF tipo<>'cena_criar' AND tipo<>'token_criar' THEN v_id:=(p_comando->>'id')::uuid; END IF;
 IF tipo='token_atualizar' THEN
  SELECT * INTO t FROM public.tokens_mapa WHERE tokens_mapa.id=v_id AND campanha_id=p_campanha FOR UPDATE;
  IF NOT FOUND OR (papel<>'mestre' AND NOT coalesce(private.controla_token_mapa(t),false)) THEN
   RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Este token não pode ser movimentado por você.';
  END IF;
  IF papel<>'mestre' AND ((p_comando->'patch')-ARRAY['x','y','rotacao'])<>'{}'::jsonb THEN
   RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Você pode apenas movimentar o seu token.';
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
 IF tipo='cena_criar' THEN
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
    IF jsonb_typeof(patch) IS DISTINCT FROM 'object' OR (patch-ARRAY['nome','largura','altura','unidade','grade','publicada','fundo_id','nevoa','revelacoes','desenhos'])<>'{}'::jsonb THEN
     RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Campos de cena inválidos.';
    END IF;
    FOR k IN SELECT jsonb_object_keys(patch) LOOP
     IF k IN ('largura','altura') THEN
      n:=private.numero_mapa(patch->k,4,100); IF n<>trunc(n) THEN RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Use células inteiras.'; END IF;
     ELSIF k='unidade' THEN PERFORM private.numero_mapa(patch->k,0.01,1000);
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
   IF c.ativa THEN UPDATE public.cenas_mapa SET ativa=false,versao=versao+1 WHERE campanha_id=p_campanha AND ativa AND cenas_mapa.id<>c.id; END IF;
   UPDATE public.cenas_mapa SET nome=btrim(c.nome),largura=c.largura,altura=c.altura,unidade=c.unidade,grade=c.grade,publicada=c.publicada,
    ativa=c.ativa,fundo_id=c.fundo_id,nevoa=c.nevoa,revelacoes=c.revelacoes,desenhos=c.desenhos,versao=versao+1 WHERE cenas_mapa.id=c.id RETURNING * INTO c;
   resposta:=jsonb_build_object('cena',to_jsonb(c));
  END IF;
 ELSIF tipo IN ('token_criar','token_atualizar','token_excluir') THEN
  IF tipo='token_criar' THEN
   IF (p_comando-ARRAY['tipo','cena_id','nome','x','y','tamanho','cor','rotacao','oculto','bloqueado','ficha_id','controlador_id','imagem_id','combate_id'])<>'{}'::jsonb THEN
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
   IF jsonb_typeof(patch) IS DISTINCT FROM 'object' OR (patch-ARRAY['nome','x','y','tamanho','cor','rotacao','oculto','bloqueado','ficha_id','controlador_id','imagem_id','combate_id'])<>'{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Campos de token inválidos.';
   END IF;
   FOR k IN SELECT jsonb_object_keys(patch) LOOP
    IF k IN ('x','y') THEN PERFORM private.numero_mapa(patch->k,0,100);
    ELSIF k='tamanho' THEN PERFORM private.numero_mapa(patch->k,0.25,10);
    ELSIF k='rotacao' THEN PERFORM private.numero_mapa(patch->k,-360,360);
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
     ficha_id=t.ficha_id,controlador_id=t.controlador_id,imagem_id=t.imagem_id,combate_id=t.combate_id,versao=versao+1 WHERE tokens_mapa.id=t.id RETURNING * INTO t;
   END IF;
   resposta:=jsonb_build_object('token',to_jsonb(t));
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
REVOKE ALL ON FUNCTION private.numero_mapa(jsonb,numeric,numeric),private.validar_geometria_mapa(public.cenas_mapa),private.validar_token_mapa(public.tokens_mapa,public.cenas_mapa),private.controla_token_mapa(public.tokens_mapa) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.operar_mapa(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.operar_mapa(uuid,uuid,jsonb) TO authenticated;

-- Ephemeral pings use the same authenticated scene boundary as tokens. Their
-- coordinates never travel through a public Broadcast channel or chat history.
CREATE TABLE public.marcadores_mapa (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 campanha_id uuid NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
 cena_id uuid NOT NULL REFERENCES public.cenas_mapa(id) ON DELETE CASCADE,
 usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 nome text NOT NULL CHECK(length(nome) BETWEEN 1 AND 120),
 x numeric NOT NULL CHECK(x>=0 AND x<=100),
 y numeric NOT NULL CHECK(y>=0 AND y<=100),
 criado_em timestamptz NOT NULL DEFAULT now(),
 UNIQUE(cena_id,usuario_id)
);
CREATE INDEX marcadores_usuario ON public.marcadores_mapa(usuario_id,criado_em);
ALTER TABLE public.marcadores_mapa ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marcadores_mapa FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.marcadores_mapa TO authenticated;
CREATE POLICY marcadores_leitura ON public.marcadores_mapa FOR SELECT TO authenticated
 USING(private.cena_visivel(cena_id,campanha_id) AND criado_em>now()-interval '6 seconds');
CREATE FUNCTION public.marcar_mapa(p_campanha uuid,p_cena uuid,p_x numeric,p_y numeric) RETURNS public.marcadores_mapa
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); papel text; c public.cenas_mapa; marcador public.marcadores_mapa; nome_autor text;
BEGIN
 SELECT m.papel INTO papel FROM public.membros_campanha m WHERE m.campanha_id=p_campanha AND m.usuario_id=u FOR SHARE;
 IF u IS NULL OR papel IS NULL OR papel='espectador' THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Sem permissão para marcar o mapa.'; END IF;
 SELECT * INTO c FROM public.cenas_mapa WHERE id=p_cena AND campanha_id=p_campanha FOR SHARE;
 IF NOT FOUND OR (NOT c.publicada AND papel<>'mestre') THEN RAISE EXCEPTION USING ERRCODE='WV002',MESSAGE='Cena indisponível.'; END IF;
 IF p_x IS NULL OR p_y IS NULL OR p_x<0 OR p_y<0 OR p_x>c.largura OR p_y>c.altura OR p_x::text IN ('NaN','Infinity','-Infinity') OR p_y::text IN ('NaN','Infinity','-Infinity') THEN
  RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Marcador fora do mapa.';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text||':map-ping',0));
 IF EXISTS(SELECT 1 FROM public.marcadores_mapa WHERE usuario_id=u AND criado_em>clock_timestamp()-interval '1 second') THEN
  RAISE EXCEPTION USING ERRCODE='WV006',MESSAGE='Aguarde um segundo entre marcadores.';
 END IF;
 SELECT coalesce(nullif(nome_exibicao,''),'Jogador') INTO nome_autor FROM public.perfis WHERE id=u;
 DELETE FROM public.marcadores_mapa WHERE usuario_id=u AND criado_em<clock_timestamp()-interval '1 minute';
 INSERT INTO public.marcadores_mapa(campanha_id,cena_id,usuario_id,nome,x,y,criado_em)
  VALUES(p_campanha,p_cena,u,coalesce(nome_autor,'Jogador'),p_x,p_y,clock_timestamp())
  ON CONFLICT(cena_id,usuario_id) DO UPDATE SET x=EXCLUDED.x,y=EXCLUDED.y,nome=EXCLUDED.nome,criado_em=EXCLUDED.criado_em
  RETURNING * INTO marcador;
 RETURN marcador;
END $$;
REVOKE ALL ON FUNCTION public.marcar_mapa(uuid,uuid,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marcar_mapa(uuid,uuid,numeric,numeric) TO authenticated;

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.cenas_mapa,public.tokens_mapa,public.arquivos_mapa,public.marcadores_mapa;
 END IF;
END $$;
COMMIT;
