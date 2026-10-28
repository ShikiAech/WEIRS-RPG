import test from 'node:test';
import assert from 'node:assert/strict';
import { speciesControls } from '../apps/web/features/character-creation/species-controls';
import { fixture } from './fixtures/creation';
test('species controls deduplicate forms and sizes, canonicalize invalid dependent values and retain valid defaults', () => {
  const species = fixture().catalog.entries.find((e) => e.kind === 'especie')!;
  assert.equal(species.kind, 'especie');
  if (species.kind !== 'especie') return;
  species.data.sizes = [
    { form: 'natural', code: 'pequeno', default: true },
    { form: 'exotraje', code: 'medio', default: false },
    { form: 'exotraje', code: 'grande', default: false },
    { form: 'exotraje', code: 'grande', default: false },
  ];
  assert.deepEqual(speciesControls(species.data, 'invalid', 'huge'), {
    forms: ['natural', 'exotraje'],
    sizes: [species.data.sizes[0]],
    form: 'natural',
    size: 'pequeno',
  });
  const suit = speciesControls(species.data, 'exotraje', 'grande');
  assert.equal(suit.size, 'grande');
  assert.equal(suit.sizes.length, 2);
});
