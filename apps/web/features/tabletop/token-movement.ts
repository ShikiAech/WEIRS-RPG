import type { MapCommand, TokenRecord } from '../../../../packages/contracts/tabletop';

type TokenMove = { id: string; version: number; x?: number; y?: number };

export function affectedTokenIds(command: MapCommand): string[] {
  if (command.tipo === 'token_atualizar' || command.tipo === 'token_excluir') return [command.id];
  if (command.tipo === 'tokens_lote') return command.itens.map((item) => item.id);
  if (command.tipo === 'tokens_duplicar') return command.tokens.map((token) => token.id);
  if (command.tipo === 'camada_transferir')
    return command.itens.filter((item) => item.tipo === 'token').map((item) => item.id);
  return [];
}

export function pendingTokenMoves(command: MapCommand): TokenMove[] {
  const updates =
    command.tipo === 'token_atualizar'
      ? [command]
      : command.tipo === 'tokens_lote'
        ? command.itens
        : [];
  return updates.flatMap((update) => {
    if (update.tipo !== 'token_atualizar') return [];
    const { x, y } = update.patch;
    if (x === undefined && y === undefined) return [];
    return [{ id: update.id, version: update.versao, x, y }];
  });
}

// A visual projection only: permissions, visibility, versions and fog stay authoritative.
export function projectTokenMoves(tokens: TokenRecord[], moves: TokenMove[]): TokenRecord[] {
  return tokens.map((token) => {
    const move = moves.find(
      (candidate) => candidate.id === token.id && candidate.version === token.versao,
    );
    if (!move) return token;
    return {
      ...token,
      ...(move.x !== undefined && Number.isFinite(move.x) ? { x: move.x } : {}),
      ...(move.y !== undefined && Number.isFinite(move.y) ? { y: move.y } : {}),
    };
  });
}
