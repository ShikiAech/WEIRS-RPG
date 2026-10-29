BEGIN;

-- Versioned RPC keeps older deployed readers compatible with their full-graph payload.
-- Current readers resolve lightweight references without importing unrelated rule trees.
CREATE FUNCTION public.obter_compendio_seletivo(p_revisoes uuid[],p_conjunto text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[]; novos uuid[]; fronteira uuid[]; rodada integer:=0;
  tabelas json:='{}'; registros jsonb; referencias jsonb; consulta text; dependencias text;
BEGIN
  IF cardinality(coalesce(p_revisoes,'{}'))>1000 THEN
    RAISE EXCEPTION 'Consulta de compêndio muito extensa.' USING ERRCODE='WC001';
  END IF;
  SELECT coalesce(array_agg(DISTINCT r.id),'{}') INTO ids FROM public.compendio_revisoes r
    WHERE r.estado='publicado' AND (p_conjunto IS NULL OR r.conjunto_regras_codigo=p_conjunto)
    AND r.id IN (
      SELECT unnest(coalesce(p_revisoes,'{}'::uuid[]))
      UNION
      SELECT c.revisao_id FROM public.compendio_caracteristicas c
        JOIN public.compendio_registros x ON x.revisao_atual_id=c.revisao_id
        WHERE p_conjunto IS NOT NULL AND c.categoria='regra-criacao');
  -- List membership and prerequisite identity do not grant a class or its rules.
  -- Traverse actual dependencies in batches, visiting each revision only once.
  SELECT string_agg(format(
    'SELECT t.%I AS id FROM public.%I t WHERE t.revisao_id=ANY($1)',
    a.attname,d.nome),' UNION ALL ' ORDER BY d.nome,a.attname) INTO dependencias
    FROM private.compendio_dominios d
    JOIN pg_catalog.pg_attribute a ON a.attrelid=format('public.%I',d.nome)::regclass
    WHERE a.attnum>0 AND NOT a.attisdropped AND a.attname LIKE '%\_revisao\_id' ESCAPE '\'
      AND d.nome NOT IN ('compendio_magia_classes','compendio_perfil_listas','compendio_requisitos');
  fronteira:=ids;
  WHILE cardinality(fronteira)>0 AND dependencias IS NOT NULL LOOP
    rodada:=rodada+1;
    IF rodada>50 OR cardinality(ids)>10000 THEN
      RAISE EXCEPTION 'Dependências do compêndio excedem o limite.' USING ERRCODE='WC001';
    END IF;
    EXECUTE 'SELECT coalesce(array_agg(DISTINCT r.id),''{}''::uuid[]) FROM ('||dependencias||') alvo
      JOIN public.compendio_revisoes r ON r.id=alvo.id
      WHERE NOT(r.id=ANY($2)) AND r.estado=''publicado''
        AND ($3 IS NULL OR r.conjunto_regras_codigo=$3)'
      INTO novos USING fronteira,ids,p_conjunto;
    ids:=ids||novos;
    fronteira:=novos;
  END LOOP;
  IF cardinality(ids)>10000 THEN
    RAISE EXCEPTION 'Dependências do compêndio excedem o limite.' USING ERRCODE='WC001';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'registro_id',r.registro_id)),'[]')
    INTO referencias FROM public.compendio_revisoes r
    WHERE r.estado='publicado' AND NOT(r.id=ANY(ids))
      AND (p_conjunto IS NULL OR r.conjunto_regras_codigo=p_conjunto)
      AND r.id IN (
        SELECT classe_revisao_id FROM public.compendio_magia_classes WHERE revisao_id=ANY(ids)
        UNION SELECT classe_revisao_id FROM public.compendio_perfil_listas WHERE revisao_id=ANY(ids)
        UNION SELECT alvo_revisao_id FROM public.compendio_requisitos WHERE revisao_id=ANY(ids));
  SELECT string_agg(format(
    'SELECT %L::text AS nome, coalesce(json_agg(t),''[]''::json) AS linhas FROM public.%I t WHERE revisao_id=ANY($1)',
    nome,nome),' UNION ALL ') INTO consulta FROM private.compendio_dominios;
  IF consulta IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(json_object_agg(nome,linhas),''{}''::json) FROM ('||consulta||') dominios'
      INTO tabelas USING ids;
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('tipo',c.tipo,'slug',c.slug,
    'fonte',to_jsonb(f),'aliases',coalesce((SELECT jsonb_agg(apelido.nome) FROM public.compendio_aliases apelido
      WHERE apelido.revisao_id=r.id),'[]'),
    'legados',coalesce((SELECT jsonb_agg(DISTINCT l.legado_id) FROM public.compendio_referencias_legadas l
      JOIN public.compendio_revisoes anterior ON anterior.id=l.revisao_id
      WHERE anterior.registro_id=r.registro_id AND anterior.estado='publicado'),'[]'))),'[]') INTO registros
    FROM public.compendio_revisoes r JOIN public.compendio_registros c ON c.id=r.registro_id
    JOIN public.compendio_fontes f ON f.id=r.fonte_id WHERE r.id=ANY(ids) AND r.estado='publicado';
  RETURN json_build_object('records',registros,'references',referencias,'tables',tabelas)::jsonb;
END $$;
REVOKE ALL ON FUNCTION public.obter_compendio_seletivo(uuid[],text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obter_compendio_seletivo(uuid[],text) TO anon,authenticated;

ALTER FUNCTION public.obter_compendio_seletivo(uuid[],text) SET statement_timeout = '8s';
NOTIFY pgrst, 'reload schema';

COMMIT;
