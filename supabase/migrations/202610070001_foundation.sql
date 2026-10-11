BEGIN;
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE TABLE public.perfis (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_exibicao text NOT NULL DEFAULT '' CHECK(length(nome_exibicao) <= 120)
);
CREATE TABLE public.campanhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK(length(btrim(nome)) BETWEEN 1 AND 120),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.membros_campanha (
  campanha_id uuid NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  papel text NOT NULL DEFAULT 'jogador' CHECK(papel IN ('jogador','mestre','espectador')),
  PRIMARY KEY(campanha_id,usuario_id)
);
CREATE INDEX membros_usuario ON public.membros_campanha(usuario_id,campanha_id);
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membros_campanha ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION private.papel_na_campanha(p_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT papel FROM public.membros_campanha WHERE campanha_id=p_id AND usuario_id=(SELECT auth.uid())
$$;
REVOKE ALL ON FUNCTION private.papel_na_campanha(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.papel_na_campanha(uuid) TO authenticated;

CREATE FUNCTION private.perfil_compartilhado(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.membros_campanha a JOIN public.membros_campanha b
    ON a.campanha_id=b.campanha_id WHERE a.usuario_id=auth.uid() AND b.usuario_id=p_id)
$$;
REVOKE ALL ON FUNCTION private.perfil_compartilhado(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.perfil_compartilhado(uuid) TO authenticated;

CREATE FUNCTION private.criar_perfil() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO public.perfis(id,nome_exibicao)
  VALUES(NEW.id,left(COALESCE(NEW.raw_user_meta_data->>'full_name','Jogador'),120));
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.criar_perfil() FROM PUBLIC;
CREATE TRIGGER weirs_criar_perfil AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION private.criar_perfil();
INSERT INTO public.perfis(id,nome_exibicao)
SELECT id,left(COALESCE(raw_user_meta_data->>'full_name','Jogador'),120) FROM auth.users ON CONFLICT(id) DO NOTHING;

CREATE FUNCTION private.conteudo_valido(c jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT COALESCE(jsonb_typeof(c)='object' AND octet_length(c::text)<=262144
    AND jsonb_typeof(c->'identidade')='object' AND jsonb_typeof(c->'classes')='array'
    AND jsonb_typeof(c->'atributos')='object' AND jsonb_typeof(c->'pericias')='object'
    AND jsonb_typeof(c->'combate')='object' AND jsonb_typeof(c->'treinamento')='object'
    AND jsonb_typeof(c->'conjuracao')='object' AND jsonb_typeof(c->'inventario')='object'
    AND jsonb_typeof(c->'historia')='object' AND jsonb_typeof(c->'magias')='array'
    AND jsonb_typeof(c->'ataques')='array' AND jsonb_typeof(c->'caracteristicas')='array'
    AND jsonb_typeof(c->'tracos')='array' AND jsonb_typeof(c->'talentos')='array'
    AND jsonb_typeof(c->'idiomas')='array' AND jsonb_typeof(c->'recursos')='array',false)
$$;
REVOKE ALL ON FUNCTION private.conteudo_valido(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.conteudo_valido(jsonb) TO authenticated;

CREATE TABLE public.fichas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid NOT NULL REFERENCES public.campanhas(id),
  proprietario_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK(length(btrim(nome)) BETWEEN 1 AND 120),
  conteudo jsonb NOT NULL CHECK(private.conteudo_valido(conteudo)),
  versao_esquema integer NOT NULL DEFAULT 1 CHECK(versao_esquema=1),
  versao integer NOT NULL DEFAULT 1 CHECK(versao>=1),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fichas_campanha_atualizacao ON public.fichas(campanha_id,atualizado_em DESC);
CREATE INDEX fichas_proprietario ON public.fichas(proprietario_id);
ALTER TABLE public.fichas ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION private.proteger_ficha() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.versao<>1 THEN RAISE EXCEPTION 'Versão inicial inválida' USING ERRCODE='WF003'; END IF;
    NEW.criado_em:=now(); NEW.atualizado_em:=now();
  ELSE
    IF NEW.id<>OLD.id OR NEW.proprietario_id<>OLD.proprietario_id OR NEW.campanha_id<>OLD.campanha_id OR NEW.criado_em<>OLD.criado_em THEN
      RAISE EXCEPTION 'Identidade da ficha é imutável' USING ERRCODE='WF002';
    END IF;
    IF NEW.versao<>OLD.versao+1 THEN RAISE EXCEPTION 'Versão inválida' USING ERRCODE='WF001'; END IF;
    NEW.atualizado_em:=now();
  END IF;
  NEW.nome:=btrim(NEW.nome);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.proteger_ficha() FROM PUBLIC;
CREATE TRIGGER weirs_proteger_ficha BEFORE INSERT OR UPDATE ON public.fichas FOR EACH ROW EXECUTE FUNCTION private.proteger_ficha();

CREATE POLICY perfis_leitura ON public.perfis FOR SELECT TO authenticated
  USING(id=(SELECT auth.uid()) OR private.perfil_compartilhado(id));
CREATE POLICY campanhas_leitura ON public.campanhas FOR SELECT TO authenticated
  USING(private.papel_na_campanha(id) IS NOT NULL);
CREATE POLICY membros_leitura ON public.membros_campanha FOR SELECT TO authenticated
  USING(private.papel_na_campanha(campanha_id) IS NOT NULL);
CREATE POLICY fichas_leitura ON public.fichas FOR SELECT TO authenticated
  USING(private.papel_na_campanha(campanha_id)='mestre' OR
    (proprietario_id=(SELECT auth.uid()) AND private.papel_na_campanha(campanha_id) IN ('jogador','espectador')));
CREATE POLICY fichas_criacao ON public.fichas FOR INSERT TO authenticated
  WITH CHECK(proprietario_id=(SELECT auth.uid()) AND private.papel_na_campanha(campanha_id) IN ('jogador','mestre') AND versao=1 AND versao_esquema=1);
CREATE POLICY fichas_exclusao ON public.fichas FOR DELETE TO authenticated
  USING(proprietario_id=(SELECT auth.uid()) AND private.papel_na_campanha(campanha_id) IN ('jogador','mestre'));

REVOKE ALL ON public.perfis,public.campanhas,public.membros_campanha,public.fichas FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.perfis,public.campanhas,public.membros_campanha TO authenticated;
GRANT SELECT,INSERT,DELETE ON public.fichas TO authenticated;

CREATE FUNCTION public.salvar_ficha(p_id uuid,p_versao integer,p_nome text,p_conteudo jsonb,p_versao_esquema integer)
RETURNS public.fichas LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f public.fichas; papel text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Acesso indisponível' USING ERRCODE='WF002'; END IF;
  SELECT * INTO f FROM public.fichas WHERE id=p_id;
  papel:=private.papel_na_campanha(f.campanha_id);
  IF f.id IS NULL OR papel IS NULL OR papel='espectador' OR (f.proprietario_id<>auth.uid() AND papel<>'mestre') THEN
    RAISE EXCEPTION 'Acesso indisponível' USING ERRCODE='WF002';
  END IF;
  SELECT * INTO f FROM public.fichas WHERE id=p_id FOR UPDATE;
  IF f.id IS NULL THEN RAISE EXCEPTION 'Acesso indisponível' USING ERRCODE='WF002'; END IF;
  IF p_versao IS NULL OR f.versao<>p_versao THEN RAISE EXCEPTION 'Conflito de edição' USING ERRCODE='WF001'; END IF;
  IF p_versao_esquema IS DISTINCT FROM 1 OR p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 1 AND 120 OR NOT private.conteudo_valido(p_conteudo) THEN
    RAISE EXCEPTION 'Conteúdo inválido' USING ERRCODE='WF003';
  END IF;
  UPDATE public.fichas SET nome=p_nome,conteudo=p_conteudo,versao=versao+1
  WHERE id=p_id AND versao=p_versao RETURNING * INTO f;
  RETURN f;
END $$;
REVOKE ALL ON FUNCTION public.salvar_ficha(uuid,integer,text,jsonb,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.salvar_ficha(uuid,integer,text,jsonb,integer) TO authenticated;
COMMIT;
