# Plano de implementação: fundação do webapp

> Execução direta por Codex, único desenvolvedor, autorizada pelo usuário nesta conversa. Aplicar execução de planos e testes primeiro. Não delegar a outros agentes.

**Objetivo:** preservar o compêndio e entregar a primeira área funcional de campanhas e fichas completas em React, preparada para Supabase gratuito.

**Arquitetura:** manter as páginas originais e acrescentar `app.html`, com navegação por hash compatível com GitHub Pages. Reaproveitar o modelo aprovado da outra conversa; usar PostgreSQL com permissões por campanha e salvamento atômico por versão. Conteúdo extraído em tempo de build, sem interpretar regras de homebrew como código.

**Tecnologias:** React, TypeScript, Vite, Supabase, Cheerio, sanitize-html; testes Node, PostgreSQL/PGlite e Playwright.

**Referências:** proposta `docs/plans/2026-10-07-webapp-migration.md`; especificação anterior `C:/Users/Tony/Documents/projects/vanilla/WEIRS-RPG/docs/superpowers/specs/2026-10-07-autenticacao-e-fichas-design.md`; código anterior, somente leitura, em `C:/Users/Tony/.codex/worktrees/fichas-personagens/WEIRS-RPG`.

## Restrições

- Uso pessoal para oito pessoas; nenhuma assinatura paga ou provisionamento externo nesta entrega.
- Interface, mensagens e documentação novas em português brasileiro.
- Manter o site original, simulador, conteúdo, estilos e URLs existentes.
- Google OAuth/PKCE; nunca incluir segredo OAuth, senha ou service_role no navegador.
- Mestre pode ler/editar fichas da sua campanha; somente proprietário cria/exclui a própria ficha.
- Nome canônico fora do JSON; conteúdo versão 1, IDs estáveis, limite de 256 KiB no banco.
- Salvamento confirmado pelo banco; conflitos preservam a edição; não guardar fichas privadas automaticamente no armazenamento local.
- Não afirmar verificação de OAuth/Supabase hospedado sem configuração e execução reais.

## Foco de revisão

1. Importar integralmente textos de modais, acentos e tabelas sem scripts/eventos perigosos.
2. Sem acesso entre campanhas ou promoção de mestre por metadados/cliente.
3. Retentativas e edições simultâneas não sobrescrevem dados ou duplicam fichas.
4. Remover origens preserva magias e itens; zeros e decimais sobrevivem ao roundtrip.
5. Sem configuração, nenhum botão deve aparentar salvamento; troca de conta descarta acesso visual à ficha anterior.

## Tarefa 1 — preservar e estruturar conteúdo

- [x] Testes em `tests/content-import.test.ts`: 477 magias, 199 talentos, 61 antecedentes, 17 classes, 19 espécies, 16 sessões, 19 biografias; IDs determinísticos, texto integral e HTML seguro.
- [x] Implementar `tools/content-import/index.ts`: `importContent(root): Promise<ContentBundle>`; `ContentBundle` em `packages/contracts/content.ts` com registros, campanhas, manifesto e avisos.
- [x] CLI gera `content/generated/index.json`, detalhes por registro, campanhas, manifesto e `supabase/seed.sql`; build copia páginas/assets legados em `tools/build/copy-legacy.mjs`.
- [x] Rodar os testes antes/depois e gerar catálogo sem modificar fontes.

## Tarefa 2 — fichas e permissões

- [x] Copiar e executar testes/modelo/cálculos aprovados, registrando origem em `packages/sheets/README.md`.
- [x] Teste PostgreSQL em `tests/database.test.ts` com bootstrap de Auth: dono, outro jogador, mestre da campanha, mestre de outra campanha e anônimo; conflitos, troca de dono/campanha e criação sem convite.
- [x] Implementar migração `supabase/migrations/202610070001_foundation.sql`: perfis, campanhas, membros, fichas; RPC `salvar_ficha`; escrita direta bloqueada e papel somente administrativo.
- [x] Tipos e contratos em `packages/contracts/sheets.ts`; configuração e repositório em `apps/web/lib/`.

## Tarefa 3 — área navegável e editor completo

