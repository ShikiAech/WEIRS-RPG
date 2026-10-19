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
import { useCreationDraft, openTemporaryCreation, type CreatorDraft } from './useCreationDraft';
import { AbilityStep } from './AbilityStep';
import { SpeciesStep } from './SpeciesStep';
import { BackgroundStep } from './BackgroundStep';
import { ClassStep } from './ClassStep';
import { HitPointStep } from './HitPointStep';
import { SpellStep } from './SpellStep';
import { ReviewStep } from './ReviewStep';
import { CreationSummary } from './CreationSummary';
import { CreationLoading } from './CreationLoading';
import { Dropdown } from '../../components/Dropdown';
import { pruneDependentChoices } from './origins';
import { commitClassLevels } from './class-levels';
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
  const { draft, step, name, campaignId, classLevelInputs } = state.value;
  const [catalog, setCatalog] = useState(emptyCatalog),
    [catalogKey, setCatalogKey] = useState<string | null>(null),
    [catalogRulesKey, setCatalogRulesKey] = useState<string | null>(null),
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
  const rulesKey = JSON.stringify([
    draft.ruleSetId,
    draft.speciesRef,
    draft.lineageRef,
    draft.backgroundRef,
    draft.classes.map((c) => [c.classRef, c.subclassRef]),
    draft.choices.flatMap((c) => c.values.flatMap((v) => (v.type === 'record' ? [v.ref] : []))),
  ]);
  const key = JSON.stringify([rulesKey, draft.spellSelections.map((s) => s.spellRef)]);
  const stageLoading = loading && step !== 0 && catalogRulesKey !== rulesKey;
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
          setCatalogRulesKey(rulesKey);
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
    const reconcile = (current: CreatorDraft): CreatorDraft => {
      if (current.attempt) return current;
      // Reload ends the old focus/blur lifecycle. Commit restored valid edits once rules are ready,
      // while leaving the actively edited input and invalid values untouched.
      const committed = commitClassLevels(
        current.draft,
        catalog,
        current.classLevelInputs,
        document.activeElement?.id,
      );
      const next = pruneDependentChoices(catalog, committed);
      return JSON.stringify(next) === JSON.stringify(current.draft)
        ? current
        : { ...current, draft: next };
    };
    const next = reconcile(state.value);
    if (next !== state.value)
      state.update((current) => (current === state.value ? next : reconcile(current)));
  }, [catalog, catalogKey, key, loading, loadError, draft, classLevelInputs, state.value.attempt]);
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
  const preview = useMemo(() => {
    const resolved = resolveCreation(catalog, draft);
    const problems = [...resolved.problems];
    for (const cls of draft.classes) {
      const input = classLevelInputs?.[cls.id];
      if (input === undefined) continue;
      const n = Number(input);
      const message = !input.trim()
        ? 'O nível da classe é obrigatório.'
        : !Number.isInteger(n) || n < 1 || n > 20
          ? 'Informe um nível inteiro entre 1 e 20.'
          : '';
      if (message)
        problems.push({
          code: 'CLASS_LEVEL',
          field: `classes.${cls.id}.level`,
          message,
          sourceRevisionId: cls.classRef.revisionId,
        });
    }
    return { ...resolved, problems, sheet: problems.length ? null : resolved.sheet };
  }, [catalog, draft, classLevelInputs]);
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
          <div
            ref={stage}
            tabIndex={-1}
            aria-labelledby="creation-stage-title"
            className="creation-stage"
            aria-busy={stageLoading}
          >
            {stageLoading && (
              <div className="creation-stage-loading">
                <CreationLoading label="Carregando regras e benefícios…" skeleton />
              </div>
            )}
            <fieldset
              className="creation-stage-fields"
              disabled={saving || !!state.value.attempt || stageLoading}
            >
              <Component
                draft={draft}
                catalog={catalog}
                preview={preview}
                repository={compendium}
                classLevelInputs={classLevelInputs}
                onChange={(next, inputs) => {
                  setError('');
                  state.update((current) => ({
                    ...current,
                    draft: next,
                    classLevelInputs: Object.fromEntries(
                      next.classes.flatMap((cls) => {
                        const previous = current.draft.classes.find((c) => c.id === cls.id);
                        const input = (inputs ?? current.classLevelInputs)?.[cls.id];
                        return previous?.classRef.revisionId === cls.classRef.revisionId &&
                          input !== undefined
                          ? [[cls.id, input]]
                          : [];
                      }),
                    ),
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
                    <Dropdown
                      label="Campanha"
                      searchable={false}
                      placeholder="Escolha uma campanha…"
                      value={campaignId || null}
                      onSelect={(selectedCampaign) =>
                        state.update((current) => ({ ...current, campaignId: selectedCampaign }))
                      }
                      onClear={() => state.update((current) => ({ ...current, campaignId: '' }))}
                      options={campaigns.map((c) => ({ value: c.id, label: c.nome }))}
                    />
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
        <CreationSummary draft={draft} catalog={catalog} preview={preview} loading={loading} />
      </div>
    </div>
  );
}
