import type { AreaRecord, SceneRecord, TokenRecord } from '../../../../packages/contracts/tabletop';
export function AreaTools({
  scene,
  areas,
  tokens,
  draft,
  userId,
  master,
  disabled,
  onDraft,
  onPosition,
  onSave,
  onDelete,
}: {
  scene: SceneRecord;
  areas: AreaRecord[];
  tokens: TokenRecord[];
  draft: AreaRecord;
  userId: string;
  master: boolean;
  disabled: boolean;
  onDraft: (draft: AreaRecord) => void;
  onPosition: () => void;
  onSave: () => void;
  onDelete: (area: AreaRecord) => void;
}) {
  const update = (patch: Partial<AreaRecord>) => onDraft({ ...draft, ...patch });
  const canEdit = (area: AreaRecord) =>
    master ||
    area.usuario_id === userId ||
    (!!area.token_id && tokens.some((t) => t.id === area.token_id));
  return (
    <>
      <form
        className="map-area-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <fieldset disabled={disabled}>
          <label>
            Nome da área
            <input
              value={draft.nome}
              maxLength={80}
              required
              onChange={(e) => update({ nome: e.target.value })}
            />
          </label>
          <div className="map-form-grid">
            <label>
              Forma da área
              <select
                value={draft.forma}
                onChange={(e) => update({ forma: e.target.value as AreaRecord['forma'] })}
              >
                <option value="circulo">Círculo</option>
                <option value="cone">Cone</option>
                <option value="quadrado">Quadrado</option>
                <option value="linha">Linha</option>
              </select>
            </label>
            <label>
              Tamanho da área (pés)
              <input
                type="number"
                min={scene.unidade * 0.25}
                max={scene.unidade * 100}
                step="any"
                value={Number((draft.tamanho * scene.unidade).toFixed(2))}
                onChange={(e) => update({ tamanho: Number(e.target.value) / scene.unidade })}
              />
            </label>
          </div>
          <p className="map-help">
            {draft.forma === 'circulo'
              ? 'Tamanho = raio.'
              : draft.forma === 'quadrado'
                ? 'Tamanho = lado do quadrado.'
                : 'Tamanho = comprimento.'}{' '}
            Arraste no mapa para definir a direção.
          </p>
          <div className="map-form-grid">
            <label>
              Direção da área (graus)
              <input
                type="number"
                min="-360"
                max="360"
                value={draft.angulo}
                onChange={(e) => update({ angulo: Number(e.target.value) })}
              />
            </label>
            <label>
              Cor da área
              <input
                type="color"
                value={draft.cor}
                onChange={(e) => update({ cor: e.target.value })}
              />
            </label>
            {draft.forma === 'linha' && (
              <label>
                Largura da linha (pés)
                <input
                  type="number"
                  min={scene.unidade * 0.1}
                  max={scene.unidade * 20}
                  step="any"
                  value={draft.largura * scene.unidade}
                  onChange={(e) => update({ largura: Number(e.target.value) / scene.unidade })}
                />
              </label>
            )}
            <label>
              Posição X (células)
              <input
                type="number"
                min="0"
                max={scene.largura}
                step="any"
                value={draft.x}
                onChange={(e) => update({ x: Number(e.target.value) })}
              />
            </label>
            <label>
              Posição Y (células)
              <input
                type="number"
                min="0"
                max={scene.altura}
                step="any"
                value={draft.y}
                onChange={(e) => update({ y: Number(e.target.value) })}
              />
            </label>
          </div>
          <label>
            Vincular ao token
            <select
              value={draft.token_id || ''}
              onChange={(e) => update({ token_id: e.target.value || null })}
            >
              <option value="">Sem vínculo</option>
              {tokens.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                  {t.oculto ? ' · Só mestres' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="map-inline-actions">
            <button type="button" className="button secondary" onClick={onPosition}>
              Posicionar no mapa
            </button>
            <button type="submit" className="button">
              {draft.id === 'preview' ? 'Criar área' : 'Salvar área'}
            </button>
          </div>
        </fieldset>
      </form>
      {areas.length > 0 && (
        <div className="map-area-list">
          <h3>Áreas nesta cena</h3>
          <ul>
            {areas.map((a) => (
              <li key={a.id}>
                <span style={{ borderColor: a.cor }}>{a.nome}</span>
                {canEdit(a) && (
                  <>
                    <button
                      type="button"
                      className="text-button"
                      disabled={disabled}
                      aria-label={'Ajustar área ' + a.nome}
                      onClick={() => onDraft(a)}
                    >
                      Ajustar
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      disabled={disabled}
                      aria-label={'Remover área ' + a.nome}
                      onClick={() => onDelete(a)}
                    >
                      Remover
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
