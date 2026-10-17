# Progresso — auditoria autônoma de criação de fichas

Plano: `docs/superpowers/plans/2026-10-17-auditoria-ux-fichas.md`

## Decisões iniciais

- Execução: três rodadas de dez avaliações por agentes distintos, em lotes de até três auxiliares devido ao limite do ambiente.
- As fontes homebrew do repositório prevalecem para as adaptações WEIRS; regras oficiais servem como referência para fundamentos e lacunas, não para substituir conteúdo customizado.
- O navegador integrado não alcançou o servidor local nesta sessão; usar Chromium instalado com Playwright e contextos isolados.
- Código está congelado durante cada rodada de auditoria. Correções entram após a triagem do PO.
- A edição de nível já permite vazio, mostra obrigatório e bloqueia conclusão; baseline validado: 178 testes, 20 testes de criação no navegador e build aprovados.

## Matriz de execução

| Rodada | Agentes concluídos | Triagem | Correções/verificação |
| --- | --- | --- | --- |
| 1 | 10/10 | Concluída | 218 testes + typecheck; 34 browser + 2 retomados |
| 2 | 10/10 | Concluída | 246 testes;38 browser;build/typecheck; revisões aprovadas |
| 3 | 10/10 | Concluída | 302 testes;76 browser;build;SQL;revisões aprovadas |

## Achados e decisões do PO

Serão registrados com ID, impacto, reprodução, decisão, teste e status.

### Evidência preliminar da rodada 1

- R1-A03: Patrulheiro não tem magias listadas nos níveis 1/3/5; agente rastreou token legado guardião sem alias. Pendente de triagem após conclusão dos dez agentes.
- O helper de auditoria passou a aceitar nomes curtos e nomes numerados das etapas; correção apenas do harness.
- Preflight de contexto Product Design executado: não há referências salvas; usado repositório e solicitação atual.

### Rodada 1 — primeiro lote concluído (3/10)

- a01: Mago/Clérigo 1/3/5, filtros negativos e preparação. Achados: orientação/cotas do grimório; rótulo de conhecidas não aplicável. Demais progressões e filtros testados passaram.
- a02: Bruxo/Bardo/Feiticeiro 1/3/5 e pacto em multiclasse. Achados: invocações, metamagias e perícias/instrumentos/especializações do Bardo sem escolhas; rótulo de conhecidas duplicado do a01.
- a03: Paladino/Patrulheiro/Artífice e terços conjuradores. Achados: lista do Patrulheiro vazia; alternativas conjuradoras de estilo ausentes; filtro inicial de truques vazio para quem não os escolhe.
- Candidatos aguardam decisão do PO após os dez relatórios. Nenhum código de produto alterado durante a rodada.

### Rodada 1 — segundo lote e multiclasse (8/10)

- a04 concluiu quatro fichas marciais: confirmou escolhas omitidas e maestrias incompatíveis na ficha resultante.
- a05 conferiu todas as 18 linhagens; encontrou variante opcional forçada e escolhas raciais/perfis ausentes.
- a06 reproduziu omissões de magia racial, configurações de Kinect/N0-V4, formas, sentidos e movimentos secundários.
- a07 concluiu Criminoso 2024 e isolou bloqueio dos três antecedentes com talento por categoria.
- a08 confirmou limites de multiclasse/Pacto e pré-requisitos; Iniciado sem lista oferece magias erradas que o motor depois rejeita.
- Backlog consolidado e decisões preliminares no report.md. a09/a10 ainda em execução.

### Plano de integração das correções

| Tarefa | Arquivos/interfaces compartilhadas | Decisão |
| --- | --- | --- |
| Escolhas de classe | Novo módulo de importação; contexto comum de factories | Módulo próprio; coordenador integra uma chamada no resolver |
| Raças e formas | Novo módulo de importação; contratos/defesas/PV/projeção | Importador racial separado; coordenador reserva mecânicas do motor |
| UX de magias | SpellStep e testes de navegador exclusivos | Sem sobreposição com importação |
| Integração | resolve.ts, concessões, escolhas dinâmicas, nível | Coordenador mantém controle dos arquivos centrais |
| Todas | Catálogo gerado/seed/identidades | Gerar somente após integrar os módulos, sem processos concorrentes |

