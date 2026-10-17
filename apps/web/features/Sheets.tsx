import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type {
  SheetContent,
  SheetRecord,
  SheetRepository,
  CampaignRecord,
  CampaignMembership,
} from '../../../packages/contracts/sheets';
import type { CompendiumSummary, CompendiumKind } from '../../../packages/contracts/compendium';
import { criarConteudo, validarFicha, UUID } from '../../../packages/sheets/modelo.js';
import { supabase } from '../lib/supabase';
import { createRepository } from '../lib/repository';
import { publicError, SheetError } from '../lib/errors';
import { markEdited, acknowledgeSave } from '../lib/editor-state';
import { compendiumSource } from '../lib/compendium-source';
import { SheetForm } from './sheets/SheetForm';
import { CampaignCopy } from './sheets/CampaignCopy';
import { readSheetFile } from '../lib/sheet-file';
import { fieldLabel } from './sheets/fields';
import { SheetChat } from './sheets/SheetChat';
import { PdfImportPreview } from './sheets/PdfImportPreview';
import { readRoll20Pdf } from '../lib/roll20-pdf-file';
import type { Roll20PdfImport } from '../../../packages/sheets/roll20-pdf';
import { CharacterCreator } from './character-creation/CharacterCreator';
import { temporaryCreation,clearTemporaryCreation } from './character-creation/useCreationDraft';
import { CreationHistory } from './sheets/CreationHistory';

type Draft = { name: string; content: SheetContent; campaignId: string };
const drafts = new Map<string, Draft & { base?: SheetRecord; requestId?: string }>();

