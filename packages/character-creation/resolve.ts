import type {
  CreationCatalog,
  CreationDraft,
  CreationPreview,
} from '../contracts/character-creation';
import { validarFicha } from '../sheets/modelo.js';
import { resolveState } from './state';
import { resolveHitPoints } from './hit-points';
import { resolveDefenses } from './defenses';
import { resolveSpellcasting } from './spellcasting';
import { projectSheet } from './project';
import { orderedCatalog } from './order';
import { resolveAbilities, orderedAbilityBonuses } from './abilities';
export function resolveCreation(catalog: CreationCatalog, draft: CreationDraft): CreationPreview {
  catalog = orderedCatalog(catalog);
  const state = resolveState(catalog, draft),
    hp = resolveHitPoints(catalog, draft, state),
    defenses = resolveDefenses(catalog, draft, state),
    spellcasting = resolveSpellcasting(catalog, draft, state);
  const problems = [
    ...state.problems,
    ...hp.problems,
    ...defenses.problems,
    ...spellcasting.problems,
  ];
  const supportedEffects = new Set([
    'atributo',
    'ca_formula',
    'ca_bonus',
    'pv_bonus',
    'pv_por_nivel',
    'resistencia',
    'imunidade',
    'vulnerabilidade',
    'recurso',
    'proficiencia',
    'iniciativa_bonus',
    'percepcao_bonus',
  ]);
  for (const { effect, instance } of state.concessions.effects)
    if (
      !supportedEffects.has(effect.type) ||
      (effect.type !== 'ca_formula' &&
        effect.type !== 'proficiencia' &&
        effect.stacking !== 'somar') ||
      (effect.condition && effect.type !== 'ca_formula')
    )
      problems.push({
        code: 'UNSUPPORTED_EFFECT',
        field: instance.id,
        message:
          'Um efeito desta origem precisa de uma regra tipada suportada antes da aplicação automática.',
        sourceRevisionId: effect.ownerRevisionId,
      });
  if (catalog.ruleSetId !== draft.ruleSetId || draft.engineVersion !== 1)
    problems.push({
      code: 'RULESET',
      field: 'ruleSetId',
      message: 'A versão das regras de criação não é compatível.',
    });
  const species = state.concessions.instances.find((i) => i.entry.kind === 'especie')?.entry;
  const lineage = state.concessions.instances.find((i) => i.entry.kind === 'linhagem')?.entry;
  if (species?.kind === 'especie' && species.data.lineageRequired && !draft.lineageRef)
    problems.push({
      code: 'LINEAGE_REQUIRED',
      field: 'lineageRef',
      message: 'Escolha uma linhagem para esta espécie.',
    });
  const ownedEquipment = new Set(
    state.concessions.instances.flatMap((i) =>
      i.entry.kind === 'equipamento'
        ? [i.entry.ref.revisionId]
        : i.entry.kind === 'pacote'
          ? i.entry.data.items.flatMap((item) =>
              item.equipmentRef ? [item.equipmentRef.revisionId] : [],
            )
          : [],
    ),
  );
  if (draft.equippedRefs?.some((r) => !ownedEquipment.has(r.revisionId)))
    problems.push({
      code: 'EQUIPMENT_NOT_OWNED',
      field: 'equippedRefs',
      message: 'Só é possível equipar os itens recebidos nesta criação.',
    });
  const sizes = [
    ...(species?.kind === 'especie' ? species.data.sizes : []),
    ...(lineage?.kind === 'linhagem' ? lineage.data.sizes : []),
  ].filter((s) => !s.form || s.form === draft.form);
  if (!sizes.some((s) => s.code === draft.size))
    problems.push({
      code: 'SIZE_REQUIRED',
      field: 'size',
      message: 'Escolha um tamanho disponível para a espécie e forma.',
    });
  if (draft.classes.length > 1)
    for (const cls of draft.classes) {
      const e = catalog.entries.find((e) => e.ref.revisionId === cls.classRef.revisionId);
      if (e?.kind !== 'classe') continue;
      const initial = draft.levels[0]?.classEntryId;
      const acquiredAt =
        (cls.id === initial
          ? draft.levels.find((l) => l.classEntryId !== initial)
          : draft.levels.find((l) => l.classEntryId === cls.id)
        )?.totalLevel ?? 1;
      const acquisitionScores = { ...resolveAbilities(catalog, draft).totals };
      for (const bonus of orderedAbilityBonuses(state.concessions.abilityBonuses).filter(
        (b) => b.instance.acquiredAt < acquiredAt,
      ))
        if (acquisitionScores[bonus.ability] !== undefined)
          acquisitionScores[bonus.ability] = Math.min(
            bonus.limit,
            acquisitionScores[bonus.ability]! + bonus.amount,
          );
      const required = e.data.multiclassAbilities,
        groups = new Set(
          required.filter((r) => r.alternativeGroup > 0).map((r) => r.alternativeGroup),
        );
      if (
        required.some(
          (r) => r.alternativeGroup === 0 && (acquisitionScores[r.ability] ?? 0) < r.minimum,
        ) ||
        [...groups].some(
          (g) =>
            !required
              .filter((r) => r.alternativeGroup === g)
              .some((r) => (acquisitionScores[r.ability] ?? 0) >= r.minimum),
        )
      )
        problems.push({
          code: 'MULTICLASS_REQUIREMENT',
          field: `classes.${cls.id}`,
          message: `Os atributos não atendem aos requisitos de multiclasse de ${e.name}.`,
        });
    }
  let sheet: CreationPreview['sheet'] = null;
  try {
    const candidate = projectSheet(catalog, draft, state, hp, defenses, spellcasting);
    const errors = validarFicha({ nome: 'Prévia', versao_esquema: 1, conteudo: candidate });
    for (const error of errors)
      problems.push({ code: 'SHEET_LIMIT', field: error.campo, message: error.mensagem });
    if (!problems.length) sheet = candidate;
  } catch {
    problems.push({
      code: 'SHEET_LIMIT',
      field: 'sheet',
      message:
        'Uma descrição ou valor do compêndio excede os limites da ficha. Revise o registro antes de criar.',
    });
  }
  return {
    problems,
    baseAbilities: state.base,
    abilities: state.totals,
    proficiencyBonus: state.proficiency,
    hitPoints: hp,
    defenses,
    spellcasting,
    contributions: state.concessions.contributions,
    sheet,
  };
}
