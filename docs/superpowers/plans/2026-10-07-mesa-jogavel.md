# Mesa jogável — plano de implementação

**Objetivo:** executar a [especificação](../specs/2026-10-07-mesa-jogavel.md) em ciclos solo, preservando o chat e a ficha existentes.

**Arquitetura:** estado de sessão por campanha, comandos SQL transacionais/idempotentes, painel de ficha e combate acoplado ao chat e loja modal. Supabase Realtime com recuperação periódica. Alterações estruturais continuam no editor com controle de versão.

- [x] Ciclo 1: testes PostgreSQL para acesso, testes da ficha, PV, transações, conflito e repetição; migração `202610070004_mesa.sql`; contratos e repositório.
- [x] Ciclo 2: painel de ficha no chat, controles de combate, modal de loja, fórmulas de dano de magia opcionais; validar tipos e testes de fluxo.
- [x] Ciclo 3: simular narrativa, combate e comércio; revisar privacidade, reconexão, respostas perdidas, estoque e moedas; corrigir achados.
- [x] Ciclo 4: executar suíte completa, build, inspeção de capturas desktop/celular, documentar instalação e limites e registrar commit.

Entradas adversas obrigatórias: operação repetida, versão obsoleta, usuário de outra campanha, espectador, estoque/saldo insuficientes, gasto acima do limite e retorno de conexão depois de revogação.

## Registro de revisão solo

- Ciclo 1: testes executando as migrações em PGlite confirmaram PV temporários, wallet/estoque/inventário atômicos, versão de ficha, limite de recursos e reenvio. Ambas as tabelas novas têm RLS; escrita direta e leitura de recibos privados são negadas.
- Ciclo 2: capturas Chromium desktop/celular levaram a manter dados e envio lado a lado no chat desktop, alinhar os controles de PV dos NPCs e fixar o cabeçalho do painel durante sua rolagem interna. O rascunho do chat sobrevive a ações da ficha e espectadores conseguem fechar os painéis.
- Ciclo 3: corrigidos avanço de turno ao remover o participante atual, limites compatíveis com o modelo da ficha, prevenção de sobrescrita de ofertas/PV digitados durante alterações externas e proteção de navegação com confirmação desconhecida. Recuperação de dados de vida oferece 2024, 2014 e ajuste manual; descanso não ressuscita personagem sem PV. Recibos revalidam a permissão atual da ficha, inclusive após perda do papel de mestre. Preço unitário exibido precisa coincidir com o atual antes de negociar.
- Cobertura adicional: dados de vida/morte com atualização da ficha e recibo estável, magias com dano homebrew, gastos e descansos, exposição apenas de dados públicos de combate, duas fichas disputando o último item e venda de item sintonizado recusada sem alterações.
- Instalação e comparação funcional com as referências Roll20: [guia de sessão](../../configuracao-mesa.md). Mapas, storage e automação integral permanecem no plano geral; a sessão desta entrega funciona por teatro da mente.
- Verificação final: `npm test` — 24 testes; suíte completa de navegador — 78 testes; após a última proteção de preço, `playwright test tests/browser/session.spec.ts --workers=1` — 18 testes da sessão, totalizando 80 cenários distintos com a suíte anterior. Conflitos simulados no recebimento da RPC evitam uma corrida do teste com a sincronização automática. `npm run build` passou, com os 86 arquivos originais idênticos; permanece o aviso de chunks acima de 500 kB. Capturas revisadas em `artifacts/session-*.png`, `artifacts/combat-*.png` e `artifacts/shop-*.png` (geradas pelos testes, ignoradas no Git).
- Revisão de integração feita solo, conforme autorização do usuário. Branch atual preservada; migração remota e publicação não executadas.
