# Criação de personagem e compêndio — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** migrar o acervo D&D/Weirs para um compêndio PostgreSQL estruturado em português e utilizá-lo na criação assistida de personagens.

**Architecture:** tabelas de domínio com revisões publicadas e relações explícitas; importação dos novos JSONs complementada pelo HTML. Um repositório compartilhado serve compêndio, seletores e assistente. A criação resolve escolhas rastreáveis e grava, atomicamente, a ficha JSONB compatível e suas relações privadas.

**Tech Stack:** React 19, TypeScript, Supabase/PostgreSQL, Node/tsx, Cheerio, PGlite e Playwright já utilizados pelo projeto. Manter as versões fixadas no repositório; não acrescentar um serviço de backend independente.

**Spec:** [Criação de personagem e compêndio D&D 5e 2024](../specs/2026-10-16-criacao-personagem-compendio-design.md).

**Source audit:** [JSONs do commit 84e6289](../../compendio-json-2026-10-16.md). Execução direta autorizada pelo pedido de continuação em 16/10/2026; progresso no ledger local deste plano.

## Global Constraints

- O PostgreSQL/Supabase será a fonte de verdade do compêndio em português brasileiro.
- Adotar um conjunto de regras explícito `dnd-5e-2024`.
- Usar os JSONs e as traduções mantidas pelo projeto como fontes de ingestão preferenciais quando disponíveis; incorporar o restante do acervo original por extração.
- A tela administrativa de CRUD fica para uma etapa futura, conforme o pedido.
- A projeção em `fichas.conteudo` continua atendendo os consumidores JSONB v1.
- Não reescrever nomes, atributos, moedas ou inventários antigos.
- Ações repetidas não duplicam talento, equipamento, moeda, recurso ou magia.
- A edição de fichas salvas continua no editor atual; esta etapa não cria um fluxo de reconstrução de fichas em jogo.
- Recompilar o frontend não poderá sobrescrever o banco ou desfazer cadastros futuros.
- Nenhuma execução deste plano publica automaticamente o frontend ou aplica migrações no projeto hospedado.

## Review Focus

1. Neflins e variantes do legado ausentes nos novos JSONs: permanecer no catálogo, com fonte e identidade preservadas — testes da tarefa 2.
2. Traduções diferentes e mecânicas diferentes com nomes semelhantes: aliases não podem fundir variantes — testes das tarefas 2–3.
3. Referência inexistente, incluindo Mancha Espiritual/Espírito Manchado, e escolhas por categoria: não conceder benefícios por aproximação de nome — testes das tarefas 3 e 6.
4. Tamanho, voo e deslocamento condicionais, incluindo forma natural/exotraje: normalizar unidades sem acumular alternativas — testes das tarefas 3 e 7.
5. Catálogo indisponível/desatualizado durante a criação: preservar escolhas e impedir gravação parcial ou fallback silencioso — testes das tarefas 5, 8 e 10.

## Organização e dependências

| Unidade | Arquivos e responsabilidade |
| --- | --- |
| Contratos | `packages/contracts/compendium.ts`, `packages/contracts/character-creation.ts`: DTOs tipados, referências, escolhas, projeção e erros. |
| Ingestão | `tools/compendium-import/{json,legacy,identity,normalize,resolve,validate,sql,cli}.ts`: fontes → entidades → relatório/carga. |
| Curadoria | `content/compendium/{sources,identities,aliases,requirements,effects,progressions,spell-lists}.json`: decisões editoriais explícitas e complementos mecânicos tipados. |
| Banco | Migrações `202610160011_compendio.sql` e `202610160012_criacao_personagem.sql`; carga `supabase/compendium-seed.sql`. |
| Consultas | `apps/web/lib/compendium.ts`: consultas, paginação e detalhes; `tools/compendium-import/snapshot.ts`: exportação explícita de catálogo publicado. |
| Resolução | `packages/character-creation/{abilities,requirements,concessions,hit-points,defenses,spellcasting,project,resolve}.ts`: prévia determinística sem efeitos de interface. |
| Assistente | `apps/web/features/character-creation/`: estado, resumo, sete etapas e finalização. |
| Compatibilidade | Contratos/modelo da ficha, repositório, importação/exportação, seletor de magias e Compendium existentes. |

