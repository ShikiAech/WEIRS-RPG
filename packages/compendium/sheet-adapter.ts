import type { CompendiumEntry } from '../contracts/compendium';
import type { SheetSpell } from '../contracts/sheets';
import { novaEntrada } from '../sheets/modelo.js';

export function spellToSheet(
  entry: CompendiumEntry<'magia'>,
  profileId: string,
  { characterLevel = 1 }: { characterLevel?: number } = {},
): SheetSpell {
  const d = entry.data;
  if (
    [
      d.castingTime,
      d.range,
      d.duration,
      entry.description,
      d.components.material,
      entry.source.title,
    ].some((s) => s.length > 10000)
  )
    throw new Error(
      'O registro excede os limites de uma magia na ficha. Revise o conteúdo no compêndio.',
    );
  const scale =
    d.damages.length === 1
      ? d.scales
          .filter((scale) => scale.basis === 'personagem' && scale.level <= characterLevel)
          .sort((a, b) => b.level - a.level)[0]
      : undefined;
  return {
    ...novaEntrada('magias'),
    nome: entry.name,
    compendioId: entry.legacyIds?.[0] ?? entry.ref.recordId,
    compendioRef: { ...entry.ref },
    circulo: d.circle,
    perfilId: profileId,
    tempo: d.castingTime,
    alcance: d.range,
    duracao: d.duration,
    concentracao: d.concentration,
    ritual: d.ritual,
    verbal: d.components.verbal,
    somatico: d.components.somatic,
    material: d.components.material,
    descricao: entry.description,
    observacoes: entry.source.title,
    danos: [...d.damages]
      .sort((a, b) => a.order - b.order)
      .map((damage) => ({
        id: crypto.randomUUID(),
        dado: scale?.dice ?? damage.dice,
        atributo: '',
        tipo: damage.damageType ?? '',
      })),
  };
}
