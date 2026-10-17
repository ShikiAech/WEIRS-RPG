BEGIN;

-- Optional mechanical metadata uses the existing typed TypeScript contracts.
-- NULL preserves revisions imported before these mechanics were available.
-- obter_compendio already returns complete domain rows with to_jsonb.
ALTER TABLE public.compendio_especies
  ADD COLUMN regras_forma jsonb
    CHECK (jsonb_typeof(regras_forma) = 'array');

ALTER TABLE public.compendio_caracteristicas
  ADD COLUMN efeitos_forma jsonb
    CHECK (jsonb_typeof(efeitos_forma) = 'object'),
  ADD COLUMN pre_requisito_magia jsonb
    CHECK (jsonb_typeof(pre_requisito_magia) = 'object'),
  ADD COLUMN bonus_pericias jsonb
    CHECK (jsonb_typeof(bonus_pericias) = 'array');

-- Keep the original operator allowlist and admit the new exclusion predicate.
ALTER TABLE public.compendio_requisitos
  DROP CONSTRAINT compendio_requisitos_operador_check,
  ADD CONSTRAINT compendio_requisitos_operador_check CHECK (
    operador IN ('todos','qualquer','nivel','nivel-classe','atributo',
      'proficiencia','caracteristica','talento','especie','linhagem','escolha','repeticoes','ausente')
  );

-- Spell choices can qualify a referenced spell as unavailable when already
-- prepared. Preserve the single-target rule for every other combination.
ALTER TABLE public.compendio_opcoes_escolha
  DROP CONSTRAINT compendio_opcoes_escolha_check,
  ADD CONSTRAINT compendio_opcoes_escolha_check CHECK (
    num_nonnulls(alvo_revisao_id,atributo_codigo,proficiencia_id,valor) = 1
    OR (
      tipo = 'magia' AND valor = 'nao-preparada'
      AND alvo_revisao_id IS NOT NULL
      AND atributo_codigo IS NULL AND proficiencia_id IS NULL
    )
  );

COMMIT;
