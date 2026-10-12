# Melhorias da ficha de jogador

**Objetivo:** implementar os itens 1–7 de `C:/Users/Tony/Downloads/temp/Ficha de Jogador.pdf` nos fluxos existentes de edição e sessão.

**Abordagem:** manter React, o tema escuro e o formato JSON v1. Equipamentos recebem campos opcionais por categoria; ataques e recursos continuam nas listas compartilhadas, vinculados por `itemId`, para usar as operações de sessão existentes. CA permanece manual; modificadores genéricos e a seção de combate sem requisitos no PDF ficam fora desta entrega.

## Etapas e verificação

- [x] Equipamentos: contratos, validação compatível com JSON antigo, sintonia limitada, ataques vinculados e múltiplos danos. Testar valores derivados, limites, referências e importação/exportação.
- [x] Inventário: editor por categoria com detalhes condicionais, recursos atuais/máximos, peso unitário e total, confirmação de exclusão e resumo de sintonia.
- [x] Magias: perfis multiclasse existentes com totais claros; adicionar/remover círculos ativos mantendo os nove registros de armazenamento; pesquisa no compêndio, indicador de presença, descrição completa e criação manual; agrupar por círculo.
- [x] Sessão: exibir detalhes dos equipamentos, recursos vinculados, perfis e magias por círculo usando os comandos existentes.
- [x] UX: conferir desktop, celular, teclado, foco do diálogo, rótulos, contraste e ausência de overflow. Referências: W3C WAI forms/grouping, ARIA dialog-modal e WCAG 2.5.8.
- [x] Validar com `npm test`, `npm run build` e testes de navegador relevantes; salvar capturas e mapa de requisitos em `docs/melhorias-ficha-jogador.md`.

## Pontos de revisão

1. Fichas antigas e itens comprados na loja precisam abrir sem campos novos obrigatórios.
2. Remover equipamento deve remover vínculos da sintonia e suas ações; remover perfil deve preservar magias com origem personalizada.
3. Alterar atributos ou nível deve atualizar os ataques de equipamentos antes da gravação.
4. Falha ao carregar uma magia deve permitir tentar novamente sem adicionar uma entrada incompleta.
5. Consulta na sessão precisa respeitar os mesmos dados da ficha completa e as permissões existentes.