Sequência: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11. Cada tarefa produz uma unidade verificável. `npm test` continuará encontrando os testes novos em `tests/*.test.ts`.

## Tarefa 1 — Estrutura relacional, contratos e políticas

**Files:** criar `packages/contracts/compendium.ts`, `packages/contracts/character-creation.ts`, `supabase/migrations/202610160011_compendio.sql`, `tests/compendium-database.test.ts` e `tests/sql/compendium-fixture.ts`.

**Interfaces:**

- `CompendiumRef = { recordId: string; revisionId: string }`.
- `CompendiumSummary`: referência, tipo, nome PT/original, fonte, conjunto de regras, estado editorial e cobertura de criação.
- `CompendiumQuery`: tipo, `ruleSetId`, busca, fonte/pai/classe opcionais, nível/círculo opcionais, cursor e limite.
- `CompendiumPage = { entries: CompendiumSummary[]; nextCursor: string | null }`.
- `CreationDraft`: ID do rascunho, versão do motor, conjunto de regras, atributos/conjuntos/distribuição, espécie/linhagem/antecedente, classes, ordem dos níveis, escolhas e resultados de PV. Cada instância de classe/concessão tem UUID próprio.
- `CreationCatalog`: subgrafo tipado de revisões publicadas necessário às seleções do rascunho, incluindo progressões, grupos/opções, efeitos e referências.
- `CreationPreview`: pendências estruturadas, parcelas derivadas e projeção `SheetContent | null`.
- `CreationSnapshot`: escolhas/rolagens/revisões e versão do motor exportáveis. Não inclui autorização ou papel do usuário.

- [x] Preparar a base `84e62891dc37802b69adbf82920259d0c66036fc`, preservar os documentos e usar a branch dedicada `codex/criacao-personagem-compendio`. A criação de worktree adicional depende de preferência do usuário; a execução atual usa o checkout existente.
- [x] Conferir instruções locais e executar baseline `npm test` e `npm run build` antes de alterações de produto.
- [x] Escrever testes SQL que recusem uma linhagem de espécie inexistente, uma entidade de tipo incompatível, níveis fora de 1–20, revisão publicada incompleta e alteração de revisão publicada. Exigir leitura anônima somente de registros publicados, escrita global bloqueada a jogador/mestre e permitida a admin autorizado.
- [x] Executar `node --import tsx --test tests/compendium-database.test.ts`; confirmar falha pela ausência da migração/contratos.
- [x] Implementar os domínios e relações da seção 5 da spec. Usar FK de revisão nas entidades e ligações; `compendio_registros` conserva identidade e aponta a revisão corrente. Requisitos/grupos/opções/concessões têm referências verificáveis, sem pares tipo/ID soltos sem integridade.
- [x] Definir entidades numéricas de progressão, efeitos e conjuração. Fórmulas/condições JSON têm gramática validada e lista de operações suportadas, nunca código executável. Criar função SQL de normalização de busca PT/original, índices e visões de revisões publicadas.
- [x] Reutilizar `private.eh_admin()` e a autoridade existente. Funções privilegiadas fixam `search_path`, revogam acesso implícito e verificam o papel. Os dados publicados não devem expor rascunhos editoriais por joins.
- [x] Reexecutar o teste; confirmar casos positivos e negativos. Commit da unidade: `feat: add relational compendium schema and contracts`.

## Tarefa 2 — Ingestão JSON/HTML e identidade estável

**Files:** criar `tools/compendium-import/{json,legacy,identity,normalize}.ts`, `content/compendium/{sources,identities,aliases}.json`, `tests/compendium-import.test.ts`; ler os três `data/*.json`; reaproveitar utilitários de `tools/content-import/index.ts` sem mudar os IDs legados.

**Consumes:** contratos da tarefa 1 e arquivos de fonte atualizados.

