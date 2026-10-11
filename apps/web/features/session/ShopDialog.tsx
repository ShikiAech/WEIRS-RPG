import { useEffect, useRef, useState } from 'react';
import type { SheetRecord } from '../../../../packages/contracts/sheets';
import type { Offer, SessionCommand, SessionState } from '../../../../packages/contracts/session';
export function ShopDialog({
  mesa,
  record,
  master,
  disabled,
  locked,
  onClose,
  operate,
  children,
}: {
  mesa: SessionState | null;
  record?: SheetRecord;
  master: boolean;
  disabled: boolean;
  locked: boolean;
  onClose: () => void;
  operate: (c: SessionCommand) => Promise<boolean>;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [quantity, setQuantity] = useState(1),
    [shopName, setShopName] = useState<string | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  const shop = mesa?.estado.loja;
  const configure = (
    offers: Offer[],
    open = shop?.aberta || false,
    name = shop?.nome || 'Loja da campanha',
    version = mesa?.versao,
  ) => {
    return mesa && version !== undefined
      ? operate({ tipo: 'loja', versao: version, nome: name, aberta: open, ofertas: offers })
      : Promise.resolve(false);
  };
  const trade = (type: 'comprar' | 'vender', offer: Offer, item?: string) => {
    if (record)
      operate({
        tipo: type,
        versao: record.versao,
        ficha_id: record.id,
        oferta_id: offer.id,
        preco_unitario: type === 'comprar' ? offer.preco : offer.venda,
        item_id: item,
        quantidade: quantity,
      });
  };
  return (
    <dialog
      ref={dialog}
      className="shop-dialog"
      aria-labelledby="shop-title"
      onCancel={(e) => {
        if (locked) e.preventDefault();
      }}
      onClose={onClose}
    >
      <div className="dialog-heading">
        <h2 id="shop-title">{shop?.nome || 'Loja da campanha'}</h2>
        <button className="button secondary" disabled={locked} onClick={onClose}>
          Fechar loja
        </button>
      </div>
      {children}
      {shop && (
        <>
          <p>
            {shop.aberta ? 'Aberta para negócios' : 'A loja está fechada.'} · Preços em PC (100 PC =
            1 PO).
          </p>
          {record && (
            <p>
              Saldo de {record.nome}:{' '}
              {Object.entries(record.conteudo.inventario.moedas)
                .map(([k, v]) => `${v} ${k.toUpperCase()}`)
                .join(' · ')}
            </p>
          )}
          <label>
            Quantidade para compra/venda
            <input
              type="number"
              value={quantity}
              min={1}
              max={9999}
              onChange={(e) => setQuantity(Number(e.target.value))}
              disabled={disabled}
            />
          </label>
          <div className="shop-offers">
            {shop.ofertas.map((offer) => (
              <article className="play-entry" key={offer.id}>
                <h3>{offer.nome}</h3>
                <p>
                  Compra {offer.preco} PC · Venda {offer.venda} PC · Estoque {offer.estoque}
                </p>
                <button
                  className="button"
                  disabled={disabled || !record || !shop.aberta || offer.estoque < quantity}
                  onClick={() => trade('comprar', offer)}
                >
                  Comprar {offer.nome}
                </button>
                {(
                  record?.conteudo.inventario.itens as
                    { id: string; nome: string; quantidade: number }[] | undefined
                )
                  ?.filter((e) => e.nome === offer.nome && e.quantidade > 0)
                  .map((item) => (
                    <button
                      key={item.id}
                      className="button secondary"
                      disabled={disabled || !shop.aberta || item.quantidade < quantity}
                      onClick={() => trade('vender', offer, item.id)}
                    >
                      Vender {item.nome} (×{item.quantidade})
                    </button>
                  ))}
                {master && (
                  <OfferEditor
                    mesa={mesa!}
                    offer={offer}
                    disabled={disabled}
                    configure={configure}
                  />
                )}
              </article>
            ))}
          </div>
          {!shop.ofertas.length && <p>O mestre ainda não cadastrou ofertas.</p>}
          {master && (
            <fieldset disabled={disabled} className="play-fields">
              <h3>Administrar loja</h3>
              <label>
                Nome da loja
                <input
                  value={shopName ?? shop.nome}
                  maxLength={120}
                  required
                  onChange={(e) => setShopName(e.target.value)}
                />
              </label>
              <button
                className="button secondary"
                onClick={() => configure(shop.ofertas, !shop.aberta, shopName ?? shop.nome)}
              >
                {shop.aberta ? 'Fechar negócios' : 'Abrir negócios'}
              </button>
              <h3>Nova oferta</h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const data = new FormData(form);
                  const success = await configure([
                    ...shop.ofertas,
                    {
                      id: crypto.randomUUID(),
                      nome: String(data.get('nome')),
                      preco: Number(data.get('preco')),
                      venda: Number(data.get('venda')),
                      estoque: Number(data.get('estoque')),
                    },
                  ]);
                  if (success) form.reset();
                }}
              >
                <label>
                  Nome do produto
                  <input name="nome" required maxLength={120} />
                </label>
                <label>
                  Compra (PC)
                  <input
                    name="preco"
                    type="number"
                    min={0}
                    max={100000000}
                    required
                    defaultValue={100}
                  />
                </label>
                <label>
                  Venda (PC)
                  <input
                    name="venda"
                    type="number"
                    min={0}
                    max={100000000}
                    required
                    defaultValue={50}
                  />
                </label>
                <label>
                  Estoque inicial
                  <input
                    name="estoque"
                    type="number"
                    min={0}
                    max={9999}
                    required
                    defaultValue={10}
                  />
                </label>
                <button className="button secondary">Adicionar oferta</button>
              </form>
            </fieldset>
          )}
          <small>
            O mestre define os preços e itens aceitos. A transação converte moedas para dar o troco;
            itens sintonizados precisam ser dessintonizados antes da venda.
          </small>
        </>
      )}
    </dialog>
  );
}

