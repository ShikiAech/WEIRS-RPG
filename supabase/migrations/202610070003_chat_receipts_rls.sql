-- Correção para projetos que já executaram a migração inicial do chat.
-- Também pode ser executada depois da versão corrigida: habilitar RLS é idempotente.
BEGIN;
ALTER TABLE private.comandos_chat ENABLE ROW LEVEL SECURITY;
COMMIT;
