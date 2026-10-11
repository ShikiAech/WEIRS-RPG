import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Vector3 } from 'three';
import { dicePlan } from '../apps/web/features/dice/roll-plan';
import {
  resultNormal,
  resultOrientation,
  geometryFromModel,
} from '../apps/web/features/dice/models';
import type { DiceModels } from '../apps/web/features/dice/models';
import type { DieType } from '../apps/web/features/dice/roll-plan';

test('anima dados confirmados, inclui descartados e decompõe percentuais sem sortear', () => {
  const plan = dicePlan({
    regras: 1,
    total: 999,
    termos: [
      { sinal: 1, faces: 20, dados: [3, 18], selecionados: [2], subtotal: 18 },
      { sinal: -1, faces: 100, dados: [1, 10, 99, 100], selecionados: [1, 2, 3, 4], subtotal: 210 },
      { sinal: 1, valor: 7, subtotal: 7 },
    ],
  });
  assert.deepEqual(
    plan.dice.map((d) => [d.type, d.value, d.kept]),
    [
      ['d20', 3, false],
      ['d20', 18, true],
      ['d100', 0, true],
      ['d10', 1, true],
      ['d100', 10, true],
      ['d10', 10, true],
      ['d100', 90, true],
      ['d10', 9, true],
      ['d100', 0, true],
      ['d10', 10, true],
    ],
  );
  assert.match(plan.groups[0], /3 \(descartado\), 18/);
  assert.equal(plan.omitted, 0);
});

test('limita a cena sem cortar pares percentuais e mantém homebrew no resumo', () => {
  const plan = dicePlan({
    regras: 1,
    termos: [
      { sinal: 1, faces: 6, dados: Array(19).fill(4), subtotal: 76 },
      { sinal: 1, faces: 100, dados: [100], subtotal: 100 },
      { sinal: 1, faces: 30, dados: [25], subtotal: 25 },
    ],
  });
  assert.equal(plan.dice.length, 19);
  assert.equal(plan.omitted, 1);
  assert.equal(plan.unsupported, 1);
  assert.match(plan.groups[2], /d30: 25/);
});

test('todas as faces dos modelos reais terminam orientadas para o resultado confirmado', async () => {
  const models: DiceModels = JSON.parse(
    await readFile(new URL('../public/dice/models.json', import.meta.url), 'utf8'),
  );
  for (const type of Object.keys(models.colliderFaceMap) as DieType[]) {
    for (const value of new Set(Object.values(models.colliderFaceMap[type]))) {
      const normal = resultNormal(models, type, value).applyQuaternion(
        resultOrientation(models, type, value, 0.3),
      );
      assert.ok(
        normal.distanceTo(new Vector3(0, type === 'd4' ? -1 : 1, 0)) < 1e-6,
        `${type}:${value}`,
      );
    }
    const model = models.meshes.find((m) => m.name === type)!;
    const geometry = geometryFromModel(model);
    // A conversão preserva a orientação entre triângulos e normais, evitando faces invisíveis.
    const pos = geometry.getAttribute('position');
    const norm = geometry.getAttribute('normal');
    const index = geometry.getIndex()!;
    for (let i = 0; i < index.count; i += 3) {
      const a = new Vector3().fromBufferAttribute(pos, index.getX(i));
      const b = new Vector3().fromBufferAttribute(pos, index.getX(i + 1));
      const c = new Vector3().fromBufferAttribute(pos, index.getX(i + 2));
      const cross = b.sub(a).cross(c.sub(a));
      assert.ok(cross.dot(new Vector3().fromBufferAttribute(norm, index.getX(i))) >= -1e-7, type);
    }
    geometry.dispose();
  }
});
