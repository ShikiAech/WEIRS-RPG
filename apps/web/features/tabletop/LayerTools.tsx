import { useState } from 'react';
import { MapDraftInput } from './MapDraftInput';
import type {
  MapCommand,
  MapSnapshot,
  TokenRecord,
  AreaRecord,
  PlacedObject,
} from '../../../../packages/contracts/tabletop';
export function LayerTools({
  snapshot,
  selected,
  members,
  disabled,
  operate,
}: {
  snapshot: MapSnapshot;
  selected: TokenRecord[];
  members: { id: string; nome: string; papel?: string }[];
  disabled: boolean;
  operate: (command: MapCommand) => unknown;
}) {
  const [name, setName] = useState(''),
    [people, setPeople] = useState<string[]>([]),
    [follow, setFollow] = useState(''),
    [objects, setObjects] = useState<string[]>([]),
    [image, setImage] = useState('');
  const { cena: scene, camadas: layers } = snapshot;
  const transfer = (id: string) =>
    operate({
      tipo: 'camada_transferir',
      cena_id: scene.id,
      camada_id: id,
      itens: [
        ...selected.map((t) => ({ tipo: 'token' as const, id: t.id, versao: t.versao })),
        ...snapshot.objetos
          .filter((o) => objects.includes(o.id))
          .map((o) => ({ tipo: 'objeto' as const, id: o.id, versao: o.versao })),
        ...snapshot.areas
          .filter((o) => objects.includes(o.id))
          .map((o) => ({ tipo: 'area' as const, id: o.id, versao: o.versao })),
      ],
    });
  return (
    <fieldset disabled={disabled}>
      <legend>Camadas e participantes</legend>
      <label>
        Nome da camada
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </label>
      <button
        className="button secondary"
        type="button"
        disabled={!name.trim()}
        onClick={async () => {
          const submitted = name;
          const result = await operate({
            tipo: 'camada_criar',
            cena_id: scene.id,
            nome: submitted,
            ordem: layers.length,
          });
          if (result) setName((current) => (current === submitted ? '' : current));
        }}
      >
        Criar camada
      </button>
      {layers.map((l) => (
        <div key={l.id}>
          <label>
            Nome
            <MapDraftInput
              value={l.nome}
              onCommit={(value) => {
                if (value !== l.nome)
                  return operate({
                    tipo: 'camada_atualizar',
                    id: l.id,
                    versao: l.versao,
                    patch: { nome: value },
                  });
              }}
            />
          </label>
          <label>
            Ordem
            <MapDraftInput
              type="number"
              value={l.ordem}
              onCommit={(value) => {
                if (Number(value) !== l.ordem)
                  return operate({
                    tipo: 'camada_atualizar',
                    id: l.id,
                    versao: l.versao,
                    patch: { ordem: Number(value) },
                  });
              }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={l.visivel}
              onChange={(e) =>
                operate({
                  tipo: 'camada_atualizar',
                  id: l.id,
                  versao: l.versao,
                  patch: { visivel: e.target.checked },
                })
              }
            />
            Visível: {l.nome}
          </label>
          <label>
            <input
              type="checkbox"
              checked={l.bloqueada}
              onChange={(e) =>
                operate({
                  tipo: 'camada_atualizar',
                  id: l.id,
                  versao: l.versao,
                  patch: { bloqueada: e.target.checked },
                })
              }
            />
            Bloqueada: {l.nome}
          </label>
          <button
            className="button secondary"
            type="button"
            disabled={!selected.length && !objects.length}
            onClick={() => transfer(l.id)}
          >
            Mover seleção para {l.nome}
          </button>
        </div>
      ))}
      <h3>Imagens e áreas</h3>
      {[...snapshot.objetos, ...snapshot.areas].map((o: PlacedObject | AreaRecord) => (
        <label key={o.id}>
          <input
            type="checkbox"
            checked={objects.includes(o.id)}
            onChange={(e) =>
              setObjects(
                e.target.checked ? [...objects, o.id] : objects.filter((id) => id !== o.id),
              )
            }
          />
          {o.nome}
          {'w' in o && (
            <button
              className="button secondary"
              type="button"
              onClick={() => operate({ tipo: 'objeto_excluir', id: o.id, versao: o.versao })}
            >
              Excluir objeto
            </button>
          )}
        </label>
      ))}
      <label>
        Imagem adicional
        <select value={image} onChange={(e) => setImage(e.target.value)}>
          <option value="">Escolha uma imagem</option>
          {snapshot.assets
            .filter((a) => a.mime.startsWith('image/') && a.estado === 'pronto')
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
        </select>
      </label>
      <button
        className="button secondary"
        type="button"
        disabled={!image}
        onClick={() =>
          operate({
            tipo: 'objeto_criar',
            cena_id: scene.id,
            nome: 'Imagem',
            x: 0,
            y: 0,
            w: Math.min(4, scene.largura),
            h: Math.min(4, scene.altura),
            imagem_id: image,
            desenho: null,
            oculto: false,
            camada_id: layers[0].id,
          })
        }
      >
        Colocar imagem
      </button>
      {snapshot.objetos
        .filter((o) => objects.includes(o.id))
        .map((o) => (
          <div key={'position' + o.id}>
            <strong>{o.nome}</strong>
            {(['x', 'y', 'w', 'h'] as const).map((key) => (
              <label key={key}>
                {{ x: 'Posição X', y: 'Posição Y', w: 'Largura', h: 'Altura' }[key]} (células)
                <MapDraftInput
                  type="number"
                  step="any"
                  min={key === 'w' || key === 'h' ? 0.01 : 0}
                  max={100}
                  value={o[key]}
                  onCommit={(value) => {
                    if (Number(value) !== o[key])
                      return operate({
                        tipo: 'objeto_atualizar',
                        id: o.id,
                        versao: o.versao,
                        patch: { [key]: Number(value) },
                      });
                  }}
                />
              </label>
            ))}
          </div>
        ))}
      <h3>Enviar participantes para esta cena</h3>
      {members.map((m) => (
        <label key={m.id}>
          <input
            type="checkbox"
            checked={people.includes(m.id)}
            onChange={(e) =>
              setPeople(e.target.checked ? [...people, m.id] : people.filter((id) => id !== m.id))
            }
          />
          {m.nome}
        </label>
      ))}
      <label>
        Visão do espectador: seguir jogador
        <select value={follow} onChange={(e) => setFollow(e.target.value)}>
          <option value="">Sem jogador: névoa completa</option>
          {members
            .filter((m) => !m.papel || m.papel === 'jogador')
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
        </select>
      </label>
      <button
        className="button secondary"
        type="button"
        disabled={!scene.publicada || !people.length}
        onClick={() =>
          operate({
            tipo: 'cena_atribuir',
            cena_id: scene.id,
            usuarios: people,
            versoes: people.map((usuario_id) => ({
              usuario_id,
              versao: snapshot.atribuicoes.find((a) => a.usuario_id === usuario_id)?.versao || 0,
            })),
            seguir_usuario_id: follow || null,
          })
        }
      >
        Enviar selecionados
      </button>
      <button
        className="button secondary"
        type="button"
        disabled={!scene.publicada}
        onClick={() =>
          operate({
            tipo: 'cena_atribuir',
            cena_id: scene.id,
            usuarios: members.map((m) => m.id),
            versoes: members.map((m) => ({
              usuario_id: m.id,
              versao: snapshot.atribuicoes.find((a) => a.usuario_id === m.id)?.versao || 0,
            })),
            seguir_usuario_id: follow || null,
          })
        }
      >
        Enviar grupo inteiro
      </button>
    </fieldset>
  );
}
