import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { createRepository } from '../../lib/repository';
import { createSessionRepository } from '../../lib/session';
import { createTabletopRepository } from '../../lib/tabletop';
import type {
  AssetRecord,
  MapSnapshot,
  AreaRecord,
  MapCommand,
  MapPing,
  SceneRecord,
  TokenRecord,
} from '../../../../packages/contracts/tabletop';
import type { SheetRecord } from '../../../../packages/contracts/sheets';
import type { SessionState } from '../../../../packages/contracts/session';
import { affectedTokenIds, pendingTokenMoves, projectTokenMoves } from './token-movement';

// One committed render model: geometry, fog, entities and their assets always agree.
type TabletopView = {
  scenes: SceneRecord[];
  sceneId: string;
  snapshot: MapSnapshot | null;
  tokens: TokenRecord[];
  areas: AreaRecord[];
  assets: AssetRecord[];
  records: SheetRecord[];
  mesa: SessionState | null;
  pings: MapPing[];
};
const emptyView = (): TabletopView => ({
  scenes: [],
  sceneId: '',
  snapshot: null,
  tokens: [],
  areas: [],
  assets: [],
  records: [],
  mesa: null,
  pings: [],
});
function accessEnded(error: unknown) {
  return ['WV002', 'WF002', 'WM002', 'ACESSO', 'SESSAO', 'PGRST301', '42501'].includes(
    (error as { code?: string })?.code || '',
  );
}

