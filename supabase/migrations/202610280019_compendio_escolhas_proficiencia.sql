BEGIN;

-- NULL preserves immutable older revisions with a fixed maximum.
ALTER TABLE public.compendio_grupos_escolha
  ADD COLUMN maximo_por_proficiencia boolean;

COMMIT;
