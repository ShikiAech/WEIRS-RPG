import type { CuratedContext } from './curated-context';
import { stableId } from './identity';

/** Only explicit physical tool choices in the local starting-equipment sources. */
export function linkedEquipmentChoice(
  text: string,
): { categories: string[]; inherited: boolean } | null {
  const value = text.trim().replace(/\s+/g, ' ');
  if (/^Conjunto de Jogos \(mesmo escolhido acima\)$/i.test(value))
    return { categories: ['ferramenta:jogo'], inherited: true };
  if (/^Ferramentas de Artesão \(mesmas escolhidas acima\)$/i.test(value))
    return { categories: ['ferramenta:artesao'], inherited: true };
  if (/^Instrumento Musical \(mesmo escolhido acima\)$/i.test(value))
    return { categories: ['ferramenta:instrumento'], inherited: true };
  if (
    /^Ferramentas de Artesão ou Instrumento Musical escolhido para a proficiência acima$/i.test(
      value,
    )
  )
    return { categories: ['ferramenta:artesao', 'ferramenta:instrumento'], inherited: true };
  if (/^Um Instrumento Musical de sua escolha$/i.test(value))
    return { categories: ['ferramenta:instrumento'], inherited: false };
  return null;
}

/** Package-owned groups activate only when that package is selected, retaining its provenance. */
export function curateEquipmentChoices(ctx: CuratedContext) {
  const { catalog, group, raw } = ctx;
  for (const equipmentOption of catalog.equipmentOptions) {
    const owner = catalog.entries.find((e) => e.ref.revisionId === equipmentOption.ownerRevisionId);
    const pkg = catalog.entries.find(
      (e) => e.ref.revisionId === equipmentOption.packageRef.revisionId,
    );
    if (!owner || pkg?.kind !== 'pacote') continue;
    for (const text of pkg.data.notes.split(';')) {
      const choice = linkedEquipmentChoice(text);
      if (!choice) continue;
      const candidates = catalog.choices.filter(
        (g) =>
          g.ownerRevisionId === owner.ref.revisionId &&
          g.options.length > 0 &&
          g.options.every((o) => {
            const equipment = catalog.proficiencies.find(
              (p) => p.id === o.proficiencyId,
            )?.equipment;
            const entry = catalog.entries.find((e) => e.ref.revisionId === equipment?.revisionId);
            const source = entry && raw.get(entry.key)?.payload;
            return source?.type === 'equipment' && choice.categories.includes(source.category);
          }),
      );
      if (candidates.length !== 1) {
        catalog.issues.push({
          severity: 'error',
          code: 'UNRESOLVED_REFERENCE',
          path: owner.sourcePath,
          pointer: owner.pointer,
          revisionId: owner.ref.revisionId,
          message: 'Proficiência de equipamento vinculado não resolvida: ' + text.trim(),
        });
        continue;
      }
      const sourceGroup = candidates[0];
      const count = choice.inherited ? sourceGroup.minimum : 1;
      const g = group(pkg, sourceGroup.key, 'Equipamento: ' + text.trim(), count, count);
      g.acquisition = 'inicial';
      // Explicit options only: granting the object must never grant proficiency again.
      g.options = sourceGroup.options.map((option) => ({
        id: stableId(g.id + ':' + option.id),
        groupId: g.id,
        name: option.name,
        type: 'equipamento',
        targetRef: catalog.proficiencies.find((p) => p.id === option.proficiencyId)!.equipment!,
        proficiencyId: null,
        ability: null,
        value: null,
        quantity: 1,
      }));
    }
  }
}
