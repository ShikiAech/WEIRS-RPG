import { useEffect, useId, useRef } from 'react';
import type { Roll20PdfImport } from '../../../../packages/sheets/roll20-pdf';
import { ATRIBUTOS } from '../../../../packages/sheets/modelo.js';

export function PdfImportPreview({
  result,
  replacing,
  onApply,
  onClose,
}: {
  result: Roll20PdfImport;
  replacing: boolean;
  onApply: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    cancel = useRef<HTMLButtonElement>(null),
    title = useId();
  useEffect(() => {
    dialog.current?.showModal();
    cancel.current?.focus();
  }, []);
  const c = result.content;
  return (
    <dialog ref={dialog} className="pdf-import-preview" aria-labelledby={title} onClose={onClose}>
      <div className="dialog-heading">
        <div>
          <p className="eyebrow">Importação do Roll20 · {result.pages} páginas</p>
          <h2 id={title}>Revisar dados do PDF</h2>
        </div>
        <button
          ref={cancel}
          type="button"
          className="button secondary"
          onClick={() => dialog.current?.close()}
        >
          Cancelar
        </button>
      </div>
      <p>
        A leitura foi feita neste navegador. Confira os dados encontrados e os pontos que precisam
        de revisão.
      </p>
      <dl className="pdf-import-summary">
        {result.found.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="pdf-import-abilities">
        {Object.entries(ATRIBUTOS).map(([key, label]) => (
          <div key={key}>
            <span>{label}</span>
            <strong>{c.atributos[key as keyof typeof c.atributos].valor}</strong>
          </div>
        ))}
      </div>
      <section className="pdf-import-warnings" aria-label="Pontos para revisar">
        <h3>Confira antes de salvar</h3>
        <ul>
          {result.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </section>
      <details>
        <summary>Ataques extraídos · {c.ataques.length}</summary>
        {c.ataques.map((x) => (
          <p key={x.id}>
            <strong>{x.nome}</strong> · {x.tipo === 'cd' ? 'CD ' : x.valor >= 0 ? '+' : ''}
            {x.valor} · {x.dano} {x.tipoDano}
          </p>
        ))}
      </details>
      <details>
        <summary>Magias extraídas · {c.magias.length}</summary>
        {c.magias.map((x) => (
          <p key={x.id}>
            <strong>{x.nome}</strong> · {x.circulo ? `Círculo ${x.circulo}` : 'Truque'} · {x.tempo}{' '}
            · {x.alcance}
          </p>
        ))}
      </details>
      <details>
        <summary>Itens extraídos · {c.inventario.itens.length}</summary>
        {c.inventario.itens.map((x) => (
          <p key={x.id}>
            <strong>{x.nome}</strong> · {x.quantidade} un. ·{' '}
            {x.peso.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg/un.
            {x.equipado ? ' · Equipado' : ''}
          </p>
        ))}
      </details>
      <details>
        <summary>Características, traços e talentos</summary>
        {[...c.caracteristicas, ...c.tracos, ...c.talentos].map((x) => (
          <p key={x.id}>{x.nome}</p>
        ))}
      </details>
      <div className="pdf-import-actions">
        <p>
          {replacing
            ? 'Aplicar substituirá os campos da ficha atual. Revise o resultado nas abas antes de salvar na mesa.'
            : 'Aplicar preencherá o rascunho. Revise o resultado nas abas antes de salvar na mesa.'}
        </p>
        <button type="button" className="button" onClick={onApply}>
          {replacing ? 'Substituir campos com dados do PDF' : 'Aplicar dados à ficha'}
        </button>
      </div>
    </dialog>
  );
}
