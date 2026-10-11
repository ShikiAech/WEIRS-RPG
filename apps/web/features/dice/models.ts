import { BufferGeometry, Float32BufferAttribute, Quaternion, Vector3 } from 'three';
import type { DieType } from './roll-plan';

type ModelMesh = {
  name: string;
  positions: number[];
  normals: number[];
  indices: number[];
  uvs: number[];
};
export type DiceModels = {
  meshes: ModelMesh[];
  colliderFaceMap: Record<DieType, Record<string, number>>;
};
const up = new Vector3(0, 1, 0);

// Arquivo Babylon (sistema de mão esquerda) -> Three.js (mão direita).
export function geometryFromModel(model: ModelMesh) {
  const geometry = new BufferGeometry();
  const reflect = (values: number[]) => values.map((v, i) => (i % 3 === 2 ? -v : v));
  geometry.setAttribute('position', new Float32BufferAttribute(reflect(model.positions), 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(reflect(model.normals), 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(model.uvs, 2));
  // O exportador Babylon já usa winding horário: refletir Z produz o CCW do Three.js.
  geometry.setIndex(model.indices);
  // As posições do catálogo são de exposição; cada malha já está centrada localmente.
  geometry.scale(10, 10, 10);
  return geometry;
}

export function resultNormal(models: DiceModels, type: DieType, value: number) {
  const model = models.meshes.find((m) => m.name === type + '_collider');
  const face = Object.entries(models.colliderFaceMap[type]).find(([, v]) => v === value);
  if (!model || !face) throw new Error('Face não disponível no modelo.');
  const indices = model.indices.slice(Number(face[0]) * 3, Number(face[0]) * 3 + 3);
  const points = indices.map(
    (i) =>
      new Vector3(model.positions[i * 3], model.positions[i * 3 + 1], -model.positions[i * 3 + 2]),
  );
  const normal = points[1]
    .clone()
    .sub(points[0])
    .cross(points[2].clone().sub(points[0]))
    .normalize();
  // Independe da ordem original dos vértices: aponta para fora do sólido.
  if (normal.dot(points[0]) < 0) normal.negate();
  return normal;
}

export function resultOrientation(models: DiceModels, type: DieType, value: number, yaw = 0) {
  // No tetraedro, o valor é lido na ponta: a face correspondente fica para baixo.
  const target = type === 'd4' ? up.clone().negate() : up;
  return new Quaternion()
    .setFromAxisAngle(up, yaw)
    .multiply(new Quaternion().setFromUnitVectors(resultNormal(models, type, value), target));
}
