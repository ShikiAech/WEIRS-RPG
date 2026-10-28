import type { ReactNode } from 'react';
import type {
  AreaRecord,
  LayerRecord,
  PlacedObject,
  TokenRecord,
  SceneRecord,
} from '../../../../packages/contracts/tabletop';
import { CELL } from './geometry';
import { SpellAreas } from './SpellAreas';
export function anchoredArea(
  area: AreaRecord,
  tokens: TokenRecord[],
  scene: Pick<SceneRecord, 'largura' | 'altura'>,
): AreaRecord {
  const token = tokens.find((t) => t.id === area.token_id);
  if (!token || area.ancora_dx == null || area.ancora_dy == null) return area;
  const delta = area.acompanhar_rotacao
    ? ((token.rotacao - (area.ancora_rotacao || 0)) * Math.PI) / 180
    : 0;
  return {
    ...area,
    x: Math.max(
      0,
      Math.min(
        scene.largura,
        token.x + area.ancora_dx * Math.cos(delta) - area.ancora_dy * Math.sin(delta),
      ),
    ),
    y: Math.max(
      0,
      Math.min(
        scene.altura,
        token.y + area.ancora_dx * Math.sin(delta) + area.ancora_dy * Math.cos(delta),
      ),
    ),
    angulo:
      area.acompanhar_rotacao && area.ancora_angulo != null
        ? (((area.ancora_angulo + token.rotacao - (area.ancora_rotacao || 0)) % 360) + 360) % 360
        : area.angulo,
  };
}
export function SceneEntities({
  scene,
  layers,
  tokenElements,
  objects,
  areas,
  preview,
  tokens,
  urls,
  zoom,
  clip,
}: {
  scene: Pick<SceneRecord, 'largura' | 'altura'>;
  layers: LayerRecord[];
  tokenElements: { token: TokenRecord; node: ReactNode }[];
  objects: PlacedObject[];
  areas: AreaRecord[];
  preview: AreaRecord | null;
  tokens: TokenRecord[];
  urls: Record<string, string>;
  zoom: number;
  clip?: string;
}) {
  const order = (layer?: string) => layers.find((l) => l.id === layer)?.ordem ?? 1;
  const entities = [
    ...tokenElements.map(({ token, node }) => ({ id: token.id, layer: token.camada_id, node })),
    ...objects.map((o) => ({
      id: o.id,
      layer: o.camada_id,
      node: (
        <g aria-label={o.nome} clipPath={clip}>
          {o.imagem_id && urls[o.imagem_id] && (
            <image
              href={urls[o.imagem_id]}
              x={o.x * CELL}
              y={o.y * CELL}
              width={o.w * CELL}
              height={o.h * CELL}
            />
          )}
          {o.desenho && (
            <polyline
              points={o.desenho.pontos.map((p) => `${p.x * CELL},${p.y * CELL}`).join(' ')}
              fill="none"
              stroke={o.desenho.cor}
              strokeWidth={3}
            />
          )}
        </g>
      ),
    })),
    ...areas
      .filter((a) => a.id !== preview?.id)
      .map((a) => ({
        id: a.id,
        layer: a.camada_id,
        node: (
          <g clipPath={clip}>
            <SpellAreas areas={[anchoredArea(a, tokens, scene)]} zoom={zoom} />
          </g>
        ),
      })),
  ];
  return (
    <g className="map-scene-entities">
      {entities
        .sort((a, b) => order(a.layer) - order(b.layer))
        .map((e) => (
          <g key={e.id} data-layer-id={e.layer}>
            {e.node}
          </g>
        ))}
      {preview && <SpellAreas areas={[]} preview={preview} zoom={zoom} />}
    </g>
  );
}
