# Implementação de chat e dados

> Execução: usar superpowers:executing-plans, pelo único desenvolvedor autorizado nesta sessão.

**Objetivo:** chat persistente por campanha, rolagens no servidor e ações das fichas.

**Arquitetura:** RPC PostgreSQL transacional com RLS, histórico ordenado e Realtime; componentes React reutilizam os estilos existentes. Sem novo serviço ou credencial.

**Stack:** Supabase/PostgreSQL, React/TypeScript, PGlite, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-chat-dados.md`.

## Restrições globais

- Oito participantes; aproveitar o plano gratuito e a infraestrutura existente.
- Interface/documentação em português brasileiro; manter dados e estilos originais.
- Único desenvolvedor; preservar mudanças locais já existentes em package.json/package-lock.json.

## Foco da revisão

- Resposta perdida: repetir o comando conserva dados e mensagem; alterar payload é conflito.
- Conta/campanha trocada: limpar histórico, erros e assinatura, impedir respostas antigas.
- Eventos fora de ordem/reconexão: buscar lacunas, deduplicar e ordenar sem perder mensagens.
- Homebrew: fórmulas limitadas, versão salva e bônus verificados no servidor.
- Espectador/visitante/campanha externa: leitura e envio obedecem permissões reais.

### Tarefa 1: banco e dados

**Arquivos:** criar `supabase/migrations/202610070002_chat.sql` e `tests/chat-database.test.ts`.

**Interface:** `public.enviar_chat(p_campanha uuid,p_pedido uuid,p_comando jsonb)` retorna `public.mensagens_chat`; `private.rolar_dados(text)` retorna JSON com expressão, termos, total e versão de regras.

- [x] Escrever testes PostgreSQL reais para gramática, limites, detalhamento, RLS, papéis, repetição, rate limit, sequência e ações/versionamento de fichas.
- [x] Executar `node --import tsx --test tests/chat-database.test.ts`; confirmar falha por ausência da migração.
- [x] Implementar migração transacional com grants mínimos, helpers privados sem EXECUTE público e publicação Realtime condicional.
- [x] Executar `npm test`; resultado esperado: toda a suíte passa.

### Tarefa 2: chat e integração

**Arquivos:** criar `packages/contracts/chat.ts`, `apps/web/lib/chat.ts`, `apps/web/lib/chat-state.ts`, `apps/web/features/Chat.tsx`, `apps/web/features/chat/Message.tsx`, `apps/web/features/sheets/SheetChat.tsx`; modificar App, Sheets, SheetForm e styles.

**Interfaces:** `createChatRepository(client)` com `history(campaign,before?)`, `since(campaign,after)`, `send(campaign,request,command)` e `subscribe(campaign,onMessage,onStatus)`; `mergeMessages` deduplica e ordena.

- [x] Escrever e executar testes RED de comando `/r`, ordenação e browser: histórico/texto/dados/XSS, retry com resultado único, mudança de campanha e conta, espectador, ação de ficha pendente/salva.
- [x] Implementar repositório real SDK e reconciliação sem avançar cursor por evento; campanha valida UUID/membro, efeitos cancelados ao desmontar.
- [x] Implementar chat responsivo e botões junto aos ataques/magias, com modo normal/vantagem/desvantagem e confirmação do servidor.
- [x] Executar `npm test`, `npm run test:browser`, `npm run build`; conferir UI desktop/móvel e resultados.

### Tarefa 3: entrega

**Arquivos:** criar `docs/configuracao-chat.md`, atualizar README e marco anterior.

- [x] Documentar execução da migração no projeto existente, publicação Realtime e teste em duas contas; não afirmar implantação remota sem evidência.
- [x] Revisar permissões, estado assíncrono, limites, UX e diff; corrigir achados importantes com testes.
- [x] Registrar verificações e commit local apenas dos arquivos desta entrega.

## Registro de execução

Desenho: RPC no banco substitui Edge Function para esta primeira fatia, mantendo cálculo e gravação atômicos sem nova infraestrutura. Consumo de recursos fica explícito para a próxima etapa.

### Evidências — 07/10/2026

- `npm test`: 18 testes passaram. PostgreSQL/PGlite verificou gramática e limites, cada dado/seleção/total, permissões, papel por campanha, propriedade, versão, recibos de ações após edição, rate limit e revogação. Texto Unicode de 2000 caracteres não é cortado por um limite de bytes menor.
- `npm run test:browser`: 34 cenários passaram em desktop e Pixel 7, incluindo os 14 anteriores. SDK real, HTTP/WebSocket simulados somente nos testes; entrega entre duas janelas, lacunas, reconexão, paginação, conta/campanha, espectador, correção de fórmula e ficha → chat.
- Revisão própria, sem outros desenvolvedores: erro de validação libera o campo para correção; revogação pela paginação também limpa o histórico; falha inicial pode recarregar a conversa; retorno de tabela da RPC é normalizado sem mensagens vazias (teste reproduziu 3 cartões em vez de 2 antes da correção).
- `npm run build`: TypeScript/Vite passaram; 773 registros importados e 86 arquivos originais idênticos por hash. Aviso de tamanho do bundle: aproximadamente 501 kB minificado / 143 kB gzip; divisão de carregamento pode ser avaliada quando as próximas áreas forem adicionadas.
- Capturas `artifacts/chat-desktop.png` e `artifacts/chat-mobile.png` conferidas visualmente. Tema existente reaproveitado, sem novos assets ou dependências de produção.
- `tsx` restaurado na versão previamente fixada, com autorização expressa do usuário; package.json/lock retornaram à configuração necessária aos comandos existentes.
- Guia de ativação criado. Migração remota, teste em duas contas reais e publicação não foram executados nesta sessão; a entrega local permanece na branch existente.
