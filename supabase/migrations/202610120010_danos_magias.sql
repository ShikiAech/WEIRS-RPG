BEGIN;

-- Resolve todas as parcelas uma vez e obtém os subtotais dos mesmos termos.
-- A fórmula derivada enviada pelo cliente não determina o resultado.
CREATE FUNCTION private.rolar_dano_magia(c jsonb, magia jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE
  partes jsonb; parte jsonb; prontas jsonb:='[]'; saida jsonb:='[]';
  resultado jsonb; formula text; expressao text:=''; atributo text; tipo text;
  dados_atributo jsonb; modificador int; inicio int:=0; quantidade int; subtotal int; ids text[]:='{}';
BEGIN
  IF magia ? 'danos' THEN
    IF jsonb_typeof(magia->'danos') IS DISTINCT FROM 'array' OR jsonb_array_length(magia->'danos')>20 THEN
      RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Parcelas de dano inválidas.';
    END IF;
    partes:=magia->'danos';
  ELSE
    partes:=jsonb_build_array(jsonb_build_object('id',magia->>'id','dado',magia->>'dano','atributo','','tipo',coalesce(magia->>'tipoDano','')));
  END IF;
  FOR parte IN SELECT value FROM jsonb_array_elements(partes) LOOP
    IF jsonb_typeof(parte) IS DISTINCT FROM 'object'
      OR jsonb_typeof(parte->'dado') IS DISTINCT FROM 'string' OR length(parte->>'dado')>120
      OR jsonb_typeof(parte->'tipo') IS DISTINCT FROM 'string' OR length(parte->>'tipo')>120
      OR jsonb_typeof(parte->'id') IS DISTINCT FROM 'string'
      OR (parte->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR (parte->>'id')=ANY(ids)
      OR jsonb_typeof(parte->'atributo') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Parcela de dano inválida.';
    END IF;
    ids:=array_append(ids,parte->>'id');
    formula:=lower(regexp_replace(parte->>'dado','[[:space:]]','','g'));
    atributo:=parte->>'atributo';
    IF atributo NOT IN ('','for','des','con','int','sab','car') THEN
      RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Atributo de dano inválido.';
    END IF;
    IF formula='' THEN CONTINUE; END IF;
    -- Valida a expressão isolada antes da concatenação para evitar que um sinal
    -- incompleto se torne uma fórmula diferente ao juntar a próxima parcela.
    IF formula !~ '^[+-]?([0-9]{1,3}d[0-9]{1,4}(k[hl][0-9]{1,3})?|[0-9]{1,4})([+-]([0-9]{1,3}d[0-9]{1,4}(k[hl][0-9]{1,3})?|[0-9]{1,4}))*$' THEN
      RAISE EXCEPTION USING ERRCODE='WC003',MESSAGE='Fórmula de dano inválida.';
    END IF;
    IF atributo<>'' THEN
      dados_atributo:=c->'atributos'->atributo;
      modificador:=floor((private.inteiro_chat(dados_atributo->'valor',1,100)-10)/2.0)::int
        +private.inteiro_chat(dados_atributo->'ajusteModificador',-999,999);
      IF modificador<>0 THEN formula:=formula||CASE WHEN modificador>0 THEN '+' ELSE '' END||modificador; END IF;
    END IF;
    IF left(formula,1)='+' THEN formula:=substr(formula,2); END IF;
    tipo:=coalesce(nullif(btrim(parte->>'tipo'),''),'Sem tipo');
    SELECT count(*)::int INTO quantidade FROM regexp_matches(formula,'([+-]?)([0-9]{1,3}d[0-9]{1,4}(?:k[hl][0-9]{1,3})?|[0-9]{1,4})','g');
    prontas:=prontas||jsonb_build_array(jsonb_build_object('id',parte->>'id','tipo',tipo,'expressao',formula,'inicio',inicio,'quantidade',quantidade));
    inicio:=inicio+quantidade;
    expressao:=expressao||CASE WHEN expressao<>'' AND left(formula,1)<>'-' THEN '+' ELSE '' END||formula;
  END LOOP;
  -- O parser aplica os limites de 120 caracteres e 100 dados à soma inteira.
  resultado:=private.rolar_dados(expressao);
  FOR parte IN SELECT value FROM jsonb_array_elements(prontas) LOOP
    SELECT coalesce(sum((termo->>'subtotal')::int),0)::int INTO subtotal
      FROM jsonb_array_elements(resultado->'termos') WITH ORDINALITY t(termo,ord)
      WHERE ord>(parte->>'inicio')::int AND ord<=(parte->>'inicio')::int+(parte->>'quantidade')::int;
    saida:=saida||jsonb_build_array((parte-ARRAY['inicio','quantidade'])||jsonb_build_object('total',subtotal));
  END LOOP;
  RETURN resultado||jsonb_build_object('parcelas',saida);
END $$;
REVOKE ALL ON FUNCTION private.rolar_dano_magia(jsonb,jsonb) FROM PUBLIC,anon,authenticated;

-- Preserva ações de ficha, recibos, autorização, versão, segredo e outras
-- alterações já aplicadas à função. Aborta se a definição esperada divergir.
DO $migration$
DECLARE definition text; needle text:='dados:=private.rolar_dados(e->>''dano''); rotulo:=e->>''nome'';';
BEGIN
  definition:=pg_get_functiondef('private.acao_chat(uuid,uuid,text,jsonb)'::regprocedure);
  IF length(definition)-length(replace(definition,needle,''))<>length(needle) THEN
    RAISE EXCEPTION 'Definição inesperada da ação de dano de magia.';
  END IF;
  EXECUTE replace(definition,needle,'dados:=private.rolar_dano_magia(c,e); rotulo:=e->>''nome'';');
END $migration$;
COMMIT;