**Produces:** `readJsonSources(root: string): Promise<ImportedSource[]>`, `readLegacySources(root: string): Promise<ImportedSource[]>` e `normalizeSources(sources: ImportedSource[], registry: IdentityRegistry): ImportedCatalog`. `ImportedCatalog` contém coleções tipadas por domínio e `issues`, não apenas HTML/metadados genéricos.

- [ ] Conferir o baseline e o ledger da preparação na tarefa 1; não repetir a instalação/testes sem mudança que a justifique. A base remota inclui a integração da branch local e alterações em CSS/antecedentes; não descartar essas alterações.
- [ ] Escrever testes com os arquivos reais: contagens 71/204/30, Elfos/Meio-Elfo e Humanos/Manchados/Marcados relacionados; Neflins também presente após complemento HTML; ausência dos modelos `teste*.html`; mudança de tradução mantendo ID via registro de identidade. Não usar igualdade de nome PT como único identificador.
- [ ] Executar `node --import tsx --test tests/compendium-import.test.ts`; confirmar falha pela ausência da ingestão.
- [ ] Implementar leitores de JSON e extratores de elementos internos das páginas. Para datasets de equipamentos embutidos, usar análise sintática de literais; não executar os scripts das páginas. Conservar nome/caminho original, hash, commit e localização de cada elemento.
- [ ] Emitir problemas por fonte e ponteiro com códigos `INVALID_SOURCE`, `UNRESOLVED_REFERENCE`, `AMBIGUOUS_IDENTITY`, `UNSUPPORTED_MECHANIC` e `INCOMPLETE_RULESET`; severidade `error` ou `warning`. Identidade publicada nunca depende do hash da descrição.
- [ ] Reexecutar testes e conferir que os JSONs de entrada e arquivos legados não foram reescritos. Commit: `feat: import compendium JSON and legacy sources`.

## Tarefa 3 — Curadoria e resolução das mecânicas

**Files:** criar `tools/compendium-import/{resolve,validate}.ts`, `content/compendium/{requirements,effects,progressions,spell-lists}.json`, `tests/compendium-rules.test.ts`; atualizar aliases/fontes quando a revisão justificar.

**Consumes:** `ImportedCatalog` da tarefa 2.

**Produces:** `resolveCatalog(input: ImportedCatalog, curation: CompendiumCuration): ResolvedCatalog` e `validateCatalog(catalog: ResolvedCatalog): ImportIssue[]`. `ResolvedCatalog` tem vínculos por UUID/revisão; a cobertura por fonte acompanha o resultado.

- [ ] Testar requisito `Nível 4+, Força ou Destreza 13+` como nível E (Força OU Destreza); equipamento do Acólito com quantidade 10 de pergaminho e 8 PO versus 50 PO; Iniciado em Magia/Clérigo como talento mais escolha; categoria Dom Sombrio/Presente Sombrio por alias editorial explícito.
- [ ] Testar que Mancha Espiritual não é vinculada por aproximação a Espírito Manchado; sem decisão editorial, gerar `UNRESOLVED_REFERENCE` e impedir publicação da concessão incompleta. Testar também que variantes de Luta Cega não são fundidas apenas pelo nome.
- [ ] Testar distâncias de jogo: 30 pés ↔ 9 metros; conservar valor/unidade originais. Separar voo/terrestre e condições de forma natural/exotraje. Carapaça Óssea dos Cranoris deve produzir a fórmula alternativa `13 + mod(con)`, sem armadura, com escudo permitido.
- [ ] Executar `node --import tsx --test tests/compendium-rules.test.ts`; confirmar falhas relevantes.
- [ ] Implementar os mapeamentos tipados e o glossário. Completar classes/subclasses, progressões 1–20, listas/magias, equipamentos, idiomas e referências de criaturas pelo restante do acervo. Conferir as regras do núcleo com a referência primária e conservar adaptações de Weirs identificadas.
- [ ] Registrar cobertura separada de texto importado, relações conferidas, revisão 2024 e automação. Não publicar um perfil de criação que dependa de uma mecânica/referência obrigatória incompleta. Problemas editoriais que dependam do autor vão à lista de pendências com candidatos e trecho de origem; não inventar equivalências.
- [ ] Reexecutar testes, inspecionar o relatório por domínio e commit: `feat: resolve compendium mechanics and provenance`.

