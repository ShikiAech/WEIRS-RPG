import type { SpeciesDefinition } from '../../../../packages/contracts/compendium';
export function speciesControls(species: SpeciesDefinition, form: string, size: string | null) {
  const forms = [...new Set(species.sizes.map((s) => s.form))];
  const fallback = species.sizes.find((s) => s.default) ?? species.sizes[0];
  const selectedForm = forms.includes(form) ? form : (fallback?.form ?? '');
  const sizes = [
    ...new Map(
      species.sizes.filter((s) => s.form === selectedForm).map((s) => [s.code, s]),
    ).values(),
  ];
  const selectedSize = sizes.some((s) => s.code === size)
    ? size
    : ((sizes.find((s) => s.default) ?? sizes[0])?.code ?? null);
  return { forms, sizes, form: selectedForm, size: selectedSize };
}
