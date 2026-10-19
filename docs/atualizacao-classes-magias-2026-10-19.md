# Atualização de classes e magias — 19/10/2026

A `main` foi conferida e sincronizada com `origin/main` em `0c29cf1`. Os JSONs de origem foram preservados. O importador, que antes usava HTML para classes e magias, agora incorpora `data/classes.json` e `data/spells.json` ao compêndio relacional e à demonstração do app.

## Conteúdo e aplicação

- **20 classes e 155 subclasses:** 143 subclasses do JSON e 12 complementares do HTML. Dado de vida, atributos, salvaguardas, treinamento, equipamento, características e escolhas usam os novos dados.
- **670 magias:** 656 variantes do JSON e 14 magias complementares do HTML. Descrições, aumento de círculo, listas de classes, escola, alcance, tempo, duração, componentes, custos e consumo são preservados.
- **Ficha e combate:** parcelas de dano simples chegam à ficha; truques usam o nível total, inclusive em multiclasse. Textos completos de reação podem ser adicionados, editados e salvos. Ajustes manuais de dano são preservados.
- **Identidades e histórico:** nomes antigos permanecem como aliases; classes, pacotes e conteúdo derivado conciliados conservam os IDs. Conteúdo obsoleto sai da busca atual, sem apagar as revisões fixadas pelas fichas.
- **Revisões imutáveis:** mudanças nas fontes complementares também alteram o hash do grafo, evitando alterar mecânicas sob a mesma revisão publicada.

O catálogo reúne **3.563 conceitos**, com **zero erros obrigatórios** e **1.046 avisos de revisão**. As classes novas que não informam quantidades de perícias ou tabelas de progressão continuam com essas lacunas sinalizadas. Danos condicionais, modos alternativos e invocações de criaturas permanecem no texto para resolução manual. Aumentos de círculo não são inferidos pelo botão de dano.

As variantes conflitantes de Aura Mágica de Nystul foram preservadas separadamente. Inundação de Energia Negativa conserva as variantes de Arcana Unleashed e Xanathar. Golpe Divino mantém sua identidade publicada, mesmo com a tradução diferente fornecida pelo JSON.

## Validação local

- `npm test`: **370 testes aprovados**.
- `npm run compendium:verify`: carga aplicada duas vezes, revisão antiga ainda acessível e personagem criado usando relações lidas do PostgreSQL.
- Atualização da carga anterior para a nova, aplicada duas vezes: **3.078 revisões publicadas antigas preservadas**, 3.563 conceitos atuais e nenhum registro extra na busca.
- Playwright: **10 cenários aprovados**, em desktop e celular, incluindo importação, edição, salvamento, combate e truque em multiclasse.
- `npm run build`, `npm run typecheck` e `git diff --check`: aprovados. O build regenerou o motor da função `criar-personagem` e preservou os 122 arquivos originais verificados.

O build mantém o aviso existente sobre tamanho de alguns chunks.

## Aplicação no Supabase

A carga foi aplicada no projeto **Weirs** (`wmfusotfddhgvjwgobtg`). O limite de tamanho da API exigiu o envio de 82 blocos para uma tabela de preparação no schema privado, com RLS e sem permissões para os clientes. A transação final conferiu a quantidade de blocos, os **42.930.958 bytes** e o SHA-256 do SQL reconstruído antes de executar a carga. A publicação e a remoção dessa tabela ocorreram na mesma transação.

| Verificação remota                      |      Resultado |
| --------------------------------------- | -------------: |
| Classes / subclasses / magias           | 20 / 155 / 670 |
| Conceitos atuais                        |          3.567 |
| Revisões publicadas históricas e atuais |         12.810 |
| Fichas / campanhas / mensagens          |    5 / 3 / 104 |
| Área de preparação removida             |            Sim |

Os 3.563 conceitos desta carga estão disponíveis. O banco mantém também quatro traços de espécies preexistentes: **Habilidades da Afinidade Elemental**, **Talpa Ferreiro**, **Talpa Armeiro** e **Talpa Ferramenteiro**. Eles ficaram preservados, fora do escopo de classes e magias. As 9.247 revisões publicadas anteriores permanecem armazenadas.

As contagens e os checksums completos das linhas de fichas, campanhas e chat são idênticos antes e depois da operação. Nenhuma ficha de teste foi criada no projeto. A API pública usada pelo app confirmou as 20 classes, Toque Gélido com alcance de toque e dano `1d10`, e a busca pelo alias antigo **Mãos Mágicas** retornando **Mão Mágica**.

## Publicação do código

O fluxo de produção publica a `main` no GitHub Pages e a função `criar-personagem` no projeto Supabase Weirs, mantendo `verify_jwt=true`. O frontend e o motor devem ser publicados juntos para manter a prévia do cliente e o cálculo do servidor compatíveis. A publicação exige testes e build aprovados, seguida da conferência do site, da versão da função e das consultas públicas ao compêndio.
