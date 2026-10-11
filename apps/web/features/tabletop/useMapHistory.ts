import { useLayoutEffect, useRef, useState } from 'react';
import type {
  MapCommand,
  MapResponse,
  SceneRecord,
  TokenRecord,
} from '../../../../packages/contracts/tabletop';
import { inverseCommand, rebaseVersions, remapTokenIds } from './map-history';
type Entry = { undo: MapCommand; redo: MapCommand };
type Pending = {
  command: MapCommand;
  tokens: TokenRecord[];
  scene?: SceneRecord;
  mode: 'normal' | 'undo' | 'redo';
  entry?: Entry;
};
export function useMapHistory(
  key: string,
  tokens: TokenRecord[],
  scene: SceneRecord | undefined,
  base: (command?: MapCommand) => Promise<MapResponse | false>,
) {
  const [undoStack, setUndo] = useState<Entry[]>([]),
    [redoStack, setRedo] = useState<Entry[]>([]);
  const pending = useRef<Pending | null>(null),
    inFlight = useRef(false),
    generation = useRef(0);
  const confirmed = useRef(new Map<string, number>());
  function clear() {
    pending.current = null;
    confirmed.current.clear();
    setUndo([]);
    setRedo([]);
  }
  useLayoutEffect(() => {
    generation.current++;
    clear();
  }, [key]);
  async function execute(
    command?: MapCommand,
    mode: Pending['mode'] = 'normal',
    entry?: Entry,
  ): Promise<MapResponse | false> {
    if (inFlight.current) return false;
    if (command) {
      const targets =
        command.tipo === 'token_atualizar' || command.tipo === 'token_excluir'
          ? [command.id]
          : command.tipo === 'tokens_lote'
            ? command.itens.map((t) => t.id)
            : command.tipo === 'tokens_duplicar'
              ? command.tokens.map((t) => t.id)
              : [];
      const external =
        targets.some(
          (id) =>
            confirmed.current.has(id) &&
            confirmed.current.get(id) !== tokens.find((t) => t.id === id)?.versao,
        ) ||
        (command.tipo === 'cena_atualizar' &&
          confirmed.current.has('scene:' + command.id) &&
          confirmed.current.get('scene:' + command.id) !== scene?.versao);
      if (mode === 'normal' && external) clear();
      pending.current = {
        command,
        tokens: structuredClone(tokens),
        scene: scene && structuredClone(scene),
        mode,
        entry,
      };
    }
    const work = pending.current,
      epoch = generation.current;
    inFlight.current = true;
    try {
      const result = await base(command);
      if (!result || epoch !== generation.current) return result;
      pending.current = null;
      if (!work) return result;
      const inverse = inverseCommand(work.command, result, work.tokens, work.scene);
      for (const token of [...(result.tokens || []), ...(result.token ? [result.token] : [])])
        confirmed.current.set(token.id, token.versao);
      if (result.cena) confirmed.current.set('scene:' + result.cena.id, result.cena.versao);
      const ids = new Map<string, string>();
      if (
        work.mode === 'redo' &&
        work.command.tipo === 'tokens_duplicar' &&
        work.entry?.undo.tipo === 'tokens_lote'
      )
        work.entry.undo.itens.forEach((old, i) => {
          if (result.tokens?.[i]) ids.set(old.id, result.tokens[i].id);
        });
      const rebase = (e: Entry): Entry => ({
        undo: rebaseVersions(remapTokenIds(e.undo, ids), result),
        redo: rebaseVersions(remapTokenIds(e.redo, ids), result),
      });
      if (work.mode === 'normal') {
        setRedo([]);
        if (
          work.command.tipo === 'token_excluir' ||
          work.command.tipo === 'cena_excluir' ||
          work.command.tipo === 'cena_ativar' ||
          (work.command.tipo === 'cena_atualizar' && !inverse) ||
          (work.command.tipo === 'tokens_lote' &&
            work.command.itens.some((i) => i.tipo === 'token_excluir'))
        ) {
          clear();
          return result;
        }
        if (inverse)
          setUndo((stack) => [...stack, { undo: inverse, redo: work.command }].slice(-20));
      } else if (work.mode === 'undo' && work.entry) {
        setUndo((stack) => stack.slice(0, -1).map(rebase));
        setRedo((stack) => [
          ...stack.map(rebase),
          rebase({ ...work.entry!, redo: inverse || work.entry!.redo }),
        ]);
      } else if (work.mode === 'redo' && work.entry && inverse) {
        setRedo((stack) => stack.slice(0, -1).map(rebase));
        setUndo((stack) =>
          [...stack.map(rebase), rebase({ undo: inverse, redo: work.entry!.redo })].slice(-20),
        );
      }
      return result;
    } finally {
      inFlight.current = false;
    }
  }
  return {
    operate: execute,
    clear,
    canUndo: !!undoStack.length,
    canRedo: !!redoStack.length,
    undo: () => {
      const e = undoStack.at(-1);
      return e ? execute(e.undo, 'undo', e) : Promise.resolve(false);
    },
    redo: () => {
      const e = redoStack.at(-1);
      return e ? execute(e.redo, 'redo', e) : Promise.resolve(false);
    },
  };
}
