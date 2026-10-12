import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import type { ChatMessage } from '../../../../packages/contracts/chat';
import { DamageBreakdown } from '../chat/DamageBreakdown';
import { dicePlan } from './roll-plan';
import { concealedResults, initialRevealState, revealReducer } from './reveal-state';
import type { Presentation } from './reveal-state';
import { FloatingWindow } from '../tabletop/FloatingWindow';

const preferenceKey = 'weirs:dice3d';
const openKey = 'weirs:dice3d:open';
const context = createContext({
  enabled: true,
  reduced: false,
  open: true,
  current: null as Presentation | null,
  hidden: new Set<string>() as ReadonlySet<string>,
  toggle: (_value: boolean) => {},
  expand: (_value: boolean) => {},
  show: (_message: ChatMessage) => {},
  finish: (_id: string) => {},
  clear: () => {},
});
const motion = () => window.matchMedia('(prefers-reduced-motion: reduce)');
const subscribeMotion = (notify: () => void) => {
  const query = motion();
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};
const compactLayout = () => window.matchMedia('(max-width: 760px)');
const subscribeCompactLayout = (notify: () => void) => {
  const query = compactLayout();
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};
function readPreference(key: string) {
  try {
    return localStorage.getItem(key) !== 'off';
  } catch {
    return true;
  }
}
function storePreference(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? 'on' : 'off');
  } catch {
    /* navegador privado */
  }
}

