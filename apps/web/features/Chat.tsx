import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { CampaignRecord, CampaignMembership } from '../../../packages/contracts/sheets';
import type {
  ChatCommand,
  ChatMessage,
  ChatRepository,
  ChatStatus,
} from '../../../packages/contracts/chat';
import { supabase } from '../lib/supabase';
import { createRepository } from '../lib/repository';
import { createChatRepository, chatError } from '../lib/chat';
import { catchUp, commandFromText, mergeMessages } from '../lib/chat-state';
import { Message } from './chat/Message';
import { DicePanel, useDice3D } from './dice/Dice3D';
import { SessionPanel } from './session/SessionPanel';
import { FloatingWindow } from './tabletop/FloatingWindow';
import { Tabletop } from './tabletop/Tabletop';

export function Chat({
  user,
  authReady,
  route,
}: {
  user: User | null;
  authReady: boolean;
  route: string;
}) {
  const repository = useMemo(() => (supabase ? createChatRepository(supabase) : null), []);
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [members, setMembers] = useState<CampaignMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const requested = route.split('/')[2];
  useEffect(() => {
    if (!user || !supabase) return;
    let active = true;
    setLoading(true);
    createRepository(supabase)
      .campaigns()
      .then((data) => {
        if (active) {
          setCampaigns(data.campaigns);
          setMembers(data.memberships);
          setError('');
        }
      })
      .catch(() => {
        if (active) setError('Não foi possível carregar suas campanhas.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id, retry]);
  const campaign =
    campaigns.find((c) => c.id === requested) || (!requested ? campaigns[0] : undefined);
  const role = members.find(
    (m) => m.campanha_id === campaign?.id && m.usuario_id === user?.id,
  )?.papel;
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
          <p className="eyebrow">Ao redor da mesa</p>
          <h1>Chat da campanha</h1>
          <p>Entre com Google para conversar com sua mesa.</p>
        </div>
      </div>
    );
  return (
    <div className="page chat-page">
      <div className="page-heading heading-with-action">
        <div>
          <p className="eyebrow">Ao redor da mesa</p>
          <h1>Chat da campanha</h1>
          <p>Uma história compartilhada. Cada dado, registrado.</p>
        </div>
        {!!campaigns.length && (
          <label className="field">
            Campanha do chat
            <select
              value={campaign?.id || ''}
              onChange={(e) => {
                window.location.hash = '/chat/' + e.target.value;
              }}
            >
              <option value="" disabled>
                Selecione uma campanha
              </option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {error ? (
        <div role="alert" className="notice error">
          {error}
          <button className="button secondary" onClick={() => setRetry(retry + 1)}>
            Tentar novamente
          </button>
        </div>
      ) : loading ? (
        <p role="status">Carregando campanhas…</p>
      ) : campaign && role ? (
        <Room
          key={user.id + campaign.id}
          campaign={campaign}
          repository={repository}
          userId={user.id}
          canSend={role !== 'espectador'}
          role={role}
        />
      ) : (
        <p className="notice">
          {requested
            ? 'Esta campanha não está disponível para sua conta.'
            : 'Você ainda não participa de uma campanha. Entre como jogador pela página Campanhas.'}{' '}
          <a href="#/campanhas">Escolher campanha</a>
        </p>
      )}
    </div>
  );
}

function Room({
  campaign,
  repository,
  canSend,
  userId,
  role,
}: {
  campaign: CampaignRecord;
  repository: ChatRepository;
  canSend: boolean;
  userId: string;
  role: string;
}) {
  const dice = useDice3D();
  const [panel, setPanel] = useState('');
  const [sheetId, setSheetId] = useState('');
  const [view, setView] = useState('chat');
  const [liveRole, setLiveRole] = useState(role);
  const currentRole = useRef(role);
  const [secret, setSecret] = useState(false);
  const [revealing, setRevealing] = useState('');
  const [sessionBusy, setSessionBusy] = useState(false);
  const [contextBusy, setContextBusy] = useState(false);
  const tableBusy = sessionBusy || contextBusy;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>('conectando');
  const [loading, setLoading] = useState(true);
  const [older, setOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [accessLost, setAccessLost] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [retry, setRetry] = useState(0);
  const [text, setText] = useState('');
  const [sendError, setSendError] = useState('');
  const [sending, setSending] = useState(false);
  const [attempt, setAttempt] = useState<{ id: string; command: ChatCommand } | null>(null);
  const [newBelow, setNewBelow] = useState(false);
  const busy = useRef(false);
  const pendingSend = useRef(false);
  const presentBeforeSend = useRef(new Set<string>());
  const forbidden = useRef(false);
  const generation = useRef(0);
  const stopChannel = useRef<() => void>(() => {});
  const mounted = useRef(true);
  const log = useRef<HTMLDivElement>(null);
  const scroll = useRef({ bottom: true, prependHeight: 0 });
  useEffect(() => {
    repository.onRole = (next, id) => {
      if (!mounted.current || !next || id !== campaign.id) return;
      if (currentRole.current === 'mestre' && next !== 'mestre') {
        dice.clear();
        setSecret(false);
        setMessages((rows) =>
          rows.map((row) =>
            row.secreta ? { ...row, resultado: null, rotulo: 'Rolagem secreta' } : row,
          ),
        );
      }
      currentRole.current = next;
      setLiveRole(next);
    };
    return () => {
      repository.onRole = undefined;
    };
  }, [repository, campaign.id]);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  function add(rows: ChatMessage[], prepend = false) {
    if (!rows.length || forbidden.current) return;
    if (currentRole.current !== 'mestre')
      rows = rows.map((row) =>
        row.secreta ? { ...row, resultado: null, rotulo: 'Rolagem secreta' } : row,
      );
    // Realtime e consultas podem confirmar o envio antes da resposta da RPC.
    // Ocultar antes de inserir impede uma renderização com o total ainda visível.
    if (pendingSend.current) {
      for (const row of rows)
        if (row.autor_id === userId && !presentBeforeSend.current.has(row.id)) dice.show(row);
    }
    const node = log.current;
    if (node) {
      scroll.current.bottom = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
      if (prepend) scroll.current.prependHeight = node.scrollHeight;
    }
    setMessages((current) => mergeMessages(current, rows));
  }
  function readFailed(error: unknown) {
    if (!mounted.current) return;
    const failure = chatError(error);
    if (['ACESSO', 'SESSAO', 'WC002'].includes(failure.code)) {
      forbidden.current = true;
      pendingSend.current = false;
      dice.clear();
      setMessages([]);
      setAccessLost(true);
      setHasOlder(false);
      setNewBelow(false);
      stopChannel.current();
    }
    setSyncError(failure.message);
  }
  useLayoutEffect(() => {
    // O histórico entra no DOM ao terminar o carregamento, mesmo sem mudar messages.
    const node = log.current;
    if (!node) return;
    if (scroll.current.prependHeight) {
      node.scrollTop += node.scrollHeight - scroll.current.prependHeight;
      scroll.current.prependHeight = 0;
    } else if (scroll.current.bottom) {
      node.scrollTop = node.scrollHeight;
      setNewBelow(false);
    } else setNewBelow(true);
  }, [messages, dice.hidden, loading]);
  useEffect(() => {
    let active = true,
      ready = false,
      syncing = false,
      again = false;
    let cursor = 0;
    let live = false;
    let lastCheck = Date.now();
    generation.current++;
    forbidden.current = false;
    setLoading(true);
    setAccessLost(false);
    setSyncError('');
    function failed(error: unknown) {
      if (active) readFailed(error);
    }
    async function sync() {
      if (!active || forbidden.current || document.visibilityState === 'hidden') return;
      if (syncing) {
        again = true;
        return;
      }
      syncing = true;
      try {
        if (!ready) {
          const rows = await repository.history(campaign.id);
          if (!active || forbidden.current) return;
          add(rows);
          cursor = rows.at(-1)?.sequencia || 0;
          setHasOlder(rows.length === 50);
          ready = true;
        }
        const result = await catchUp(cursor, async (after) => {
          if (!active) return [];
          return repository.since(campaign.id, after);
        });
        if (active && !forbidden.current) {
          cursor = result.cursor;
          add(result.messages);
          setSyncError('');
        }
      } catch (error) {
        failed(error);
      } finally {
        syncing = false;
        if (active) setLoading(false);
        if (again) {
          again = false;
          void sync();
        }
      }
    }
    const stop = repository.subscribe(
      campaign.id,
      (row) => {
        if (active && !forbidden.current) {
          add([row]);
          void sync();
        }
      },
      (state) => {
        if (active) {
          live = state === 'ao_vivo';
          setStatus(state);
          if (live) void sync();
        }
      },
    );
    stopChannel.current = stop;
    void sync();
    // Realtime entrega ao vivo; o intervalo também verifica revogação de acesso e lacunas.
    const timer = window.setInterval(() => {
      if (!live || Date.now() - lastCheck >= 30000) {
        lastCheck = Date.now();
        void sync();
      }
    }, 5000);
    const resume = () => {
      void sync();
    };
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      active = false;
      stop();
      window.clearInterval(timer);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [campaign.id, repository, retry]);

  async function previous() {
    if (older || !messages.length || forbidden.current) return;
    const version = generation.current;
    setOlder(true);
    try {
      const rows = await repository.history(campaign.id, messages[0].sequencia);
      if (mounted.current && version === generation.current && !forbidden.current) {
        add(rows, true);
        setHasOlder(rows.length === 50);
        setSyncError('');
      }
    } catch (error) {
      if (version === generation.current) readFailed(error);
    } finally {
      if (mounted.current) setOlder(false);
    }
  }
  async function send(command?: ChatCommand) {
    if (busy.current || tableBusy || !canSend || liveRole === 'espectador' || forbidden.current)
      return;
    let next = attempt;
    try {
      if (!next) {
        let parsed = command || commandFromText(text);
        if (parsed.tipo !== 'texto' && (secret || parsed.secreta)) {
          if (liveRole !== 'mestre')
            throw new Error('Somente o mestre pode realizar rolagens secretas.');
          if (parsed.tipo === 'acao' && ['iniciativa', 'morte', 'dado_vida'].includes(parsed.acao))
            throw new Error(
              'Iniciativa, testes de morte e dados de vida alteram a mesa. Selecione rolagem pública para usar esta ação.',
            );
          parsed = { ...parsed, secreta: true };
        }
        next = { id: crypto.randomUUID(), command: parsed };
      }
    } catch (error) {
      setSendError((error as Error).message);
      return;
    }
    setAttempt(next);
    pendingSend.current = true;
    presentBeforeSend.current = new Set(messages.map((message) => message.id));
    busy.current = true;
    setSending(true);
    setSendError('');
    try {
      const row = await repository.send(campaign.id, next.id, next.command);
      if (mounted.current && !forbidden.current) {
        add([row]);
        if (!row.secreta || currentRole.current === 'mestre') dice.show(row);
        pendingSend.current = false;
        setAttempt(null);
        if (next.command.tipo !== 'acao') setText('');
        setSendError('');
      }
    } catch (error) {
      if (mounted.current) {
        const failure = chatError(error);
        setSendError(failure.message);
        if (['WC002', 'WC003', 'WC004', 'WC005', 'SESSAO'].includes(failure.code)) {
          pendingSend.current = false;
          setAttempt(null);
        }
      }
    } finally {
      busy.current = false;
      if (mounted.current) setSending(false);
    }
  }
  async function reveal(id: string) {
    if (revealing || accessLost || tableBusy || sending || attempt || liveRole !== 'mestre') return;
    setRevealing(id);
    setSendError('');
    try {
      const row = await repository.reveal(campaign.id, id);
      if (mounted.current && !forbidden.current) {
        add([row]);
        setMessages((rows) => rows.map((m) => (m.id === id ? { ...m, revelada_id: row.id } : m)));
      }
    } catch (e) {
      if (mounted.current) setSendError(chatError(e).message);
    } finally {
      if (mounted.current) setRevealing('');
    }
  }
  const disabled = !canSend || liveRole === 'espectador' || accessLost || loading || tableBusy;
  return (
    <>
      <div className="session-toolbar" aria-label="Ferramentas da sessão">
        <div className="mobile-tabletop-tabs" aria-label="Visualização da mesa">
          <button
            className="text-button"
            aria-pressed={view === 'mapa'}
            onClick={() => setView('mapa')}
          >
            Mapa
          </button>
          <button
            className="text-button"
            aria-pressed={view === 'chat'}
            onClick={() => setView('chat')}
          >
            Chat
          </button>
        </div>
        {['ficha', 'combate', 'loja'].map((kind) => (
          <button
            key={kind}
            className="button secondary"
            aria-pressed={panel === kind}
            disabled={tableBusy || sending || !!attempt || accessLost}
            onClick={() => setPanel(kind)}
          >
            {kind === 'ficha' ? 'Minha ficha' : kind === 'combate' ? 'Combate' : 'Loja'}
          </button>
        ))}
      </div>
      <div className={'tabletop-workspace view-' + view}>
        <section className="tabletop-center" aria-label="Mapa da campanha">
          {!accessLost && (
            <Tabletop
              campaignId={campaign.id}
              userId={userId}
              role={liveRole}
              onRoll={(command) => void send(command)}
              onMessage={(message) => add([message])}
              onBusy={setContextBusy}
              chatDisabled={loading || accessLost || sessionBusy || sending || !!attempt}
              onOpenSheet={(id) => {
                if (!tableBusy && !sending && !attempt) {
                  setSheetId(id);
                  setPanel('ficha');
                }
              }}
            />
          )}
          {accessLost && <p className="notice">Acesso à mesa encerrado.</p>}
        </section>
        {panel &&
          !accessLost &&
          (panel === 'loja' ? (
            <SessionPanel
              campaign={campaign.id}
              userId={userId}
              role={liveRole}
              kind={panel}
              chatDisabled={loading || accessLost || tableBusy || sending || !!attempt}
              onClose={() => setPanel('')}
              onRoll={(command) => void send(command)}
              onMessage={(message) => add([message])}
              onBusy={setSessionBusy}
            />
          ) : (
            <FloatingWindow
              id={campaign.id + ':' + panel}
              title={panel === 'ficha' ? 'Ficha do personagem' : 'Combate'}
              className="session-floating"
              initial={{ x: 22, y: 128 }}
            >
              <SessionPanel
                campaign={campaign.id}
                userId={userId}
                role={liveRole}
                kind={panel}
                selectedSheetId={sheetId}
                chatDisabled={loading || accessLost || tableBusy || sending || !!attempt}
                onClose={() => {
                  setPanel('');
                  setSheetId('');
                }}
                onRoll={(command) => void send(command)}
                onMessage={(message) => add([message])}
                onBusy={setSessionBusy}
              />
            </FloatingWindow>
          ))}
        <section className="chat-room" aria-label={'Conversa de ' + campaign.nome}>
          <div className="chat-room-heading">
            <strong>{campaign.nome}</strong>
            <span
              className={'connection ' + (status === 'ao_vivo' ? 'connected' : '')}
              role="status"
            >
              {accessLost
                ? 'Acesso encerrado'
                : status === 'ao_vivo'
                  ? 'Ao vivo'
                  : status === 'conectando'
                    ? 'Conectando…'
                    : 'Reconectando · sincronização periódica'}
            </span>
          </div>
          {syncError && (
            <div className="notice error" role="alert">
              {syncError}
              <button className="text-button" onClick={() => setRetry(retry + 1)}>
                Atualizar histórico
              </button>
            </div>
          )}
          {hasOlder && (
            <button className="text-button older-messages" disabled={older} onClick={previous}>
              {older ? 'Carregando…' : 'Carregar mensagens anteriores'}
            </button>
          )}
          <div
            className="chat-log"
            ref={log}
            role="log"
            aria-label="Mensagens da campanha"
            aria-live="polite"
            aria-relevant="additions"
            onScroll={() => {
              const n = log.current!;
              scroll.current.bottom = n.scrollHeight - n.scrollTop - n.clientHeight < 80;
              if (scroll.current.bottom) setNewBelow(false);
            }}
          >
            {loading ? (
              <p>Carregando conversa…</p>
            ) : !messages.length && !accessLost ? (
              <div className="chat-empty">
                <span>✦</span>
                <h2>A aventura começa aqui.</h2>
                <p>Envie uma mensagem ou role os primeiros dados da sessão.</p>
              </div>
            ) : (
              <div className="chat-messages">
                {messages.map((m) => (
                  <Message
                    key={m.id}
                    message={m}
                    onReveal={liveRole === 'mestre' ? () => void reveal(m.id) : undefined}
                    revealing={revealing === m.id}
                  />
                ))}
              </div>
            )}
          </div>
          {newBelow && (
            <button
              className="text-button"
              onClick={() => {
                log.current!.scrollTop = log.current!.scrollHeight;
                scroll.current.bottom = true;
                setNewBelow(false);
              }}
            >
              Ir para mensagens recentes ↓
            </button>
          )}
          <div className="chat-controls">
            <div className="chat-composer">
              <div className="quick-dice" aria-label="Dados rápidos">
                {[4, 6, 8, 10, 12, 20, 100].map((faces) => (
                  <button
                    key={faces}
                    type="button"
                    disabled={disabled || sending || !!attempt}
                    onClick={() => setText('/r 1d' + faces)}
                  >
                    d{faces}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={disabled || sending || !!attempt}
                  onClick={() => setText('/r 2d20kh1')}
                >
                  Vantagem
                </button>
                <button
                  type="button"
                  disabled={disabled || sending || !!attempt}
                  onClick={() => setText('/r 2d20kl1')}
                >
                  Desvantagem
                </button>
              </div>
              {liveRole === 'mestre' && (
                <label className="roll-visibility">
                  Visibilidade da rolagem
                  <select
                    value={secret ? 'secreta' : 'publica'}
                    disabled={tableBusy || sending || !!attempt || accessLost}
                    onChange={(e) => setSecret(e.target.value === 'secreta')}
                  >
                    <option value="publica">Pública</option>
                    <option value="secreta">Só mestres</option>
                  </select>
                </label>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <label htmlFor="chat-message-input">Mensagem ou comando de dados</label>
                <textarea
                  id="chat-message-input"
                  rows={2}
                  maxLength={2000}
                  placeholder="Conte sua ação… ou /r 1d20+5"
                  value={text}
                  disabled={disabled || sending || !!attempt}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <div className="composer-footer">
                  <small>
                    {!canSend
                      ? 'Você acompanha esta campanha como espectador.'
                      : 'Enter envia · Shift+Enter quebra a linha'}
                  </small>
                  <button className="button" disabled={disabled || sending || !!attempt}>
                    {sending ? 'Enviando…' : 'Enviar'}
                  </button>
                </div>
              </form>
              {sendError && (
                <div className="notice error" role="alert">
                  {sendError}
                </div>
              )}
              {attempt && !sending && (
                <div className="retry-command">
                  <button
                    className="button secondary"
                    disabled={disabled}
                    onClick={() => void send()}
                  >
                    Reenviar mesma tentativa
                  </button>
                  <button
                    className="text-button"
                    disabled={tableBusy}
                    onClick={() => {
                      setAttempt(null);
                      pendingSend.current = false;
                      setSendError('');
                    }}
                  >
                    Liberar nova mensagem
                  </button>
                  <small>
                    Uma resposta perdida pode já estar no histórico. Reenvie para recuperar o mesmo
                    resultado.
                  </small>
                </div>
              )}
              <details className="dice-help">
                <summary>Como rolar dados</summary>
                <p>
                  Use <code>/r 1d20+5</code>, <code>/roll 2d6+1d4-2</code> ou <code>/r 4d6kh3</code>
                  . <code>kh</code> mantém os maiores; <code>kl</code>, os menores. Até 100 dados
                  por rolagem e faces de 2 a 1000. Resultados são calculados no servidor e
                  compartilhados com a campanha. O mestre pode usar <code>/gmroll 1d20+5</code> para
                  esconder o resultado.
                </p>
                <p>Ataques e magias também podem ser enviados pelos botões das fichas salvas.</p>
              </details>
            </div>
          </div>
        </section>
      </div>
      {!accessLost && <DicePanel sessionWindow={panel} />}
    </>
  );
}
