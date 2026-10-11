import { useEffect, useLayoutEffect, useState } from 'react';
import type {
  AssetRecord,
  MapCommand,
  SceneRecord,
  TokenRecord,
} from '../../../../packages/contracts/tabletop';
import type { SheetRecord } from '../../../../packages/contracts/sheets';
import type { Combatant } from '../../../../packages/contracts/session';

type Common = {
  disabled: boolean;
  operate: (command: MapCommand) => Promise<boolean>;
  onClose: () => void;
  assets: AssetRecord[];
};
export function SceneEditor({
  scene,
  disabled,
  operate,
  onClose,
  assets,
}: Common & { scene?: SceneRecord }) {
  const [name, setName] = useState(scene?.nome || ''),
    [width, setWidth] = useState(scene?.largura || 24),
    [height, setHeight] = useState(scene?.altura || 18);
  const [unit, setUnit] = useState(scene?.unidade || 5),
    [grid, setGrid] = useState(scene?.grade ?? true),
    [published, setPublished] = useState(scene?.publicada ?? true),
    [background, setBackground] = useState(scene?.fundo_id || '');
  return (
    <form
      className="map-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        const patch = {
          nome: name.trim(),
          largura: width,
          altura: height,
          unidade: unit,
          grade: grid,
          publicada: published,
          fundo_id: background || null,
        };
        if (
          await operate(
            scene
              ? { tipo: 'cena_atualizar', id: scene.id, versao: scene.versao, patch }
              : { tipo: 'cena_criar', ...patch },
          )
        )
          onClose();
      }}
    >
      <div className="map-drawer-heading">
        <h3>{scene ? 'Editar cena' : 'Nova cena'}</h3>
        <button type="button" className="text-button" disabled={disabled} onClick={onClose}>
          Cancelar
        </button>
      </div>
      <fieldset disabled={disabled}>
        <label>
          Nome da cena
          <input
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ruínas ao anoitecer"
            autoFocus
          />
        </label>
        <div className="map-field-pair">
          <label>
            Largura em células
            <input
              required
              type="number"
              min="4"
              max="100"
              value={width}
              onChange={(event) => setWidth(Number(event.target.value))}
            />
          </label>
          <label>
            Altura em células
            <input
              required
              type="number"
              min="4"
              max="100"
              value={height}
              onChange={(event) => setHeight(Number(event.target.value))}
            />
          </label>
        </div>
        <label>
          Distância por célula
          <input
            required
            type="number"
            min="1"
            max="100"
            value={unit}
            onChange={(event) => setUnit(Number(event.target.value))}
          />
        </label>
        <label>
          Imagem de fundo
          <select value={background} onChange={(event) => setBackground(event.target.value)}>
            <option value="">Sem imagem</option>
            {assets
              .filter(
                (asset) =>
                  asset.estado === 'pronto' &&
                  asset.mime.startsWith('image/') &&
                  (!published || asset.visibilidade === 'campanha'),
              )
              .map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.nome}
                </option>
              ))}
          </select>
        </label>
        <label className="map-check">
          <input
            type="checkbox"
            checked={grid}
            onChange={(event) => setGrid(event.target.checked)}
          />
          Mostrar grade
        </label>
        <label className="map-check">
          <input
            type="checkbox"
            checked={published}
            onChange={(event) => {
              setPublished(event.target.checked);
              if (
                event.target.checked &&
                assets.find((asset) => asset.id === background)?.visibilidade === 'mestre'
              )
                setBackground('');
            }}
          />
          Disponível aos jogadores
        </label>
        <button type="submit" className="button">
          {scene ? 'Salvar cena' : 'Criar cena'}
        </button>
      </fieldset>
      <p className="map-help">
        O fundo ocupa toda a cena. Ajuste o número de células para alinhar a grade da imagem.
      </p>
    </form>
  );
}

