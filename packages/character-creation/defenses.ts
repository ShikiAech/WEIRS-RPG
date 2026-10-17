import type {
  CreationCatalog,
  CreationDraft,
  DefenseBreakdown,
} from '../contracts/character-creation';
import type { MovementDefinition } from '../contracts/compendium';
import { resolveState, type CreationState } from './state';
import { modifier } from './abilities';
import { evaluateFormula } from './formula';
export function resolveDefenses(
  catalog: CreationCatalog,
  draft: CreationDraft,
  state: CreationState = resolveState(catalog, draft),
): DefenseBreakdown {
  const result: DefenseBreakdown = {
    armorClass: 10,
    formula: '10 + DES',
    movements: [],
    problems: [],
  };
  const equipped = (draft.equippedRefs ?? [])
    .map((r) =>
      catalog.entries.find(
        (e) => e.ref.recordId === r.recordId && e.ref.revisionId === r.revisionId,
      ),
    )
    .filter((e) => e?.kind === 'equipamento');
  const armors = equipped.filter((e) => e.data.armor),
    shields = equipped.filter((e) => e.data.shield);
  if (armors.length > 1 || shields.length > 1)
    result.problems.push({
      code: 'EQUIPPED_CONFLICT',
      field: 'equippedRefs',
      message: 'Equipe no máximo uma armadura e um escudo.',
    });
  const dex = modifier(state.totals.des ?? 10),
    shield = shields[0]?.data.shield?.acBonus ?? 0,
    armor = armors[0]?.data.armor;
  const species = state.concessions.instances.find((i) => i.entry.kind === 'especie')?.entry,
    lineage = state.concessions.instances.find((i) => i.entry.kind === 'linhagem')?.entry;
  const formRule =
    species?.kind === 'especie'
      ? species.data.formRules?.find((r) => r.form === draft.form)
      : undefined;
  const formFeatures = state.concessions.instances.flatMap((i) =>
    i.entry.kind === 'caracteristica' &&
    i.entry.data.formEffects &&
    (!i.entry.data.formEffects.form || i.entry.data.formEffects.form === draft.form)
      ? [i.entry.data.formEffects]
      : [],
  );
  if (formRule && armors.length)
    result.problems.push({
      code: 'FORM_ARMOR',
      field: 'equippedRefs',
      message: 'Esta forma não permite vestir armaduras.',
    });
  const alternatives = [
    {
      value: armor
        ? armor.baseAc +
          (armor.addDexterity ? Math.min(dex, armor.dexterityLimit ?? Infinity) : 0) +
          shield
        : 10 + dex + shield,
      name: armor
        ? `${armors[0].name}${shield ? ' + escudo' : ''}`
        : `10 + DES${shield ? ' + escudo' : ''}`,
    },
  ];
  if (formRule)
    alternatives.splice(0, alternatives.length, {
      value: formRule.armorClass + (formRule.permitsShield ? shield : 0),
      name: `${species?.name} (${draft.form})${formRule.permitsShield && shield ? ' + escudo' : ''}`,
    });
  let bonus = formFeatures.reduce((n, f) => n + (f.armorClassBonus ?? 0), 0);
  for (const { effect, instance } of state.concessions.effects) {
    const value = evaluateFormula(effect.formula, {
      abilities: state.totals,
      level: state.level,
      classLevel: instance.level,
      proficiency: state.proficiency,
    });
    if (
      !formRule &&
      effect.type === 'ca_formula' &&
      (!effect.defenses.length ||
        effect.defenses.some((d) => (!d.unarmored || !armor) && (d.permitsShield || !shield)))
    )
      alternatives.push({
        value: value + shield,
        name: instance.entry.name + (shield ? ' + escudo' : ''),
      });
    if (effect.type === 'ca_bonus') bonus += value;
  }
  const chosen = alternatives.reduce((a, b) => (b.value > a.value ? b : a));
  result.armorClass = chosen.value + bonus;
  result.formula = chosen.name + (bonus ? ` + ${bonus}` : '');
  const movements: MovementDefinition[] = [];
  if (species?.kind === 'especie') movements.push(...species.data.movements);
  if (lineage?.kind === 'linhagem') movements.push(...lineage.data.movements);
  for (const feature of formFeatures) movements.push(...(feature.movements ?? []));
  for (const movement of movements.filter((m) => !m.form || m.form === draft.form)) {
    // Conditional modes remain visible as source text until their condition has a typed rule.
    if (movement.condition) continue;
    const feet = movement.unit === 'pes' ? movement.distance : (movement.distance * 10) / 3;
    const old = result.movements.find((m) => m.mode === movement.mode);
    if (!old) result.movements.push({ mode: movement.mode, feet, meters: feet * 0.3 });
    else if (feet > old.feet) {
      old.feet = feet;
      old.meters = feet * 0.3;
    }
  }
  return result;
}