## Tarefa 4 — Carga reproduzível e relatório de migração

**Files:** criar `tools/compendium-import/{sql,cli}.ts`, `supabase/compendium-seed.sql`, `tests/compendium-seed.test.ts`; atualizar `package.json` e `docs/compendio-json-2026-10-16.md` com a cobertura efetivamente obtida.

**Consumes:** `ResolvedCatalog` validado.

**Produces:** `generateSeed(catalog: ResolvedCatalog): string`; comandos `npm run compendium:check` e `npm run compendium:seed`. O primeiro valida e relata; o segundo gera SQL local e não se conecta ao banco hospedado.

- [ ] Testar carga seguida de recarga sem duplicar entidades; descrição com aspas/newlines preservada; nenhuma referência pendente em registros publicados; edição posterior de uma revisão de rascunho não sobrescrita pela reimportação. Conflito de hash esperado deve abortar a alteração daquela unidade em transação.
- [ ] Executar `node --import tsx --test tests/compendium-seed.test.ts`; confirmar falhas.
- [ ] Gerar carga em ordem de dependências, com vínculo às fontes e relatório por elemento. Publicar apenas revisões completas, mantendo pendências explícitas. Reexecução não desfaz manutenção posterior do catálogo.
- [ ] Acrescentar os comandos sem ligá-los ao `predev` ou `build`. O importador legado pode continuar produzindo os arquivos de compatibilidade; nenhum comando de build aplica escrita remota.
- [ ] Executar os dois comandos e teste SQL em PGlite, inclusive duas aplicações da carga. Comparar cobertura com as fontes e corrigir ausências estruturais antes de marcar a migração completa. Commit: `feat: add versioned compendium seed and coverage report`.

## Tarefa 5 — Repositório de compêndio e consumidores existentes

**Files:** criar `apps/web/lib/compendium.ts`, `tools/compendium-import/snapshot.ts`, `tests/compendium-repository.test.ts`, `tests/browser/compendium.spec.ts`; modificar `Compendium.tsx`, `Sheets.tsx`, `SpellPicker.tsx`, `SpellEditor.tsx` e os consumidores de catálogo em `SessionPanel.tsx`/`SheetPlay.tsx` encontrados pela busca.

**Produces:** `createCompendiumRepository(client: SupabaseClient): CompendiumRepository`, com `list(query, signal?)`, `get(ref, signal?)` e `getCreationCatalog(draft, signal?)`. A consulta de criação retorna apenas revisões publicadas e dependências transitivas das seleções; `get` conserva a revisão solicitada por fichas existentes.

- [ ] Testar paginação sem registros repetidos, busca PT/original sem acentos, filtro de classe/círculo/fonte, cancelamento de busca anterior e ausência de rascunhos. Uma ficha com ID legado resolve o registro/revisão correto. Falha não retorna catálogo estático como se fosse atual.
- [ ] Executar `node --import tsx --test tests/compendium-repository.test.ts`; confirmar falhas.
- [ ] Implementar consultas parametrizadas às tabelas/visões e adapter temporário para consumidores que ainda usam `ContentSummary`. Remover interpretação de HTML para obter dados mecânicos de magia; os campos vêm de suas entidades.
- [ ] Atualizar a página Compêndio e os seletores para o mesmo repositório. Paginar listas; buscar descrições completas sob demanda. A demonstração sem banco usa snapshot explicitamente exportado do modelo publicado e identificado na interface. Snapshot não é fallback para falha de um banco configurado.
- [ ] Tratar presença de magia por identidade, perfil e origem, permitindo a mesma magia obtida por fontes diferentes. Preservar magias manuais e referências antigas.
- [ ] Rodar o teste unitário e `npx playwright test tests/browser/compendium.spec.ts tests/browser/spell-content.spec.ts --workers=1`. Conferir busca/erro/retentativa e navegação do diálogo. Commit: `feat: query database compendium across the app`.

## Tarefa 6 — Atributos, requisitos e concessões rastreáveis