export function DiceProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(() => readPreference(preferenceKey));
  const [open, setOpen] = useState(() => readPreference(openKey));
  const reduced = useSyncExternalStore(subscribeMotion, () => motion().matches);
  const options = useRef({ enabled, open });
  options.current = { enabled, open };
  const [state, dispatch] = useReducer(revealReducer, initialRevealState);
  const hidden = useMemo(() => concealedResults(state), [state]);
  const seen = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  useEffect(() => {
    if (reduced) dispatch({ type: 'release' });
  }, [reduced]);
  const show = useCallback((message: ChatMessage) => {
    if (!mounted.current || seen.current.has(message.id)) return;
    seen.current.add(message.id);
    if (seen.current.size > 500) seen.current.delete(seen.current.values().next().value!);
    if (!options.current.enabled || !options.current.open || motion().matches || !message.resultado)
      return;
    const plan = dicePlan(message.resultado);
    if (!plan.dice.length) return; // Constantes, CD e faces sem modelo são reveladas imediatamente.
    dispatch({ type: 'show', presentation: { message, plan, finished: false } });
  }, []);
  const finish = useCallback((id: string) => dispatch({ type: 'finish', id }), []);
  const clear = useCallback(() => dispatch({ type: 'clear' }), []);
  function toggle(value: boolean) {
    options.current.enabled = value;
    setEnabled(value);
    storePreference(preferenceKey, value);
    if (!value) dispatch({ type: 'release' });
  }
  function expand(value: boolean) {
    options.current.open = value;
    setOpen(value);
    storePreference(openKey, value);
    if (!value) dispatch({ type: 'release' });
  }
  return (
    <context.Provider
      value={{
        enabled,
        reduced,
        open,
        current: state.current,
        hidden,
        toggle,
        expand,
        show,
        finish,
        clear,
      }}
    >
      {children}
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

export function DicePanel({ sessionWindow = '' }: { sessionWindow?: string } = {}) {
  const dice = useDice3D();
  const id = useId();
  const compact = useSyncExternalStore(subscribeCompactLayout, () => compactLayout().matches);
  const [automaticallyCollapsed, setAutomaticallyCollapsed] = useState(false);
  const current = useRef(dice.current);
  current.current = dice.current;
  useLayoutEffect(() => {
    // Abrir um painel dá prioridade à ficha/combate. Uma animação em andamento continua.
    // Esta preferência é temporária: não desliga as próximas animações no navegador.
    const activePanel = document.querySelector('.session-floating:not(.is-collapsed)');
    setAutomaticallyCollapsed(
      Boolean(compact && sessionWindow && activePanel && current.current?.finished),
    );
  }, [sessionWindow, compact]);
  useLayoutEffect(() => {
    // Uma nova rolagem traz a janela de volta, mesmo com a ficha ainda aberta.
    setAutomaticallyCollapsed(false);
  }, [dice.current?.message.id]);
  const collapsed = !dice.open || automaticallyCollapsed;
  return (
    <FloatingWindow
      id="dados"
      title="Mesa de dados 3D"
      className="dice-accordion dice-floating"
      collapsed={collapsed}
      onCollapse={(next) => {
        setAutomaticallyCollapsed(false);
        dice.expand(!next);
      }}
      toggleLabel="Mesa de dados 3D"
      avoidKey={sessionWindow + ':' + (dice.current?.message.id || '')}
      initial={{
        x:
          window.innerWidth <= 760
            ? window.innerWidth - 253
            : Math.max(80, window.innerWidth - 700),
        y: window.innerWidth <= 760 ? 125 : Math.max(110, window.innerHeight - 340),
      }}
    >
      <div
        id={id}
        role="region"
        aria-label="Dados 3D"
        hidden={collapsed}
        className="dice-tray"
        data-phase={!dice.current ? 'ociosa' : dice.current.finished ? 'concluida' : 'rolando'}
      >
        {!collapsed && (
          <>
            <DiceSettings />
            {dice.current ? (
              <DiceScene
                key={dice.current.message.id}
                presentation={dice.current}
                animate={dice.enabled && !dice.reduced}
                finish={dice.finish}
              />
            ) : (
              <div className="dice-idle">
                <span aria-hidden="true">✧</span>
                <p>A mesa está pronta.</p>
                <small>Envie uma rolagem para lançar os dados aqui.</small>
              </div>
            )}
          </>
        )}
      </div>
    </FloatingWindow>
  );
}

function DiceScene({
  presentation,
  animate,
  finish,
}: {
  presentation: Presentation;
  animate: boolean;
  finish: (id: string) => void;
}) {
  const { message, plan, finished } = presentation;
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!animate || error) return;
    const controller = new AbortController();
    let cleanup: (() => void) | undefined;
    let timeout: ReturnType<typeof setTimeout>;
    function done() {
      if (controller.signal.aborted) return;
      clearTimeout(timeout);
      finish(message.id);
    }
    function failure() {
      if (controller.signal.aborted) return;
      setError('Visualização 3D indisponível. O resultado está confirmado no chat.');
      done();
      controller.abort();
      cleanup?.();
    }
    // Falhas de download/renderização e abas em segundo plano nunca retêm o resultado.
    timeout = setTimeout(failure, 12000);
    import('./renderer')
      .then(async ({ renderDice }) => {
        if (controller.signal.aborted) return;
        cleanup = await renderDice(
          host.current!,
          plan,
          controller.signal,
          done,
          failure,
          !finished,
        );
        if (controller.signal.aborted) cleanup?.();
        if (finished) clearTimeout(timeout);
      })
      .catch(failure);
    return () => {
      controller.abort();
      cleanup?.();
      clearTimeout(timeout);
    };
    // Concluir mantém os modelos parados; reabrir monta uma pose estática.
  }, [message.id, plan, animate, finish]);
  return (
    <div className="dice-presentation">
      {animate && !error && <div className="dice-scene" ref={host} aria-hidden="true" />}
      <div className="dice-confirmation" aria-live="polite">
        <span className="eyebrow">{finished ? 'Destino revelado' : 'Dados em movimento'}</span>
        <span>{message.rotulo || message.resultado?.expressao}</span>
        {finished ? (
          <>
            <strong>Resultado confirmado: {message.resultado?.total}</strong>
            <p className="dice-values">{plan.groups.join(' · ')}</p>
            <DamageBreakdown parts={message.resultado?.parcelas} />
          </>
        ) : (
          <p className="dice-rolling">Rolando dados…</p>
        )}
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
    </div>
  );
}
