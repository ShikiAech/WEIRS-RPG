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

export function useTabletop(campaign: string, master: boolean, userId: string) {
  const repository = useMemo(() => createTabletopRepository(supabase!), []);
  const sheets = useMemo(() => createRepository(supabase!), []);
  const session = useMemo(() => createSessionRepository(supabase!), []);
  const [scenes, setScenes] = useState<SceneRecord[]>([]),
    [tokens, setTokens] = useState<TokenRecord[]>([]),
    [assets, setAssets] = useState<AssetRecord[]>([]);
  const [records, setRecords] = useState<SheetRecord[]>([]),
    [mesa, setMesa] = useState<SessionState | null>(null);
  const [snapshot, setSnapshot] = useState<MapSnapshot | null>(null);
  const [pings, setPings] = useState<MapPing[]>([]);
  const [areas, setAreas] = useState<AreaRecord[]>([]);
  const [members, setMembers] = useState<{ id: string; nome: string; papel?: string }[]>([]);
  const [sceneId, setSceneId] = useState(''),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState<{ id: string; command: MapCommand } | null>(null);
  const selected = useRef(''),
    alive = useRef(true),
    running = useRef(false),
    again = useRef(false),
    busy = useRef(false),
    unresolved = useRef(false);
  const readEpoch = useRef(0);
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
      setScenes(rows);
      const chosen =
        (master && rows.find((row) => row.id === selected.current)) ||
        rows.find((row) => row.ativa) ||
        (!master ? rows[0] : undefined) ||
        (master ? rows[0] : undefined);
      selected.current = chosen?.id || '';
      setSceneId(selected.current);
      if (!chosen) {
        setTokens([]);
        setAreas([]);
        setPings([]);
      }
      const authoritative = chosen?.modo_visao
        ? await repository.snapshot(campaign, chosen.id)
        : null;
      if (
        !alive.current ||
        generation.current !== requestGeneration ||
        readEpoch.current !== requestEpoch
      )
        return;
      setSnapshot(authoritative);
      const [tokenResult, assetResult, sheetResult, stateResult, pingResult, areaResult] =
        await Promise.allSettled([
          authoritative
            ? Promise.resolve(authoritative.tokens)
            : chosen
              ? repository.tokens(campaign, chosen.id)
              : Promise.resolve([]),
          authoritative ? Promise.resolve(authoritative.assets) : repository.assets(campaign),
          sheets.list(),
          session.read(campaign),
          chosen ? repository.pings(campaign, chosen.id) : Promise.resolve([]),
          authoritative
            ? Promise.resolve(authoritative.areas)
            : chosen
              ? repository.areas(campaign, chosen.id)
              : Promise.resolve([]),
        ]);
      if (
        !alive.current ||
        generation.current !== requestGeneration ||
        readEpoch.current !== requestEpoch ||
        selected.current !== (chosen?.id || '')
      )
        return;
      if (tokenResult.status === 'fulfilled') setTokens(tokenResult.value);
      else throw tokenResult.reason;
      if (areaResult.status === 'fulfilled') setAreas(areaResult.value);
      else {
        setAreas([]);
        throw areaResult.reason;
      }
      if (assetResult.status === 'fulfilled') setAssets(assetResult.value);
      else setAssets([]);
      if (sheetResult.status === 'fulfilled')
        setRecords(sheetResult.value.filter((row) => row.campanha_id === campaign));
      else setRecords([]);
      if (stateResult.status === 'fulfilled') setMesa(stateResult.value);
      else setMesa(null);
      if (pingResult.status === 'fulfilled')
        setPings(pingResult.value.filter((ping) => Date.now() - Date.parse(ping.criado_em) < 6000));
      else setPings([]);
    } catch (e) {
      if (
        !alive.current ||
        generation.current !== requestGeneration ||
        readEpoch.current !== requestEpoch
      )
        return;
      setSnapshot(null);
      setTokens([]);
      setAreas([]);
      setAssets([]);
      const code = (e as { code?: string }).code;
      if (['WV002', 'ACESSO', 'SESSAO', 'PGRST301'].includes(code || '')) {
        setScenes([]);
        setTokens([]);
        setAreas([]);
        setAssets([]);
        setRecords([]);
        setMesa(null);
        setPings([]);
        setAttempt(null);
        unresolved.current = false;
      }
      setError(e instanceof Error ? e.message : 'Não foi possível atualizar o mapa.');
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
  }, [campaign, master, repository, session, sheets, contextKey]);
  latestRefresh.current = refresh;

  useEffect(() => {
    if (!pings.length) return;
    const timer = setInterval(
      () =>
        setPings((rows) => rows.filter((ping) => Date.now() - Date.parse(ping.criado_em) < 6000)),
      500,
    );
    return () => clearInterval(timer);
  }, [pings.length]);

  useLayoutEffect(() => {
    generation.current++;
    context.current = contextKey;
    setLoading(true);
    setAttempt(null);
    unresolved.current = false;
    setSnapshot(null);
    if (!master) {
      setTokens([]);
      setAssets([]);
      setAreas([]);
      setScenes((rows) => rows.filter((row) => row.publicada));
      setTokens((rows) => rows.filter((row) => !row.oculto));
      setAssets((rows) => rows.filter((row) => row.visibilidade === 'campanha'));
      setRecords((rows) => rows.filter((row) => row.proprietario_id === userId));
    }
  }, [contextKey, master, userId]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    void (async () => {
      const { data: memberships } = await supabase!
        .from('membros_campanha')
        .select('usuario_id,papel')
        .eq('campanha_id', campaign);
      if (!alive.current) return;
      const ids = (memberships || [])
        .filter(() => true)
        .map((member) => member.usuario_id as string);
      if (master && !ids.includes(userId)) ids.push(userId);
      if (!ids.length) return;
      const { data: profiles } = await supabase!
        .from('perfis')
        .select('id,nome_exibicao')
        .in('id', ids);
      if (alive.current)
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
      readEpoch.current++;
      setLoading(true);
      setSnapshot(null);
      setTokens([]);
      setAreas([]);
      setAssets([]);
      setPings([]);
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
  }, [campaign, refresh, repository, session]);

  async function operate(command?: MapCommand) {
    if (busy.current || (attempt && command)) return false;
    const current = attempt || (command && { id: crypto.randomUUID(), command });
    if (!current) return false;
    busy.current = true;
    unresolved.current = true;
    setPending(true);
    setAttempt(current);
    setError('');
    const requestGeneration = generation.current;
    try {
      const result = await repository.operate(campaign, current.command, current.id);
      if (!alive.current || generation.current !== requestGeneration) return false;
      setAttempt(null);
      unresolved.current = false;
      await refresh();
      return result;
    } catch (e) {
      if (!alive.current || generation.current !== requestGeneration) return false;
      const code = (e as { code?: string }).code;
      if (['WV001', 'WV002', 'WV003', 'WV004'].includes(code || '')) {
        setAttempt(null);
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
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }
  function chooseScene(id: string) {
    if (!master || busy.current || unresolved.current) return;
    selected.current = id;
    generation.current++;
    setSceneId(id);
    setSnapshot(null);
    setTokens([]);
    setAreas([]);
    setPings([]);
    void refresh();
  }
  function release() {
    if (busy.current) return;
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
        setPings((rows) => [...rows.filter((row) => row.id !== marker.id), marker]);
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
      ? tokens.filter(
          (row) =>
            row.campanha_id === campaign && row.cena_id === sceneId && (master || !row.oculto),
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
    error,
    setError,
    pending,
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
