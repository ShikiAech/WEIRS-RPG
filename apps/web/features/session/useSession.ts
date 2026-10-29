import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { createRepository } from '../../lib/repository';
import { createSessionRepository, SessionError } from '../../lib/session';
import type { SheetRecord } from '../../../../packages/contracts/sheets';
import type { SessionCommand, SessionState } from '../../../../packages/contracts/session';
import type { RollResult } from '../../../../packages/contracts/chat';
import type { ChatMessage } from '../../../../packages/contracts/chat';

export function useSession(
  campaign: string,
  onMessage: (m: ChatMessage) => void,
  onBusy: (busy: boolean) => void,
) {
  const sheets = useMemo(() => createRepository(supabase!), []);
  const repository = useMemo(() => createSessionRepository(supabase!), []);
  const [records, setRecords] = useState<SheetRecord[]>([]);
  const [mesa, setMesa] = useState<SessionState | null>(null);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [hpResult, setHpResult] = useState<RollResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [denied, setDenied] = useState(false);
  const [attempt, setAttempt] = useState<{ id: string; command: SessionCommand } | null>(null);
  const alive = useRef(true),
    busy = useRef(false),
    unresolved = useRef(false),
    refreshing = useRef(false),
    again = useRef(false);
  const refresh = useCallback(async () => {
    if (!alive.current) return;
    if (refreshing.current) {
      again.current = true;
      return;
    }
    refreshing.current = true;
    try {
      const [rows, state] = await Promise.all([sheets.list(), repository.read(campaign)]);
      if (!alive.current) return;
      const filtered = rows.filter((r) => r.campanha_id === campaign);
      setRecords(filtered);
      setMesa(state);
      setDenied(false);
      setSelected((id) => (filtered.some((r) => r.id === id) ? id : filtered[0]?.id || ''));
    } catch (e) {
      if (!alive.current) return;
      const code = (e as { code?: string }).code;
      if (['WM002', 'WF002', 'ACESSO', 'SESSAO', 'PGRST301'].includes(code || '')) {
        setRecords([]);
        setMesa(null);
        setDenied(true);
        setAttempt(null);
        unresolved.current = false;
      }
      setError(e instanceof Error ? e.message : 'Não foi possível atualizar a mesa.');
    } finally {
      refreshing.current = false;
      if (alive.current) setLoading(false);
      if (again.current) {
        again.current = false;
        void refresh();
      }
    }
  }, [campaign, repository, sheets]);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const update = () => {
      if (document.visibilityState !== 'hidden') void refresh();
    };
    const stop = repository.subscribe(campaign, update);
    const timer = setInterval(update, 6000);
    window.addEventListener('online', update);
    const detachedUpdate = () => void refresh();
    window.addEventListener('weirs:session-refresh', detachedUpdate);
    document.addEventListener('visibilitychange', update);
    const guard = (e: Event) => {
      if (busy.current || unresolved.current) {
        e.preventDefault();
        setError(
          'Confirme a operação pendente pelo reenvio antes de sair, ou libere uma nova operação após conferir o chat.',
        );
      }
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (busy.current || unresolved.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('weirs:before-navigation', guard);
    window.addEventListener('weirs:before-account-change', guard);
    window.addEventListener('beforeunload', unload);
    return () => {
      alive.current = false;
      clearInterval(timer);
      stop();
      window.removeEventListener('online', update);
      window.removeEventListener('weirs:session-refresh', detachedUpdate);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('weirs:before-navigation', guard);
      window.removeEventListener('weirs:before-account-change', guard);
      window.removeEventListener('beforeunload', unload);
    };
  }, [campaign, refresh, repository]);
  async function operate(command?: SessionCommand) {
    if (busy.current || denied || (!command && !attempt)) return false;
    const next = attempt || { id: crypto.randomUUID(), command: command! };
    busy.current = true;
    setPending(true);
    onBusy(true);
    setAttempt(next);
    unresolved.current = true;
    setError('');
    try {
      const result = await repository.operate(campaign, next.id, next.command);
      if (!alive.current) return false;
      onMessage(result.mensagem);
      setHpResult(result.resultado || null);
      setAttempt(null);
      unresolved.current = false;
      // Reenviar pode devolver um recibo antigo; consultar o estado atual evita regressão.
      await refresh();
      return true;
    } catch (e) {
      if (!alive.current) return false;
      const failure = e instanceof SessionError ? e : new SessionError('REDE');
      setError(
        failure.code === 'WM003' && next.command.expressao !== undefined
          ? 'Expressão de PV inválida. Use soma, subtração e dados; o resultado deve ser inteiro entre 0 e 9999. Até 100 dados, com faces de 2 a 1000.'
          : failure.message,
      );
      if (['WM001', 'WM002', 'WM003', 'WM004'].includes(failure.code)) {
        setAttempt(null);
        unresolved.current = false;
        await refresh();
      }
      return false;
    } finally {
      busy.current = false;
      if (alive.current) {
        setPending(false);
        onBusy(false);
      }
    }
  }
  return {
    records,
    hpResult,
    mesa,
    selected,
    setSelected,
    record: records.find((r) => r.id === selected),
    error,
    loading,
    pending,
    denied,
    attempt,
    refresh,
    operate,
    release: () => {
      setAttempt(null);
      unresolved.current = false;
      setError('');
      void refresh();
    },
    clearError: () => setError(''),
  };
}
