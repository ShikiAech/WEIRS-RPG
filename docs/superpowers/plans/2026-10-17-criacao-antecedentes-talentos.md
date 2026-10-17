# Correções de antecedentes e talentos

> **For agentic workers:** Use superpowers:executing-plans, inline, task by task. Track the checks below.

**Goal:** Exibir antecedentes completos e oferecer os talentos permitidos em cada ocasião da criação da ficha.

**Architecture:** O JSON é a fonte estruturada dos antecedentes; variantes HTML correspondentes são preservadas como procedência do mesmo registro. A seleção de talentos usa categorias normalizadas e mantém as concessões específicas de origem e estilo de luta.

**Tech Stack:** TypeScript, React, Node test runner, Playwright, PostgreSQL/PGlite.

**Spec:** Relato e cinco screenshots do tester na solicitação de 2026-10-17.

## Constraints and review focus

- Preservar revisões antigas, referências de fichas e variantes de fonte.
- Não unir registros ambíguos ou de livros distintos.
- Nível 4+: geral, marca do dragão, pacto planar, presente sombrio, selvagem, vilania e Weirs; dádivas épicas a partir de 19.
- Origem e estilo de luta continuam disponíveis por suas concessões específicas.
- Regenerar e verificar os artefatos locais do compêndio; nenhuma publicação remota faz parte desta correção.

## Tasks

- [x] Reproduzir com testes a descrição incompleta e os antecedentes duplicados; enriquecer a descrição e consolidar apenas correspondências inequívocas.
- [x] Reproduzir com testes as categorias incorretas; normalizar tipos/tags e corrigir as opções de progressão, mantendo os pré-requisitos existentes.
- [x] Gerar o seed e snapshot; verificar reimportação, busca e leitura de revisões antigas.
- [x] Executar testes de regressão, suíte completa, typecheck/build e testes de navegador relevantes.

## Validation

- `npm test`: 313 passed, zero failures.
- `npm run build`: passed, including typecheck and integrity of 122 legacy files.
- Compendium and character creation browser suites: 26 passed across desktop and mobile.
- Previous committed full seed -> new full seed -> repeated new seed: passed in PGlite; one current Acólito and historical JSON revision/dependencies remain readable.
- Compendium generation: 71 backgrounds, 61 duplicate backgrounds consolidated, zero structural errors.
- Independent review findings resolved: translated duplicates, special prerequisites, total acquisition level for epic boons, and revision-scoped damage IDs needed for upgrades.
- Browser tests required execution outside the network sandbox because local HTTP connections returned EACCES. No remote database publication was performed.

## Follow-up: duplicate Magic Initiate lists

- Reproduced duplicate sections before selection in all five fixed-list backgrounds: Acólito, Guia, Sábio, Tocado pelo Gênio and Peregrino dos Poços da Lua.
- Compatible ancestor choices now own the decision before selection; child choices remain inherited. Unrestricted feat acquisition still offers all three spell lists, and stale child choices cannot bypass the background list.
- Seven regression cases passed; full suite: 320 passed. Creation and spell UX browser suites: 46 passed across desktop and mobile. Build/typecheck passed and the creation server bundle was regenerated.
- Independent review found no actionable issues in the follow-up.
