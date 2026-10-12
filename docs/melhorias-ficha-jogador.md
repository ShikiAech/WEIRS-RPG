# Melhorias da ficha de jogador

Requisitos: `C:/Users/Tony/Downloads/temp/Ficha de Jogador.pdf`, páginas 1–3, itens 1–7. O título final “Combate” não contém requisitos adicionais. A ficha dedicada e o painel **Minha ficha** da sessão compartilham os mesmos equipamentos, ataques e recursos.

## Cobertura do PDF

| Item | Implementação |
| --- | --- |
| Campos comuns | Nome, tipo, quantidade, peso unitário, descrição, exclusão com confirmação e peso total. Recursos próprios por item com nome, quantidade atual e máxima. Checkbox de sintonia e contador, com limite padrão de 3. |
| 1. Básico | Campos comuns, recursos e sintonia. Observações/cargas antigas continuam acessíveis. |
| 2. Arma | Simples/marcial, corpo a corpo/distância e crítico natural mínimo, padrão 20. Vários ataques com nome, atributo, bônus e proficiência; vários danos por ataque com fórmula, atributo e tipo. Acerto e fórmula compatível com o chat atualizam quando atributos/nível mudam. |
| 3. Armadura | Leve/média/pesada, Força mínima, CA base, limite de Destreza (vazio = ilimitado), adição de Destreza e desvantagem em Furtividade. Prévia da CA e aviso de requisito de Força. |
| 4. Escudo | Bônus de CA, outros bônus e resumo do total. |
| 5. Conjuração | Perfis por classe/multiclasse; atributo, bônus de salvaguarda/ataque, modificador, CD e ataque totais visíveis. Remover perfil preserva magias com origem personalizada. |
| 6. Espaços | Adicionar/remover círculos de 1 a 9; total, gastos e disponíveis; pacto separado. Remover espaços preserva as magias. Os nove registros continuam no JSON v1 para compatibilidade com descansos e comandos da mesa. |
| 7. Magias | Busca por nomes em português/inglês, sem depender de acentos, e filtro por círculo no diálogo. Checkbox e “Na ficha” indicam inclusão e evitam duplicatas. Criação manual/homebrew, pesquisa na própria ficha e agrupamento por círculo. Importação preserva descrição, componentes materiais longos, custo, duração e fonte. |

O painel de sessão mostra categorias, peso, sintonia, detalhes de armas/defesas, ações e recursos dos equipamentos. Magias ficam agrupadas por círculo, com perfis, componentes, duração e descrição consultáveis. Gastos continuam transacionais e respeitam a versão da ficha e as permissões existentes.

## Ativação do banco

Antes de disponibilizar os equipamentos novos na mesa salva, execute **uma vez** [202610120008_ficha.sql](../supabase/migrations/202610120008_ficha.sql) no SQL Editor do Supabase, de `BEGIN;` a `COMMIT;`. A fundação da ficha deve estar instalada; para loja/sessão, siga também [configuracao-mesa.md](configuracao-mesa.md).

A migração limpa ataques, recursos e sintonias vinculados quando um equipamento é removido da ficha, incluindo a venda da última unidade. Vendas parciais preservam seus vínculos; ações e recursos dos outros itens permanecem. Ela conserva os controles de versão, permissões e recibos de reenvio já existentes. O banco remoto não foi modificado nesta entrega.

O formato da ficha continua v1. Campos novos de equipamentos são opcionais para abrir fichas antigas e itens comprados pela loja. Importação valida antes e depois de recalcular os ataques, rejeitando dados incompletos e fórmulas que excedem os limites da mesa. A duração foi acrescentada ao compêndio sem alterar os IDs dos registros.

## Verificação de UX

| Etapa | Resultado | Evidência local |
| --- | --- | --- |
| 1. Inventário anterior | Pouca distinção de tipos e sintonia separada dos itens. | `artifacts/ficha-ux/01-inventario-antes.jpg` |
| 2. Equipamento e ataque | Campos condicionais, dano separado por parcela, recursos junto ao item e resumo de acerto. Conferido em desktop e celular. | `artifacts/ficha-ux/02-arma-desktop.png`, `02-arma-mobile.png` |
| 3. Magias e espaços | Círculos configuráveis, busca, presença na ficha e navegação de teclado. Foco na busca ao abrir; Escape fecha mesmo com texto, retornando ao botão de abertura. | `artifacts/ficha-ux/03-magias-desktop.png`, `03-magias-mobile.png` |
| 4. Pop-up da sessão | Detalhes e recursos vinculados consultáveis; gastar no inventário reflete na aba Recursos. | `artifacts/ficha-ux/04-popup-desktop.png`, `04-popup-mobile.png` |
| 5. Seleção no compêndio | Pesquisa, filtros e identificação de magias já presentes. | `artifacts/ficha-ux/05-selecao-magias.jpg` |

As alterações seguem as orientações da W3C para [agrupar campos relacionados](https://www.w3.org/WAI/tutorials/forms/grouping/), [diálogos e foco de teclado](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) e [tamanho de alvos](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). Controles numéricos usam texto de 16px; rótulos de 14px; foco visível e mensagens de carregamento/erro; abas em duas colunas no celular. Os testes verificam ausência de overflow horizontal nos fluxos novos.

As capturas verificam o layout; os testes de navegador verificam interações e foco. Essa combinação não constitui uma certificação completa de acessibilidade. Os testes da sessão interceptam HTTP para um backend de teste; a migração é executada em PostgreSQL local via PGlite para conferir o comportamento real de venda/reenvio.

## Verificação técnica

Comandos: `npm test`, `npm run build` e `npx playwright test tests/browser/app.spec.ts tests/browser/persistence.spec.ts tests/browser/session.spec.ts tests/browser/sheet-improvements.spec.ts tests/browser/spell-content.spec.ts --workers=1`.

Resultado em 12/10/2026: **66 testes unitários/de banco e 40 testes de navegador aprovados**, com desktop e celular. TypeScript, build e integridade das páginas originais aprovados. Os achados da revisão independente de código foram corrigidos e cobertos por regressão.

Testes novos cobrem atualização de atributos/nível, sintonia, referências, importação/exportação, múltiplos danos, limites de fórmulas, venda parcial/final e reenvio, seleção de magias, componentes materiais longos, duração, foco e recursos no pop-up. O build verifica a preservação de 122 arquivos originais. Os avisos de registros duplicados do acervo e tamanho de chunks continuam informativos.

## Limites desta etapa

CA de combate, aplicação das penalidades e tratamento/dano de críticos permanecem manuais, com as configurações e prévias visíveis. O gasto de espaços de magia é escolhido na sessão. Modificadores genéricos e automações adicionais de regras ficam para uma etapa futura, conforme o PDF. Fórmulas de dano seguem os limites do chat existente: até 120 caracteres e 100 dados, com faces de 2 a 1.000; excedê-los mostra uma mensagem junto ao ataque.