export function TokenEditor({
  token,
  scene,
  records,
  members,
  combatants,
  origin,
  disabled,
  operate,
  onClose,
  assets,
}: Common & {
  token?: TokenRecord;
  scene: SceneRecord;
  records: SheetRecord[];
  members: { id: string; nome: string }[];
  combatants: Combatant[];
  origin: { x: number; y: number };
}) {
  const [name, setName] = useState(token?.nome || ''),
    [size, setSize] = useState(token?.tamanho || 1),
    [color, setColor] = useState(token?.cor || '#b89a55');
  const [sheet, setSheet] = useState(token?.ficha_id || ''),
    [controller, setController] = useState(token?.controlador_id || ''),
    [image, setImage] = useState(token?.imagem_id || ''),
    [combat, setCombat] = useState(token?.combate_id || '');
  const [hidden, setHidden] = useState(token?.oculto || false),
    [locked, setLocked] = useState(token?.bloqueado || false),
    [rotation, setRotation] = useState(token?.rotacao || 0);
  return (
    <form
      className="map-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        const patch = {
          nome: name.trim(),
          tamanho: size,
          cor: color,
          ficha_id: sheet || null,
          controlador_id: controller || null,
          imagem_id: image || null,
          combate_id: combat || null,
          oculto: hidden,
          bloqueado: locked,
          rotacao: rotation,
          ...(token
            ? {
                x: Math.min(token.x, scene.largura - size),
                y: Math.min(token.y, scene.altura - size),
              }
            : {}),
        };
        const command: MapCommand = token
          ? { tipo: 'token_atualizar', id: token.id, versao: token.versao, patch }
          : {
              tipo: 'token_criar',
              cena_id: scene.id,
              x: Math.min(origin.x, scene.largura - size),
              y: Math.min(origin.y, scene.altura - size),
              ...patch,
            };
        if (await operate(command)) onClose();
      }}
    >
      <div className="map-drawer-heading">
        <h3>{token ? 'Editar token' : 'Novo token'}</h3>
        <button type="button" className="text-button" disabled={disabled} onClick={onClose}>
          Cancelar
        </button>
      </div>
      <fieldset disabled={disabled}>
        <label>
          Nome do token
          <input
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </label>
        <label>
          Ficha vinculada
          <select
            value={sheet}
            onChange={(event) => {
              setSheet(event.target.value);
              const row = records.find((record) => record.id === event.target.value);
              if (row) {
                setName(row.nome);
                setController(row.proprietario_id);
              }
            }}
          >
            <option value="">Sem ficha</option>
            {records.map((record) => (
              <option key={record.id} value={record.id}>
                {record.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Controlado por
          <select value={controller} onChange={(event) => setController(event.target.value)}>
            <option value="">Somente mestres</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Participante do combate
          <select value={combat} onChange={(event) => setCombat(event.target.value)}>
            <option value="">Sem vínculo</option>
            {combatants
              .filter((participant) => !participant.ficha_id)
              .map((participant) => (
                <option key={participant.id} value={participant.id}>
                  {participant.nome}
                </option>
              ))}
          </select>
        </label>
        <label>
          Retrato do token
          <select value={image} onChange={(event) => setImage(event.target.value)}>
            <option value="">Iniciais do nome</option>
            {assets
              .filter(
                (asset) =>
                  asset.estado === 'pronto' &&
                  asset.mime.startsWith('image/') &&
                  (hidden || asset.visibilidade === 'campanha'),
              )
              .map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.nome}
                </option>
              ))}
          </select>
        </label>
        <div className="map-field-pair">
          <label>
            Tamanho em células
            <input
              required
              type="number"
              min="1"
              max={Math.min(10, scene.largura, scene.altura)}
              step="1"
              value={size}
              onChange={(event) => setSize(Number(event.target.value))}
            />
          </label>
          <label>
            Cor do token
            <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
          </label>
        </div>
        <label>
          Rotação
          <input
            type="range"
            min="0"
            max="359"
            step="15"
            value={rotation}
            onChange={(event) => setRotation(Number(event.target.value))}
          />
          <small>{rotation}°</small>
        </label>
        <label className="map-check">
          <input
            type="checkbox"
            checked={hidden}
            onChange={(event) => {
              setHidden(event.target.checked);
              if (
                !event.target.checked &&
                assets.find((asset) => asset.id === image)?.visibilidade === 'mestre'
              )
                setImage('');
            }}
          />
          Oculto dos jogadores
        </label>
        <label className="map-check">
          <input
            type="checkbox"
            checked={locked}
            onChange={(event) => setLocked(event.target.checked)}
          />
          Bloquear movimento dos jogadores
        </label>
        <button type="submit" className="button">
          {token ? 'Salvar token' : 'Adicionar token'}
        </button>
      </fieldset>
    </form>
  );
}

