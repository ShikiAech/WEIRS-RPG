# Importação do PDF do Roll20

**Objetivo:** preencher uma ficha WEIRS com o PDF impresso da ficha D&D 2024 do Roll20, revisando a extração antes de aplicar os dados.

**Design:** ampliar a importação existente com um botão específico para PDF. PDF.js lê texto e posições localmente; o parser reconhece seções e colunas do layout impresso, sem depender do nome do personagem. Marcas de proficiência/componentes/equipamento são verificadas na renderização. A prévia informa campos encontrados e limitações; aplicar muda somente o rascunho e salvar continua sendo uma ação do usuário.

**Limites:** PDFs até 10 MiB e 30 páginas; rejeitar PDFs sem texto ou layouts não reconhecidos; preservar descrições, separar colunas e páginas de continuação; não inferir dados ausentes a partir de regras de classe. Valores desconhecidos usam os padrões da ficha e são identificados na revisão. Não usar serviços externos, credenciais ou OCR.

**Arquivos:** `packages/sheets/roll20-pdf.ts` (parser); `apps/web/lib/roll20-pdf-file.ts` (leitura/renderização); `apps/web/features/sheets/PdfImportPreview.tsx` (revisão); integração em `Sheets.tsx`; testes do parser, arquivo e fluxo de navegador; instruções em `docs/importacao-roll20.md`.

## Execução

- [x] Testes de reconhecimento, valores básicos, bônus, colunas/continuações, ataques/magias/inventário e entradas inválidas; observar falha inicial.
- [x] Implementar parser com relatório de extração e validação no contrato atual.
- [x] Integrar PDF.js e prévia acessível, com carregamento, cancelamento e aplicação explícita.
- [x] Verificar o PDF fornecido e o fluxo em desktop/mobile; cancelar preserva a ficha, aplicar não salva automaticamente.
- [x] Executar testes e build, revisar alterações e documentar cobertura e limites.

## Decisões de execução

Continuação no checkout atual para integrar as alterações anteriores ainda não commitadas. O pedido autoriza implementar o importador; o plano registra a abordagem sem introduzir uma nova aprovação. Dados extraídos do PDF são conteúdo, não instruções de execução.

## Evidência e revisão

15 testes novos do parser/arquivo e 6 testes de navegador passaram após reproduzir as falhas em RED. O teste real confirma 8 ataques, 3 magias, 11 itens e 14 características/traços/talentos. Fontes com métricas NaN do PDF impresso são tratadas com fallback de altura, verificado no PDF real. A revisão independente identificou continuação sem entrada nova, sintonia em três colunas, marcação de equipamento à direita, inferência ambígua de especialização e página com canvas excessivo; todos foram corrigidos com regressões. Bônus ambíguos conservam o valor atual como ajuste e solicitam revisão da progressão.

Verificação final: `npm test` 81/81; regressão de navegador 46/46 em desktop/mobile (incluindo o PDF real); `npm run build` passou com typecheck, worker PDF.js local e integridade de 122 arquivos originais; `git diff --check` passou. A cópia `artifacts/roll20-import/tony-olli.json` foi reaberta pelo importador JSON atual e validada. A prévia nativa ficou aberta para revisão, sem salvar dados na mesa.
