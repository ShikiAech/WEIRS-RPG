BEGIN;

-- O grafo público pode ultrapassar 10 MB. O custo inicial do leitor e da
-- serialização do PostgREST pode exceder os 3 segundos do papel anônimo.
-- Aplique o orçamento de 8 segundos somente a esta RPC, sem mudar os limites
-- de entrada, a travessia, as permissões ou os demais endpoints.
ALTER FUNCTION public.obter_compendio(uuid[],text) SET statement_timeout = '8s';
NOTIFY pgrst, 'reload schema';

COMMIT;
