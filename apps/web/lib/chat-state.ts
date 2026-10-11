import type { ChatCommand, ChatMessage } from '../../../packages/contracts/chat';

export function commandFromText(input: string): ChatCommand {
  const text = input.trim();
  if (!text) throw new Error('Escreva uma mensagem ou uma expressão de dados.');
  const match = /^\/(r|roll|gmroll|gr)(?:\s+(.*))?$/is.exec(text);
  if (match) {
    const expression = match[2]?.trim();
    if (!expression) throw new Error('Informe a expressão depois de /r. Exemplo: /r 1d20+5');
    if (expression.length > 120) throw new Error('A expressão pode ter até 120 caracteres.');
    return {
      tipo: 'rolagem',
      expressao: expression,
      ...(['gmroll', 'gr'].includes(match[1].toLowerCase()) ? { secreta: true } : {}),
    };
  }
  if (text.startsWith('/'))
    throw new Error(
      'Comando desconhecido. Use /r para dados ou /gmroll para rolagens secretas do mestre.',
    );
  if (text.length > 2000) throw new Error('A mensagem pode ter até 2000 caracteres.');
  return { tipo: 'texto', texto: text };
}

export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const rows = new Map(current.map((row) => [row.id, row]));
  for (const row of incoming) rows.set(row.id, row);
  return [...rows.values()].sort((a, b) => a.sequencia - b.sequencia);
}

// Só consultas completas avançam o cursor. Um evento isolado pode chegar após uma lacuna.
export async function catchUp(cursor: number, fetch: (after: number) => Promise<ChatMessage[]>) {
  let after = cursor;
  let messages: ChatMessage[] = [];
  while (true) {
    const rows = await fetch(after);
    messages = mergeMessages(messages, rows);
    if (rows.length) {
      const next = rows.at(-1)!.sequencia;
      if (next <= after) throw new Error('Histórico fora de ordem.');
      after = next;
    }
    if (rows.length < 50) return { cursor: after, messages };
  }
}