- [x] Testes dos limites de configuração pública e atualização de edição enquanto o save está pendente.
- [x] Montar shell, compêndio filtrável e histórico das campanhas reutilizando cores/fontes e links legados.
- [x] Editor em abas com os campos definidos na especificação anterior; listas repetíveis, perícias, multiclasse, perfis, espaços/pacto, recursos, inventário, história e ajustes.
- [x] Google login, callback, listagem/criação/edição/exclusão, cópia/exportação explícita e aviso de alterações pendentes; exigir seleção de campanha autorizada.
- [x] Sem credenciais, permitir ler o compêndio e explorar uma ficha temporária claramente identificada; persistência exige login configurado.

## Tarefa 4 — verificar e documentar

- [x] Playwright: conteúdo, ficha temporária, abas/teclado/mobile; backend de teste intercepta somente requests, nunca cria autenticação falsa no produto.
- [x] Rodar suite, typecheck e build; conferir que arquivos legados sobreviveram com hash idêntico.
- [x] Guia de configuração e evidências em português; Supabase remoto pendente se dados externos não forem fornecidos.
- [x] Revisão própria, sem subagentes conforme pedido do usuário, incluindo isolamento de campanhas e perdas de dados.

## Decisões de reconciliação

- O desenho atual aprovado de React/TypeScript substitui a entrega antiga em JavaScript puro. O domínio da ficha e seus testes são reaproveitados, sem copiar a UI incompleta.
- A permissão global de mestre do protótipo anterior vira papel por campanha. O administrador adiciona os oito usuários à campanha no banco; login Google sozinho não libera a mesa.
- Esta entrega cobre a fundação e as fichas. Chat autoritativo, uploads de campanha e mapas interativos são os próximos projetos; não expor botões que aparentem funcionalidades ainda ausentes.

## Evidências da entrega local — 07/10/2026

- `npm test`: 14 testes passaram, incluindo permissões reais em PostgreSQL/PGlite e retentativa determinística de importação.
- `npm run test:browser`: 14 cenários passaram, sete em desktop e sete em Pixel 7; respostas HTTP interceptadas somente nos testes.
- `npm run build`: TypeScript e Vite passaram; 86 arquivos legados conferidos por SHA-256 e catálogo sem arquivos órfãos.
- Build servido pelo preview: campanhas, texto completo do compêndio, simulador original, modo sem credenciais, teclado nas abas e largura de 320px verificados sem erros JavaScript.
- Capturas desktop/mobile em `artifacts/` conferidas visualmente, ignoradas pelo Git.
- Fontes da pasta anterior foram somente lidas. Modelo e cálculos reaproveitados; código novo e guia em português. Nenhum subagente ou outro desenvolvedor foi usado.
- Supabase/Google hospedados continuam pendentes de configuração externa e validação com contas reais. Código de login/CRUD, migração, seed e guia estão prontos; nenhum serviço remoto foi provisionado ou publicado.

### Cuidados resolvidos na revisão

IDs de variantes com nomes repetidos não trocam quando cartões são reordenados. Repetir uma criação após resposta perdida conserva o mesmo UUID, inclusive após navegação. JSONB normalizado não gera conflito por ordem de propriedades. Rascunhos mantêm a versão de origem; respostas atrasadas não marcam novas edições como salvas. Acesso de leitura permite navegar pelas abas. Falha ao carregar uma ficha existente não abre criação acidental. Exclusão continua restrita ao dono. Callback cancelado limpa os parâmetros e sincroniza a tela. Voltar no navegador permite cancelar a saída de uma ficha temporária. Importação JSON conserva campos, mas nunca transfere dono ou permissões.

### Próximos marcos

1. Supabase/Google configurados e funcionamento confirmado pelo usuário em 07/10/2026.
2. Chat persistente e rolagens: implementação em `2026-10-07-chat-dados.md`, ativação pelo guia `docs/configuracao-chat.md`.
3. Uploads privados com limites por arquivo/campanha, validação e cópias dos objetos.
4. Mapas, tokens vinculados aos personagens e sincronização entre mapa, ficha e chat.