Ruling: manter o checkout atual — ele contém as correções anteriores solicitadas pelo usuário, ainda sem commit; trocar de worktree separaria código e evidência já em uso. Nenhum commit, push ou publicação do frontend foi solicitado. A autorização explícita para atualizar Supabase permanece válida.

Ruling: tratar ausência de escolhas permanentes como defeito mesmo quando a característica tem marca manual — a marca preserva texto/proveniência, mas não permite ao usuário registrar a decisão necessária para uma ficha completa.

### Integração PO 1

- a09 reproduziu perda de subclasse/PV ao digitar3→12; regressão falhou antes, depois passou em desktop/mobile com aplicação ao sair do campo.
- a10 concluiu/exportou Druida1/Fadas/Soldado; aceitos Ordem, Druídico, Herbalismo, aliases tipados do kit e objeto vinculado ao jogo escolhido.
- Classes:14 regressões verdes; revisão independente encontrou perícia adicional repetível, encaminhada para correção e regressão de motor.
- Espécies:11 regressões verdes; integração com concessões/projeção e vida/defesas existente:25 testes verdes.
- Motor: especialização sem treino, duplicata de especialização e requisito de característica tiveram RED observado; três passaram após correção. Magia por grupo e união de listas tiveram RED observado; integração posterior passou.
- Catálogo ainda não regenerado durante edição dos módulos; próxima rodada só inicia após gerar e validar o conjunto.

