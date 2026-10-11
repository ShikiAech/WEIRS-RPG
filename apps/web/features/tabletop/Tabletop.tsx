import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { SceneRecord, TokenRecord } from '../../../../packages/contracts/tabletop';
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

type Tool = 'select' | 'pan' | 'ruler' | 'fog' | 'draw' | 'ping';
type Drag = {
  pointer: number;
  start: Point;
  kind: Tool;
  camera: Camera;
  token?: TokenRecord;
  offset?: Point;
  points?: Point[];
};
export function Tabletop({
  campaignId,
  userId,
  role,
  onOpenSheet,
}: {
  campaignId: string;
  userId: string;
  role: string;
  onOpenSheet?: (id: string) => void;
}) {
  const master = role === 'mestre',
    spectator = role === 'espectador';
  const map = useTabletop(campaignId, master, userId),
    { scene, tokens, records, mesa } = map;
  const [tool, setTool] = useState<Tool>('select'),
    [drawer, setDrawer] = useState<'scenes' | 'assets' | 'token' | ''>('');
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
  const svg = useRef<SVGSVGElement>(null),
    stage = useRef<HTMLDivElement>(null),
    drag = useRef<Drag | null>(null),
    cameraRef = useRef(camera);
  cameraRef.current = camera;
  const unique = useId().replace(/:/g, ''),
    selectedToken = tokens.find((token) => token.id === selected);
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
    setPreview(null);
    setRuler(null);
    setFogPreview(null);
    setDrawPreview([]);
    drag.current = null;
    if (scene) setCamera(fitCamera(size.width, size.height, scene.largura, scene.altura));
  }, [scene?.id, scene?.largura, scene?.altura, size.width, size.height]);
  useEffect(() => {
    if (selected && !tokens.some((token) => token.id === selected)) {
      setSelected('');
      setDeleteConfirm(false);
    }
  }, [tokens, selected]);
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
      kind = event.button !== 0 ? 'pan' : tool;
    if (kind === 'ping') {
      if (!spectator)
        void map.ping({
          x: Math.max(0, Math.min(scene.largura, p.x)),
          y: Math.max(0, Math.min(scene.altura, p.y)),
        });
      return;
    }
    if (kind === 'select') setSelected('');
    if ((kind === 'fog' || kind === 'draw') && (!master || map.locked)) return;
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
  }
  function beginToken(event: ReactPointerEvent<SVGGElement>, token: TokenRecord) {
    if (tool !== 'select' || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    setSelected(token.id);
    setDeleteConfirm(false);
    if (map.locked || !canMove(token)) return;
    svg.current!.setPointerCapture(event.pointerId);
    const p = world(event);
    drag.current = {
      pointer: event.pointerId,
      start: p,
      kind: 'select',
      camera: cameraRef.current,
      token,
      offset: { x: p.x - token.x, y: p.y - token.y },
    };
    setPreview({ x: token.x, y: token.y });
  }
  function move(event: ReactPointerEvent<SVGSVGElement>) {
    const action = drag.current;
    if (!action || action.pointer !== event.pointerId || !scene) return;
    const p = world(event);
    if (action.token) {
      setPreview(
        snapToken(
          { x: p.x - action.offset!.x, y: p.y - action.offset!.y },
          action.token.tamanho,
          scene.largura,
          scene.altura,
          scene.grade && !event.altKey,
        ),
      );
    } else if (action.kind === 'pan' || action.kind === 'select') {
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
        const p = world(event),
          position = snapToken(
            { x: p.x - action.offset!.x, y: p.y - action.offset!.y },
            action.token.tamanho,
            scene.largura,
            scene.altura,
            scene.grade && !event.altKey,
          );
        if (position.x !== action.token.x || position.y !== action.token.y)
          void map.operate({
            tipo: 'token_atualizar',
            id: action.token.id,
            versao: action.token.versao,
            patch: position,
          });
      } else if (action.kind === 'fog') {
        const rectangle = revealRectangle(action.start, world(event), scene.largura, scene.altura);
        void map.operate({
          tipo: 'cena_atualizar',
          id: scene.id,
          versao: scene.versao,
          patch: { revelacoes: [...scene.revelacoes, rectangle] },
        });
      } else if (action.kind === 'draw' && action.points!.length > 1) {
        void map.operate({
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
  const toggleDrawer = (next: 'scenes' | 'assets' | 'token') => {
    if (map.locked || fileBusy) return;
    setDrawer((previous) => (previous === next ? '' : next));
    setSceneEditor(null);
    setTokenEditor(null);
  };

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
                setRuler(null);
                setDrawer('');
                return;
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
              const position = snapToken(
                { x: selectedToken.x + delta.x, y: selectedToken.y + delta.y },
                selectedToken.tamanho,
                scene.largura,
                scene.altura,
                scene.grade,
              );
              if (position.x !== selectedToken.x || position.y !== selectedToken.y)
                void map.operate({
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
                  width={scene.largura * CELL}
                  height={scene.altura * CELL}
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
              {tokens.map((token) => {
                const position = selected === token.id && preview ? preview : token,
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
                    role="button"
                    tabIndex={0}
                    aria-label={'Token ' + token.nome}
                    aria-pressed={selected === token.id}
                    data-token-id={token.id}
                    className={
                      'map-token' +
                      (token.oculto ? ' hidden-token' : '') +
                      (selected === token.id ? ' selected-token' : '')
                    }
                    onPointerDown={(event) => beginToken(event, token)}
                    onFocus={() => {
                      setSelected(token.id);
                      setDeleteConfirm(false);
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (tool === 'select') {
                        setSelected(token.id);
                        setDeleteConfirm(false);
                      }
                    }}
                    onDoubleClick={() => {
                      if (canOpen(token)) onOpenSheet?.(token.ficha_id!);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelected(token.id);
                      }
                    }}
                  >
                    <title>
                      {token.nome}
                      {token.oculto ? ' · Somente mestres' : ''}
                      {token.bloqueado ? ' · Movimento bloqueado' : ''}
                      {vitals ? ` · PV ${vitals.current}/${vitals.max}` : ''}
                    </title>
                    {(selected === token.id || active) && (
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
                            dimension * 0.76 * Math.max(0, Math.min(1, vitals.current / vitals.max))
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
                    <text
                      x={center}
                      y={dimension + 12 / camera.zoom}
                      fontSize={11 / camera.zoom}
                      fill="#eee6d7"
                      textAnchor="middle"
                      stroke="#171719"
                      strokeWidth={3 / camera.zoom}
                      paintOrder="stroke"
                      className="token-name"
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
                    fontSize={11 / camera.zoom}
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
      </nav>

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
                    : selectedToken
                      ? `${selectedToken.nome}${selectedVitals ? ` · PV ${selectedVitals.current}/${selectedVitals.max}` : ''}${canMove(selectedToken) ? ' · Arraste ou use as setas' : ''}`
                      : `${scene.unidade} pés por célula · Arraste para mover · Scroll para zoom`}
        </div>
      )}

      {selectedToken && tool === 'select' && !drawer && (
        <div className="map-selection" aria-label="Token selecionado">
          <strong>{selectedToken.nome}</strong>
          {selectedToken.oculto && <span>Somente mestres</span>}
          {selectedVitals && (
            <span>
              PV {selectedVitals.current}/{selectedVitals.max}
            </span>
          )}
          {canOpen(selectedToken) && (
            <button
              type="button"
              className="text-button"
              onClick={() => onOpenSheet?.(selectedToken.ficha_id!)}
            >
              Ficha do token
            </button>
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
        </div>
      )}

      {drawer && (
        <aside
          className="map-drawer"
          aria-label={
            drawer === 'scenes'
              ? 'Cenas da campanha'
              : drawer === 'assets'
                ? 'Arquivos da campanha'
                : 'Configurar token'
          }
        >
          <div className="map-drawer-heading">
            <h2>
              {drawer === 'scenes' ? 'Cenas e mapas' : drawer === 'assets' ? 'Arquivos' : 'Token'}
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
              }}
            >
              ×
            </button>
          </div>
          {drawer === 'scenes' && (
            <>
              {sceneEditor && master ? (
                <SceneEditor
                  key={sceneEditor === 'new' ? 'new' : sceneEditor.id}
                  scene={sceneEditor === 'new' ? undefined : sceneEditor}
                  assets={map.assets}
                  disabled={map.locked}
                  operate={map.operate}
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
                                await map.operate({
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
                                void map.operate({
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
                            void map.operate({
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
                            void map.operate({
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
                            void map.operate({
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
                operate={map.operate}
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
                            await map.operate({
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
      {map.error && (
        <div className="map-notice" role="alert">
          <p>{map.error}</p>
          {map.attempt ? (
            <div>
              <button
                type="button"
                className="button secondary"
                disabled={map.pending}
                onClick={() => void map.operate()}
              >
                Reenviar alteração
              </button>
              <button
                type="button"
                className="text-button"
                disabled={map.pending}
                onClick={map.release}
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
