BEGIN;

-- Cadastro global mantido exclusivamente pelo administrador do banco.
CREATE TABLE public.administradores (
  usuario_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.administradores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.administradores FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.administradores TO authenticated;
CREATE POLICY administradores_proprio_acesso ON public.administradores FOR SELECT TO authenticated
  USING (usuario_id = (SELECT auth.uid()));

CREATE FUNCTION private.eh_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.administradores WHERE usuario_id=auth.uid())
$$;
REVOKE ALL ON FUNCTION private.eh_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.eh_admin() TO authenticated;

CREATE OR REPLACE FUNCTION private.papel_na_campanha(p_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT CASE WHEN private.eh_admin() THEN 'mestre'
    ELSE (SELECT papel FROM public.membros_campanha WHERE campanha_id=p_id AND usuario_id=auth.uid()) END
  FROM public.campanhas WHERE id=p_id
$$;
CREATE OR REPLACE FUNCTION private.perfil_compartilhado(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.eh_admin() OR EXISTS(SELECT 1 FROM public.membros_campanha a JOIN public.membros_campanha b
    ON a.campanha_id=b.campanha_id WHERE a.usuario_id=auth.uid() AND b.usuario_id=p_id)
$$;

-- Mantém o bloqueio de vínculo usado pelas RPCs, incluindo a revogação de admin.
CREATE FUNCTION private.papel_campanha_operacao(p_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE papel text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.campanhas WHERE id=p_id) THEN RETURN NULL; END IF;
  PERFORM 1 FROM public.administradores WHERE usuario_id=auth.uid() FOR SHARE;
  IF FOUND THEN RETURN 'mestre'; END IF;
  SELECT m.papel INTO papel FROM public.membros_campanha m
    WHERE m.campanha_id=p_id AND m.usuario_id=auth.uid() FOR SHARE;
  RETURN papel;
END $$;
REVOKE ALL ON FUNCTION private.papel_campanha_operacao(uuid) FROM PUBLIC, anon, authenticated;

DROP POLICY campanhas_leitura ON public.campanhas;
CREATE POLICY campanhas_leitura ON public.campanhas FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);

CREATE FUNCTION public.entrar_campanha(p_campanha uuid) RETURNS public.membros_campanha
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE membro public.membros_campanha;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.campanhas WHERE id=p_campanha) THEN
    RAISE EXCEPTION 'Campanha indisponível' USING ERRCODE='WF002';
  END IF;
  INSERT INTO public.membros_campanha(campanha_id,usuario_id,papel)
    VALUES(p_campanha,auth.uid(),'jogador') ON CONFLICT(campanha_id,usuario_id) DO NOTHING;
  SELECT * INTO membro FROM public.membros_campanha WHERE campanha_id=p_campanha AND usuario_id=auth.uid();
  RETURN membro;
END $$;
REVOKE ALL ON FUNCTION public.entrar_campanha(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entrar_campanha(uuid) TO authenticated;

-- Atualiza somente a consulta de acesso nas definições vigentes. Os comandos,
-- validações, recibos, permissões e limites das migrações 004/005/006/007 permanecem.
-- Uma divergência da definição esperada interrompe a migração inteira.
DO $migration$
DECLARE r record; definition text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.enviar_chat(uuid,uuid,jsonb)', 'SELECT m.papel INTO papel FROM public.membros_campanha m WHERE m.campanha_id=p_campanha AND m.usuario_id=usuario FOR SHARE;'),
    ('public.ler_segredos_chat(uuid,uuid[])', 'SELECT m.papel INTO papel FROM public.membros_campanha m WHERE m.campanha_id=p_campanha AND m.usuario_id=auth.uid() FOR SHARE;'),
    ('public.revelar_rolagem(uuid,uuid)', 'SELECT m.papel INTO papel FROM public.membros_campanha m WHERE m.campanha_id=p_campanha AND m.usuario_id=auth.uid() FOR SHARE;'),
    ('public.operar_mesa(uuid,uuid,jsonb)', 'SELECT membro.papel INTO papel FROM public.membros_campanha membro WHERE membro.campanha_id=p_campanha AND membro.usuario_id=u FOR SHARE;'),
    ('public.operar_mapa(uuid,uuid,jsonb)', 'SELECT m.papel INTO papel FROM public.membros_campanha m WHERE m.campanha_id=p_campanha AND m.usuario_id=u FOR SHARE;'),
    ('public.marcar_mapa(uuid,uuid,numeric,numeric)', 'SELECT m.papel INTO papel FROM public.membros_campanha m WHERE m.campanha_id=p_campanha AND m.usuario_id=u FOR SHARE;'),
    ('public.salvar_ficha(uuid,integer,text,jsonb,integer)', 'papel:=private.papel_na_campanha(f.campanha_id);')
  ) AS changes(signature, needle) LOOP
    definition:=pg_get_functiondef(r.signature::regprocedure);
    IF length(definition)-length(replace(definition,r.needle,''))<>length(r.needle) THEN
      RAISE EXCEPTION 'Definição de acesso inesperada: %',r.signature;
    END IF;
    EXECUTE replace(definition,r.needle,
      CASE WHEN r.signature LIKE 'public.salvar_ficha%' THEN 'papel:=private.papel_campanha_operacao(f.campanha_id);'
      ELSE 'papel:=private.papel_campanha_operacao(p_campanha);' END);
  END LOOP;
END $migration$;

CREATE OR REPLACE FUNCTION private.validar_token_mapa(t public.tokens_mapa,c public.cenas_mapa) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF t.campanha_id<>c.campanha_id OR t.cena_id<>c.id OR t.x+t.tamanho>c.largura OR t.y+t.tamanho>c.altura THEN
  RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Token fora do mapa.';
 END IF;
 IF t.ficha_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.fichas WHERE id=t.ficha_id AND campanha_id=t.campanha_id) THEN
  RAISE EXCEPTION USING ERRCODE='WV003',MESSAGE='Ficha de outra campanha.';
 END IF;
 IF t.controlador_id IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM public.administradores WHERE usuario_id=t.controlador_id)
  AND NOT EXISTS(SELECT 1 FROM public.membros_campanha WHERE campanha_id=t.campanha_id AND usuario_id=t.controlador_id AND papel IN ('jogador','mestre')) THEN
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

CREATE TABLE private.copias_ficha (
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL,
  origem_id uuid NOT NULL,
  versao_origem integer NOT NULL,
  destino_id uuid NOT NULL,
  ficha_id uuid NOT NULL,
  PRIMARY KEY(usuario_id,pedido_id)
);
ALTER TABLE private.copias_ficha ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.copias_ficha FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.copiar_ficha_campanha(p_origem uuid,p_versao integer,p_campanha uuid,p_pedido uuid)
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
  INSERT INTO private.copias_ficha VALUES(auth.uid(),p_pedido,p_origem,p_versao,p_campanha,copia.id);
  RETURN copia;
END $$;
REVOKE ALL ON FUNCTION public.copiar_ficha_campanha(uuid,integer,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copiar_ficha_campanha(uuid,integer,uuid,uuid) TO authenticated;
COMMIT;
