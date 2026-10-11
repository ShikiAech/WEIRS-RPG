# Plano de implementação da mesa virtual

**Objetivo:** cumprir a [especificação](../specs/2026-10-11-mesa-virtual.md) em ciclos de implementação e revisão solo, conforme autorização autônoma do usuário.

**Arquitetura:** RPCs transacionais, tabelas de mapas/tokens/assets com RLS, Storage privado e renderização SVG. Reutilizar os contratos e fluxos atuais de chat/ficha/sessão. Não acrescentar dependências de produto.

- [x] Ciclo 1 — `202610110005_rolagens_secretas.sql`, contratos/repositório/chat: teste vermelho de privacidade e revelação, implementar e verificar PostgreSQL e UI.
- [x] Ciclo 2 — `202610110006_mesa_virtual.sql`, contratos/repositório de mapa e Storage: cenas, tokens, camadas, versões e assets. Testar acesso, limites, vínculo e idempotência.
- [x] Ciclo 3 — componentes `features/tabletop`: mapa SVG, ferramentas/inspector/cenas/arquivos, régua/pings/desenhos/neblina; `FloatingWindow` e nova composição de `Chat`/`App`. Testes de geometria e navegador.
- [x] Ciclo 4 — simular jogo em duas sessões, inspecionar capturas, revisar informação exposta e navegação/janelas, corrigir achados. Atualizar testes que fixavam o layout anterior sem relaxar os requisitos funcionais.
- [x] Ciclo 5 — testes completos, build/integridade legada, guia de ativação e uso, comparação funcional, revisão final e registro local das alterações.

Foco de revisão: resultado secreto jamais em payload público; mudanças de papel; tokens ocultos e controle de propriedade; conflito de posição/configuração; janelas que não cubram permanentemente o envio; upload interrompido e arquivos privados; múltiplas abas e reconstrução após perda de eventos.

Achados corrigidos durante a revisão: retorno privado atrasado após perda do papel de mestre; resposta de tokens de outra cena após navegação; corrida entre exclusão de arquivo e vínculo a mapa; token de NPC removido do combate; crescimento da janela de dados além do viewport; sobreposição de janelas/paginação no celular; enquadramento de cenas grandes; pré-carregamento desnecessário da biblioteca inteira. A simulação de Realtime foi corrigida para representar vários canais no mesmo WebSocket do SDK.

A instalação no Supabase hospedado e a confirmação com duas contas reais estão documentadas no [guia de ativação](../../configuracao-mesa-virtual.md). Esta entrega usa testes locais de PostgreSQL/PGlite e navegador com SDK real e transporte simulado; não aplicou migrações remotas.

Verificação final em 11/10/2026: `npm test` passou os 35 testes; `npm run test:browser -- --workers=1` passou os 100 cenários desktop/celular; `npm run build` passou TypeScript, importação de 773 registros e verificação dos 86 arquivos legados idênticos. Capturas desktop/celular foram inspecionadas. `git diff --check` e a conferência de formatação passaram. O build conserva o aviso de tamanho dos bundles de aplicação/Three.js; o renderizador continua carregado sob demanda.
