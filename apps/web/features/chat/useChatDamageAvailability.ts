import { useEffect, useState } from 'react';
import type { ChatMessage } from '../../../../packages/contracts/chat';
import type { SheetRecord, SheetRepository } from '../../../../packages/contracts/sheets';
import { canRollChatDamage } from './damage-action';

export function useChatDamageAvailability(
  messages: ChatMessage[],
  repository: Pick<SheetRepository, 'get'>,
  campaign: string,
  userId: string,
  role: string,
  enabled: boolean,
) {
  const sources = new Map<string, number>();
  if (enabled && role !== 'espectador')
    for (const message of messages) {
      const origin = message.resultado?.origem;
      if (
        origin &&
        message.campanha_id === campaign &&
        (!message.secreta || role === 'mestre') &&
        ['ataque', 'magia', 'magia_ataque'].includes(origin.acao)
      )
        sources.set(origin.ficha_id, Math.max(sources.get(origin.ficha_id) || 0, origin.versao));
    }
  // Uma consulta por ficha, compartilhada pelo histórico inteiro; mensagens de texto
  // e conjurações da mesma versão não iniciam novas consultas.
  const key = JSON.stringify([campaign, userId, role, [...sources].sort()]);
  const [loaded, setLoaded] = useState<{ key: string; sheets: Map<string, SheetRecord> }>({
    key: '',
    sheets: new Map(),
  });
  useEffect(() => {
    let active = true;
    let request = 0;
    const [, , , entries] = JSON.parse(key) as [string, string, string, [string, number][]];
    async function refresh() {
      const current = ++request;
      setLoaded({ key, sheets: new Map() });
      const results = await Promise.allSettled(entries.map(([id]) => repository.get(id)));
      if (!active || current !== request) return;
      const sheets = new Map<string, SheetRecord>();
      for (const result of results)
        if (
          result.status === 'fulfilled' &&
          result.value.campanha_id === campaign &&
          (role === 'mestre' || result.value.proprietario_id === userId)
        )
          sheets.set(result.value.id, result.value);
      setLoaded({ key, sheets });
    }
    const resume = () => {
      if (document.visibilityState !== 'hidden') void refresh();
    };
    void refresh();
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      active = false;
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [key, repository, campaign, role, userId]);
  return (message: ChatMessage) =>
    loaded.key === key &&
    canRollChatDamage(message, loaded.sheets.get(message.resultado?.origem?.ficha_id || ''));
}