function OfferEditor({
  mesa,
  offer,
  disabled,
  configure,
}: {
  mesa: SessionState;
  offer: Offer;
  disabled: boolean;
  configure: (offers: Offer[], open: boolean, name: string, version: number) => Promise<boolean>;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const [base, setBase] = useState<{ mesa: SessionState; offer: Offer } | null>(null);
  return (
    <details
      ref={details}
      onToggle={(e) => {
        if (e.currentTarget.open) setBase((old) => old || structuredClone({ mesa, offer }));
        else setBase(null);
      }}
    >
      <summary>Editar oferta: {offer.nome}</summary>
      {base && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const changed = {
              ...base.offer,
              nome: String(data.get('nome')),
              preco: Number(data.get('preco')),
              venda: Number(data.get('venda')),
              estoque: Number(data.get('estoque')),
            };
            const shop = base.mesa.estado.loja;
            const success = await configure(
              shop.ofertas.map((x) => (x.id === offer.id ? changed : x)),
              shop.aberta,
              shop.nome,
              base.mesa.versao,
            );
            if (success && details.current) details.current.open = false;
          }}
        >
          {base.mesa.versao !== mesa.versao && (
            <p role="status">
              A mesa mudou durante a edição. Reabra a oferta para revisar os valores atuais antes de
              salvar.
            </p>
          )}
          <fieldset disabled={disabled} className="play-fields">
            <label>
              Nome da oferta
              <input name="nome" defaultValue={base.offer.nome} required maxLength={120} />
            </label>
            {(['preco', 'venda', 'estoque'] as const).map((key) => (
              <label key={key}>
                {key === 'preco'
                  ? 'Preço de compra (PC)'
                  : key === 'venda'
                    ? 'Preço de venda (PC)'
                    : 'Estoque'}
                <input
                  name={key}
                  type="number"
                  min={0}
                  max={key === 'estoque' ? 9999 : 100000000}
                  defaultValue={base.offer[key]}
                  required
                />
              </label>
            ))}
            <button className="button secondary">Salvar oferta</button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                const shop = base.mesa.estado.loja;
                void configure(
                  shop.ofertas.filter((x) => x.id !== offer.id),
                  shop.aberta,
                  shop.nome,
                  base.mesa.versao,
                );
              }}
            >
              Retirar oferta
            </button>
          </fieldset>
        </form>
      )}
    </details>
  );
}
