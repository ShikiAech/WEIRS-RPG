# Agilidade durante o jogo — plano

> Execução autorizada: tarefas independentes por agentes, integração e revisão nesta sessão.

**Objetivo:** operar combate e mapa com menos cliques, mantendo a mesa legível.

**Arquitetura:** Supabase transacional existente; SVG para geometria; preferências de favoritos no navegador. Sem nova dependência de produto.

**Spec:** [agilidade-design](../specs/2026-10-11-agilidade-design.md).

## Tarefas

- [x] Capturar auditoria inicial desktop/celular, inspecionar seis passos e registrar atritos antes de alterar produto.
- [x] Backend: testes vermelhos PostgreSQL de lote atômico, cópia, áreas, permissões, versão e replay; migração007/contratos; verificar testes verdes.
- [x] Favoritos/contexto: testes de referência atual, invalidação e limites; catálogo/hook, estrelas na ficha e TokenActions com PV/condições autorizados; estilos compactos.
- [x] Editor: geometria de áreas/seleção/grupo com testes; histórico de versões com testes; componentes focados, integração do mapa e ajustes de fundo/aura.
- [x] UX: prioridade do painel ativo, abas da ficha acessíveis, seleção alternativa de tokens pequenos, toolbar/cabeçalho compactos; capturas e fluxos novos no navegador.
- [x] Revisão: permissões e ausência de vazamento, conflitos/reenvio, overlays/mobile/teclado; corrigir achados e rodar suíte apropriada completa/build/integridade legada.
- [x] Entrega: guia da migração007, uso/atalhos/limites, relatório com capturas e registro local.

Foco de revisão: seleção preservada após atualização, token removido/oculto durante uma ação, versão alterada por outra sessão, resultado secreto/3D, navegação com operação desconhecida. Mudanças de UI de baixo impacto serão verificadas nos fluxos reais, sem testes que apenas reproduzam CSS.

## Verificação final — 11/10/2026

- `npm test`: **57/57** testes de lógica e PostgreSQL/PGlite aprovados.
- `npm run test:browser -- --workers=1`: **130/130** aprovados, em Chromium desktop e emulação Pixel 7; inclui 30 cenários novos de agilidade/auditoria.
- `npm run typecheck`: aprovado; Prettier nos arquivos de código alterados e `git diff --check` também aprovados.
- `npm run build`: aprovado, com importação de 773 registros de três campanhas e **86 arquivos originais idênticos** no build. Há três avisos no manifesto do conteúdo e avisos de tamanho dos bundles, sem falha de compilação.
- Capturas dos seis passos, antes/depois em desktop/celular, salvas e inspecionadas. [Relatório de auditoria](../../auditoria-agilidade-2026-10-11.md).

A revisão corrigiu interceptação do Shift+clique pelo cartão, sobreposição do 3D no combate móvel, remapeamento de cópias ao refazer, atualização após confirmação concorrente, exposição de cache após perder papel de mestre e leitura da própria ficha pelo espectador. A suíte completa passou após essas correções.

O Supabase hospedado e a publicação não foram alterados. A migração 007 deve ser instalada pelo [guia da mesa virtual](../../configuracao-mesa-virtual.md); validação externa com duas contas e uma sessão com os oito participantes permanece fora da evidência automatizada local.
