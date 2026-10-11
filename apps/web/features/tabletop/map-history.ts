import type {
  MapCommand,
  MapResponse,
  SceneRecord,
  TokenRecord,
  TokenPatch,
  ScenePatch,
} from '../../../../packages/contracts/tabletop';

export function rebaseVersions(command: MapCommand, response: MapResponse): MapCommand {
  const versions = new Map((response.tokens || []).map((t) => [t.id, t.versao]));
  if (response.token) versions.set(response.token.id, response.token.versao);
  if (command.tipo === 'token_atualizar' || command.tipo === 'token_excluir')
    return { ...command, versao: versions.get(command.id) ?? command.versao };
  if (command.tipo === 'tokens_lote')
    return {
      ...command,
      itens: command.itens.map((i) => ({ ...i, versao: versions.get(i.id) ?? i.versao })),
    };
  if (command.tipo === 'tokens_duplicar')
    return {
      ...command,
      tokens: command.tokens.map((t) => ({ ...t, versao: versions.get(t.id) ?? t.versao })),
    };
  if (command.tipo === 'cena_atualizar' && response.cena?.id === command.id)
    return { ...command, versao: response.cena.versao };
  return command;
}
export function remapTokenIds(command: MapCommand, ids: Map<string, string>): MapCommand {
  if (command.tipo === 'token_atualizar' || command.tipo === 'token_excluir')
    return { ...command, id: ids.get(command.id) || command.id };
  if (command.tipo === 'tokens_lote')
    return { ...command, itens: command.itens.map((i) => ({ ...i, id: ids.get(i.id) || i.id })) };
  if (command.tipo === 'tokens_duplicar')
    return { ...command, tokens: command.tokens.map((t) => ({ ...t, id: ids.get(t.id) || t.id })) };
  return command;
}

// Inverses keep the acknowledged version. A later edit must make undo fail rather than overwrite it.
export function inverseCommand(
  command: MapCommand,
  response: MapResponse,
  tokens: TokenRecord[],
  scene?: SceneRecord,
): MapCommand | null {
  const tokenInverse = (id: string, patch: TokenPatch, after?: TokenRecord) => {
    const before = tokens.find((t) => t.id === id);
    if (!before || !after) return null;
    const old = Object.fromEntries(
      Object.keys(patch).map((key) => [key, before[key as keyof TokenRecord]]),
    ) as TokenPatch;
    return { tipo: 'token_atualizar' as const, id, versao: after.versao, patch: old };
  };
  if (command.tipo === 'token_atualizar')
    return tokenInverse(command.id, command.patch, response.token);
  if (command.tipo === 'tokens_lote' && command.itens.every((i) => i.tipo === 'token_atualizar')) {
    const itens = command.itens.map((i) =>
      i.tipo === 'token_atualizar'
        ? tokenInverse(
            i.id,
            i.patch,
            response.tokens?.find((t) => t.id === i.id),
          )
        : null,
    );
    return itens.every((i) => i !== null)
      ? {
          tipo: 'tokens_lote',
          cena_id: command.cena_id,
          itens: itens as NonNullable<(typeof itens)[number]>[],
        }
      : null;
  }
  if (command.tipo === 'tokens_duplicar' && response.tokens?.length)
    return {
      tipo: 'tokens_lote',
      cena_id: command.cena_id,
      itens: response.tokens.map((t) => ({ tipo: 'token_excluir', id: t.id, versao: t.versao })),
    };
  if (command.tipo === 'cena_atualizar' && scene?.id === command.id && response.cena) {
    // Publication and resizing may affect other scenes/tokens, and cannot be safely inverted locally.
    if (Object.keys(command.patch).some((key) => ['publicada', 'largura', 'altura'].includes(key)))
      return null;
    const patch = Object.fromEntries(
      Object.keys(command.patch).map((key) => [key, scene[key as keyof SceneRecord]]),
    ) as ScenePatch;
    return { tipo: 'cena_atualizar', id: scene.id, versao: response.cena.versao, patch };
  }
  return null;
}
