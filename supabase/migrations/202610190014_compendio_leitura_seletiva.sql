BEGIN;

-- As revisões pedidas e as regras atuais são conjuntos pequenos. Selecione seus
-- IDs antes de consultar as revisões, evitando reavaliar as regras para cada
-- revisão histórica publicada. A leitura de revisões fixadas permanece intacta.
-- Monte os domínios em JSON e converta uma vez ao final, evitando copiar o
-- objeto JSONB acumulado a cada tabela do catálogo.
CREATE OR REPLACE FUNCTION public.obter_compendio(p_revisoes uuid[],p_conjunto text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[]; novos uuid[]; d record; a record; mudou boolean; rodada integer:=0;
  tabelas json:='{}'; registros jsonb; consulta text;
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
  LOOP
    mudou:=false; rodada:=rodada+1;
    IF rodada>50 OR cardinality(ids)>10000 THEN
      RAISE EXCEPTION 'Dependências do compêndio excedem o limite.' USING ERRCODE='WC001';
    END IF;
    FOR d IN SELECT nome FROM private.compendio_dominios LOOP
      FOR a IN SELECT attname FROM pg_catalog.pg_attribute
        WHERE attrelid=format('public.%I',d.nome)::regclass AND attnum>0 AND NOT attisdropped
        AND attname LIKE '%\_revisao\_id' ESCAPE '\' LOOP
        EXECUTE format('SELECT array_agg(DISTINCT r.id) FROM public.%I t
          JOIN public.compendio_revisoes r ON r.id=t.%I
          WHERE t.revisao_id=ANY($1) AND NOT(r.id=ANY($1)) AND r.estado=''publicado''
          AND ($2 IS NULL OR r.conjunto_regras_codigo=$2)',d.nome,a.attname)
          INTO novos USING ids,p_conjunto;
        IF cardinality(novos)>0 THEN ids:=ids||novos; mudou:=true; END IF;
      END LOOP;
    END LOOP;
    EXIT WHEN NOT mudou;
  END LOOP;
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
  RETURN json_build_object('records',registros,'tables',tabelas)::jsonb;
END $$;
REVOKE ALL ON FUNCTION public.obter_compendio(uuid[],text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obter_compendio(uuid[],text) TO anon,authenticated;

COMMIT;