export function useTabletop(campaign: string, master: boolean, userId: string) {
  const repository = useMemo(() => createTabletopRepository(supabase!), []);
  const sheets = useMemo(() => createRepository(supabase!), []);
  const session = useMemo(() => createSessionRepository(supabase!), []);
  const [view, setView] = useState<TabletopView>(emptyView);
  const { scenes, sceneId, tokens, assets, records, mesa, snapshot, pings, areas } = view;
  const [members, setMembers] = useState<{ id: string; nome: string; papel?: string }[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [refreshError, setRefreshError] = useState(''),
    [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState<{ id: string; command: MapCommand } | null>(null);
  const [movement, setMovement] = useState<{
    context: string;
    scene: string;
    moves: (ReturnType<typeof pendingTokenMoves>[number] & { request: string })[];
  } | null>(null);
  const selected = useRef(''),
    alive = useRef(true),
    running = useRef(false),
    again = useRef(false),
    busy = useRef(false),
    unresolved = useRef(false);
  const readEpoch = useRef(0),
    readSerial = useRef(0);
  const contextGeneration = useRef(0),
    accessRevision = useRef(0),
    lastPingRead = useRef(0);
  const panelRead = useRef<{ context: number; promise: Promise<void> } | null>(null);
  const generation = useRef(0),
    refreshWaiters = useRef<(() => void)[]>([]),
    context = useRef(''),
    latestRefresh = useRef<() => Promise<void>>(async () => {});
  const contextKey = campaign + ':' + master + ':' + userId;
  const refresh = useCallback(async () => {
    if (!alive.current || context.current !== contextKey) return;
    if (running.current) {
      again.current = true;
      return new Promise<void>((resolve) => refreshWaiters.current.push(resolve));
    }
    running.current = true;
    const requestSerial = ++readSerial.current;
    const requestGeneration = generation.current,
      requestEpoch = readEpoch.current;
    try {
      const rows = await repository.scenes(campaign);
      if (
        !alive.current ||
        generation.current !== requestGeneration ||
        readEpoch.current !== requestEpoch
      )
        return;
      const chosen =
        (master && rows.find((row) => row.id === selected.current)) ||
        rows.find((row) => row.ativa) ||
        rows[0];
      // Stage the entire authorized scene. Never publish an intermediate empty collection
      // or combine a new visibility mask with the old geometry/entities.
      // Sheet/session reads belong to the campaign, not the scene. Reuse one
      // outstanding batch even during continuous token events: restarting or
      // discarding it on every map hint would starve slow services indefinitely.
      const panelContext = contextGeneration.current,
        permissionRevision = accessRevision.current;
      if (panelRead.current?.context !== panelContext) {
        const promise = Promise.allSettled([sheets.list(), session.read(campaign)])
          .then(([sheetResult, stateResult]) => {
            if (
              !alive.current ||
              contextGeneration.current !== panelContext ||
              accessRevision.current !== permissionRevision
            )
              return;
            setView((previous) => ({
              ...previous,
              records:
                sheetResult.status === 'fulfilled'
                  ? sheetResult.value.filter((row) => row.campanha_id === campaign)
                  : accessEnded(sheetResult.reason)
                    ? []
                    : previous.records,
              mesa:
                stateResult.status === 'fulfilled'
                  ? stateResult.value
                  : accessEnded(stateResult.reason)
                    ? null
                    : previous.mesa,
            }));
          })
          .finally(() => {
            if (panelRead.current?.promise === promise) panelRead.current = null;
          });
        panelRead.current = { context: panelContext, promise };
      }
      // Pings are scene-scoped and short-lived, and never gate scene publication.
      const pingRead = Promise.allSettled([
        chosen ? repository.pings(campaign, chosen.id) : Promise.resolve([]),
      ]);
      const next = await (async () => {
        const authoritative = chosen?.modo_visao
          ? await repository.snapshot(campaign, chosen.id)
          : null;
        if (authoritative)
          return {
            snapshot: authoritative,
            tokens: authoritative.tokens,
            assets: authoritative.assets,
            areas: authoritative.areas,
          };
        const [tokens, assets, areas] = await Promise.all([
          chosen ? repository.tokens(campaign, chosen.id) : Promise.resolve([]),
          repository.assets(campaign),
          chosen ? repository.areas(campaign, chosen.id) : Promise.resolve([]),
        ]);
        return { snapshot: null, tokens, assets, areas };
      })();
      if (
        !alive.current ||
        generation.current !== requestGeneration ||
        readEpoch.current !== requestEpoch
      )
        return;
      selected.current = chosen?.id || '';
      setView((previous) => ({
        ...previous,
        ...next,
        scenes: rows,
        sceneId: chosen?.id || '',
        pings: previous.sceneId === chosen?.id ? previous.pings : [],
      }));
      void pingRead.then(([result]) => {
        if (
          !alive.current ||
          generation.current !== requestGeneration ||
          accessRevision.current !== permissionRevision ||
          requestSerial < lastPingRead.current
        )
          return;
        lastPingRead.current = requestSerial;
        setView((previous) =>
          previous.sceneId !== (chosen?.id || '')
            ? previous
            : {
                ...previous,
                pings: (result.status === 'fulfilled'
                  ? result.value
                  : accessEnded(result.reason)
                    ? []
                    : previous.pings
                ).filter((ping) => Date.now() - Date.parse(ping.criado_em) < 6000),
              },
        );
      });
      // An acknowledged write may outlive a failed confirmation read. Retain its
      // coordinates until a new authoritative version (or deletion) settles it.
      setMovement((previous) => {
        if (!previous || previous.scene !== chosen?.id) return null;
        const moves = previous.moves.filter((move) =>
          next.tokens.some((token) => token.id === move.id && token.versao === move.version),
        );
        return moves.length ? { ...previous, moves } : null;
      });
      setRefreshError('');
    } catch (e) {
      if (
        !alive.current ||
        generation.current !== requestGeneration ||
        readEpoch.current !== requestEpoch
      )
        return;
      if (accessEnded(e)) {
        accessRevision.current++;
        selected.current = '';
        setView(emptyView());
        setAttempt(null);
        setMovement(null);
        unresolved.current = false;
      }
      setRefreshError(
        accessEnded(e)
          ? 'Seu acesso ao mapa foi encerrado. Atualize a mesa para conferir suas permissões.'
          : 'Não foi possível atualizar o mapa. A última versão confirmada foi preservada.',
      );
    } finally {
      running.current = false;
      const waiters = refreshWaiters.current.splice(0);
      const resolveWaiters = () => waiters.forEach((resolve) => resolve());
      if (
        alive.current &&
        generation.current === requestGeneration &&
        readEpoch.current === requestEpoch
      )
        setLoading(false);
      if (again.current) {
        again.current = false;
        // Join the first read that started after this queued refresh, without waiting for
        // every later Realtime event to become quiet.
        void latestRefresh.current().then(resolveWaiters, resolveWaiters);
      } else resolveWaiters();
    }
  }, [campaign, master, repository, session, sheets, contextKey, userId]);
  latestRefresh.current = refresh;

  useEffect(() => {
    if (!pings.length) return;
    const timer = setInterval(
      () =>
        setView((previous) => ({
          ...previous,
          pings: previous.pings.filter((ping) => Date.now() - Date.parse(ping.criado_em) < 6000),
        })),
      500,
    );
    return () => clearInterval(timer);
  }, [pings.length]);

  useLayoutEffect(() => {
    contextGeneration.current++;
    generation.current++;
    context.current = contextKey;
    setLoading(true);
    setPending(false);
    busy.current = false;
    setAttempt(null);
    setMovement(null);
    unresolved.current = false;
    selected.current = '';
    setView(emptyView());
    setMembers([]);
    setError('');
    setRefreshError('');
  }, [contextKey, master, userId]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const memberGeneration = contextGeneration.current;
    void (async () => {
      const { data: memberships } = await supabase!
        .from('membros_campanha')
        .select('usuario_id,papel')
        .eq('campanha_id', campaign);
      if (!alive.current || contextGeneration.current !== memberGeneration) return;
      const ids = (memberships || [])
        .filter(() => true)
        .map((member) => member.usuario_id as string);
      if (master && !ids.includes(userId)) ids.push(userId);
      if (!ids.length) return;
      const { data: profiles } = await supabase!
        .from('perfis')
        .select('id,nome_exibicao')
        .in('id', ids);
      if (alive.current && contextGeneration.current === memberGeneration)
        setMembers(
          ids.map((id) => ({
            id,
            papel: memberships?.find((member) => member.usuario_id === id)?.papel,
            nome:
              profiles?.find((profile) => profile.id === id)?.nome_exibicao ||
              'Jogador ' + id.slice(0, 6),
          })),
        );
    })();
    const update = () => {
      if (document.visibilityState !== 'hidden') void refresh();
    };
    const invalidate = () => {
      // Realtime is a freshness hint, not an empty/unauthorized snapshot. Keep the
      // coherent scene mounted while one queued read catches up with the newest event.
      readEpoch.current++;
      update();
    };
    const stop = repository.subscribe(campaign, invalidate),
      stopSession = session.subscribe(campaign, update),
      timer = setInterval(update, 6000);
    window.addEventListener('online', update);
    document.addEventListener('visibilitychange', update);
    const guard = (event: Event) => {
      if (busy.current || unresolved.current) {
        event.preventDefault();
        setError('Confirme a alteração do mapa antes de sair.');
      }
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (busy.current || unresolved.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('weirs:before-navigation', guard);
    window.addEventListener('weirs:before-account-change', guard);
    window.addEventListener('beforeunload', unload);
    return () => {
      alive.current = false;
      clearInterval(timer);
      stop();
      stopSession();
      window.removeEventListener('online', update);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('weirs:before-navigation', guard);
      window.removeEventListener('weirs:before-account-change', guard);
      window.removeEventListener('beforeunload', unload);
    };
  }, [campaign, refresh, repository, session, contextKey, master, userId]);

  const syncingTokenIds = new Set([
    ...(attempt ? affectedTokenIds(attempt.command) : []),
    ...(movement?.context === contextKey && movement.scene === sceneId
      ? movement.moves.map((move) => move.id)
      : []),
  ]);
  function forgetMovement(request: string | undefined) {
    setMovement((previous) => {
      if (!previous) return null;
      const moves = previous.moves.filter((move) => move.request !== request);
      return moves.length ? { ...previous, moves } : null;
    });
  }
  async function operate(command?: MapCommand) {
    if (busy.current || (attempt && command)) return false;
    if (command && affectedTokenIds(command).some((id) => syncingTokenIds.has(id))) return false;
    const current = attempt || (command && { id: crypto.randomUUID(), command });
    if (!current) return false;
    busy.current = true;
    unresolved.current = true;
    setPending(true);
    setAttempt(current);
    if (command) {
      const moves = pendingTokenMoves(command).map((move) => ({ ...move, request: current.id }));
      if (moves.length)
        setMovement((previous) => ({
          context: contextKey,
          scene: sceneId,
          // New gestures take precedence. Keep older acknowledged projections so a
          // later rejected command can roll back only its own coordinates.
          moves: [
            ...moves,
            ...(previous?.context === contextKey && previous.scene === sceneId
              ? previous.moves
              : []),
          ],
        }));
    }
    setError('');
    const requestGeneration = generation.current;
    try {
      const result = await repository.operate(campaign, current.command, current.id);
      if (!alive.current || generation.current !== requestGeneration) return false;
      unresolved.current = false;
      await refresh();
      // Keep the affected tokens busy through the authoritative confirmation read.
      if (alive.current && generation.current === requestGeneration) setAttempt(null);
      return result;
    } catch (e) {
      if (!alive.current || generation.current !== requestGeneration) return false;
      const code = (e as { code?: string }).code;
      if (['WV001', 'WV002', 'WV003', 'WV004'].includes(code || '')) {
        setAttempt(null);
        forgetMovement(current.id);
        unresolved.current = false;
        await refresh();
      }
      setError(
        e instanceof Error
          ? e.message
          : 'Não foi possível confirmar esta alteração. Reenvie a mesma tentativa.',
      );
      return false;
    } finally {
      if (alive.current && generation.current === requestGeneration) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  function chooseScene(id: string) {
    if (!master || busy.current || unresolved.current) return;
    selected.current = id;
    generation.current++;
    setLoading(true);
    setView((previous) => ({ ...emptyView(), scenes: previous.scenes, sceneId: id }));
    setMovement(null);
    setRefreshError('');
    void refresh();
  }
  function release() {
    if (busy.current) return;
    forgetMovement(attempt?.id);
    setAttempt(null);
    unresolved.current = false;
    setError('');
    void refresh();
  }
  async function ping(position: { x: number; y: number }) {
    if (!sceneId) return;
    const requestGeneration = generation.current;
    try {
      const marker = await repository.ping(campaign, sceneId, position);
      if (alive.current && generation.current === requestGeneration)
        setView((previous) => ({
          ...previous,
          pings: [...previous.pings.filter((row) => row.id !== marker.id), marker],
        }));
    } catch (e) {
      if (alive.current && generation.current === requestGeneration)
        setError(e instanceof Error ? e.message : 'Não foi possível marcar o local.');
    }
  }
  const visibleScenes = scenes.filter(
    (row) => row.campanha_id === campaign && (master || row.publicada),
  );
  const visibleScene = visibleScenes.find((row) => row.id === sceneId);
  return {
    repository,
    snapshot,
    backgroundVision: snapshot,
    scenes: visibleScenes,
    areas: visibleScene
      ? areas.filter(
          (row) =>
            row.campanha_id === campaign &&
            row.cena_id === sceneId &&
            (master ||
              !!snapshot ||
              !row.token_id ||
              tokens.some((t) => t.id === row.token_id && !t.oculto)),
        )
      : [],
    tokens: visibleScene
      ? projectTokenMoves(
          tokens.filter(
            (row) =>
              row.campanha_id === campaign && row.cena_id === sceneId && (master || !row.oculto),
          ),
          movement?.context === contextKey && movement.scene === sceneId ? movement.moves : [],
        )
      : [],
    assets: assets.filter(
      (row) => row.campanha_id === campaign && (master || row.visibilidade === 'campanha'),
    ),
    records: records.filter(
      (row) => row.campanha_id === campaign && (master || row.proprietario_id === userId),
    ),
    members,
    mesa,
    pings: visibleScene ? pings.filter((marker) => marker.cena_id === sceneId) : [],
    ping,
    scene: visibleScene && snapshot?.cena.id === visibleScene.id ? snapshot.cena : visibleScene,
    loading,
    error: error || refreshError,
    setError,
    pending,
    syncingTokenIds,
    attempt,
    locked: loading || pending || !!attempt,
    refresh,
    operate,
    chooseScene,
    release,
  };
}

export function useAssetUrls(
  assets: AssetRecord[],
  repository: ReturnType<typeof createTabletopRepository>,
  requestedImageIds?: readonly string[],
) {
  const [urls, setUrls] = useState<Record<string, string>>({}),
    cache = useRef<Record<string, string>>({});
  const [failed, setFailed] = useState<string[]>([]),
    [retryCount, setRetryCount] = useState(0);
  const authorizedImages = assets.filter(
    (asset) => asset.estado === 'pronto' && asset.mime.startsWith('image/'),
  );
  const allowed = new Set(authorizedImages.map((asset) => asset.id));
  const requested = requestedImageIds
    ? new Set(requestedImageIds.filter((id) => allowed.has(id)))
    : allowed;
  const key = authorizedImages
    .map((asset) => asset.id)
    .sort()
    .join(',');
  const requestedKey = [...requested].sort().join(',');
  const requestedFailure = failed.some((id) => requested.has(id));
  useLayoutEffect(() => {
    let alive = true;
    setFailed([]);
    for (const [id, url] of Object.entries(cache.current))
      if (!allowed.has(id)) {
        URL.revokeObjectURL(url);
        delete cache.current[id];
      }
    setUrls({ ...cache.current });
    for (const asset of authorizedImages.filter((asset) => requested.has(asset.id))) {
      if (cache.current[asset.id]) continue;
      void repository
        .download(asset)
        .then((blob) => {
          if (!alive) return;
          cache.current[asset.id] = URL.createObjectURL(blob);
          setUrls({ ...cache.current });
        })
        .catch(() => {
          if (alive) setFailed((ids) => [...ids, asset.id]);
        });
    }
    return () => {
      alive = false;
    };
  }, [key, requestedKey, retryCount, repository]);
  useEffect(() => {
    const retry = () => setRetryCount((count) => count + 1);
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, []);
  useEffect(() => {
    if (!requestedFailure) return;
    const timer = setTimeout(() => setRetryCount((count) => count + 1), 6000);
    return () => clearTimeout(timer);
  }, [requestedFailure, requestedKey]);
  useEffect(
    () => () => {
      for (const url of Object.values(cache.current)) URL.revokeObjectURL(url);
      cache.current = {};
    },
    [],
  );
  return {
    urls: Object.fromEntries(Object.entries(urls).filter(([id]) => allowed.has(id))),
    failed: requestedFailure,
    retry: () => setRetryCount((count) => count + 1),
  };
}
