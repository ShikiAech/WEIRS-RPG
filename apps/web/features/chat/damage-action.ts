import type { ChatCommand, ChatMessage } from '../../../../packages/contracts/chat';
import type { SheetRecord, SheetSpell } from '../../../../packages/contracts/sheets';
import { temDanoMagia } from '../../../../packages/sheets/magias.js';

export async function buildChatDamageAction(
  message: ChatMessage,
  load: (id: string) => Promise<SheetRecord>,
): Promise<Extract<ChatCommand, { tipo: 'acao' }>> {
  const origin = message.resultado?.origem;
  if (!origin || !['ataque', 'magia', 'magia_ataque'].includes(origin.acao))
    throw Error('Esta mensagem não permite rolar dano.');
  const sheet = await load(origin.ficha_id);
  if (sheet.campanha_id !== message.campanha_id || sheet.id !== origin.ficha_id)
    throw Error('Ficha indisponível nesta campanha.');
  const spell = origin.acao !== 'ataque';
  const entry = (spell ? sheet.conteudo.magias : sheet.conteudo.ataques).find(
    (e) => e.id === origin.entrada_id,
  );
  if (!entry) throw Error('A entrada foi removida da ficha salva.');
  if (spell ? !temDanoMagia(entry as SheetSpell) : !entry.dano?.trim())
    throw Error('A entrada atual não possui dano.');
  return {
    tipo: 'acao',
    ficha_id: sheet.id,
    versao: sheet.versao,
    entrada_id: entry.id,
    acao: spell ? 'magia_dano' : 'dano',
    modo: 'normal',
    ...(message.secreta ? { secreta: true } : {}),
  };
}