**Files:** criar `packages/character-creation/{abilities,requirements,concessions,project,resolve}.ts` e `tests/character-creation.test.ts`; ampliar os contratos da tarefa 1 e os tipos opcionais em `packages/contracts/sheets.ts`.

**Produces:** `resolveCreation(catalog: CreationCatalog, draft: CreationDraft): CreationPreview`. A resolução é pura; não rola dados, acessa rede ou grava fichas. Produz IDs de instância preservados no rascunho e procedência para cada benefício.

- [ ] Testar dois conjuntos selecionáveis sem preferência automática; valores repetidos distribuídos por índices diferentes; reutilização de um índice recusada; campos externos vazios não equivalem a zero. Exatamente dois conjuntos por rascunho no modo Weirs.
- [ ] Testar bônus +2/+1 ou +1/+1/+1 entre atributos permitidos, limite de regra, escolhas pendentes e elegibilidade no nível de aquisição. Trocar antecedente remove apenas suas concessões; resolver duas vezes não duplica itens, moedas, proficiências ou talentos.
- [ ] Testar uma magia concedida por duas fontes com perfis/usos separados; referência Mancha Espiritual não resolvida aparece como pendência e não é aplicada. Característica sem automação conserva descrição e estado de cobertura.
- [ ] Executar `node --import tsx --test tests/character-creation.test.ts`; confirmar falhas.
- [ ] Implementar leitura de grupos/opções e condições tipadas. Projetar valores base e parcelas separadas; não inferir benefícios pelo nome ou por regex de descrição durante o uso. Manter entradas manuais separadas das geradas.
- [ ] Reexecutar o teste e commit: `feat: resolve character creation choices and grants`.

## Tarefa 7 — Progressão, PV, CA e conjuração multiclasse

**Files:** criar `packages/character-creation/{hit-points,defenses,spellcasting}.ts`, `tests/character-progression.test.ts`; ampliar `resolve.ts` e a projeção da tarefa 6.

**Produces:** `resolveHitPoints(catalog, draft): HitPointBreakdown`, `resolveDefenses(catalog, draft): DefenseBreakdown` e `resolveSpellcasting(catalog, draft): SpellcastingBreakdown`; tipos definidos em `character-creation.ts`. Os resultados carregam fórmulas, revisões de origem e escolhas pendentes.

- [ ] Testar primeiro nível total com máximo do dado, novo nível em outra classe com ganho posterior ao primeiro, mistura de d6/d8/d10/d12 e mínimo 1 por nível posterior. Alterar Constituição recalcula sem trocar os resultados armazenados.
- [ ] Testar nível total e marcos específicos de cada classe, requisitos de multiclasse, proficiências iniciais versus de entrada e subclasse vinculada à classe. CA dos Cranoris sem armadura e com escudo usa uma fórmula, sem somar outra defesa alternativa. Modos de movimento incompatíveis não acumulam.
- [ ] Testar classe única com sua própria tabela; Conjuração de uma só fonte com outra classe não conjuradora; soma de conjuradores completos; metades arredondadas para cima para paladino/patrulheiro; terços arredondados para baixo para subclasses pertinentes; pacto fora da soma normal. Patrulheiro 4/Feiticeiro 3 resulta em espaços 4/3/2, sem liberar magias de círculo 3.
- [ ] Testar personagem sem classe conjuradora com magia racial/talento, seleção de atributo apenas entre os permitidos e usos próprios. Atributos/perfis continuam separados por origem.
- [ ] Executar `node --import tsx --test tests/character-progression.test.ts`; confirmar falhas. Implementar as funções a partir de progressões/efeitos do banco, incluindo a distinção entre espaços disponíveis e magias elegíveis.
- [ ] Reexecutar os testes das tarefas 6–7 e commit: `feat: calculate character progression and multiclass casting`.

## Tarefa 8 — Criação transacional e compatibilidade dos arquivos

**Files:** criar `supabase/migrations/202610160012_criacao_personagem.sql`, `tests/character-creation-database.test.ts`; modificar `packages/contracts/sheets.ts`, `packages/sheets/modelo.js`, `apps/web/lib/{repository,errors,sheet-file}.ts` e testes de arquivo/estado existentes.

