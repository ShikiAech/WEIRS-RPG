import type { StepProps } from './types';
import { abilities, modifier } from '../../../../packages/character-creation/abilities';
import { ATRIBUTOS } from '../../../../packages/sheets/modelo.js';
export function CreationSummary({
  draft,
  catalog,
  preview,
}: Pick<StepProps, 'draft' | 'catalog' | 'preview'>) {
  const name = (id: string | undefined) =>
    catalog.entries.find((e) => e.ref.revisionId === id)?.name;
  return (
    <aside className="creation-summary" aria-label="Resumo do personagem">
      <p className="eyebrow">Seu personagem</p>
      <h2>{name(draft.speciesRef?.revisionId) || 'Espécie a escolher'}</h2>
      <p>{name(draft.backgroundRef?.revisionId) || 'Antecedente a escolher'}</p>
      <p>
        {draft.classes
          .map((c) => `${name(c.classRef.revisionId) ?? 'Classe'} ${c.level}`)
          .join(' / ') || 'Classe a escolher'}
      </p>
      <dl className="creation-score-summary">
        {abilities.map((a) => (
          <div key={a}>
            <dt>{ATRIBUTOS[a]}</dt>
            <dd>
              {preview.abilities[a] ?? '—'}{' '}
              <small>
                ({preview.abilities[a] === undefined ? '—' : modifier(preview.abilities[a]!)})
              </small>
            </dd>
          </div>
        ))}
      </dl>
      <dl className="creation-metrics">
        <div>
          <dt>Pontos de vida</dt>
          <dd>{preview.hitPoints.total}</dd>
        </div>
        <div>
          <dt>CA</dt>
          <dd>{preview.defenses.armorClass}</dd>
        </div>
        <div>
          <dt>Proficiência</dt>
          <dd>+{preview.proficiencyBonus}</dd>
        </div>
      </dl>
      <p className="muted">{preview.problems.length} pendência(s) para revisar.</p>
    </aside>
  );
}
