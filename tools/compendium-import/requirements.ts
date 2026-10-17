import type {
  CompendiumRef,
  RequirementDefinition,
  ProficiencyDefinition,
} from '../../packages/contracts/compendium';
import type { ResolvedEntry } from './resolved';
import { normalizeName, stableId } from './identity';

interface RequirementNode {
  operator: RequirementDefinition['operator'];
  fields?: Partial<RequirementDefinition>;
  proficiency?: Omit<ProficiencyDefinition, 'id' | 'ownerRevisionId'>;
  children?: RequirementNode[];
}
export interface RequirementLookup {
  entries: ResolvedEntry[];
  find(kind: 'talento' | 'linhagem', name: string): ResolvedEntry | undefined;
  proficiency(key: string, data: Omit<ProficiencyDefinition, 'id' | 'ownerRevisionId'>): string;
}
/** Resolves explicit names only. No approximate translation/name matching. */
export function linkRequirements(
  parsed: { requirements: RequirementDefinition[]; unsupported: string[] },
  lookup: RequirementLookup,
) {
  const nodes = [...parsed.requirements],
    unresolved: string[] = [];
  const root = nodes.find((r) => r.parentId === null)!;
  const leaf = (
    operator: RequirementDefinition['operator'],
    targetRef: CompendiumRef,
    minimum: number | null = null,
  ): RequirementNode => ({ operator, fields: { targetRef, minimum } });
  const feature = (name: string): RequirementNode | null => {
    const names =
      normalizeName(name) === 'pacto-magico'
        ? ['magia-de-pacto', 'magia-de-pacto-da-alma-profana']
        : [normalizeName(name)];
    const matches = lookup.entries.filter(
      (e) => e.kind === 'caracteristica' && names.includes(normalizeName(e.name)),
    );
    return matches.length
      ? { operator: 'qualquer', children: matches.map((e) => leaf('caracteristica', e.ref)) }
      : null;
  };
  function parse(raw: string, inherited = ''): RequirementNode | null {
    const text = raw.replace(/^a\s+(?=Característica)/i, '').trim();
    const exclusive = /^Não Pode Ter Outro Talento (Selvagem|de Marca do Dragão)$/i.exec(text);
    if (exclusive) {
      const category = normalizeName(exclusive[1]) === 'selvagem' ? 'selvagem' : 'marca-dragao';
      return {
        operator: 'todos',
        children: lookup.entries
          .filter(
            (e) =>
              e.kind === 'talento' &&
              e.data.category === category &&
              e.ref.revisionId !== root.ownerRevisionId,
          )
          .map((e) => leaf('ausente', e.ref)),
      };
    }
    const path = /^(?:pelo menos )?dois Talentos do Caminho (do Lich|do Cavaleiro da Morte)$/i.exec(
      text,
    );
    if (path) {
      const initiate = 'Iniciado ' + path[1];
      const feats = lookup.entries.filter(
        (e) =>
          e.kind === 'talento' &&
          e.data.category === 'vilania' &&
          e.ref.revisionId !== root.ownerRevisionId &&
          (e.name === initiate || e.data.prerequisiteText.includes('Talento ' + initiate)),
      );
      const pairs = feats.flatMap((a, i) =>
        feats.slice(i + 1).map((b) => ({
          operator: 'todos' as const,
          children: [leaf('talento', a.ref), leaf('talento', b.ref)],
        })),
      );
      return pairs.length ? { operator: 'qualquer', children: pairs } : null;
    }
    if (/\s+ou\s+/i.test(text)) {
      const prefix = /^(Talento|Característica)\s+/i.exec(text)?.[1] ?? inherited;
      const parts = text.split(/\s+ou\s+/i).map((rawPart) => {
        const part = rawPart.replace(/^a\s+(?=Característica)/i, '');
        return parse(
          /^(Talento|Característica|Magia de Pacto|Proficiência|Treinamento)/i.test(part)
            ? part
            : prefix + ' ' + part,
        );
      });
      return parts.every(Boolean)
        ? { operator: 'qualquer', children: parts as RequirementNode[] }
        : null;
    }
    if (/^Humano Manchado$/i.test(text)) {
      const lineage = lookup.find('linhagem', 'Manchados');
      return lineage ? leaf('linhagem', lineage.ref) : null;
    }
    const training = /^(?:Treinamento com|Proficiência com)\s+(?:Armadura[s]?\s+)?(.+)$/i.exec(
      text,
    );
    if (training) {
      const name = normalizeName(training[1]);
      const category = name.includes('leve')
        ? 'armadura-leve'
        : name.includes('media')
          ? 'armadura-media'
          : name.includes('pesada')
            ? 'armadura-pesada'
            : name.includes('escudo')
              ? 'escudo'
              : name.includes('marcial')
                ? 'arma-marcial'
                : null;
      if (category)
        return { operator: 'proficiencia', proficiency: { type: 'categoria', category } };
    }
    if (/^Característica\s+/i.test(text) || /^Magia de Pacto$/i.test(text))
      return feature(text.replace(/^Característica\s+(?:de\s+)?/i, ''));
    const feat = /^Talento\s+(.+)$/i.exec(text);
    if (feat) {
      const repeated = /\s+repetido pelo menos uma vez$/i.test(feat[1]);
      const name = feat[1].replace(/\s+repetido pelo menos uma vez$/i, '');
      const parenthetical = /\(([^)]+)\)/.exec(name);
      const base = name.replace(/\s*\([^)]*\)/g, '').trim();
      const english = parenthetical ? lookup.find('talento', parenthetical[1]) : undefined;
      const target = english ?? lookup.find('talento', base);
      if (!target) return null;
      const requirement = leaf(
        repeated ? 'repeticoes' : 'talento',
        target.ref,
        repeated ? 2 : null,
      );
      if (parenthetical && !english)
        return {
          operator: 'todos',
          children: [
            requirement,
            {
              operator: 'escolha',
              fields: { targetRef: target.ref, choiceKey: normalizeName(parenthetical[1]) },
            },
          ],
        };
      return requirement;
    }
    return null;
  }
  function emit(node: RequirementNode, parentId: string) {
    const id = stableId(root.ownerRevisionId + ':linked-req:' + nodes.length);
    const proficiencyId = node.proficiency
      ? lookup.proficiency('requirement:' + id, node.proficiency)
      : null;
    nodes.push({
      id,
      ownerRevisionId: root.ownerRevisionId,
      parentId,
      operator: node.operator,
      ability: null,
      targetRef: null,
      minimum: null,
      choiceKey: null,
      proficiencyId,
      ...node.fields,
    });
    node.children?.forEach((child) => emit(child, id));
  }
  for (const text of parsed.unsupported) {
    const tree = parse(text);
    if (tree) emit(tree, root.id);
    else unresolved.push(text);
  }
  return { requirements: nodes, unsupported: unresolved };
}
