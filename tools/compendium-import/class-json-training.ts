import type { CuratedContext } from './curated-context';
import { normalizeName, stableId } from './identity';

/** Basic JSON training that is not already covered by the named class curators. */
export function curateClassJsonTraining(ctx: CuratedContext) {
  const { catalog, raw, group, proficiency } = ctx;
  const existingToolKeys = new Set([
    'instrumentos',
    'ferramenta-instrumento',
    'ferramenta-artesao',
  ]);
  for (const owner of catalog.entries) {
    if (owner.kind !== 'classe') continue;
    const source = raw.get(owner.key);
    if (source?.payload.type !== 'class') continue;
    const input = source.payload.input;
    const rangedMartial = input.weapons.some((s) => /marciais/i.test(s) && /dist[âa]ncia/i.test(s));
    const firearms = input.weapons.some((s) => /armas? de fogo/i.test(s));
    if (rangedMartial) {
      // The generic category parser cannot express a ranged-only martial category.
      owner.data.proficiencies = owner.data.proficiencies.filter(
        (g) =>
          catalog.proficiencies.find((p) => p.id === g.proficiencyId)?.category !== 'arma-marcial',
      );
    }
    if (rangedMartial || firearms) {
      for (const weapon of catalog.entries) {
        if (weapon.kind !== 'equipamento' || weapon.data.weapon?.rangeType !== 'distancia')
          continue;
        const card = raw.get(weapon.key)?.payload;
        if (card?.type !== 'equipment') continue;
        const props = String(card.input.props ?? '');
        const firearm =
          /Munição[^;]*;\s*Bala/i.test(props) ||
          (card.category === 'arma:eterforja' && /Recarga/i.test(props));
        if (!(rangedMartial && weapon.data.category === 'arma-marcial') && !(firearms && firearm))
          continue;
        const trained = owner.data.proficiencies.some((g) => {
          const p = catalog.proficiencies.find((p) => p.id === g.proficiencyId);
          return (
            p?.equipment?.revisionId === weapon.ref.revisionId ||
            p?.category === weapon.data.category
          );
        });
        if (!trained)
          proficiency(
            owner,
            'arma-de-fogo:' + weapon.key,
            { type: 'equipamento', equipment: weapon.ref },
            'inicial',
          );
      }
    }
    if (
      catalog.choices.some(
        (g) => g.ownerRevisionId === owner.ref.revisionId && existingToolKeys.has(g.key),
      )
    )
      continue;
    for (const text of input.tools) {
      const countText = /escolha\s+(\d+|um|uma|dois|duas|três)\b/i.exec(text)?.[1];
      if (!countText) continue;
      const count =
        Number(countText) ||
        ({ um: 1, uma: 1, dois: 2, duas: 2, tres: 3 }[normalizeName(countText)] ?? 0);
      if (!count) continue;
      const allowed = (category: string) => {
        if (/jogos?/i.test(text)) return category === 'ferramenta:jogo';
        if (/artes[aã]o|instrumento/i.test(text))
          return (
            (/artes[aã]o/i.test(text) && category === 'ferramenta:artesao') ||
            (/instrumento/i.test(text) && category === 'ferramenta:instrumento')
          );
        return /qualquer/i.test(text) && category.startsWith('ferramenta:');
      };
      const tools = catalog.entries.filter((e) => {
        if (e.kind !== 'equipamento') return false;
        const card = raw.get(e.key)?.payload;
        return (
          card?.type === 'equipment' &&
          allowed(card.category) &&
          (e.data.variantOf || typeof card.input.variantes !== 'string')
        );
      });
      if (!tools.length) continue;
      const g = group(owner, 'ferramentas-json', 'Ferramentas da classe inicial', count, count, 1);
      g.acquisition = 'inicial';
      for (const tool of tools)
        g.options.push({
          id: stableId(g.id + ':' + tool.key),
          groupId: g.id,
          name: tool.name,
          type: 'proficiencia',
          targetRef: null,
          ability: null,
          proficiencyId: proficiency(
            owner,
            'ferramenta-json:' + tool.key,
            { type: 'equipamento', equipment: tool.ref },
            'inicial',
            false,
          ),
          value: null,
          quantity: 1,
        });
    }
  }
}
