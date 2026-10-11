# Auditoria da mesa — agilidade durante o jogo

Revisão realizada em 11/10/2026 no aplicativo local. Fluxo: abrir mesa → selecionar token → consultar ficha → rolar → conduzir combate → abrir loja. Capturas novas antes e depois das alterações, em Chromium desktop (1280 × 720) e emulação Pixel 7. Os arquivos exatos ficam em `artifacts/agility-audit/`; são evidências locais, fora do bundle e do Git.

**Resultado:** os seis passos são operáveis nos fluxos verificados. O mapa ganhou espaço no desktop, ações frequentes ficaram próximas do token e o painel de combate recebe prioridade no celular. A interface mantém a identidade escura/dourada existente. Fichas extensas e janelas sobrepostas continuam exigindo rolagem/recolhimento em telas pequenas; esta revisão não substitui uma sessão de usabilidade com os oito participantes.

## 1. Abrir a mesa — adequado

Mapa central e chat separado conservam os próximos caminhos visíveis. O cabeçalho desktop passou de três barras para duas; a janela de dados ociosa mostra apenas cabeçalho e preferência. No celular, Mapa/Chat alternam a área principal sem rolagem horizontal da página. Os tokens ficam pequenos no enquadramento completo; a lista alternativa tem alvos maiores.

![1 — Mesa no desktop](../artifacts/agility-audit/after-01-map-desktop.png)

[Captura equivalente no celular](../artifacts/agility-audit/after-01-map-mobile.png).

## 2. Selecionar e operar token — bom

O cartão aparece no rodapé do mapa e apresenta PV, ficha e controles recolhíveis de PV/condições, favoritos e movimento. O primeiro teste revelou que o cartão anterior interceptava Shift+clique de outro token; o cartão foi reposicionado e se oculta enquanto Shift está pressionado. A lista devolve o foco ao token e há botões de direção para movimentar sem arrastar. Mestre pode selecionar grupos por Shift ou caixas na lista, duplicar e usar desfazer/refazer.

![2 — Contexto do token](../artifacts/agility-audit/after-02-token-desktop.png)

[Celular](../artifacts/agility-audit/after-02-token-mobile.png), [lista/foco no celular](../artifacts/agility-audit/after-11-token-list-keyboard-mobile.png).

## 3. Consultar ficha e favoritos — adequado

Abas e modo ficam fixos durante a rolagem interna, evitando voltar ao topo para trocar de ação. Estrelas criam até 12 favoritos por usuário/campanha/ficha. Os atalhos reconstruem o comando com a versão salva atual; não guardam cópias privadas da ficha. A ficha completa ainda é longa no celular, mas os controles frequentes também estão disponíveis no token. Espectadores leem a própria ficha com ações desabilitadas; perder papel de mestre remove acesso às fichas de outras pessoas em cache.

![3 — Ficha e abas](../artifacts/agility-audit/after-03-sheet-desktop.png)

[Celular](../artifacts/agility-audit/after-03-sheet-mobile.png).

## 4. Rolar e acompanhar conversa — adequado

Resultados continuam aguardando o término do 3D, com recuperação de rede e fallback sem WebGL. Favoritos respeitam vantagem/desvantagem e a visibilidade definida no chat. Durante a rolagem interna da ficha, as abas seguem acessíveis. No celular, o popup pode ocupar parte do mapa/conversa; o usuário pode mover/recolher a janela e a próxima animação respeita a preferência manual.

![4 — Rolagem e conversa](../artifacts/agility-audit/after-04-roll-desktop.png)

[Celular](../artifacts/agility-audit/after-04-roll-mobile.png).

## 5. Conduzir combate — bom

Ao abrir ficha/combate no celular após uma rolagem concluída, os dados se recolhem temporariamente. Uma animação em andamento continua; a próxima rolagem volta a expandir os dados. O teste executa adicionar NPC e iniciar combate sem o overlay interceptar os controles. PV pode ser alterado pelo token de personagem ou NPC vinculado, sem abrir a ficha completa. Condições/concentração/PV temporários usam fichas; NPCs sem ficha têm dano/cura contextual.

![5 — Combate no desktop](../artifacts/agility-audit/after-05-combat-desktop.png)

[Preparação no celular](../artifacts/agility-audit/after-05-combat-mobile.png), [combate ativo operável após 3D](../artifacts/agility-audit/after-10-combat-unobstructed-mobile.png).

## 6. Comprar/vender e voltar ao jogo — bom

A loja permanece um modal com ações e saldo legíveis, rolagem própria e fechamento acessível. Escape fecha e devolve o foco ao botão Loja; compras/vendas, estoque, preço alterado e confirmação perdida continuam cobertos na regressão. Administração é exclusiva do mestre e ofertas usam detalhes recolhíveis.

![6 — Loja](../artifacts/agility-audit/after-06-shop-desktop.png)

[Celular](../artifacts/agility-audit/after-06-shop-mobile.png).

## Evidência e limites

As capturas iniciais `01` a `06` registram o estado anterior nesta mesma revisão. As capturas finais têm prefixo `after-`; foram abertas e inspecionadas. A auditoria acessou a aplicação executável, com SDK Supabase real e transporte externo simulado pelos testes. Regras, RLS, transações e reenvios são exercitados em PostgreSQL/PGlite. O Supabase hospedado não foi alterado nesta sessão; instalar a migração 007 continua necessário conforme o [guia](configuracao-mesa-virtual.md).

Os fluxos verificam teclado, foco da lista/loja, versões, conflitos, acesso perdido offline e ausência de rolagem horizontal. Não certificam conformidade WCAG, leitor de tela completo, Safari/Firefox, hardware móvel real, desempenho com oito conexões ou consumo real das quotas de hospedagem. A referência de acessibilidade é a [orientação W3C para foco, alvos de toque e alternativas ao arraste](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/); o tamanho de tokens no zoom é compensado pela lista e pelos botões de movimento.

Áreas de magia, aura e alinhamento são visuais; não calculam alvos ou efeitos automaticamente. O histórico é local e protege versões; exclusões definitivas e alterações irreversíveis de cena limpam o histórico. Diário/bestiário existentes ficaram fora desta etapa.

Os resultados finais de verificação estão registrados no [plano de execução](superpowers/plans/2026-10-11-agilidade.md).