Ruling: corrigir quatro mínimos contraditórios das invocações Mente Mística e Pactos. A página local exigia uma invocação no1, mas não oferecia nenhuma elegível. Basic Rules2024 oficial confirma essas quatro sem mínimo (https://www.dndbeyond.com/sources/dnd/br-2024/character-classes); só seus pré-requisitos foram ajustados na fonte local.

### Fechamento PO1 / início R2

- Catálogo regenerado: errors0, 318grupos,29perfis,1196grants,1158requisitos. SQL gerado local, ainda não aplicado remotamente.
- Suíte final R1:218/218pass (unit-integration-final.log), typecheckexit0. Browser integrado:34/36pass na primeira execução;2falharam esperando catálogo grande sob carga; teste passou a aguardar status de atualização e os2retomados passaram. Sem aumento arbitrário de timeout da asserção de opções.
- Duasfixtures foram atualizadas para a regra intencional: atributo inato obrigatório em Oni/Gélido e escalada naturalN0. Testes antigos de subclasse agora confirmam nível comTab.
- Revisão integraçãoR1: P2truquesTomo não satisfaziam requisitos; P2escolha física prévia sobrepunha vínculo dekit. Regressões RED2/2 observadas, correções e suíte218verdes. ColisãoTomo jápreparada tem erro e aviso local; herança obrigatória prevalece sobre escolha física antiga.
- Rodada2 iniciada: agentesnovos ux_r2_01,ux_r2_02,ux_r2_03. Brief comum artifacts/ux-swarm/round-2.md. Despachar04–10 conforme slots, depoistriagemPO2. Nenhum produto deve mudar enquanto os dez auditam.
- Achado do coordenador para PO2: catalogTables/decodeCatalog descartam novos campos opcionais formRules/formEffects/spellPrerequisite/skillBonuses. FonteSQL é relacional, não payloadJSON, contrariando hipótese inicial do implementador. Repro artefato metadata-roundtrip.mts/log. Necessário persistir/hidratar esses campos, com migração local+MCP e teste de equivalência banco/snapshot ANTESdeployfinal. Ainda não alterarproduto duranteR2.
- Supabase Weirs wmfusotfddhgvjwgobtg, edge criar-personagem ACTIVEversion1 listado read-only. Atualização final precisa bundle daengine nova, além dados, para mantervalidação canônica. Frontend ainda sempublicação.

### Rodada2 — primeiro lote concluído (3/10)

- a01: fichaClérigo1Taumaturgo completa,4truques distintos/4preparadas eSAB+2 nasperícias corretos; livroMago6/4passou. P2EruditoMago2/3semexpertise1 eP2truqueextra permite duplicarLuzdoperfilbase.
- a02: fichaBruxo3/Tomo completa,3truques+2rituais/CAR,2espaçosPacto2º corretos; truqueTomo reconhecido paraRajadaAgonizante. Bardo2instrumentos3/expertise2 eFeiticeiro2metamagia2passaram. P2invocaçãoRajadaAgonizante não permite registrar QUALtruque recebe benefício.
- a03: fichaPaladino2Abençoado completa,2truquesClérigo/CARcorretos; Patrulheiro1/3/5lista/cotas/espaços eEstiloDruídico/SABpassaram. P2magiasfixas declasses não são concedidas (GolpeDivino/MarcaCaçador). Artífice nãoavaliado nesteagente.
- a04/a05/a06 ativos. a07–a10 ainda não despachados. Não repetir agentes já concluídos. Relatórios em artifacts/ux-swarm/r2/aNN/report.md.

### Produção / implantação coordenada

- Read-only MCP confirmou colunas atuais de compendio_especies/caracteristicas sem novos metadados. Repro metadata-roundtrip.log mostra campos antes e ausência apósdecode.
- Backup edgeversion1 salvo em artifacts/ux-swarm/remote-before/criar-personagem/index.ts e _shared/creation-engine.js. Cache functions store ux-remote-edge-before/ux-remote-schema-before se disponível. Sem segredos em arquivos; runtime usa env.
- Não publicar catálogo com novas mecânicas enquanto frontend antigo/edgeantiga não puderem interpretá-las: esperadoSheet diverge e pode bloquear criações. Migração aditiva/staging de rascunhos pode ser feita antes, mas publicação ativa deve ser coordenada. Supabase direto foi autorizado; publicação do frontend ainda não foi solicitada expressamente. Concluir30avaliações/código/testes e preparar pacote concreto antes de qualquer pedido final necessário sobre publicação.

### Fechamento R2 / plano PO2

- Dez avaliações concluídas, sem alterações de produto durante a rodada. Relatórios r2/a01–a10.
- Aceitos P1: talentos Humano/Meio-Elfo vazios; três antecedentes especiais bloqueados por requisitos incompletos; Druídico impede ficha de Druida. P2: Erudito do Mago, truque extra duplicado, alvo permanente de invocações, magias fixas Paladino/Patrulheiro, armas Etherforge à distância classificadas como corpo a corpo. Persistência SQL dos novos metadados é bloqueador de implantação.
- a08: multiclasse, Pacto, lista pendente/troca de Iniciado e pré-requisitos passaram. a09: ficha Guerreiro12/Campeão concluída no mobile, nível inválido bloqueia e 3→12 preserva escolhas/PV. a10: equipamentos Druida equipáveis CA15 e herança/remoção de objeto de Soldado passaram; Druídico bloqueou exportação. Oni/Yun/Gélido e Artífice precisam cobertura explícita na R3.
- Implementadores novos: fix_r2_database (SQL/decode/migração13), fix_r2_feats (categorias e talentos especiais), fix_r2_classes (lacunas classe/importador). Coordenador mantém contratos/motor/projeção e regressões centrais. Catálogo só será regenerado após integração.
- Ruling: adicionar operador `ausente` para exclusividade de Pactos Planares; condições narrativas de campanha permanecem descritas e não criam uma pendência sem controle possível. Não desativar genericamente pré-requisitos.
- Ruling: carga de fontes tolera apenas diferença de commit_fonte quando ID/hash e todos os demais campos são idênticos; preserva commit já registrado e rejeita divergências de conteúdo. Upgrade em base HEAD revelou15 diferenças só de commit. Fonte publicada não será sobrescrita.

### Verificação PO2 / preparação R3

- Implementação integrada: talentos tardios preenchidos;12 talentos especiais com requisitos curados, decisões/perfis e exclusividade; Erudito; Druídico; magias fixas e progressão de usos; Etherforge; alvo de invocação registrado e validado; truque extra distinto. Metadados persistidos e hidratação antiga compatível na migração13.
- Fonte adicional aceita: Divine Smite ausente do acervo; card sintético curado do PHB2024 oficial https://www.dndbeyond.com/spells/2618833-divine-smite, nome português já presente na classe. Hunter's Mark usa card local Marca do Predador por título original exato.
- Motor RED5/5 observado, GREEN5/5; regressões combinadas11/11. Classes23/23; talentos11/11 com três antecedentes produzindo ficha. SQL39/39. Revisões independentes talentos e classes/motor aprovadas sem achados; DB também reproduziu6/6 e upgrade de2985revisões/26metadados sem perda.
- Integração: npmtest246/246, typecheckexit0, buildexit0 com122originais preservados. Browser focado18/18desktop/mobile; criação autenticada20/20 no servidor de testes4173 comSupabasesimulado. Tentativa inicial dessa suíte no servidor4180 não correspondia à URL mock e foi interrompida; falhas ambientais, retomadas corretas aprovadas. Sem criação real.
- Catálogo regenerado errors0/warnings1845. Bundle backend gerado e mantido porque motor mudou. Catálogo/edge novos ainda não publicados.
- Ruling: substituição de Silvestre quando já conhecido permanece descrita no talento, sem escolha universal indevida; limitação explícita nesta execução. Efeitos condicionais de combate/narrativa permanecem texto quando não são decisões permanentes.
- R3 tem brief artifacts/ux-swarm/round-3.md; dez agentes novos devem ser despachados, sem repetir R2. Produto volta a ficar congelado durante suas avaliações.
- R3a01/a02/a03 despachados; nenhum dos demais sete iniciou ainda. Integração compendium-full passou1/1 com seed integral2x e criação via catálogoSQL. Migração13 aplicada via MCP no projetoWeirs e verificada: quatrocolunas presentes;3019conceitos ativos/3043revisões publicadas preservados. Catálogoativo novo ainda não publicado; schema aditivo somente. Advisors security/performance consultados antes e security após, sem ampliação de escopo.

### R3 — primeiro lote concluído

- a01: ficha Mago3 exportada, Erudito/História+7 e10livro/6preparadas/3truques passaram; Taumaturgo distinto/troca Protetor passaram. P2novo: Arcana da fonteHTML não é mapeado para Arcanismo nas perícias iniciais.
- a02: filtros/alvos/Tomo/invalidação/repetição entre grupos passaram. P2novo: duas aquisições da mesma invocação repetível no mesmo grupo não são representáveis; exige ocorrências distintas com IDs/alvos próprios.
- a03: ficha Artífice2 exportada, cotas2/3,INT,espaços2 e kit físico passaram. Novos: P1quatro planos ausentes, P2ferramentas fixas+escolha artesão ausentes, P2truque concedido ausente. Restauração/Reparar precisa identidade conferida antes de vincular; não assumir pela tradução. CouroCravejado sem tipo é observação com equipar não testado; verificar na PO3 se confirmar alias fonte.
- a04/a05/a06 ativos; a07–a10 não despachados ainda. Código permanece congelado; novos defeitos serão corrigidos após dez relatórios.
- PacoteSQLcompactado da PO2 testado em base HEAD:3073revisões atuais esperadas, preservação de anteriores e reaplicação de staging aprovadas. Nenhum staging remoto novo executado; regenerar após PO3.

### R3 — nove concluídos / preparação PO3

- a04: Ladino/Bárbaro e ficha/export MestreBatalha3 passaram. P3: manobra já escolhida pode ser marcada em outro nível, mas motor DUPLICATE_FEATURE bloqueia; melhorar disponibilidade/mensagem, sem alegar ficha inválida aceita.
- a05: Humano/Alerta e MeioElfo/Curandeiro chegaram à ficha; Marcados escolhas e troca limpa exclusivos preservando classe passaram. Sem novo achado.
- a06: matriz24projeções e UI Oni1/3/5/Yun/trocaTalpa passaram magias/usos/exclusivos. P2resistências fixas Oni3/Gélido vazias no campo operacional. PO3 também conferirá12origens Oni3/Drac5/Namy4 pela mesma causa e fonte explícita.
- a07: Buscador/Feérico ficha/export passou; Dons/Médium e Infernal tiveram complementos. P2novo: radioPactoFeérico desabilita os outros Pactos, impedindo SUBSTITUIR na mesma escolha; exclusividade deve bloquear coexistência, permitindo troca.
- a08: ficha/export Mago3/Bardo2/Bruxo1 e círculos2/1/1, slots4/3/2+Pacto1, trocas e independentes passaram. Sem novo achado.
- a09: ficha Bardo2 no mobile390, grupos/perícias/instrumentos/expertise/magias e inválidos passaram. MelhoriaP2aceita: recuperar rascunho no reload. Spec126 previa apenas memória da aba; não chamar regressão. RulingPO: ampliar para sessionStorage da aba por conta/campanha, limpar logout/sucesso; evita perda em formulário longo sem persistência permanente em localStorage.
- a10 é último auditor ativo. Todos30 já foram DESPACHADOS,29concluídos; não despachar mais auditorR3 nem iniciar correções antes dele terminar.
- Workers novos fix_r3_artificer e fix_r3_resistances estão APENAS lendo/preparando artefatos, aguardam mensagem explícita LIBERAÇÃO. Root mantém genericchoices/invocações/Arcana/aliases. Após a10, abrir terceiro worker para recuperação do rascunho; quatro slots total.
- Artífice identityRestauração/Reparar confirmada pela fonte primária final https://www.dndbeyond.com/posts/2106-whats-new-with-the-artificer-in-eberron-forge-of (20/11/2025), Tinker'sMagic→Mending. Não usar UA como autoridade da edição final. Planos4/5/6/7/8 nos2/6/10/14/18; genéricos só podem virar planos de itens reais comtipo/raridadeexplicitamente comprovados, sem conceder equipamento físico. BolsaCestos/Carga alias confirmado pelas variantesHTML/JSON da mesma classe.

### Fechamento das 30 avaliações / integração PO3

- a10 concluiu/exportou Druida1 Guardião/Fadas/SoldadoBaralho: CA15/PV10, equipamentos tipados, Druídico, Herbalismo, Baralho e FalarAnimais fixo corretos. Complemento Bardo confirma três proficiências para um objeto e kitB remove objeto mantendo treinamento. Sem novo achado.
- Todas as três rodadas de dez auditores distintos estão concluídas. Produto ficou congelado durante cada rodada. Não houve criação real de ficha.
- PO3: Artífice corrigido em módulo próprio (planos e requisitos/tier/duplicatas, ferramentas iniciais, Reparar fora da cota); resistências fixas12origens; Arcanaalias; CouroCravejado12equipável; ocorrências de invocação repetível; disponibilidade de manobra/feat; substituição de Pacto; recuperação de rascunho por sessão.
- RED dos cinco casos centrais e nove iniciais Artífice observado; GREEN16regressões centrais e10Artífice. Resistências62/62 relacionadas; revisão própria e independente aprovadas. Browser das novas escolhas6/6, Artífice2/2; ajustes de fixture completaram cardinalidade e nomes acessíveis antes do GREEN.
- Recuperação:20/20browser iniciais e teste fortalecido de limpeza. Reviewer encontrouP2raw12/draft3 apósreload semblur; corrigido com helperclass-levels compartilhado e reconciliação funcional em lote apóscatálogopronto, excluindo inputfocado/attempt. REDdoiscasos, GREEN14novos/regressões; rereviewindependente confirmou12+PV/subclasse,multiclass5/4,númerosinválidosevazio. Sem achado aberto.
- Reviewfinalintegração aprovado: contraprova54prévias nas18linhagens e38metadados preservados entre snapshot→tabelas→decode. São prévias deliberadamente incompletas, não54fichasfinalizadas. SQLrealR3 passou seedintegral2x e upgradeHEAD preservando2985revisões/38metadados/closure921.
- Catálogo errors0/warnings1846; único aviso novo registra ausência de itemcomum específico elegível para plano de Artífice (poção existente é proibida). Opções nomeadas e maravilhosos de tipo/raridade comprovados permanecem disponíveis, sem item fictício.
- Verificação final unit/build/browser5arquivos em execução. Sem publicação de frontend/edge/catálogo mecânico novo; pacote remoto deve permanecer coordenado. Sub-raças iniciais e migração13 estão noSupabase.

### Verificação final concluída

- `npm test`: 302/302 aprovados, exit 0 (final-unit.log).
- `npm run build`: exit 0, inclui TypeScript e bundle backend atualizado; integridade dos 122 arquivos originais aprovada (final-build.log).
- Playwright integrado, cinco arquivos de criação, ambiente Supabase simulado: 76/76 desktop/mobile aprovados, exit 0, 2,8 minutos (final-browser.log).
- SQL integral R3 e upgrade de metadados: 1/1 cada; duas aplicações idempotentes, 2.985 revisões antigas preservadas, 38 entradas com metadados e closure 921.
- Pacote final compacto regenerado e verificado: 3.126 entradas atuais, 320 partes, upgrade/reaplicação aprovados; manifest contém hash do seed final. Artefatos final-deployment-prepare.log/final-deployment-test.log, sem aplicação remota desse pacote.
- `git diff --check`: exit 0, somente avisos de finais de linha. Conferidos 10 relatórios não vazios em cada uma das três rodadas.
- Revisões independentes PO2/PO3 e integração final aprovadas; P2 adicional de recuperação de nível encerrado por rereview. Não há correção priorizada aberta nesta execução.
- Supabase recebeu o delta inicial de linhagens e a migração13 aditiva verificada. Frontend, novo catálogo mecânico e Edge Function permanecem preparados localmente para publicação coordenada; nenhum commit/push/publicação do frontend foi realizado. O servidor demo4180 permanece disponível para inspeção local.

### Publicação autorizada — 17/10/2026

- Usuário aprovou publicação integral na `main` e produção. `git fetch` confirmou alinhamento com `origin/main` antes da integração.
- Reexecução unitária: 302/302, exit0 (`release-unit.log`). Suíte completa:241pass/2skip e uma corrida do teste de revogação do chat; diagnóstico pelo trace confirmou revogação correta durante o segundo catch-up inicial. Teste sincronizado, sem alteração de produto; seis repetições desktop/mobile aprovadas (`release-chat.log`). O CI verifica novamente a suíte completa no commit publicado.
- Snapshot dos apontamentos ativos preservado antes da carga. Manifest final e hashes conferidos; 320 partes transportadas com conferência de integridade, das quais319 preparatórias já aplicadas sem ativação. Verificação remota:3.126 rascunhos novos,3.043 revisões publicadas anteriores e3.019 apontamentos atuais preservados.
- Entrega coordenada: frontend pelo workflow GitHub Pages em `main`, bundle `criar-personagem` com JWT obrigatório e ativação transacional do catálogo; conferir o site oficial e os apontamentos após o deploy.

### Produção publicada e conferida

- Commit funcional `0f1521eda79f110a29b0bc8a23a489ed6a67cfaa` publicado na `main`; Pages run39066817426 aprovado. Edge `criar-personagem` v2 ACTIVE/verify_jwttrue. Catálogo ativado em transação;3126revisões esperadas atuais/publicadas,6169revisões publicadas totais,0rascunhos. Dez conceitos históricos fora do snapshot mantidos para compatibilidade; nenhum dado publicado antigo foi apagado.
- Site oficial serve bundle compilado e snapshot com hash idêntico ao commit. Smoke real desktop/mobile aprovou Oni3/Talpa3, nível vazio/obrigatório,3→12/subclasse e recuperação12apósreload; zero pageerrors. API anônima real confirmou linhagens e metadados nos contextos Oni/Talpa/N0-V4/Artífice/Bruxo, e quatro consultas positivas/negativas para listas de Mago/Clérigo. Edge rejeita requisição sem sessão (401). Nenhuma ficha real criada (`production/verification.json`, `production/spell-lists.json`).
- CI39066817396:241pass/2skip/1fail, com os testes de criação aprovados. Falha é leitura de response.text() após fechar página no teste preexistente de privacidade de áreas do mapa. Followup torna as leituras monitoradas e aguardadas, com asserção de payload não vazio e falhas de leitura explícitas; produto não alterado.
- Followup do teste de áreas aprovado em oito repetições desktop/mobile com2workers, exit0 (`release-agility-after.log`); revisão focal e `git diff --check` aprovados. Nenhuma falha de leitura é ignorada.