**Produces:** RPC `public.criar_personagem(p_campanha uuid, p_pedido uuid, p_nome text, p_criacao jsonb)`, retornando `public.fichas`; repositório `createFromChoices(campaignId: string, name: string, draft: CreationDraft, requestId: string): Promise<SheetRecord>`. Resolver SQL privado valida/recalcula os valores essenciais contra as tabelas, sem confiar na prévia enviada pelo navegador.

- [ ] Testar permissão por campanha, FK das revisões, vínculos classe/subclasse, escolhas impossíveis, rolagens fora das faixas e alteração de fonte após prévia. Falha reverte ficha e relações; reenvio com o mesmo pedido devolve a ficha original; pedido repetido com dados diferentes é conflito.
- [ ] Testar equivalência semântica da projeção PostgreSQL/TypeScript para os casos das tarefas 6–7. Comparar atributos, PV, CA, movimentos, proficiências, equipamentos, moedas, recursos, perfis e espaços; IDs novos do servidor podem ser comparados pelo vínculo de procedência.
- [ ] Executar `node --import tsx --test tests/character-creation-database.test.ts`; confirmar falhas. Implementar as relações privadas da seção 9 da spec, RLS vinculada à ficha e idempotência seguindo o padrão dos recibos existentes.
- [ ] Acrescentar snapshot opcional de criação ao formato v1 com validação explícita nos dois lados. Manter limites existentes de ficha e rejeitar excesso antes de gravar, sem truncamento silencioso. Exportar/importar conserva snapshot e revisões; revisão indisponível preserva a ficha manual e informa a indisponibilidade da automação.
- [ ] Testar JSON v1 antigo e novo, Roll20, fontes ausentes, logout e isolamento entre contas. Cópia para campanha mantém o snapshot e copia relações somente com a autoridade já existente, sem trazer dados privados de outro usuário.
- [ ] Rodar testes de criação e `tests/sheet-file.test.ts`, `tests/roll20-pdf.test.ts`, `tests/campaign-access.test.ts`. Commit: `feat: persist character creation atomically`.

## Tarefa 9 — Assistente e revisão antes de criar

**Files:** criar `apps/web/features/character-creation/{CharacterCreator,useCreationDraft,CreationSummary,AbilityStep,SpeciesStep,BackgroundStep,ClassStep,HitPointStep,SpellStep,ReviewStep}.tsx` (hook em `.ts`), `apps/web/styles/character-creation.css` e `tests/browser/character-creation.spec.ts`; modificar `Sheets.tsx`, `styles.css` e helpers HTTP de testes pertinentes.

**Consumes:** repositórios das tarefas 5/8 e resolução das tarefas 6–7.

**Produces:** `CharacterCreator({ user, repository, compendium, initialCampaign })`. `#/fichas/nova` abre o assistente; **Preencher manualmente** usa `#/fichas/nova?modo=manual`. `#/fichas/teste` preserva o editor temporário atual e oferece entrada explícita na demonstração do assistente.

- [ ] Escrever fluxo Playwright com atributos, espécie/linhagem, antecedente, kit, classe/nível, escolhas, PV, magias e revisão; confirmar que a ficha resultante abre no editor existente. Testar duas resoluções iguais sem duplicação e troca de origem com limpeza apenas das escolhas dependentes.
- [ ] Executar `npx playwright test tests/browser/character-creation.spec.ts --workers=1`; confirmar falhas por fluxo ausente.
- [ ] Implementar sete etapas com resumo persistente e fórmulas/origens consultáveis. Gerar aleatoriedade apenas em ações explícitas e guardar todos os resultados no rascunho. Não rerrolar em renderização, navegação ou alteração de Constituição.
- [ ] Mostrar grupos de escolhas do banco e listas dependentes; manter o rascunho em memória por conta/campanha, limpar no logout e permitir a navegação entre etapas. Impedir finalização com dependências carregando, pendências obrigatórias ou prévia divergente do catálogo.
- [ ] Finalizar pela RPC com um ID de tentativa preservado até confirmação. Rejeição mantém o preenchimento e mostra a causa; sucesso usa o registro devolvido pelo banco e abre a ficha.
- [ ] Reexecutar Playwright e commit: `feat: add guided character creation`.

