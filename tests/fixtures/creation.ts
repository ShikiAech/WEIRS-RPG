import type { CreationCatalog, CreationDraft } from '../../packages/contracts/character-creation';
import type {
  CompendiumEntry,
  CompendiumKind,
  CompendiumPayloadMap,
  GrantDefinition,
} from '../../packages/contracts/compendium';
export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export function entry<K extends CompendiumKind>(
  n: number,
  kind: K,
  data: CompendiumPayloadMap[K],
  name: string = kind,
): CompendiumEntry<K> {
  return {
    ref: { recordId: id(n), revisionId: id(n + 1000) },
    kind,
    name,
    originalName: name,
    slug: name,
    sourceId: id(900),
    sourceTitle: 'Teste',
    ruleSetId: 'dnd-5e-2024',
    revision: 1,
    reviewed2024: true,
    automation: 'completa',
    origin: 'homebrew',
    description: name,
    descriptionHtml: '',
    aliases: [],
    source: {
      id: id(900),
      title: 'Teste',
      edition: '2024',
      language: 'pt-BR',
      origin: 'homebrew',
      author: '',
      referenceUrl: '',
      attribution: '',
      path: '',
      commit: '',
      hash: '',
    },
    data,
  } as CompendiumEntry<K>;
}
export const classData = (die: 6 | 8 | 10 | 12 = 8) => ({
  hitDie: die,
  fixedHitPoints: die / 2 + 1,
  primaryAbilities: ['for' as const],
  multiclassAbilities: [],
  levels: Array.from({ length: 20 }, (_, i) => ({ level: i + 1 })),
  proficiencies: [],
});
export function fixture() {
  const species = entry(1, 'especie', {
    creatureType: 'humanoide',
    defaultSize: 'medio',
    sizes: [{ code: 'medio', form: '', default: true }],
    age: '',
    movements: [
      {
        id: id(50),
        mode: 'terrestre',
        distance: 30,
        unit: 'pes',
        form: '',
        condition: '',
        hover: false,
      },
    ],
    senses: [],
  });
  const background = entry(2, 'antecedente', {
    abilities: ['for', 'des', 'con'],
    distribution: '2-1-ou-1-1-1',
    abilityLimit: 20,
  });
  const cls = entry(3, 'classe', classData());
  const catalog: CreationCatalog = {
    ruleSetId: 'dnd-5e-2024',
    entries: [species, background, cls],
    requirements: [],
    choices: [],
    grants: [],
    effects: [],
    proficiencies: [],
    castingProfiles: [],
    equipmentOptions: [],
    multiclassSlots: [],
  };
  const draft: CreationDraft = {
    id: id(100),
    engineVersion: 1,
    ruleSetId: 'dnd-5e-2024',
    abilities: {
      mode: 'external',
      sets: [],
      selectedSet: null,
      assignment: {},
      external: { for: 10, des: 10, con: 10, int: 10, sab: 10, car: 10 },
      backgroundBonuses: { for: 2, con: 1 },
    },
    speciesRef: species.ref,
    lineageRef: null,
    backgroundRef: background.ref,
    size: 'medio',
    form: '',
    classes: [{ id: id(101), classRef: cls.ref, subclassRef: null, level: 1 }],
    levels: [{ totalLevel: 1, classEntryId: id(101), hitPointMethod: 'fixed', hitPointRoll: null }],
    choices: [],
    equipmentOptions: [],
    spellSelections: [],
    castingAbilities: [],
  };
  return { catalog, draft, species, background, cls };
}
export function grant(
  n: number,
  owner: CompendiumEntry,
  target: CompendiumEntry,
  level = 1,
): GrantDefinition {
  return {
    id: id(n),
    ownerRevisionId: owner.ref.revisionId,
    key: `grant-${n}`,
    kind: target.kind,
    targetRef: target.ref,
    groupId: null,
    requirementId: null,
    level,
    acquisition: 'ambas',
    quantity: 1,
  };
}
