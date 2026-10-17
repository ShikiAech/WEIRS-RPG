import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type {
  CompendiumRepository,
  CreationCatalog,
} from '../../../../packages/contracts/character-creation';
import type { CampaignRecord, SheetRepository } from '../../../../packages/contracts/sheets';
import { resolveCreation } from '../../../../packages/character-creation/resolve';
import {
  validateCreationRequest,
  type CreationRequest,
} from '../../../../packages/character-creation/server';
import { publicError } from '../../lib/errors';
import { useCreationDraft, openTemporaryCreation } from './useCreationDraft';
import { AbilityStep } from './AbilityStep';
import { SpeciesStep } from './SpeciesStep';
import { BackgroundStep } from './BackgroundStep';
import { ClassStep } from './ClassStep';
import { HitPointStep } from './HitPointStep';
import { SpellStep } from './SpellStep';
import { ReviewStep } from './ReviewStep';
import { CreationSummary } from './CreationSummary';
import { pruneDependentChoices } from './origins';
const steps = [
  'Atributos',
  'Espécie',
  'Antecedente',
  'Classes',
  'Vida e defesas',
  'Magias',
  'Revisão',
];
const components = [
  AbilityStep,
  SpeciesStep,
  BackgroundStep,
  ClassStep,
  HitPointStep,
  SpellStep,
  ReviewStep,
];
const emptyCatalog: CreationCatalog = {
  ruleSetId: 'dnd-5e-2024',
  entries: [],
  requirements: [],
  choices: [],
  grants: [],
  effects: [],
  proficiencies: [],
  castingProfiles: [],
  equipmentOptions: [],
  multiclassSlots: [],
};
export function CharacterCreator({
  user,
  repository,
  compendium,
  initialCampaign = '',
  demo = false,
}: {
  user: User | null;
  repository: SheetRepository | null;
  compendium: CompendiumRepository;
  initialCampaign?: string;
  demo?: boolean;
}) {
  const state = useCreationDraft(demo ? 'demonstracao' : user!.id, initialCampaign);
  const { draft, step, name, campaignId } = state.value;
  const [catalog, setCatalog] = useState(emptyCatalog),
    [catalogKey, setCatalogKey] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(''),
    [retry, setRetry] = useState(0);
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const [serverFields, setServerFields] = useState<{ campo: string; mensagem: string }[]>([]);
  const busy = useRef(false),
    finished = useRef(false),
    mounted = useRef(true),
    stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const key = JSON.stringify([
    draft.ruleSetId,
    draft.speciesRef,
    draft.lineageRef,
    draft.backgroundRef,
    draft.classes.map((c) => [c.classRef, c.subclassRef]),
    draft.choices.flatMap((c) => c.values.flatMap((v) => (v.type === 'record' ? [v.ref] : []))),
    draft.spellSelections.map((s) => s.spellRef),
  ]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    compendium
      .getCreationCatalog(draft, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setCatalog(data);
          setCatalogKey(key);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setLoadError(
            'Não foi possível carregar as regras desta criação. Suas escolhas foram preservadas.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [compendium, key, retry]);
  useEffect(() => {
    if (loading || loadError || catalogKey !== key || state.value.attempt) return;
    const next = pruneDependentChoices(catalog, draft);
    if (JSON.stringify(next) !== JSON.stringify(draft))
      state.update((current) => ({ ...current, draft: next }));
  }, [catalog, catalogKey, key, loading, loadError, draft, state.value.attempt]);
  useEffect(() => {
    if (demo || !repository) return;
    let active = true;
    repository
      .campaigns()
      .then((access) => {
        if (active)
          setCampaigns(
            access.campaigns.filter((c) =>
              access.memberships.some(
                (m) =>
                  m.campanha_id === c.id && m.usuario_id === user?.id && m.papel !== 'espectador',
              ),
            ),
          );
      })
      .catch(() => {
        if (active)
          setError(
            'Não foi possível carregar suas campanhas. Atualize a página para tentar novamente.',
          );
      });
    return () => {
      active = false;
    };
  }, [repository, user?.id, demo]);
  useEffect(() => {
    stage.current?.focus();
  }, [step]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if ((state.dirty || busy.current) && !finished.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const navigate = (e: Event) => {
      if (
        (state.dirty || busy.current) &&
        !finished.current &&
        !window.confirm('Seu rascunho está nesta sessão. Deseja sair da criação?')
      )
        e.preventDefault();
    };
    window.addEventListener('beforeunload', leave);
    window.addEventListener('weirs:before-navigation', navigate);
    window.addEventListener('weirs:before-account-change', navigate);
    return () => {
      window.removeEventListener('beforeunload', leave);
      window.removeEventListener('weirs:before-navigation', navigate);
      window.removeEventListener('weirs:before-account-change', navigate);
    };
  }, [state.dirty]);
  const preview = useMemo(() => resolveCreation(catalog, draft), [catalog, draft]);
  const Component = components[step];
  const canSubmit =
    (!demo && !!state.value.attempt) ||
    (!loading &&
      !loadError &&
      !preview.problems.length &&
      !!preview.sheet &&
      !!name.trim() &&
      (demo || !!campaignId));
  async function create() {
    if (busy.current || !canSubmit) return;
    const request: CreationRequest | null =
      state.value.attempt ??
      (preview.sheet
        ? {
            campaignId: demo ? '00000000-0000-4000-8000-000000000001' : campaignId,
            name: name.trim(),
            requestId: state.value.requestId,
            draft: structuredClone(draft),
            expectedSheet: preview.sheet,
          }
        : null);
    if (!request) return;
    busy.current = true;
    setSaving(true);
    setError('');
    setServerFields([]);
    state.update((current) => ({ ...current, attempt: request }));
    try {
      if (demo) {
        const canonical = validateCreationRequest(catalog, request);
        openTemporaryCreation(request.name, canonical.content);
        finished.current = true;
        state.clear();
        window.location.hash = '/fichas/teste';
      } else {
        const record = await repository!.createFromChoices(request);
        if (!mounted.current) return;
        finished.current = true;
        state.clear();
        window.location.hash = `/fichas/${record.id}`;
      }
    } catch (e) {
      if (mounted.current) {
        const problem = publicError(e);
        setError(problem.message);
        setServerFields(problem.fields);
        if (problem.code === 'VALIDACAO')
          state.update((current) => ({
            ...current,
            attempt: undefined,
            requestId: current.requestId,
          }));
      }
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  return (
    <div className="page character-creator">
      <div className="page-heading heading-with-action">
        <div>
          <p className="eyebrow">Uma nova história em Weirs</p>
          <h1>Criar personagem</h1>
          <p>Escolha suas origens. Veja cada benefício tomar forma.</p>
        </div>
        <a
          href={
            demo
              ? '#/fichas/teste'
              : `#/fichas/nova?modo=manual${initialCampaign ? `&campanha=${encodeURIComponent(initialCampaign)}` : ''}`
          }
          className="button secondary"
        >
          Preencher manualmente
        </a>
      </div>
      {demo && (
        <p className="notice">
          Demonstração do assistente · catálogo de demonstração. Ao concluir, você abrirá uma ficha
          temporária para conferir e baixar.
        </p>
      )}
      <nav className="creation-steps" aria-label="Etapas de criação">
        {steps.map((label, index) => (
          <button
            key={label}
            aria-current={step === index ? 'step' : undefined}
            onClick={() => state.update((current) => ({ ...current, step: index }))}
          >
            <span>{index + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      {loadError && (
        <div className="notice error" role="alert">
          {loadError}
          <button className="button secondary" onClick={() => setRetry((n) => n + 1)}>
            Tentar novamente
          </button>
        </div>
      )}
      <div className="creation-layout">
        <div className="creation-workspace">
          <p className="eyebrow" id="creation-stage-title">
            Etapa {step + 1} de 7 · {steps[step]}
          </p>
          {loading && <p role="status">Atualizando regras e benefícios…</p>}
          <div
            ref={stage}
            tabIndex={-1}
            aria-labelledby="creation-stage-title"
            className="creation-stage"
          >
            <fieldset className="creation-stage-fields" disabled={saving || !!state.value.attempt}>
              <Component
                draft={draft}
                catalog={catalog}
                preview={preview}
                repository={compendium}
                onChange={(next) => {
                  setError('');
                  state.update((current) => ({
                    ...current,
                    draft: next,
                  }));
                }}
              />
              {step === 6 && (
                <div className="creation-fields">
                  <label>
                    Nome do personagem
                    <input
                      maxLength={120}
                      value={name}
                      onChange={(e) =>
                        state.update((current) => ({ ...current, name: e.target.value }))
                      }
                    />
                  </label>
                  {!demo && (
                    <label>
                      Campanha
                      <select
                        aria-label="Campanha"
                        value={campaignId}
                        onChange={(e) =>
                          state.update((current) => ({ ...current, campaignId: e.target.value }))
                        }
                      >
                        <option value="">Escolha uma campanha…</option>
                        {campaigns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nome}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}
            </fieldset>
          </div>
          {error && (
            <div className="notice error" role="alert">
              {error}
              {serverFields.length > 0 && (
                <ul>
                  {serverFields.map((p, i) => (
                    <li key={i}>{p.mensagem}</li>
                  ))}
                </ul>
              )}
              {state.value.attempt && (
                <div>
                  <p>
                    A tentativa foi preservada. Use o botão de concluir novamente para consultar o
                    mesmo pedido.
                  </p>
                  <p>Confirme o resultado desta tentativa antes de editar as escolhas.</p>
                </div>
              )}
            </div>
          )}
          <div className="creation-navigation">
            <button
              className="button secondary"
              disabled={step === 0 || saving}
              onClick={() => state.update((current) => ({ ...current, step: step - 1 }))}
            >
              Etapa anterior
            </button>
            {step < 6 ? (
              <button
                className="button"
                onClick={() => state.update((current) => ({ ...current, step: step + 1 }))}
              >
                Próxima etapa
              </button>
            ) : (
              <button
                className="button"
                disabled={saving || !canSubmit}
                onClick={() => void create()}
              >
                {saving
                  ? 'Criando personagem…'
                  : demo
                    ? 'Abrir ficha temporária'
                    : 'Criar ficha na campanha'}
              </button>
            )}
          </div>
        </div>
        <CreationSummary draft={draft} catalog={catalog} preview={preview} />
      </div>
    </div>
  );
}
