BEGIN;

-- As ações continuam nas listas v1. A remoção final do equipamento deve
-- limpar seus vínculos na mesma transação da venda/gravação da ficha.
CREATE FUNCTION private.limpar_vinculos_equipamento() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE removidos text[]; chave text; lista jsonb;
BEGIN
  SELECT array_agg(item->>'id') INTO removidos
  FROM jsonb_array_elements(OLD.conteudo#>'{inventario,itens}') item
  WHERE NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.conteudo#>'{inventario,itens}') atual
    WHERE atual->>'id'=item->>'id'
  );
  IF removidos IS NULL THEN RETURN NEW; END IF;
  FOREACH chave IN ARRAY ARRAY['ataques','recursos'] LOOP
    SELECT coalesce(jsonb_agg(value ORDER BY ordinality),'[]'::jsonb) INTO lista
    FROM jsonb_array_elements(NEW.conteudo->chave) WITH ORDINALITY
    WHERE NOT coalesce(value->>'itemId'=ANY(removidos),false);
    NEW.conteudo:=jsonb_set(NEW.conteudo,ARRAY[chave],lista);
  END LOOP;
  SELECT coalesce(jsonb_agg(value ORDER BY ordinality),'[]'::jsonb) INTO lista
  FROM jsonb_array_elements(NEW.conteudo#>'{inventario,sintonizados}') WITH ORDINALITY
  WHERE NOT coalesce(value->>'itemId'=ANY(removidos),false);
  NEW.conteudo:=jsonb_set(NEW.conteudo,'{inventario,sintonizados}',lista);
  RETURN NEW;
END $$;

-- Executa antes de weirs_proteger_ficha, que valida o conteúdo resultante.
CREATE TRIGGER weirs_limpar_vinculos_equipamento BEFORE UPDATE OF conteudo ON public.fichas
FOR EACH ROW EXECUTE FUNCTION private.limpar_vinculos_equipamento();
REVOKE ALL ON FUNCTION private.limpar_vinculos_equipamento() FROM PUBLIC, anon, authenticated;

COMMIT;
