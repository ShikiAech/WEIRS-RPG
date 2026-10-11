import type { ChatMessage } from '../../../../packages/contracts/chat';
import type { DicePlan } from './roll-plan';

export type Presentation = { message: ChatMessage; plan: DicePlan; finished: boolean };
export type RevealState = { current: Presentation | null; queue: Presentation[] };
export type RevealAction =
  | { type: 'show'; presentation: Presentation }
  | { type: 'finish'; id: string }
  | { type: 'release' }
  | { type: 'clear' };
export const initialRevealState: RevealState = { current: null, queue: [] };

export function revealReducer(state: RevealState, action: RevealAction): RevealState {
  if (action.type === 'clear') return initialRevealState;
  if (action.type === 'release')
    return { current: state.current ? { ...state.current, finished: true } : null, queue: [] };
  if (action.type === 'show') {
    if (!state.current || state.current.finished)
      return { current: action.presentation, queue: [] };
    // Uma fila limitada evita reter resultados indefinidamente em envios em massa.
    if (state.queue.length >= 20) return state;
    return { ...state, queue: [...state.queue, action.presentation] };
  }
  if (!state.current || state.current.message.id !== action.id || state.current.finished)
    return state;
  if (state.queue.length) return { current: state.queue[0], queue: state.queue.slice(1) };
  return { current: { ...state.current, finished: true }, queue: [] };
}

export function concealedResults(state: RevealState): ReadonlySet<string> {
  return new Set([
    ...(!state.current?.finished && state.current ? [state.current.message.id] : []),
    ...state.queue.map((item) => item.message.id),
  ]);
}
