import { useEffect, useRef, useState } from 'react';
import type {
  CampaignRecord,
  SheetRecord,
  SheetRepository,
} from '../../../../packages/contracts/sheets';
import { publicError } from '../../lib/errors';

type Attempt = { record: SheetRecord; destination: string; id: string };
export function CampaignCopy({
  record,
  campaigns,
  repository,
  disabled,
}: {
  record: SheetRecord;
  campaigns: CampaignRecord[];
  repository: SheetRepository;
  disabled: boolean;
}) {
  const [destination, setDestination] = useState('');
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [copy, setCopy] = useState<SheetRecord | null>(null);
  const busy = useRef(false),
    unresolved = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const guard = (event: Event) => {
      if (busy.current || unresolved.current) {
        event.preventDefault();
        setError('Confirme a mesma cópia antes de sair desta ficha.');
      }
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (busy.current || unresolved.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('weirs:before-navigation', guard);
    window.addEventListener('weirs:before-account-change', guard);
    window.addEventListener('beforeunload', unload);
    return () => {
      alive.current = false;
      window.removeEventListener('weirs:before-navigation', guard);
      window.removeEventListener('weirs:before-account-change', guard);
      window.removeEventListener('beforeunload', unload);
    };
  }, []);
  async function add() {
    if (busy.current || (!attempt && (disabled || !destination))) return;
    const current = attempt || { record, destination, id: crypto.randomUUID() };
    busy.current = true;
    unresolved.current = true;
    setPending(true);
    setAttempt(current);
    setError('');
    setCopy(null);
    try {
      const next = await repository.copyToCampaign(current.record, current.destination, current.id);
      unresolved.current = false;
      if (alive.current) {
        setCopy(next);
        setAttempt(null);
        setDestination('');
      }
    } catch (e) {
      const failure = publicError(e);
      if (!['REDE', 'INDISPONIVEL'].includes(failure.code)) {
        unresolved.current = false;
        if (alive.current) setAttempt(null);
      }
      if (alive.current)
        setError(
          failure.code === 'CONFLITO'
            ? 'A ficha salva mudou. Recarregue a versão mais recente antes de adicionar a cópia.'
            : failure.code === 'ACESSO'
              ? 'Seu acesso de administrador não está disponível. Atualize a página.'
              : 'Não foi possível confirmar a cópia. Confirme a mesma tentativa para evitar duplicação.',
        );
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }
  return (
    <section className="campaign-copy form-section" aria-labelledby="copy-title">
      <p className="eyebrow">Administração</p>
      <h2 id="copy-title">Adicionar a outra campanha</h2>
      <p>
        A cópia mantém o proprietário e os dados salvos desta ficha. O dono também recebe acesso
        como jogador na campanha de destino, caso ainda não participe. As duas fichas passam a ser
        independentes.
      </p>
      {disabled && !attempt && (
        <p className="notice">Salve as alterações antes de adicionar a cópia.</p>
      )}
      <div className="campaign-copy-controls">
        <label className="field">
          Campanha de destino
          <select
            value={destination}
            disabled={disabled || pending || !!attempt}
            onChange={(e) => {
              setDestination(e.target.value);
              setCopy(null);
              setError('');
            }}
          >
            <option value="">Selecione outra campanha</option>
            {campaigns
              .filter((c) => c.id !== record.campanha_id)
              .map((c) => (
                <option value={c.id} key={c.id}>
                  {c.nome}
                </option>
              ))}
          </select>
        </label>
        <button
          className="button"
          disabled={pending || (!attempt && (disabled || !destination))}
          onClick={() => void add()}
        >
          {pending ? 'Confirmando cópia…' : attempt ? 'Confirmar mesma cópia' : 'Adicionar cópia'}
        </button>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {copy && (
        <p className="notice" role="status">
          Cópia adicionada em {campaigns.find((c) => c.id === copy.campanha_id)?.nome}.{' '}
          <a href={'#/fichas/' + copy.id}>Abrir cópia</a>
        </p>
      )}
    </section>
  );
}
