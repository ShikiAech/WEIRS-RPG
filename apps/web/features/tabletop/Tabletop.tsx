import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { AreaRecord, SceneRecord, TokenRecord } from '../../../../packages/contracts/tabletop';
import type { ChatCommand, ChatMessage } from '../../../../packages/contracts/chat';
import { useSession } from '../session/useSession';
import { TokenActions } from './TokenActions';
import { AreaTools } from './AreaTools';
import { SpellAreas } from './SpellAreas';
import { groupDelta, selectionBounds } from './agility-geometry';
import { useMapHistory } from './useMapHistory';
import { AssetLibrary, SceneEditor, TokenEditor } from './MapEditors';
import { useAssetUrls, useTabletop } from './useTabletop';
import {
  CELL,
  distance,
  fitCamera,
  gridPoint,
  revealRectangle,
  snapToken,
  zoomCamera,
  type Camera,
  type Point,
} from './geometry';

type Tool = 'select' | 'pan' | 'ruler' | 'fog' | 'draw' | 'ping' | 'area' | 'box';
type Drag = {
  pointer: number;
  start: Point;
  kind: Tool;
  camera: Camera;
  token?: TokenRecord;
  tokens?: TokenRecord[];
  offset?: Point;
  points?: Point[];
};
export function Tabletop({
  campaignId,
  userId,
  role,
  onOpenSheet,
  onRoll = () => {},
  onMessage = () => {},
  onBusy = () => {},
  chatDisabled = false,
}: {
  campaignId: string;
  userId: string;
  role: string;
  onOpenSheet?: (id: string) => void;
  onRoll?: (command: ChatCommand) => void;
  onMessage?: (message: ChatMessage) => void;
  onBusy?: (busy: boolean) => void;
  chatDisabled?: boolean;
}) {
  const master = role === 'mestre',
    spectator = role === 'espectador';
  const map = useTabletop(campaignId, master, userId),
    { scene, tokens, records, mesa } = map;
  const session = useSession(campaignId, onMessage, onBusy);
  useEffect(() => {
    onBusy(session.pending || !!session.attempt);
  }, [session.pending, session.attempt, onBusy]);
  const history = useMapHistory(
    `${campaignId}:${userId}:${role}:${scene?.id || ''}`,
    tokens,
    scene,
    map.operate,
  );
  const operate = history.operate;
  const [tool, setTool] = useState<Tool>('select'),
    [drawer, setDrawer] = useState<'scenes' | 'assets' | 'token' | 'areas' | 'selection' | ''>('');
  const requestedImages = [
    scene?.fundo_id,
    ...tokens.map((token) => token.imagem_id),
    ...(drawer === 'assets' ? map.assets.map((asset) => asset.id) : []),
  ].filter((id): id is string => Boolean(id));
  const images = useAssetUrls(map.assets, map.repository, requestedImages),
    urls = images.urls;
  const [sceneEditor, setSceneEditor] = useState<SceneRecord | 'new' | null>(null),
    [tokenEditor, setTokenEditor] = useState<TokenRecord | 'new' | null>(null);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 }),
    [size, setSize] = useState({ width: 900, height: 600 });
  const [selected, setSelected] = useState(''),
    [selection, setSelection] = useState<string[]>([]),
    [preview, setPreview] = useState<Point | null>(null),
    [ruler, setRuler] = useState<{ a: Point; b: Point } | null>(null);
  const [fogPreview, setFogPreview] = useState<{
      x: number;
      y: number;
      w: number;
      h: number;
    } | null>(null),
    [drawPreview, setDrawPreview] = useState<Point[]>([]),
    [deleteConfirm, setDeleteConfirm] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [boxPreview, setBoxPreview] = useState<ReturnType<typeof selectionBounds> | null>(null);
  const [areaDraft, setAreaDraft] = useState<AreaRecord | null>(null);
  const [groupPreview, setGroupPreview] = useState<Point | null>(null);
  const [multiSelecting, setMultiSelecting] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setMultiSelecting(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setMultiSelecting(false);
    };
    const blur = () => setMultiSelecting(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);
  const svg = useRef<SVGSVGElement>(null),
    stage = useRef<HTMLDivElement>(null),
    drag = useRef<Drag | null>(null),
    cameraRef = useRef(camera);
  cameraRef.current = camera;
  const unique = useId().replace(/:/g, ''),
    selectedToken = tokens.find((token) => token.id === selected);
  const selectedTokens = tokens.filter((t) => selection.includes(t.id));
  const canMove = (token: TokenRecord) =>
    !spectator &&
    (master ||
      (!token.bloqueado &&
        !token.oculto &&
        (token.controlador_id === userId ||
          records.some(
            (record) => record.id === token.ficha_id && record.proprietario_id === userId,
          ))));
  const canOpen = (token: TokenRecord) =>
    !!token.ficha_id && (master || records.some((record) => record.id === token.ficha_id));
  const currentCombatant = (token: TokenRecord) =>
    mesa?.estado.combate.participantes.find(
      (participant) =>
        (token.ficha_id && participant.ficha_id === token.ficha_id) ||
        (token.combate_id && participant.id === token.combate_id),
    );
  const currentVitals = (token: TokenRecord) => {
    const participant = currentCombatant(token);
    if (participant)
      return {
        current: participant.pvAtuais,
        max: participant.pvMaximos,
        conditions: participant.condicoes || [],
        concentration: participant.concentracao,
      };
    const sheet = records.find((record) => record.id === token.ficha_id);
    return sheet
      ? {
          current: sheet.conteudo.combate.pvAtuais,
          max: sheet.conteudo.combate.pvMaximos,
          conditions: sheet.conteudo.combate.condicoes,
          concentration: sheet.conteudo.combate.concentracaoAtiva,
        }
      : null;
  };
  const point = (event: { clientX: number; clientY: number }) => {
    const rect = svg.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const world = (event: { clientX: number; clientY: number }) =>
    gridPoint(point(event), cameraRef.current);
  const fit = () => {
    if (scene) setCamera(fitCamera(size.width, size.height, scene.largura, scene.altura));
  };
  useLayoutEffect(() => {
    if (master) return;
    const pointer = drag.current?.pointer;
    if (pointer !== undefined && svg.current?.hasPointerCapture(pointer))
      svg.current.releasePointerCapture(pointer);
    drag.current = null;
    setSceneEditor(null);
    setTokenEditor(null);
    setSelected('');
    setSelection([]);
    setAreaDraft(null);
    setTool('select');
    setPreview(null);
    setRuler(null);
    setFogPreview(null);
    setDrawPreview([]);
    setDeleteConfirm(false);
    setDrawer((previous) => (previous === 'token' || previous === 'scenes' ? '' : previous));
  }, [master]);
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setSelected('');
    setSelection([]);
    setAreaDraft(null);
    setGroupPreview(null);
    setBoxPreview(null);
    setPreview(null);
    setRuler(null);
    setFogPreview(null);
    setDrawPreview([]);
    drag.current = null;
    if (scene) setCamera(fitCamera(size.width, size.height, scene.largura, scene.altura));
  }, [scene?.id, scene?.largura, scene?.altura, size.width, size.height]);
  useEffect(() => {
    setSelection((ids) => {
      const available = ids.filter((id) => tokens.some((t) => t.id === id));
      return available.length === ids.length ? ids : available;
    });
    if (selected && !tokens.some((token) => token.id === selected)) {
      setSelected('');
      setSelection((ids) => ids.filter((id) => tokens.some((t) => t.id === id)));
      setDeleteConfirm(false);
    }
  }, [tokens, selected]);
  useEffect(() => {
    if (!areaDraft || map.loading) return;
    if (
      (areaDraft.id !== 'preview' && !map.areas.some((a) => a.id === areaDraft.id)) ||
      (areaDraft.token_id && !tokens.some((t) => t.id === areaDraft.token_id))
    ) {
      setAreaDraft(null);
      setDrawer('');
      setTool('select');
    }
  }, [areaDraft, map.areas, tokens, map.loading]);
  useEffect(() => {
    const target = svg.current;
    if (!target) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = target.getBoundingClientRect();
      setCamera((previous) =>
        zoomCamera(
          previous,
          { x: event.clientX - rect.left, y: event.clientY - rect.top },
          previous.zoom * Math.exp(-event.deltaY * 0.0015),
        ),
      );
    };
    target.addEventListener('wheel', wheel, { passive: false });
    return () => target.removeEventListener('wheel', wheel);
  }, [scene?.id]);

  function begin(event: ReactPointerEvent<SVGSVGElement>) {
    if (!scene || (event.button !== 0 && event.button !== 1 && event.button !== 2)) return;
    event.preventDefault();
    const p = world(event),
      kind =
        event.button !== 0 ? 'pan' : tool === 'select' && event.shiftKey && master ? 'box' : tool;
    if (kind === 'ping') {
      if (!spectator)
        void map.ping({
          x: Math.max(0, Math.min(scene.largura, p.x)),
          y: Math.max(0, Math.min(scene.altura, p.y)),
        });
      return;
    }
    if (kind === 'select') {
      setSelected('');
      setSelection([]);
    }
    if ((kind === 'fog' || kind === 'draw') && (!master || map.locked)) return;
    if (kind === 'area' && (spectator || map.locked || !areaDraft)) return;
    svg.current!.setPointerCapture(event.pointerId);
    drag.current = {
      pointer: event.pointerId,
      start: kind === 'pan' || kind === 'select' ? point(event) : p,
      kind,
      camera: cameraRef.current,
      points: kind === 'draw' ? [p] : undefined,
    };
    if (kind === 'ruler') setRuler({ a: p, b: p });
    if (kind === 'fog') setFogPreview(revealRectangle(p, p, scene.largura, scene.altura));
    if (kind === 'draw') setDrawPreview([p]);
    if (kind === 'box') {
      setSelection([]);
      setSelected('');
      setBoxPreview(selectionBounds(p, p));
    }
    if (kind === 'area')
      setAreaDraft(
        (d) =>
          d && {
            ...d,
            x: Math.max(0, Math.min(scene.largura, p.x)),
            y: Math.max(0, Math.min(scene.altura, p.y)),
          },
      );
  }
  function beginToken(event: ReactPointerEvent<SVGGElement>, token: TokenRecord) {
    if (tool !== 'select' || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const ids =
      master && event.shiftKey
        ? selection.includes(token.id)
          ? selection.filter((id) => id !== token.id)
          : [...selection, token.id].slice(-40)
        : selection.includes(token.id)
          ? selection
          : [token.id];
    setSelection(ids);
    setSelected(ids.includes(token.id) ? token.id : ids.at(-1) || '');
    setDeleteConfirm(false);
    if (event.shiftKey || map.locked || !canMove(token)) return;
    svg.current!.setPointerCapture(event.pointerId);
    const p = world(event);
    drag.current = {
      pointer: event.pointerId,
      start: p,
      kind: 'select',
      camera: cameraRef.current,
      token,
      tokens: tokens.filter((t) => ids.includes(t.id)),
      offset: { x: p.x - token.x, y: p.y - token.y },
    };
    setPreview({ x: token.x, y: token.y });
    setGroupPreview({ x: 0, y: 0 });
  }
  function move(event: ReactPointerEvent<SVGSVGElement>) {
    const action = drag.current;
    if (!action || action.pointer !== event.pointerId || !scene) return;
    const p = world(event);
    if (action.token) {
      if (master && action.tokens!.length > 1) {
        setGroupPreview(
          groupDelta(
            action.tokens!,
            { x: p.x - action.start.x, y: p.y - action.start.y },
            scene.largura,
            scene.altura,
            scene.grade && !event.altKey,
          ),
        );
        return;
      }
      setPreview(
        snapToken(
          { x: p.x - action.offset!.x, y: p.y - action.offset!.y },
          action.token.tamanho,
          scene.largura,
          scene.altura,
          scene.grade && !event.altKey,
        ),
      );
    } else if (action.kind === 'box') setBoxPreview(selectionBounds(action.start, p));
    else if (action.kind === 'area')
      setAreaDraft(
        (d) =>
          d && {
            ...d,
            angulo: Math.round(
              (Math.atan2(p.y - action.start.y, p.x - action.start.x) * 180) / Math.PI,
            ),
          },
      );
    else if (action.kind === 'pan' || action.kind === 'select') {
      const screen = point(event);
      setCamera({
        ...action.camera,
        x: action.camera.x + screen.x - action.start.x,
        y: action.camera.y + screen.y - action.start.y,
      });
    } else if (action.kind === 'ruler') setRuler({ a: action.start, b: p });
    else if (action.kind === 'fog')
      setFogPreview(revealRectangle(action.start, p, scene.largura, scene.altura));
    else if (action.kind === 'draw') {
      const bounded = {
        x: Math.max(0, Math.min(scene.largura, p.x)),
        y: Math.max(0, Math.min(scene.altura, p.y)),
      };
      const previous = action.points!.at(-1)!;
      if (
        Math.hypot(previous.x - bounded.x, previous.y - bounded.y) > 0.08 &&
        action.points!.length < 100
      ) {
        action.points!.push(bounded);
        setDrawPreview([...action.points!]);
      }
    }
  }
  function end(event: ReactPointerEvent<SVGSVGElement>, cancel = false) {
    const action = drag.current;
    if (!action || action.pointer !== event.pointerId || !scene) return;
    drag.current = null;
    if (svg.current!.hasPointerCapture(event.pointerId))
      svg.current!.releasePointerCapture(event.pointerId);
    if (!cancel) {
      if (action.token) {
        if (master && action.tokens!.length > 1) {
          const delta = groupDelta(
            action.tokens!,
            { x: world(event).x - action.start.x, y: world(event).y - action.start.y },
            scene.largura,
            scene.altura,
            scene.grade && !event.altKey,
          );
          if (delta.x || delta.y)
            void operate({
              tipo: 'tokens_lote',
              cena_id: scene.id,
              itens: action.tokens!.map((t) => ({
                tipo: 'token_atualizar',
                id: t.id,
                versao: t.versao,
                patch: { x: t.x + delta.x, y: t.y + delta.y },
              })),
            });
        } else {
          const p = world(event),
            position = snapToken(
              { x: p.x - action.offset!.x, y: p.y - action.offset!.y },
              action.token.tamanho,
              scene.largura,
              scene.altura,
              scene.grade && !event.altKey,
            );
          if (position.x !== action.token.x || position.y !== action.token.y)
            void operate({
              tipo: 'token_atualizar',
              id: action.token.id,
              versao: action.token.versao,
              patch: position,
            });
        }
      } else if (action.kind === 'box') {
        const rectangle = selectionBounds(action.start, world(event));
        const ids = tokens
          .filter(
            (t) =>
              t.x + t.tamanho >= rectangle.x &&
              t.x <= rectangle.x + rectangle.w &&
              t.y + t.tamanho >= rectangle.y &&
              t.y <= rectangle.y + rectangle.h,
          )
          .slice(0, 40)
          .map((t) => t.id);
        setSelection(ids);
        setSelected(ids[0] || '');
      } else if (action.kind === 'area') {
        setTool('select');
        setDrawer('areas');
      } else if (action.kind === 'fog') {
        const rectangle = revealRectangle(action.start, world(event), scene.largura, scene.altura);
        void operate({
          tipo: 'cena_atualizar',
          id: scene.id,
          versao: scene.versao,
          patch: { revelacoes: [...scene.revelacoes, rectangle] },
        });
      } else if (action.kind === 'draw' && action.points!.length > 1) {
        void operate({
          tipo: 'cena_atualizar',
          id: scene.id,
          versao: scene.versao,
          patch: {
            desenhos: [
              ...(scene.desenhos || []),
              { id: crypto.randomUUID(), cor: '#d5b873', pontos: action.points! },
            ],
          },
        });
      }
    }
    setPreview(null);
    setGroupPreview(null);
    setBoxPreview(null);
    setFogPreview(null);
    setDrawPreview([]);
  }
  const selectedVitals = selectedToken && currentVitals(selectedToken);
  const tokenOrigin = scene
    ? snapToken(
        gridPoint({ x: size.width / 2, y: size.height / 2 }, camera),
        1,
        scene.largura,
        scene.altura,
      )
    : { x: 1, y: 1 };
  const toggleDrawer = (next: 'scenes' | 'assets' | 'token' | 'areas' | 'selection') => {
    if (map.locked || fileBusy) return;
    setDrawer((previous) => (previous === next ? '' : next));
    setSceneEditor(null);
    setTokenEditor(null);
  };
  function newArea(): AreaRecord {
    return {
      id: 'preview',
      campanha_id: campaignId,
      cena_id: scene!.id,
      versao: 0,
      usuario_id: userId,
      token_id: null,
      nome: 'Área de magia',
      forma: 'circulo',
      x: tokenOrigin.x,
      y: tokenOrigin.y,
      tamanho: 3,
      largura: 1,
      angulo: 0,
      cor: '#b493e5',
    };
  }
  async function duplicate() {
    if (!master || map.locked || !scene || !selectedTokens.length) return;
    const delta = groupDelta(selectedTokens, { x: 1, y: 1 }, scene.largura, scene.altura);
    const result = await operate({
      tipo: 'tokens_duplicar',
      cena_id: scene.id,
      tokens: selectedTokens.map((t) => ({ id: t.id, versao: t.versao })),
      dx: delta.x,
      dy: delta.y,
    });
    if (result && result.tokens) {
      setSelection(result.tokens.map((t) => t.id));
      setSelected(result.tokens[0]?.id || '');
    }
  }
  function moveSelection(delta: Point) {
    if (!scene || map.locked || !selectedTokens.length || !selectedTokens.every(canMove)) return;
    const bounded = groupDelta(selectedTokens, delta, scene.largura, scene.altura, scene.grade);
    if (!bounded.x && !bounded.y) return;
    if (selectedTokens.length === 1)
      void operate({
        tipo: 'token_atualizar',
        id: selectedTokens[0].id,
        versao: selectedTokens[0].versao,
        patch: { x: selectedTokens[0].x + bounded.x, y: selectedTokens[0].y + bounded.y },
      });
    else if (master)
      void operate({
        tipo: 'tokens_lote',
        cena_id: scene.id,
        itens: selectedTokens.map((t) => ({
          tipo: 'token_atualizar',
          id: t.id,
          versao: t.versao,
          patch: { x: t.x + bounded.x, y: t.y + bounded.y },
        })),
      });
  }
  const movementButtons = (
    <div className="token-movement" aria-label="Movimentar seleção">
      {[
        { name: 'esquerda', symbol: '←', x: -1, y: 0 },
        { name: 'cima', symbol: '↑', x: 0, y: -1 },
        { name: 'baixo', symbol: '↓', x: 0, y: 1 },
        { name: 'direita', symbol: '→', x: 1, y: 0 },
      ].map((d) => (
        <button
          key={d.name}
          type="button"
          aria-label={'Mover seleção para ' + d.name}
          disabled={map.locked}
          onClick={() => moveSelection({ x: d.x, y: d.y })}
        >
          {d.symbol}
        </button>
      ))}
    </div>
  );
  async function saveArea() {
    if (!areaDraft || !scene) return;
    const { nome, forma, x, y, tamanho, largura, angulo, cor, token_id } = areaDraft;
    const result = await operate(
      areaDraft.id === 'preview'
        ? {
            tipo: 'area_criar',
            cena_id: scene.id,
            nome,
            forma,
            x,
            y,
            tamanho,
            largura,
            angulo,
            cor,
            token_id,
          }
        : {
            tipo: 'area_atualizar',
            id: areaDraft.id,
            versao: areaDraft.versao,
            patch: { nome, forma, x, y, tamanho, largura, angulo, cor, token_id },
          },
    );
    if (result) {
      setAreaDraft(null);
      setDrawer('');
      setTool('select');
    }
  }

  return (
    <section className="tabletop-map" aria-label="Mesa virtual">
      <div className="map-stage" ref={stage}>
        {scene ? (
          <svg
            ref={svg}
            className={'map-canvas tool-' + tool}
            width="100%"
            height="100%"
            viewBox={`0 0 ${size.width} ${size.height}`}
            role="application"
            aria-label="Mapa da campanha"
            tabIndex={0}
            onPointerDown={begin}
            onPointerMove={move}
            onPointerUp={(event) => end(event)}
            onPointerCancel={(event) => end(event, true)}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setSelected('');
                setSelection([]);
                setAreaDraft(null);
                setTool('select');
                setRuler(null);
                setDrawer('');
                return;
              }
              if (master && (event.ctrlKey || event.metaKey)) {
                if (event.key.toLowerCase() === 'z') {
                  event.preventDefault();
                  if (!map.locked) void (event.shiftKey ? history.redo() : history.undo());
                  return;
                }
                if (event.key.toLowerCase() === 'd') {
                  event.preventDefault();
                  void duplicate();
                  return;
                }
              }
              if (!selectedToken || map.locked || !canMove(selectedToken)) return;
              const directions: Record<string, Point> = {
                ArrowLeft: { x: -1, y: 0 },
                ArrowRight: { x: 1, y: 0 },
                ArrowUp: { x: 0, y: -1 },
                ArrowDown: { x: 0, y: 1 },
              };
              const delta = directions[event.key];
              if (!delta) return;
              event.preventDefault();
              if (master && selectedTokens.length > 1) {
                const bounded = groupDelta(selectedTokens, delta, scene.largura, scene.altura);
                if (bounded.x || bounded.y)
                  void operate({
                    tipo: 'tokens_lote',
                    cena_id: scene.id,
                    itens: selectedTokens.map((t) => ({
                      tipo: 'token_atualizar',
                      id: t.id,
                      versao: t.versao,
                      patch: { x: t.x + bounded.x, y: t.y + bounded.y },
                    })),
                  });
                return;
              }
              const position = snapToken(
                { x: selectedToken.x + delta.x, y: selectedToken.y + delta.y },
                selectedToken.tamanho,
                scene.largura,
                scene.altura,
                scene.grade,
              );
              if (position.x !== selectedToken.x || position.y !== selectedToken.y)
                void operate({
                  tipo: 'token_atualizar',
                  id: selectedToken.id,
                  versao: selectedToken.versao,
                  patch: position,
                });
            }}
          >
            <title>
              Mapa da campanha. Arraste para mover o mapa; selecione seu token e use as setas para
              movimentá-lo.
            </title>
            <defs>
              <pattern
                id={'grid' + unique}
                width={CELL}
                height={CELL}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M ${CELL} 0 L 0 0 0 ${CELL}`}
                  fill="none"
                  stroke={scene.fundo_id ? '#ece0b84d' : '#b5a38724'}
                  strokeWidth="1"
                />
              </pattern>
              <pattern id={'paper' + unique} width="256" height="256" patternUnits="userSpaceOnUse">
                <rect width="256" height="256" fill="#242421" />
                <circle cx="25" cy="62" r="80" fill="#a99c7710" />
                <path
                  d="M180 0L208 112 176 220 250 256"
                  fill="none"
                  stroke="#b5aa8610"
                  strokeWidth="28"
                />
              </pattern>
              <mask id={'fog' + unique}>
                <rect width={scene.largura * CELL} height={scene.altura * CELL} fill="white" />
                {scene.revelacoes.map((rectangle, index) => (
                  <rect
                    key={index}
                    x={rectangle.x * CELL}
                    y={rectangle.y * CELL}
                    width={rectangle.w * CELL}
                    height={rectangle.h * CELL}
                    fill="black"
                  />
                ))}
              </mask>
              <clipPath id={'scene' + unique}>
                <rect width={scene.largura * CELL} height={scene.altura * CELL} />
              </clipPath>
              {tokens
                .filter((token) => token.imagem_id)
                .map((token) => (
                  <clipPath key={token.id} id={'portrait' + token.id}>
                    <circle
                      cx={(token.tamanho * CELL) / 2}
                      cy={(token.tamanho * CELL) / 2}
                      r={token.tamanho * CELL * 0.43}
                    />
                  </clipPath>
                ))}
            </defs>
            <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
              <rect
                width={scene.largura * CELL}
                height={scene.altura * CELL}
                fill={`url(#paper${unique})`}
                stroke="#b4a07850"
                strokeWidth="2"
              />
              {scene.fundo_id && urls[scene.fundo_id] && (
                <image
                  href={urls[scene.fundo_id]}
                  x={(scene.fundo_x || 0) * CELL}
                  y={(scene.fundo_y || 0) * CELL}
                  width={scene.largura * CELL * (scene.fundo_escala || 1)}
                  height={scene.altura * CELL * (scene.fundo_escala || 1)}
                  clipPath={`url(#scene${unique})`}
                  preserveAspectRatio="none"
                />
              )}
              {scene.grade && (
                <rect
                  width={scene.largura * CELL}
                  height={scene.altura * CELL}
                  fill={`url(#grid${unique})`}
                  pointerEvents="none"
                />
              )}
              {(scene.desenhos || []).map((stroke) => (
                <polyline
                  key={stroke.id}
                  points={stroke.pontos.map((p) => `${p.x * CELL},${p.y * CELL}`).join(' ')}
                  fill="none"
                  stroke={stroke.cor}
                  strokeWidth={3 / camera.zoom}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              ))}
              <g clipPath={`url(#scene${unique})`}>
                <SpellAreas
                  areas={map.areas}
                  preview={
                    areaDraft &&
                    (master ||
                      !areaDraft.token_id ||
                      tokens.some((t) => t.id === areaDraft.token_id && !t.oculto))
                      ? areaDraft
                      : null
                  }
                  zoom={camera.zoom}
                />
              </g>
              <g clipPath={`url(#scene${unique})`} pointerEvents="none">
                {tokens
                  .filter((t) => t.aura)
                  .map((t) => {
                    const p =
                      selectedTokens.length > 1 && selection.includes(t.id) && groupPreview
                        ? { x: t.x + groupPreview.x, y: t.y + groupPreview.y }
                        : selected === t.id && preview
                          ? preview
                          : t;
                    return (
                      <circle
                        key={t.id}
                        cx={(p.x + t.tamanho / 2) * CELL}
                        cy={(p.y + t.tamanho / 2) * CELL}
                        r={t.aura!.raio * CELL}
                        fill={t.aura!.cor}
                        fillOpacity={0.1}
                        stroke={t.aura!.cor}
                        strokeOpacity={0.5}
                        strokeWidth={1 / camera.zoom}
                      />
                    );
                  })}
              </g>
              {tokens.map((token) => {
                const position =
                    selectedTokens.length > 1 && selection.includes(token.id) && groupPreview
                      ? { x: token.x + groupPreview.x, y: token.y + groupPreview.y }
                      : selected === token.id && preview
                        ? preview
                        : token,
                  dimension = token.tamanho * CELL,
                  center = dimension / 2,
                  radius = dimension * 0.43,
                  vitals = currentVitals(token);
                const active =
                  mesa?.estado.combate.ativo &&
                  currentCombatant(token)?.id === mesa.estado.combate.turno;
                return (
                  <g
                    key={token.id}
                    transform={`translate(${position.x * CELL} ${position.y * CELL})`}
                  >
                    <g
                      role="button"
                      tabIndex={0}
                      aria-label={'Token ' + token.nome}
                      aria-pressed={selection.includes(token.id)}
                      data-token-id={token.id}
                      className={
                        'map-token' +
                        (token.oculto ? ' hidden-token' : '') +
                        (selection.includes(token.id) ? ' selected-token' : '')
                      }
                      onPointerDown={(event) => beginToken(event, token)}
                      onFocus={() => {
                        setSelected(token.id);
                        setSelection((ids) => (ids.includes(token.id) ? ids : [token.id]));
                        setDeleteConfirm(false);
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                      onDoubleClick={() => {
                        if (canOpen(token)) onOpenSheet?.(token.ficha_id!);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelected(token.id);
                          setSelection((ids) =>
                            event.shiftKey && master
                              ? ids.includes(token.id)
                                ? ids.filter((id) => id !== token.id)
                                : [...ids, token.id].slice(-40)
                              : [token.id],
                          );
                        }
                      }}
                    >
                      <title>
                        {token.nome}
                        {token.oculto ? ' · Somente mestres' : ''}
                        {token.bloqueado ? ' · Movimento bloqueado' : ''}
                        {vitals ? ` · PV ${vitals.current}/${vitals.max}` : ''}
                      </title>
                      {(selection.includes(token.id) || active) && (
                        <circle
                          cx={center}
                          cy={center}
                          r={radius + 5 / camera.zoom}
                          fill="none"
                          stroke={active ? '#f5d483' : '#f0e9db'}
                          strokeWidth={2 / camera.zoom}
                          strokeDasharray={
                            active ? undefined : `${4 / camera.zoom} ${3 / camera.zoom}`
                          }
                        />
                      )}
                      <circle
                        cx={center}
                        cy={center}
                        r={radius}
                        fill="#1b1c20"
                        stroke={token.cor}
                        strokeWidth={4 / camera.zoom}
                      />
                      {token.imagem_id && urls[token.imagem_id] ? (
                        <image
                          href={urls[token.imagem_id]}
                          width={dimension}
                          height={dimension}
                          preserveAspectRatio="xMidYMid slice"
                          clipPath={`url(#portrait${token.id})`}
                          transform={`rotate(${token.rotacao} ${center} ${center})`}
                        />
                      ) : (
                        <text
                          x={center}
                          y={center}
                          fill={token.cor}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={dimension * 0.3}
                          fontWeight="700"
                        >
                          {token.nome
                            .trim()
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((word) => word[0])
                            .join('')
                            .toUpperCase()}
                        </text>
                      )}
                      {token.rotacao !== 0 && (
                        <path
                          d={`M${center} ${center - radius - 5}l-5 8h10Z`}
                          fill={token.cor}
                          transform={`rotate(${token.rotacao} ${center} ${center})`}
                        />
                      )}
                      {vitals && vitals.max > 0 && (
                        <g>
                          <rect
                            x={dimension * 0.12}
                            y={dimension * 0.87}
                            width={dimension * 0.76}
                            height={5 / camera.zoom}
                            rx="2"
                            fill="#17191b"
                          />
                          <rect
                            x={dimension * 0.12}
                            y={dimension * 0.87}
                            width={
                              dimension *
                              0.76 *
                              Math.max(0, Math.min(1, vitals.current / vitals.max))
                            }
                            height={5 / camera.zoom}
                            rx="2"
                            fill={
                              vitals.current <= 0
                                ? '#aa5146'
                                : vitals.current / vitals.max < 0.4
                                  ? '#dbad57'
                                  : '#78a584'
                            }
                          />
                        </g>
                      )}
                      {!!vitals?.conditions.length && (
                        <circle
                          cx={dimension * 0.85}
                          cy={dimension * 0.15}
                          r={5 / camera.zoom}
                          fill="#ce8557"
                        >
                          <title>
                            {vitals.conditions.map((condition) => condition.nome).join(', ')}
                          </title>
                        </circle>
                      )}
                      {vitals?.concentration && (
                        <text
                          x={dimension * 0.07}
                          y={dimension * 0.13}
                          fontSize={12 / camera.zoom}
                          fill="#b9a0d9"
                        >
                          ◆<title>{'Concentração: ' + vitals.concentration}</title>
                        </text>
                      )}
                    </g>
                    <text
                      x={center}
                      y={dimension + 16 / camera.zoom}
                      fontSize={14 / camera.zoom}
                      fill="#eee6d7"
                      textAnchor="middle"
                      stroke="#171719"
                      strokeWidth={3 / camera.zoom}
                      paintOrder="stroke"
                      className="token-name"
                      opacity={token.oculto ? 0.62 : 1}
                    >
                      {token.nome.length > 24 ? token.nome.slice(0, 23) + '…' : token.nome}
                      {token.oculto ? ' ◌' : ''}
                    </text>
                  </g>
                );
              })}
              {scene.nevoa && (
                <rect
                  width={scene.largura * CELL}
                  height={scene.altura * CELL}
                  fill="#101114"
                  opacity={master ? 0.52 : 0.98}
                  mask={`url(#fog${unique})`}
                  pointerEvents="none"
                />
              )}
              {fogPreview && (
                <rect
                  x={fogPreview.x * CELL}
                  y={fogPreview.y * CELL}
                  width={fogPreview.w * CELL}
                  height={fogPreview.h * CELL}
                  fill="#d6c89033"
                  stroke="#e0c881"
                  strokeWidth={2 / camera.zoom}
                  strokeDasharray={6 / camera.zoom}
                  pointerEvents="none"
                />
              )}
              {drawPreview.length > 1 && (
                <polyline
                  points={drawPreview.map((p) => `${p.x * CELL},${p.y * CELL}`).join(' ')}
                  fill="none"
                  stroke="#d5b873"
                  strokeWidth={3 / camera.zoom}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
              )}
              {ruler && (
                <g pointerEvents="none">
                  <line
                    x1={ruler.a.x * CELL}
                    y1={ruler.a.y * CELL}
                    x2={ruler.b.x * CELL}
                    y2={ruler.b.y * CELL}
                    stroke="#e7c97c"
                    strokeWidth={2 / camera.zoom}
                    strokeDasharray={5 / camera.zoom}
                  />
                  <circle
                    cx={ruler.a.x * CELL}
                    cy={ruler.a.y * CELL}
                    r={4 / camera.zoom}
                    fill="#e7c97c"
                  />
                  <circle
                    cx={ruler.b.x * CELL}
                    cy={ruler.b.y * CELL}
                    r={4 / camera.zoom}
                    fill="#e7c97c"
                  />
                  <text
                    x={ruler.b.x * CELL}
                    y={ruler.b.y * CELL - 12 / camera.zoom}
                    fill="#f4e2b2"
                    stroke="#161719"
                    strokeWidth={4 / camera.zoom}
                    paintOrder="stroke"
                    fontSize={14 / camera.zoom}
                    textAnchor="middle"
                  >
                    {distance(ruler.a, ruler.b, scene.unidade)} pés
                  </text>
                </g>
              )}
              {map.pings.map((marker) => (
                <g
                  key={marker.id}
                  transform={`translate(${marker.x * CELL} ${marker.y * CELL})`}
                  className="map-ping"
                  pointerEvents="none"
                  aria-label={'Local marcado por ' + marker.nome}
                >
                  <circle
                    className="ping-halo"
                    r={18 / camera.zoom}
                    fill="none"
                    stroke="#edc97e"
                    strokeWidth={2 / camera.zoom}
                  />
                  <circle r={4 / camera.zoom} fill="#f0d996" />
                  <text
                    y={-28 / camera.zoom}
                    fontSize={14 / camera.zoom}
                    textAnchor="middle"
                    fill="#f2dfb0"
                    stroke="#17181b"
                    strokeWidth={3 / camera.zoom}
                    paintOrder="stroke"
                  >
                    {marker.nome}
                  </text>
                </g>
              ))}
              {boxPreview && (
                <rect
                  x={boxPreview.x * CELL}
                  y={boxPreview.y * CELL}
                  width={boxPreview.w * CELL}
                  height={boxPreview.h * CELL}
                  fill="#d5b87322"
                  stroke="#d5b873"
                  strokeWidth={2 / camera.zoom}
                  pointerEvents="none"
                />
              )}
            </g>
          </svg>
        ) : (
          <div className="map-empty">
            <span aria-hidden="true">⌖</span>
            <h2>{map.loading ? 'Preparando a mesa…' : 'Uma nova aventura começa aqui'}</h2>
            <p>
              {master
                ? 'Prepare uma cena e coloque os personagens no mapa.'
                : 'O mestre pode exibir um mapa quando a cena começar.'}
            </p>
            {master && !map.loading && (
              <button
                className="button secondary"
                disabled={map.locked}
                onClick={() => {
                  setDrawer('scenes');
                  setSceneEditor('new');
                }}
              >
                Criar primeiro mapa
              </button>
            )}
          </div>
        )}
      </div>

      <nav className="map-tools" aria-label="Ferramentas do mapa">
        {(
          [
            { key: 'select', label: 'Selecionar', symbol: '↖' },
            { key: 'pan', label: 'Mover mapa', symbol: '✥' },
            { key: 'ruler', label: 'Régua', symbol: '↔' },
            ...(!spectator ? [{ key: 'ping', label: 'Marcar local', symbol: '⌾' }] : []),
            ...(master
              ? [
                  { key: 'fog', label: 'Revelar área', symbol: '◩' },
                  { key: 'draw', label: 'Desenhar no mapa', symbol: '✎' },
                ]
              : []),
          ] as { key: Tool; label: string; symbol: string }[]
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            title={item.label}
            aria-label={item.label}
            aria-pressed={tool === item.key}
            disabled={!scene || ((item.key === 'fog' || item.key === 'draw') && map.locked)}
            onClick={() => {
              setTool(item.key);
              setRuler(null);
            }}
          >
            {item.symbol}
          </button>
        ))}
        <span className="map-tool-divider" />
        <button
          type="button"
          title="Cenas e mapas"
          aria-label="Cenas e mapas"
          aria-pressed={drawer === 'scenes'}
          disabled={map.locked || fileBusy}
          onClick={() => toggleDrawer('scenes')}
        >
          ▧
        </button>
        <button
          type="button"
          title="Arquivos da campanha"
          aria-label="Arquivos da campanha"
          aria-pressed={drawer === 'assets'}
          disabled={map.locked || fileBusy}
          onClick={() => toggleDrawer('assets')}
        >
          ▱
        </button>
        {master && (
          <button
            type="button"
            title="Novo token"
            aria-label="Novo token"
            disabled={!scene || map.locked || fileBusy}
            onClick={() => {
              setDrawer('token');
              setTokenEditor('new');
            }}
          >
            ⊕
          </button>
        )}
        {!spectator && (
          <button
            type="button"
            title="Áreas de magia"
            aria-label="Áreas de magia"
            aria-pressed={drawer === 'areas'}
            disabled={!scene || map.locked}
            onClick={() => {
              if (drawer === 'areas') {
                setDrawer('');
                setAreaDraft(null);
              } else {
                setAreaDraft(newArea());
                setDrawer('areas');
                setTool('select');
              }
            }}
          >
            ◌
          </button>
        )}
        <button
          type="button"
          title="Selecionar tokens"
          aria-label="Selecionar tokens"
          aria-pressed={drawer === 'selection'}
          disabled={!scene || map.locked}
          onClick={() => toggleDrawer('selection')}
        >
          ☷
        </button>
      </nav>
      {master && scene && (
        <nav className="map-history" aria-label="Histórico do mapa">
          <button
            type="button"
            aria-label="Desfazer alteração"
            title="Desfazer (Ctrl+Z)"
            disabled={map.locked || !history.canUndo}
            onClick={() => void history.undo()}
          >
            ↶
          </button>
          <button
            type="button"
            aria-label="Refazer alteração"
            title="Refazer (Ctrl+Shift+Z)"
            disabled={map.locked || !history.canRedo}
            onClick={() => void history.redo()}
          >
            ↷
          </button>
        </nav>
      )}

      {scene && (
        <div className="map-scene-caption">
          <strong>{scene.nome}</strong>
          {master && !scene.publicada && <span>Só mestres</span>}
          {master && scene.publicada && !scene.ativa && <span>Prévia</span>}
        </div>
      )}
      {scene && (
        <div className="map-zoom" aria-label="Zoom do mapa">
          <button
            type="button"
            aria-label="Diminuir zoom"
            onClick={() =>
              setCamera((current) =>
                zoomCamera(current, { x: size.width / 2, y: size.height / 2 }, current.zoom / 1.2),
              )
            }
          >
            −
          </button>
          <span>{Math.round(camera.zoom * 100)}%</span>
          <button
            type="button"
            aria-label="Aumentar zoom"
            onClick={() =>
              setCamera((current) =>
                zoomCamera(current, { x: size.width / 2, y: size.height / 2 }, current.zoom * 1.2),
              )
            }
          >
            +
          </button>
          <button type="button" aria-label="Enquadrar mapa" title="Enquadrar mapa" onClick={fit}>
            ⌖
          </button>
        </div>
      )}
      {scene && (
        <div className="map-status" aria-live="polite">
          {map.pending
            ? 'Salvando…'
            : tool === 'ruler'
              ? `${ruler ? distance(ruler.a, ruler.b, scene.unidade) + ' pés · ' : ''}Arraste para medir · diagonais D&D`
              : tool === 'ping'
                ? 'Clique no mapa para marcar um local para a campanha'
                : tool === 'fog'
                  ? 'Arraste um retângulo para revelar a área'
                  : tool === 'draw'
                    ? 'Arraste para desenhar no mapa'
                    : tool === 'area'
                      ? 'Clique para posicionar · Arraste para orientar · Esc cancela'
                      : selection.length > 1
                        ? `${selection.length} tokens · Arraste ou use as setas · Shift para selecionar`
                        : selectedToken
                          ? `${selectedToken.nome}${selectedVitals ? ` · PV ${selectedVitals.current}/${selectedVitals.max}` : ''}${canMove(selectedToken) ? ' · Arraste ou use as setas' : ''}`
                          : `${scene.unidade} pés por célula · Arraste para mover · Scroll para zoom`}
        </div>
      )}

      {selectedToken &&
        tool === 'select' &&
        !drawer &&
        selectedTokens.length <= 1 &&
        !multiSelecting && (
          <div className="map-selection" aria-label="Token selecionado">
            <strong>{selectedToken.nome}</strong>
            {selectedToken.oculto && <span>Somente mestres</span>}
            {selectedVitals && (
              <span>
                PV {selectedVitals.current}/{selectedVitals.max}
              </span>
            )}
            <TokenActions
              key={selectedToken.id}
              token={selectedToken}
              record={session.records.find((r) => r.id === selectedToken.ficha_id)}
              participant={session.mesa?.estado.combate.participantes.find(
                (p) =>
                  (selectedToken.ficha_id && p.ficha_id === selectedToken.ficha_id) ||
                  (selectedToken.combate_id && p.id === selectedToken.combate_id),
              )}
              mesa={session.mesa}
              userId={userId}
              role={role}
              disabled={
                chatDisabled ||
                session.pending ||
                !!session.attempt ||
                session.loading ||
                session.denied ||
                map.locked
              }
              onOpenSheet={onOpenSheet}
              onRoll={onRoll}
              operate={async (command) => {
                const result = await session.operate(command);
                if (result) await map.refresh();
                return result;
              }}
            />
            {canMove(selectedToken) && (
              <details className="token-position">
                <summary>Mover token</summary>
                {movementButtons}
                <p className="map-help">
                  Cada clique move uma célula ({scene?.unidade} pés). Também use arraste ou as setas
                  do teclado.
                </p>
              </details>
            )}
            {master && (
              <button
                type="button"
                className="text-button"
                disabled={map.locked}
                onClick={() => {
                  setTokenEditor(selectedToken);
                  setDrawer('token');
                }}
              >
                Editar token
              </button>
            )}
            {master && (
              <button
                type="button"
                className="text-button"
                disabled={map.locked}
                onClick={() => void duplicate()}
              >
                Duplicar seleção
              </button>
            )}
          </div>
        )}
      {master && selectedTokens.length > 1 && tool === 'select' && !drawer && (
        <div className="map-bulk-actions" aria-label="Seleção do mapa">
          {selectedTokens.length > 1 && (
            <strong>{selectedTokens.length} tokens selecionados</strong>
          )}
          <button
            type="button"
            className="text-button"
            disabled={map.locked}
            onClick={() => void duplicate()}
          >
            Duplicar seleção
          </button>
          {selectedTokens.length > 1 && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setSelection([]);
                setSelected('');
              }}
            >
              Limpar seleção
            </button>
          )}
          {movementButtons}
        </div>
      )}

      {drawer && (drawer === 'assets' || drawer === 'scenes' || scene) && (
        <aside
          className="map-drawer"
          aria-label={
            drawer === 'scenes'
              ? 'Cenas da campanha'
              : drawer === 'assets'
                ? 'Arquivos da campanha'
                : drawer === 'areas'
                  ? 'Configurar áreas de magia'
                  : drawer === 'selection'
                    ? 'Tokens da cena'
                    : 'Configurar token'
          }
        >
          <div className="map-drawer-heading">
            <h2>
              {drawer === 'scenes'
                ? 'Cenas e mapas'
                : drawer === 'assets'
                  ? 'Arquivos'
                  : drawer === 'areas'
                    ? 'Áreas de magia'
                    : drawer === 'selection'
                      ? 'Tokens da cena'
                      : 'Token'}
            </h2>
            <button
              type="button"
              className="text-button"
              aria-label="Fechar ferramentas do mapa"
              disabled={map.pending || !!map.attempt || fileBusy}
              onClick={() => {
                setDrawer('');
                setSceneEditor(null);
                setTokenEditor(null);
                setAreaDraft(null);
                setTool('select');
              }}
            >
              ×
            </button>
          </div>
          {drawer === 'areas' && scene && areaDraft && (
            <AreaTools
              scene={scene}
              areas={map.areas}
              tokens={tokens.filter((t) => canMove(t))}
              draft={areaDraft}
              userId={userId}
              master={master}
              disabled={map.locked}
              onDraft={setAreaDraft}
              onPosition={() => {
                setDrawer('');
                setTool('area');
              }}
              onSave={() => void saveArea()}
              onDelete={async (area) => {
                const result = await operate({
                  tipo: 'area_excluir',
                  id: area.id,
                  versao: area.versao,
                });
                if (result) {
                  setAreaDraft(newArea());
                }
              }}
            />
          )}
          {drawer === 'selection' && (
            <>
              <p className="map-help">
                {master
                  ? 'Use Selecionar para acessar ações. Marque vários tokens para movimentar ou duplicar.'
                  : 'Selecione um token para acessar suas ações.'}
              </p>
              <ul className="map-token-list">
                {tokens.map((t) => (
                  <li key={t.id}>
                    {master && (
                      <input
                        type="checkbox"
                        aria-label={'Incluir ' + t.nome + ' na seleção'}
                        checked={selection.includes(t.id)}
                        onChange={(e) => {
                          const ids = e.target.checked
                            ? [...selection, t.id].slice(-40)
                            : selection.filter((id) => id !== t.id);
                          setSelection(ids);
                          setSelected(ids.at(-1) || '');
                        }}
                      />
                    )}
                    <button
                      type="button"
                      className="text-button"
                      aria-label={'Selecionar token ' + t.nome}
                      onClick={() => {
                        setSelection([t.id]);
                        setSelected(t.id);
                        setDrawer('');
                        setTool('select');
                        requestAnimationFrame(() =>
                          svg.current
                            ?.querySelector<SVGGElement>(`[data-token-id="${t.id}"]`)
                            ?.focus(),
                        );
                      }}
                    >
                      {t.nome}
                      {t.oculto ? ' · Só mestres' : ''}
                    </button>
                  </li>
                ))}
              </ul>
              {master && selection.length > 1 && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setDrawer('');
                    setTool('select');
                    svg.current?.focus();
                  }}
                >
                  Usar seleção de {selection.length} tokens
                </button>
              )}
            </>
          )}
          {drawer === 'scenes' && (
            <>
              {sceneEditor && master ? (
                <SceneEditor
                  key={sceneEditor === 'new' ? 'new' : sceneEditor.id}
                  scene={sceneEditor === 'new' ? undefined : sceneEditor}
                  assets={map.assets}
                  disabled={map.locked}
                  operate={operate}
                  onClose={() => setSceneEditor(null)}
                />
              ) : (
                <>
                  {master && (
                    <button
                      type="button"
                      className="button secondary"
                      disabled={map.locked}
                      onClick={() => setSceneEditor('new')}
                    >
                      Nova cena
                    </button>
                  )}
                  <ul className="map-scenes">
                    {map.scenes.map((row) => (
                      <li key={row.id} className={row.id === scene?.id ? 'selected-scene' : ''}>
                        <button
                          type="button"
                          className="map-scene-select"
                          disabled={map.locked || !master}
                          onClick={() => {
                            map.chooseScene(row.id);
                            setDrawer('');
                          }}
                        >
                          <span>{row.nome}</span>
                          <small>
                            {row.ativa
                              ? 'Exibida na mesa'
                              : row.publicada
                                ? 'Disponível'
                                : 'Só mestres'}{' '}
                            · {row.largura} × {row.altura}
                          </small>
                        </button>
                        {master && (
                          <div className="map-scene-actions">
                            <button
                              type="button"
                              className="text-button"
                              disabled={map.locked}
                              aria-label={'Editar cena ' + row.nome}
                              onClick={() => setSceneEditor(row)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="text-button"
                              disabled={map.locked}
                              aria-label={'Excluir cena ' + row.nome}
                              onClick={async () => {
                                if (
                                  !window.confirm('Excluir a cena ' + row.nome + ' e seus tokens?')
                                )
                                  return;
                                await operate({
                                  tipo: 'cena_excluir',
                                  id: row.id,
                                  versao: row.versao,
                                });
                              }}
                            >
                              Excluir
                            </button>
                            <button
                              type="button"
                              className="text-button"
                              disabled={map.locked || row.ativa}
                              aria-label={'Exibir cena ' + row.nome}
                              onClick={() =>
                                void operate({
                                  tipo: 'cena_ativar',
                                  id: row.id,
                                  versao: row.versao,
                                })
                              }
                            >
                              Exibir na mesa
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                  {scene && master && (
                    <div className="map-scene-options">
                      <h3>Exploração</h3>
                      <label className="map-check">
                        <input
                          type="checkbox"
                          checked={scene.nevoa}
                          disabled={map.locked}
                          onChange={(event) =>
                            void operate({
                              tipo: 'cena_atualizar',
                              id: scene.id,
                              versao: scene.versao,
                              patch: { nevoa: event.target.checked },
                            })
                          }
                        />
                        Cobrir áreas não reveladas
                      </label>
                      <div className="map-inline-actions">
                        <button
                          type="button"
                          className="text-button"
                          disabled={map.locked || !scene.revelacoes.length}
                          onClick={() =>
                            void operate({
                              tipo: 'cena_atualizar',
                              id: scene.id,
                              versao: scene.versao,
                              patch: { revelacoes: [] },
                            })
                          }
                        >
                          Cobrir novamente
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          disabled={map.locked || !scene.desenhos?.length}
                          onClick={() =>
                            void operate({
                              tipo: 'cena_atualizar',
                              id: scene.id,
                              versao: scene.versao,
                              patch: { desenhos: [] },
                            })
                          }
                        >
                          Limpar desenhos
                        </button>
                      </div>
                      <p className="map-help">
                        Use Revelar área para abrir a neblina. Tokens ocultos ficam disponíveis
                        apenas aos mestres.
                      </p>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          {drawer === 'assets' && (
            <AssetLibrary
              campaignId={campaignId}
              master={master}
              assets={map.assets}
              urls={urls}
              disabled={map.locked || spectator}
              repository={map.repository}
              refresh={map.refresh}
              onError={map.setError}
              onBusy={setFileBusy}
            />
          )}
          {drawer === 'token' && master && scene && tokenEditor && (
            <>
              <TokenEditor
                key={tokenEditor === 'new' ? 'new' : tokenEditor.id}
                token={tokenEditor === 'new' ? undefined : tokenEditor}
                scene={scene}
                records={records}
                members={map.members}
                combatants={mesa?.estado.combate.participantes || []}
                origin={tokenOrigin}
                assets={map.assets}
                disabled={map.locked}
                operate={operate}
                onClose={() => {
                  setDrawer('');
                  setTokenEditor(null);
                }}
              />
              {tokenEditor !== 'new' && (
                <div className="map-delete">
                  {deleteConfirm ? (
                    <>
                      <p>Remover {tokenEditor.nome} do mapa?</p>
                      <button
                        type="button"
                        className="button danger"
                        disabled={map.locked}
                        onClick={async () => {
                          if (
                            await operate({
                              tipo: 'token_excluir',
                              id: tokenEditor.id,
                              versao: tokenEditor.versao,
                            })
                          ) {
                            setDrawer('');
                            setTokenEditor(null);
                            setSelected('');
                            setDeleteConfirm(false);
                          }
                        }}
                      >
                        Confirmar exclusão
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        disabled={map.locked}
                        onClick={() => setDeleteConfirm(false)}
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="text-button"
                      disabled={map.locked}
                      onClick={() => setDeleteConfirm(true)}
                    >
                      Excluir token
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </aside>
      )}

      {images.failed && !map.error && (
        <div className="map-notice" role="alert">
          <p>Algumas imagens não puderam ser carregadas.</p>
          <button type="button" className="text-button" onClick={images.retry}>
            Recarregar imagens
          </button>
        </div>
      )}
      {session.error && (
        <div className="map-notice context-notice" role="alert">
          <p>{session.error}</p>
          {session.attempt && !session.pending ? (
            <div>
              <button
                type="button"
                className="button secondary"
                disabled={session.denied}
                onClick={async () => {
                  if (await session.operate()) await map.refresh();
                }}
              >
                Reenviar ação do token
              </button>
              <button type="button" className="text-button" onClick={session.release}>
                Liberar ação do token
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                session.clearError();
                void session.refresh();
              }}
            >
              Atualizar ações do token
            </button>
          )}
        </div>
      )}
      {map.error && (
        <div className="map-notice" role="alert">
          <p>{map.error}</p>
          {map.attempt ? (
            <div>
              <button
                type="button"
                className="button secondary"
                disabled={map.pending}
                onClick={() => void operate()}
              >
                Reenviar alteração
              </button>
              <button
                type="button"
                className="text-button"
                disabled={map.pending}
                onClick={() => {
                  history.clear();
                  map.release();
                }}
              >
                Liberar nova alteração
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                map.setError('');
                void map.refresh();
              }}
            >
              Atualizar mapa
            </button>
          )}
        </div>
      )}
    </section>
  );
}
export default Tabletop;
