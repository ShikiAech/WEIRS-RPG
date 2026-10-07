import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import type { ChatMessage } from '../../../../packages/contracts/chat';
import { dicePlan } from './roll-plan';
import type { DicePlan } from './roll-plan';

const preferenceKey = 'weirs:dice3d';
const context = createContext({
  enabled: true,
  reduced: false,
  toggle: (_value: boolean) => {},
  show: (_message: ChatMessage) => {},
  clear: () => {},
});
const motion = () => window.matchMedia('(prefers-reduced-motion: reduce)');
const subscribeMotion = (notify: () => void) => {
  const query = motion();
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};

export function DiceProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(preferenceKey) !== 'off';
    } catch {
      return true;
    }
  });
  const reduced = useSyncExternalStore(subscribeMotion, () => motion().matches);
  const enabledNow = useRef(enabled);
  enabledNow.current = enabled;
  const [active, setActive] = useState<{ message: ChatMessage; plan: DicePlan } | null>(null);
  const seen = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  useEffect(() => {
    if (!enabled || reduced) setActive(null);
  }, [enabled, reduced]);
  function show(message: ChatMessage) {
    if (!mounted.current || seen.current.has(message.id)) return;
    seen.current.add(message.id);
    if (seen.current.size > 500) seen.current.delete(seen.current.values().next().value!);
    // A confirmação pode chegar depois de o usuário mudar a preferência.
    if (!enabledNow.current || motion().matches || !message.resultado) return;
    const plan = dicePlan(message.resultado);
    if (!plan.groups.length) return; // Texto, constantes e anúncio de CD não têm dados para animar.
    setActive({ message, plan });
  }
  function toggle(value: boolean) {
    setEnabled(value);
    // Somente a preferência visual é persistida; mensagens/resultados ficam em memória.
    try {
      localStorage.setItem(preferenceKey, value ? 'on' : 'off');
    } catch {
      /* navegador privado */
    }
  }
  return (
    <context.Provider value={{ enabled, reduced, toggle, show, clear: () => setActive(null) }}>
      {children}
      {active && enabled && !reduced && (
        <DiceTray key={active.message.id} {...active} close={() => setActive(null)} />
      )}
    </context.Provider>
  );
}

export const useDice3D = () => useContext(context);

export function DiceSettings() {
  const { enabled, reduced, toggle } = useDice3D();
  return (
    <div className="dice-settings">
      <label>
        <input type="checkbox" checked={enabled} onChange={(e) => toggle(e.target.checked)} />{' '}
        Animar meus dados em 3D
      </label>
      {reduced && (
        <small>Animações pausadas pela preferência de movimento reduzido do dispositivo.</small>
      )}
    </div>
  );
}

function DiceTray({
  message,
  plan,
  close,
}: {
  message: ChatMessage;
  plan: DicePlan;
  close: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState('carregando');
  const [error, setError] = useState('');
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const controller = new AbortController();
    let cleanup: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout>;
    function finish() {
      if (controller.signal.aborted) return;
      setPhase('concluida');
      clearTimeout(timer);
      timer = setTimeout(() => closeRef.current(), 4500);
    }
    function failure() {
      if (controller.signal.aborted) return;
      cleanup?.();
      setError('Visualização 3D indisponível. O resultado está confirmado no chat.');
      finish();
    }
    if (!plan.dice.length) finish();
    else {
      import('./renderer')
        .then(async ({ renderDice }) => {
          if (controller.signal.aborted) return;
          setPhase('rolando');
          cleanup = await renderDice(host.current!, plan, controller.signal, finish, failure);
          if (controller.signal.aborted) cleanup?.();
        })
        .catch(failure);
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', escape);
    return () => {
      controller.abort();
      cleanup?.();
      clearTimeout(timer);
      window.removeEventListener('keydown', escape);
    };
  }, [plan]);
  return (
    <section className="dice-tray" role="region" aria-label="Dados 3D" data-phase={phase}>
      <div className="dice-tray-heading">
        <span className="eyebrow">
          {phase === 'concluida' ? 'Destino revelado' : 'Dados em movimento'}
        </span>
        <button className="text-button" aria-label="Fechar dados 3D" onClick={close}>
          Fechar ×
        </button>
      </div>
      {!!plan.dice.length && !error && <div className="dice-scene" ref={host} aria-hidden="true" />}
      <div className="dice-confirmation" aria-live="polite">
        <strong>Resultado confirmado: {message.resultado?.total}</strong>
        <span>{message.rotulo || message.resultado?.expressao}</span>
        {phase === 'carregando' && <small>Preparando os dados…</small>}
        {phase === 'concluida' && <p className="dice-values">{plan.groups.join(' · ')}</p>}
        {plan.omitted > 0 && (
          <small>Limite de 20 modelos por animação. Todos os dados estão no chat.</small>
        )}
        {plan.unsupported > 0 && (
          <small>
            Dados com faces de homebrew aparecem no chat; esta animação usa os sólidos tradicionais.
          </small>
        )}
        {error && <small>{error}</small>}
      </div>
    </section>
  );
}