## Tarefa 10 — Integração na mesa e resiliência de interface

**Files:** modificar consumidores em `features/sheets/` e `features/session/`, testes de navegador existentes e `tests/browser/character-creation.spec.ts`; registrar evidências em `artifacts/character-creation/`.

**Consumes:** projeção v1 da tarefa 8. Nenhuma regra nova de combate deve ser inferida ou aplicada pelo chat.

- [ ] Testar a ficha recém-criada na sessão: mesmos inventário, ataques, recursos, perfis e espaços; gastos/descansos existentes continuam operando; edição manual não reaplica o assistente. Testar copiar para outra campanha e exportar/importar.
- [ ] Testar perda de rede antes/depois do envio, confirmação perdida, clique repetido, catálogo desatualizado e ausência da migração. Preservar o rascunho, permitir retentativa idempotente e nunca mostrar sucesso sem resposta confirmada.
- [ ] Implementar os ajustes de consumo e mensagens públicas; tratar distintamente consulta indisponível, atualização de catálogo e escolha inválida. Não expor erros SQL ou credenciais.
- [ ] Conferir desktop/celular, navegação por teclado, foco, labels, mensagens e resumo sem overflow. Usar os mecanismos de teste/inspeção de navegador permitidos e salvar capturas finais das etapas representativas.
- [ ] Rodar `npx playwright test tests/browser/character-creation.spec.ts tests/browser/compendium.spec.ts tests/browser/persistence.spec.ts tests/browser/session.spec.ts tests/browser/sheet-improvements.spec.ts tests/browser/roll20-pdf.spec.ts --workers=1`. Commit: `fix: integrate generated sheets with existing play flows`.

## Tarefa 11 — Verificação final, cobertura e instruções de ativação

**Files:** criar `docs/criacao-personagem.md` e `docs/compendio-banco.md`; atualizar `README.md`, `docs/configuracao-supabase.md`, relatório de cobertura e checkboxes deste plano.

- [ ] Documentar os domínios realmente carregados, contagens consolidadas, fontes/edições, aliases, pendências editoriais e cobertura de criação. Não declarar completude de campos/regras sem dados e verificações correspondentes.
- [ ] Descrever a ordem: migrações existentes até 010 → 011 → carga do compêndio → 012 → conferência de cobertura/publicação. Incluir migração ausente, backup e retentativa, sem afirmar que o ambiente remoto já foi atualizado.
- [ ] Rodar `npm run compendium:check`, `npm test`, `npm run build` e `npm run test:browser`. Confirmar os resultados e a integridade dos arquivos legados na base atualizada. Corrigir falhas da mudança e repetir somente as verificações justificadas pelas correções.
- [ ] Fazer revisão final de integridade, segurança e fluxos com a skill de revisão aplicável; resolver achados acionáveis antes de concluir. Conferir diff e ausência de segredos/artefatos temporários.
- [ ] Usar `superpowers:verification-before-completion` e `superpowers:finishing-a-development-branch`. Informar exatamente o que foi implementado/testado e quais operações remotas não foram executadas; entregar migrações/carga prontas para ativação. Commit final de documentação: `docs: describe database compendium and character creation`.

## Revisão do plano

- Cobertura da spec: domínios e segurança (1); fontes e identidade (2); mecânicas/pendências (3); carga (4); consultas (5); escolhas/atributos (6); progressão/PV/CA/conjuração (7); persistência/compatibilidade (8); fluxo (9); mesa/resiliência/acessibilidade (10); verificação/ativação (11).
- Pontos da auditoria: os três JSONs são reaproveitados, sem substituir Neflins ou variantes do legado; referências não resolvidas bloqueiam a concessão afetada; o SRD confere regras do núcleo, enquanto o acervo de Weirs permanece identificado.
- Método recomendado: execução direta nesta conversa, porque importação, contratos, projeção e persistência dependem fortemente dos mesmos vínculos. A escolha e a revisão do plano precedem a implementação.
