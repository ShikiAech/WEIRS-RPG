import { createSnapshotRepository } from '../../../packages/compendium/snapshot';
import { CompendiumError } from '../../../packages/compendium/errors';
import { asset } from './paths';
export { createSnapshotRepository } from '../../../packages/compendium/snapshot';
export const demoCompendium = createSnapshotRepository(async () => {
  const response = await fetch(asset('compendium/demo.json'));
  if (!response.ok) throw new CompendiumError('UNAVAILABLE');
  return response.json();
});