export function AssetLibrary({
  campaignId,
  master,
  assets,
  urls,
  disabled,
  repository,
  refresh,
  onError,
  onBusy,
}: {
  campaignId: string;
  master: boolean;
  assets: AssetRecord[];
  urls: Record<string, string>;
  disabled: boolean;
  repository: {
    upload: (
      campaign: string,
      file: File,
      visibility?: 'campanha' | 'mestre',
    ) => Promise<AssetRecord>;
    download: (asset: AssetRecord) => Promise<Blob>;
    remove: (asset: AssetRecord) => Promise<void>;
  };
  refresh: () => Promise<void>;
  onError: (error: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [visibility, setVisibility] = useState<'campanha' | 'mestre'>('campanha'),
    [uploading, setUploading] = useState(false),
    [removing, setRemoving] = useState('');
  useLayoutEffect(() => {
    if (!master) setVisibility('campanha');
  }, [master]);
  useEffect(() => {
    onBusy(uploading || !!removing);
    const guard = (event: Event) => {
      if (uploading || removing) {
        event.preventDefault();
        onError('Aguarde a confirmação do arquivo antes de sair.');
      }
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (uploading || removing) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('weirs:before-navigation', guard);
    window.addEventListener('weirs:before-account-change', guard);
    window.addEventListener('beforeunload', unload);
    return () => {
      window.removeEventListener('weirs:before-navigation', guard);
      window.removeEventListener('weirs:before-account-change', guard);
      window.removeEventListener('beforeunload', unload);
      onBusy(false);
    };
  }, [uploading, removing, onBusy, onError]);
  return (
    <div className="map-library">
      <p className="map-help">Imagens para mapas e retratos; PDFs para handouts da campanha.</p>
      {master && (
        <label>
          Visibilidade do arquivo
          <select
            value={visibility}
            disabled={disabled || uploading}
            onChange={(event) => setVisibility(event.target.value as 'campanha' | 'mestre')}
          >
            <option value="campanha">Toda a campanha</option>
            <option value="mestre">Somente mestres</option>
          </select>
        </label>
      )}
      <label className="map-upload button secondary">
        {uploading ? 'Enviando arquivo…' : 'Enviar imagem ou PDF'}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          disabled={disabled || uploading}
          aria-label="Enviar arquivo da campanha"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            setUploading(true);
            try {
              await repository.upload(campaignId, file, visibility);
              await refresh();
            } catch (error) {
              onError(
                error instanceof Error ? error.message : 'Não foi possível enviar o arquivo.',
              );
            } finally {
              setUploading(false);
            }
          }}
        />
      </label>
      <small className="map-help">PNG, JPEG, WebP ou PDF · até 5 MB por arquivo.</small>
      <ul className="map-assets">
        {assets.map((asset) => (
          <li key={asset.id}>
            <span className="map-asset-preview">
              {urls[asset.id] ? (
                <img alt="" src={urls[asset.id]} />
              ) : (
                <span aria-hidden="true">{asset.mime === 'application/pdf' ? 'PDF' : 'IMG'}</span>
              )}
            </span>
            <span>
              <strong>{asset.nome}</strong>
              <small>
                {asset.estado === 'pendente'
                  ? 'Envio interrompido'
                  : asset.estado === 'excluindo'
                    ? 'Limpeza pendente'
                    : Math.max(1, Math.round(asset.tamanho / 1024)) + ' KB'}
                {asset.visibilidade === 'mestre' ? ' · Privado' : ''}
              </small>
            </span>
            {asset.estado === 'pronto' && (
              <button
                type="button"
                className="text-button"
                aria-label={'Baixar ' + asset.nome}
                onClick={async () => {
                  try {
                    const blob = await repository.download(asset),
                      url = URL.createObjectURL(blob),
                      link = document.createElement('a');
                    link.href = url;
                    link.download = asset.nome;
                    link.click();
                    setTimeout(() => URL.revokeObjectURL(url), 30000);
                  } catch (error) {
                    onError(
                      error instanceof Error ? error.message : 'Não foi possível baixar o arquivo.',
                    );
                  }
                }}
              >
                ↓
              </button>
            )}
            {(master || asset.estado !== 'pronto') && (
              <button
                type="button"
                className="text-button"
                aria-label={'Remover arquivo ' + asset.nome}
                disabled={disabled || uploading || !!removing}
                onClick={async () => {
                  if (!window.confirm('Remover o arquivo ' + asset.nome + '?')) return;
                  setRemoving(asset.id);
                  try {
                    await repository.remove(asset);
                    await refresh();
                  } catch (error) {
                    onError(
                      error instanceof Error
                        ? error.message
                        : 'Não foi possível remover o arquivo.',
                    );
                  } finally {
                    setRemoving('');
                  }
                }}
              >
                {removing === asset.id ? '…' : '×'}
              </button>
            )}
          </li>
        ))}
      </ul>
      {!assets.some((asset) => asset.estado === 'pronto') && (
        <p className="map-help">Nenhum arquivo compartilhado ainda.</p>
      )}
    </div>
  );
}