export function Sheets({
  route,
  user,
  authReady,
}: {
  route: string;
  user: User | null;
  authReady: boolean;
}) {
  const repository = useMemo(() => (supabase ? createRepository(supabase) : null), []);
  const suffix = route.split('/')[2]?.split('?')[0];
  const initialCampaign = new URLSearchParams(route.split('?')[1] || '').get('campanha') || '';
  const params = new URLSearchParams(route.split('?')[1] || '');
  if (suffix === 'nova' && params.get('demo') === '1')
    return <CharacterCreator user={null} repository={null} compendium={compendiumSource(true).repository} demo />;
  if (suffix === 'teste')
    return <SheetEditor key="teste" id="teste" user={null} repository={null} />;
  if (!authReady)
    return (
      <div className="page">
        <p role="status">Recuperando sua sessão…</p>
      </div>
    );
  if (!user || !repository)
    return (
      <div className="page">
        <div className="page-heading">
          <p className="eyebrow">Seus companheiros de jornada</p>
          <h1>Fichas de personagens</h1>
          <p>Atributos, magias, recursos e histórias em um só lugar.</p>
        </div>
        <section className="welcome-panel">
          <span className="ornament">✦</span>
          <h2>Prepare seu personagem.</h2>
          <p>
            {supabase
              ? 'Entre com Google para abrir as fichas da sua mesa.'
              : 'O acesso às fichas salvas será liberado quando a mesa estiver configurada.'}
          </p>
          <a className="button" href="#/fichas/teste">
            Experimentar ficha
          </a>
          <a className="button secondary" href="#/fichas/nova?demo=1">Experimentar criação guiada</a>
          <p className="muted">
            A ficha temporária permite explorar todos os campos e baixar uma cópia. Ela não é salva
            na mesa.
          </p>
        </section>
      </div>
    );
  if (suffix === 'nova' && params.get('modo') !== 'manual')
    return <CharacterCreator user={user} repository={repository} compendium={compendiumSource().repository} initialCampaign={initialCampaign} />;
  if (suffix)
    return (
      <SheetEditor
        key={suffix + initialCampaign}
        id={suffix}
        initialCampaign={initialCampaign}
        user={user}
        repository={repository}
      />
    );
  return <SheetList user={user} repository={repository} />;
}
function SheetList({ user, repository }: { user: User; repository: SheetRepository }) {
  const [rows, setRows] = useState<SheetRecord[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([repository.list(), repository.campaigns()])
      .then(([rows, data]) => {
        if (active) {
          setRows(rows);
          setCampaigns(data.campaigns);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(publicError(e).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repository, retry]);
  return (
    <div className="page">
      <div className="page-heading heading-with-action">
        <div>
          <p className="eyebrow">Seus companheiros de jornada</p>
          <h1>Fichas de personagens</h1>
          <p>Suas fichas e os personagens que você acompanha como mestre.</p>
        </div>
        <a className="button" href="#/fichas/nova">
          Criar personagem +
        </a>
      </div>
      {loading && <p role="status">Abrindo suas fichas…</p>}
      {error && (
        <div className="notice error" role="alert">
          {error}
          <button className="button secondary" onClick={() => setRetry(retry + 1)}>
            Tentar novamente
          </button>
        </div>
      )}
      {!loading && !error && !campaigns.length && (
        <p className="notice">
          Sua conta ainda não está vinculada a uma campanha.{' '}
          <a href="#/campanhas">Escolha uma campanha e entre como jogador.</a>
        </p>
      )}
      {!loading && !error && campaigns.length > 0 && !rows.length && (
        <section className="welcome-panel">
          <h2>A primeira aventura começa na ficha.</h2>
          <p>Você ainda não tem personagens salvos. Crie o primeiro para sua campanha.</p>
          <a className="button" href="#/fichas/nova">
            Criar primeira ficha
          </a>
        </section>
      )}
      <div className="content-grid">
        {rows.map((row) => (
          <article className="content-card" key={row.id}>
            <p className="eyebrow">
              {campaigns.find((c) => c.id === row.campanha_id)?.nome || 'Campanha'}
            </p>
            <h2>
              <a href={`#/fichas/${row.id}`}>{row.nome}</a>
            </h2>
            <p>{row.conteudo.identidade.especie || 'Espécie a definir'}</p>
            <p>
              {row.proprietario_id === user.id ? 'Seu personagem' : 'Acesso de mestre'} · Versão{' '}
              {row.versao}
            </p>
            <a href={`#/fichas/${row.id}`}>Abrir ficha →</a>
          </article>
        ))}
      </div>
    </div>
  );
}
function SheetEditor({
  id,
  initialCampaign = '',
  user,
  repository,
}: {
  id: string;
  initialCampaign?: string;
  user: User | null;
  repository: SheetRepository | null;
}) {
  const temporary = id === 'teste';
  const draftKey = user
    ? `${user.id}:${id}${id === 'nova' && initialCampaign ? ':' + initialCampaign : ''}`
    : '';
  const [draft, setDraft] = useState<Draft>(
    () => drafts.get(draftKey) || (temporary && temporaryCreation() ? {...temporaryCreation()!,campaignId:''} : { name: '', content: criarConteudo(), campaignId: '' }),
  );
  const [record, setRecord] = useState<SheetRecord | null>(null);
  useEffect(()=>{if(temporary)clearTemporaryCreation();},[temporary]);
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [memberships, setMemberships] = useState<CampaignMembership[]>([]);
  const [admin, setAdmin] = useState(false);
  const { repository: compendium, demo: demoCatalog } = compendiumSource(temporary);
  const [catalog, setCatalog] = useState<CompendiumSummary[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [loading, setLoading] = useState(!temporary);
  const [loadRetry, setLoadRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<SheetError | null>(null);
  const [revision, setRevision] = useState({
    revision: drafts.has(draftKey) ? 1 : 0,
    savedRevision: 0,
  });
  const revisionRef = useRef(revision);
  const draftRef = useRef(draft);
  const activeDraftKey = useRef(draftKey);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const fileInput = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const pdfController = useRef<AbortController | null>(null);
  const [pdfReading, setPdfReading] = useState('');
  const [pdfPreview, setPdfPreview] = useState<Roll20PdfImport | null>(null);
  const [pdfWarnings, setPdfWarnings] = useState<string[]>([]);
  useEffect(() => () => pdfController.current?.abort(), []);
  const [creationId] = useState(() => drafts.get(draftKey)?.requestId || crypto.randomUUID());
  const dirty = revision.revision !== revision.savedRevision;
  const allowedCampaigns = campaigns.filter((c) =>
    memberships.some(
      (m) => m.campanha_id === c.id && m.usuario_id === user?.id && m.papel !== 'espectador',
    ),
  );
  const canEdit =
    temporary ||
    memberships.some(
      (m) =>
        m.campanha_id === (record?.campanha_id || draft.campaignId) &&
        m.usuario_id === user?.id &&
        (m.papel === 'mestre' ||
          (m.papel === 'jogador' && (!record || record.proprietario_id === user?.id))),
    );
  useEffect(() => {
    const controller = new AbortController();
    Promise.all((['classe','especie','antecedente','talento'] as CompendiumKind[]).map(async kind => {
      const entries: CompendiumSummary[] = []; let cursor: string | undefined;
      do {
        const page = await compendium.list({ruleSetId:'dnd-5e-2024',kind,limit:100,cursor},controller.signal);
        entries.push(...page.entries); cursor = page.nextCursor ?? undefined;
      } while (cursor);
      return entries;
    })).then(lists => { if (!controller.signal.aborted) setCatalog(lists.flat()); })
      .catch(() => { if (!controller.signal.aborted) setCatalogError('As sugestões do compêndio não estão disponíveis. Os campos manuais continuam disponíveis.'); });
    return () => controller.abort();
  }, [compendium]);
  useEffect(() => {
    if (temporary || !repository) return;
    let active = true;
    setLoading(true);
    setError(null);
    (async () => {
      const data = await repository.campaigns();
      if (!active) return;
      setCampaigns(data.campaigns);
      setMemberships(data.memberships);
      setAdmin(data.admin);
      if (id !== 'nova') {
        if (!UUID.test(id)) throw new SheetError('ACESSO');
        const row = await repository.get(id);
        if (!active) return;
        // O rascunho foi criado sobre uma versão específica. Reabrir não autoriza
        // sobrescrever alterações que o mestre fez enquanto a ficha estava fechada.
        setRecord(drafts.get(draftKey)?.base || row);
        if (!drafts.has(draftKey))
          setDraft({ name: row.nome, content: row.conteudo, campaignId: row.campanha_id });
      } else if (!drafts.has(draftKey)) {
        const first = data.campaigns.find((c) =>
          data.memberships.some(
            (m) => m.campanha_id === c.id && m.usuario_id === user?.id && m.papel !== 'espectador',
          ),
        );
        const requested = data.campaigns.find(
          (c) =>
            c.id === initialCampaign &&
            data.memberships.some(
              (m) =>
                m.campanha_id === c.id && m.usuario_id === user?.id && m.papel !== 'espectador',
            ),
        );
        setDraft((d) => ({ ...d, campaignId: requested?.id || first?.id || '' }));
      }
    })()
      .catch((e) => {
        if (active) setError(publicError(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, repository, temporary, draftKey, user?.id, loadRetry, initialCampaign]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (revisionRef.current.revision !== revisionRef.current.savedRevision || pending.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const navigate = (event: Event) => {
      if (
        (revisionRef.current.revision !== revisionRef.current.savedRevision || pending.current) &&
        !window.confirm('Há alterações pendentes. Deseja sair desta ficha?')
      )
        event.preventDefault();
    };
    const account = (event: Event) => {
      if (
        (dirty || pending.current) &&
        !window.confirm('Há alterações pendentes. Baixe sua ficha antes de sair. Deseja continuar?')
      )
        event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('weirs:before-navigation', navigate);
    window.addEventListener('weirs:before-account-change', account);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('weirs:before-navigation', navigate);
      window.removeEventListener('weirs:before-account-change', account);
    };
  }, [dirty]);
  function edit(next: Draft) {
    draftRef.current = next;
    setDraft(next);
    if (activeDraftKey.current)
      drafts.set(activeDraftKey.current, {
        ...next,
        base: record || undefined,
        requestId: creationId,
      });
    revisionRef.current = markEdited(revisionRef.current);
    setRevision(revisionRef.current);
    setMessage('');
  }
  async function save() {
    if (pending.current || !repository || !canEdit || error?.code === 'CONFLITO') return;
    const fields = validarFicha({ nome: draft.name, conteudo: draft.content, versao_esquema: 1 });
    if (fields.length) {
      setError(new SheetError('VALIDACAO', fields));
      return;
    }
    const submitted = revision.revision;
    pending.current = true;
    setSaving(true);
    setError(null);
    setMessage('');
    try {
      const next = record
        ? await repository.save(record, draft.name, draft.content)
        : await repository.create(draft.campaignId, draft.name, draft.content, creationId);
      if (!mounted.current) return;
      setRecord(next);
      revisionRef.current = acknowledgeSave(revisionRef.current, submitted);
      setRevision(revisionRef.current);
      setMessage('Ficha salva na mesa.');
      if (!record) {
        window.history.replaceState(null, '', `#/fichas/${next.id}`);
        drafts.delete(activeDraftKey.current);
        activeDraftKey.current = `${user!.id}:${next.id}`;
      }
      if (submitted === revisionRef.current.revision) drafts.delete(activeDraftKey.current);
      else
        drafts.set(activeDraftKey.current, {
          ...draftRef.current,
          base: next,
          requestId: creationId,
        });
    } catch (e) {
      setError(publicError(e));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  function download() {
    const blob = new Blob(
      [
        JSON.stringify({
          nome: draft.name,
          conteudo: draft.content,
          versao_esquema: 1,
          campanha_id: draft.campaignId,
        }),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'weirs-ficha.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importFile(file: File) {
    try {
      if (file.size > 262144)
        throw new SheetError('VALIDACAO', [
          { campo: 'arquivo', mensagem: 'O arquivo deve ter até 256 KiB.' },
        ]);
      const recovered = readSheetFile(await file.text());
      if (dirty && !window.confirm('Importar substitui os campos desta ficha. Deseja continuar?'))
        return;
      if(record?.conteudo.criacao)recovered.content.criacao=record.conteudo.criacao;
      edit({ ...draft, ...recovered });
      setPdfWarnings([]);
      setError(null);
      setMessage(recovered.content.criacao?'Cópia importada para edição manual. O histórico inicial foi preservado; confira os campos e a disponibilidade das origens antes de salvar.':'Cópia importada. Confira os campos antes de salvar.');
    } catch (error) {
      setError(publicError(error));
    }
  }
  async function importPdf(file: File) {
    if (pdfController.current) return;
    const controller = new AbortController();
    pdfController.current = controller;
    setPdfReading('Abrindo PDF…');
    setError(null);
    try {
      const result = await readRoll20Pdf(file, {
        signal: controller.signal,
        onProgress: (page, total) => setPdfReading(`Lendo página ${page} de ${total}…`),
      });
      if (mounted.current && !controller.signal.aborted) setPdfPreview(result);
    } catch (e) {
      if (mounted.current && !controller.signal.aborted)
        setError(
          new SheetError('VALIDACAO', [
            {
              campo: 'arquivo',
              mensagem: e instanceof Error ? e.message : 'Não foi possível ler o PDF.',
            },
          ]),
        );
    } finally {
      pdfController.current = null;
      if (mounted.current) setPdfReading('');
    }
  }
  async function remove() {
    if (!record || !repository || pending.current) return;
    if (
      window.prompt(`Para excluir definitivamente, digite o nome: ${record.nome}`) !== record.nome
    )
      return;
    pending.current = true;
    setSaving(true);
    try {
      await repository.remove(record.id);
      drafts.delete(activeDraftKey.current);
      revisionRef.current = { revision: 0, savedRevision: 0 };
      setRevision(revisionRef.current);
      window.location.hash = '/fichas';
    } catch (e) {
      setError(publicError(e));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  if (loading)
    return (
      <div className="page">
        <p role="status">Abrindo ficha…</p>
      </div>
    );
  if (error?.code === 'ACESSO' && !record)
    return (
      <div className="page">
        <p role="alert" className="notice error">
          {error.message}
        </p>
        <a href="#/fichas">Voltar às fichas</a>
      </div>
    );
  if (error && !record && id !== 'nova' && !temporary)
    return (
      <div className="page">
        <p role="alert" className="notice error">
          {error.message}
        </p>
        <button className="button" onClick={() => setLoadRetry(loadRetry + 1)}>
          Tentar novamente
        </button>
      </div>
    );
  return (
    <div className="page sheet-page">
      <a className="back-link" href="#/fichas">
        ← Fichas de personagens
      </a>
      <div className="page-heading">
        <p className="eyebrow">
          {temporary ? 'Ficha temporária' : record ? 'Ficha de personagem' : 'Um novo começo'}
        </p>
        <h1>{draft.name || 'Seu personagem'}</h1>
        <p>
          {temporary
            ? 'Explore os campos e baixe sua ficha. Esta versão não fica salva na mesa.'
            : 'Sua história, suas escolhas, seu personagem.'}
        </p>
      </div>
      <div className="editor-toolbar">
        <span role="status" aria-live="polite">
          {saving
            ? 'Salvando…'
            : pdfReading
              ? pdfReading
              : dirty
                ? 'Alterações pendentes'
                : message || (temporary ? 'Apenas nesta página' : 'Sem alterações pendentes')}
        </span>
        <div>
          <input
            ref={pdfInput}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            aria-label="PDF da ficha do Roll20"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void importPdf(file);
            }}
          />
          {pdfReading ? (
            <button className="button secondary" onClick={() => pdfController.current?.abort()}>
              Cancelar leitura
            </button>
          ) : (
            <button
              className="button secondary"
              disabled={!canEdit || saving}
              onClick={() => pdfInput.current?.click()}
            >
              Importar PDF do Roll20
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label="Arquivo da ficha"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void importFile(file);
            }}
          />
          <button
            className="button secondary"
            disabled={!canEdit || saving || !!pdfReading}
            onClick={() => fileInput.current?.click()}
          >
            Importar ficha
          </button>
          <button className="button secondary" onClick={download}>
            Baixar ficha
          </button>
          <button
            className="button"
            disabled={temporary || !canEdit || saving || !!pdfReading || error?.code === 'CONFLITO'}
            onClick={save}
          >
            Salvar ficha
          </button>
        </div>
      </div>
      {pdfPreview && (
        <PdfImportPreview
          result={pdfPreview}
          replacing={dirty || !!record}
          onClose={() => setPdfPreview(null)}
          onApply={() => {
            edit({ ...draftRef.current, name: pdfPreview.name, content: pdfPreview.content });
            setPdfWarnings(pdfPreview.warnings);
            setPdfPreview(null);
            setMessage(
              'PDF importado. Confira os pontos da revisão e os campos nas abas antes de salvar.',
            );
            setError(null);
          }}
        />
      )}
      {!!pdfWarnings.length && (
        <details className="pdf-import-reminders">
          <summary>Pontos para revisar na importação do PDF</summary>
          <ul>
            {pdfWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      {error && (
        <div role="alert" className="notice error">
          <p>{error.message}</p>
          {error.fields.length > 0 && (
            <ul>
              {error.fields.map((f, i) => (
                <li key={i}>
                  {fieldLabel(f.campo)}: {f.mensagem}
                </li>
              ))}
            </ul>
          )}
          {error.code === 'CONFLITO' && (
            <button
              className="button secondary"
              onClick={() => {
                if (
                  window.confirm('Baixou suas alterações? Recarregar abre a versão salva na mesa.')
                ) {
                  drafts.delete(activeDraftKey.current);
                  revisionRef.current = { revision: 0, savedRevision: 0 };
                  setRevision(revisionRef.current);
                  if (record) window.location.reload();
                  else window.location.replace(`${window.location.pathname}#/fichas/${creationId}`);
                }
              }}
            >
              Recarregar versão salva
            </button>
          )}
        </div>
      )}
      {message && dirty && (
        <p className="notice">
          {message === 'Ficha salva na mesa.'
            ? 'A gravação anterior foi concluída. Há novas alterações para salvar.'
            : message}
        </p>
      )}
      <div className="sheet-body">
        {!temporary && !canEdit && (
          <p className="notice">
            {record
              ? 'Você tem acesso de leitura a esta ficha.'
              : 'Escolha uma campanha na página Campanhas e entre como jogador para criar uma ficha.'}
          </p>
        )}
        <section className="form-section">
          <div className="field-grid">
            <label className="field">
              Nome do personagem
              <input
                disabled={!canEdit || !!pdfReading}
                maxLength={120}
                aria-invalid={error?.fields.some((f) => f.campo === 'nome') || undefined}
                value={draft.name}
                onChange={(e) => edit({ ...draft, name: e.target.value })}
              />
            </label>
            {!temporary && (
              <label className="field">
                Campanha
                <select
                  value={draft.campaignId}
                  disabled={!canEdit || !!pdfReading || Boolean(record)}
                  onChange={(e) => edit({ ...draft, campaignId: e.target.value })}
                >
                  <option value="">Selecione uma campanha</option>
                  {(record ? campaigns : allowedCampaigns).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </section>
        {admin && record && repository && (
          <CampaignCopy
            record={record}
            campaigns={campaigns}
            repository={repository}
            disabled={dirty || saving || !!pdfReading || !!error}
          />
        )}
        {demoCatalog && <p className="notice">Catálogo de demonstração nas sugestões e na busca de magias.</p>}
        <CreationHistory snapshot={draft.content.criacao} repository={compendium} />
        {catalogError && <p className="notice" role="status">{catalogError}</p>}
        <SheetChat record={record} disabled={dirty || saving || !canEdit || Boolean(error)}>
          <SheetForm
            content={draft.content}
            onChange={(content) => edit({ ...draft, content })}
            catalog={catalog}
            compendium={compendium}
            readOnly={!canEdit || !!pdfReading}
            errors={error?.fields || []}
          />
        </SheetChat>
      </div>
      {record && record.proprietario_id === user?.id && canEdit && (
        <button className="text-button danger delete-sheet" disabled={saving} onClick={remove}>
          Excluir esta ficha
        </button>
      )}
    </div>
  );
}
