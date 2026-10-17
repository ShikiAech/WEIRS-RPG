# Auditoria de UX e regras de criação — plano de execução

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Execução autônoma autorizada pelo usuário, com três rodadas de dez agentes.

**Goal:** Permitir criar personagens diversos sem escolhas obrigatórias ausentes, magias de origens erradas ou perda de dados durante a edição.

**Architecture:** Dez avaliações independentes por rodada, em lotes de até três agentes auxiliares. Cada agente usa navegador/contexto próprio, as mesmas referências de regras e um diretório exclusivo de evidências. O coordenador consolida achados como PO, reproduz os defeitos aceitos, escreve regressões, corrige e valida antes da rodada seguinte.

**Tech Stack:** React, TypeScript, Playwright, Node test runner, compêndio versionado e Supabase.

## Regras globais

- Preservar alterações das correções anteriores e conteúdo não relacionado.
- WEIRS é homebrew: conferir fontes locais antes de considerar divergência de D&D como defeito.
- Usar D&D 2024/SRD para fundamentos; não misturar 2014/2024 silenciosamente.
- Auditorias em demonstração local ou backend de teste; não criar fichas nem campanhas de usuários em produção.
- Nenhum agente de auditoria altera código de produto ou arquivos de outro agente.
- Achado exige reprodução, resultado esperado independente, resultado observado e evidência; hipótese não é defeito confirmado.
- Registrar decisões e limites; não declarar cobertura de todas as combinações possíveis.

## Rodadas

- [ ] Rodada 1: dez agentes cobrem conjuradores preparados/grimório; pacto/conhecidas; meios/terços conjuradores; marciais; linhagens; traços raciais; antecedentes; multiclasse; interação/mobile; ficha final.
- [ ] PO 1: deduplicar, classificar P1/P2/P3, reproduzir e corrigir defeitos aceitos com regressões.
- [ ] Rodada 2: dez novos agentes verificam as correções e procuram contraexemplos, usando outras combinações/níveis.
- [ ] PO 2: corrigir novos defeitos aceitos e repetir verificações pertinentes.
- [ ] Rodada 3: dez novos agentes cobrem limites, regressões e jornadas completas cruzadas.
- [ ] PO 3: corrigir achados remanescentes, executar testes, typecheck/build e produzir lista final com evidências e limites.

## Verificação

Cada correção deve falhar no teste de regressão antes de ser implementada. Executar os testes afetados após cada conjunto de mudanças e a suíte do projeto ao concluir; executar testes de navegador desktop/mobile para alterações de interação. Rever o diff e preservar referências de revisões publicadas.

## Registro

Progresso/decisões: `docs/audits/2026-10-17-character-ux/progress.md`. Relatório consolidado: `docs/audits/2026-10-17-character-ux/report.md`. Evidências e scripts individuais: `artifacts/ux-swarm/`.
