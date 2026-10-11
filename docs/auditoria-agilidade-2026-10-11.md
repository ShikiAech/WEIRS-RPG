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

## Revisão de legibilidade e dados 3D

Após o feedback sobre fontes pequenas, os textos principais de chat, ficha e formulários passaram a 16 px; controles, rótulos e informações secundárias usam 14 px. Esses tamanhos são escolhas do produto, não um mínimo atribuído à WCAG. O chat desktop ocupa 380 px e o painel de configuração do mapa, 340 px. No celular, a navegação superior permite rolagem horizontal dentro da própria barra. A [orientação W3C sobre redimensionamento de texto](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) permanece uma referência; esta etapa não certifica todos os fluxos com zoom de 200%.

A câmera dos dados enquadra os limites projetados de todo o lançamento, incluindo a posição de chegada, com margem para evitar cortes. A escala desse enquadramento é calculada uma vez e permanece fixa durante os giros; a posição da câmera acompanha o deslocamento dos dados no piso, mantendo o ângulo. A textura com ruído e listras diagonais permanece vinculada à superfície, passando pela imagem conforme a câmera avança. O lançamento usa um único arco e mantém a duração de 2,1 segundos. Isso aproxima rolagens de um a seis dados sem aumentar o popup: o canvas continua com 150 px de altura no desktop e 125 px no celular. O resultado no chat continua aguardando o fim da animação.

![Seis dados com enquadramento próximo no desktop](../artifacts/chat-layout-audit/after-desktop.png)

No celular, a janela dos dados recebe prioridade durante o lançamento e quando contém o foco. Ao terminar, a ficha aberta recupera a prioridade se o usuário não estiver operando os dados. A captura e o teste de pontos no topo e no rodapé do canvas verificam que a ficha não encobre a animação.

[Lançamento sobre a ficha no celular](../artifacts/agility-audit/after-04-launch-mobile.png), [ficha com textos maiores](../artifacts/agility-audit/after-03-sheet-desktop.png).

O nome do token passou a 14 px na tela e foi separado do elemento interativo do token, mantendo o alvo de clique alinhado ao corpo. A posição inicial dos dados no desktop foi ajustada à largura atual do chat. Seleção, arraste e navegação por teclado continuam cobertos.

A revisão passou em 59 testes de unidade/integração e 130 casos de navegador, distribuídos em execuções de 34 e 96 casos. Depois do ajuste final da prioridade móvel, os 52 casos afetados de agilidade, layout e sessão passaram novamente em desktop e emulação móvel. O build com verificação TypeScript passou, importando 773 registros em três campanhas e confirmando os 86 arquivos originais idênticos. Permanecem os avisos existentes de três entradas no manifesto e chunks acima de 500 kB. As limitações de ambiente descritas acima continuam válidas.

### Continuidade da animação

O feedback seguinte relatou a impressão de rolar duas vezes. A reprodução registrou uma inicialização e um canvas, mas 124 projeções de câmera diferentes numa mesma rolagem; a trajetória também voltava a subir após a primeira queda. A escala fixa do enquadramento e o arco único corrigem esses movimentos. O progresso agora permanece entre zero e um, evitando um recuo inicial quando o timestamp do primeiro quadro precede o instante de preparação do renderizador.

O teste de navegador observa as matrizes enviadas ao WebGL e a criação de canvas: verifica uma projeção constante, um canvas, movimento efetivo e ausência de novo impulso depois da queda. Os testes reproduziram os problemas antes das correções. A regressão passou nos 58 casos de dados, layout e agilidade em desktop e emulação móvel; os sete testes de enquadramento, faces dos modelos e fila de revelação também passaram. O build com TypeScript e a preservação dos 86 arquivos originais passaram novamente. As capturas e gravações de diagnóstico ficam localmente em `artifacts/dice-motion/`.

Após o feedback sobre o fundo estático, a câmera passou a acompanhar a média do deslocamento horizontal dos dados. Os limites são calculados em relação à câmera em cada pose preparatória, permitindo um percurso maior sem afastar os modelos. A verificação curta passou em TypeScript e no caso de animação em desktop e celular: a matriz de visão se desloca sem inverter o sentido, enquanto a escala de projeção permanece constante. A avaliação visual desta etapa ficou com o usuário, conforme solicitado.
