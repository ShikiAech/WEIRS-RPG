# Melhorias de criação de personagem e mesa

Este guia acompanha as alterações locais de 28 de outubro de 2026. A interface depende das migrações, do compêndio atualizado e do motor de criação correspondente. Publicar apenas o frontend não instala as funções do banco.

## Criação de personagem

- Inamons exibem seus traços e decisões de arma integrada e aprimoramentos. A escolha da arma considera as proficiências obtidas pelas classes; não concede uma arma arbitrária antes dessas escolhas. Os aprimoramentos adicionais e a carapaça respeitam os níveis da espécie.
- Forma e tamanho aparecem quando existem alternativas reais. Linhagens opcionais continuam disponíveis, mesmo que não sejam obrigatórias. Uma falha na consulta de linhagens aparece como erro recuperável, não como ausência de linhagens.
- A etapa 5 reúne equipamentos iniciais da classe inicial e do antecedente, moedas e configuração dos itens recebidos. Entradas em multiclasse não recebem outro kit inicial.
- As consultas bem-sucedidas ao compêndio são reutilizadas na sessão. Listas, filtros e páginas diferentes conservam chaves distintas; erros e cancelamentos podem ser tentados novamente. Mudanças de conta não compartilham o cache da conta anterior.
- As magias selecionadas aparecem em chips por origem. A descrição pode ser aberta pelo ponteiro, pelo teclado ou por toque. Concessões fixas são diferenciadas das escolhas removíveis; preparo e limites continuam separados por perfil.

## Pontos de vida e chat

Os campos de dano e cura aceitam valores, somas, subtrações e dados, por exemplo `12`, `8 + 4`, `12 - 3` e `2d8 + 3`. O servidor resolve a expressão junto com a alteração de PV. Repetir a mesma tentativa recupera o mesmo resultado sem rolar ou aplicar outra vez. Expressões inválidas ou resultados negativos não alteram o personagem.

Multiplicação, divisão e parênteses não fazem parte desta primeira versão da gramática. Os limites existentes de comprimento, quantidade e faces dos dados continuam valendo.

O controle de PV temporários permite definir o valor exato, inclusive reduzi-lo ou limpar com zero. Isso é diferente de conceder novos PV temporários conservando o maior valor, quando essa ação estiver disponível.

As mensagens de ataque e magia com dano oferecem uma ação para rolar o dano usando a ficha salva atual. Uma edição de PV ou recurso entre o ataque e o dano não invalida a mensagem anterior. Se a ação for excluída ou a permissão mudar, a nova tentativa é recusada com uma explicação. Rolagens secretas conservam sua privacidade.

As fichas permitem enviar descrições disponíveis ao chat, sem substituir os controles de rolagem. O chat guarda uma cópia do texto daquele momento. Magias com informação cadastrada exibem o modificador de ataque ou a CD e o atributo de salvaguarda; informações desconhecidas não são inventadas.

## Ferramentas do mapa

A régua usa centros de células para início, vértices e fim. As opções permitem ajustar contraste e espessura/estilo, fixar e excluir medidas e acompanhar movimentos de tokens. A medição de altura apresenta separadamente distância horizontal, diferença de altura e hipotenusa. A medida horizontal comum mantém a regra de diagonais existente.

O posicionamento de áreas de magia apresenta uma prévia antes da gravação, orientação ajustável e confirmação ou cancelamento. Áreas ancoradas acompanham o token; a aura continua sendo uma indicação visual, sem aplicar efeitos de jogo automaticamente.

Áreas vinculadas também dependem da visibilidade atual do token de origem: se ele estiver fora da visão, o efeito vinculado não aparece para aquele participante, mesmo quando alcança uma região visível. O mestre mantém seu acesso, e o dono conserva o acesso autorizado ao próprio token. Para mostrar um efeito independentemente da origem, desvincule a área do token.

A seleção múltipla funciona com os tokens controlados pelo usuário e mantém o limite de 40 tokens por operação. Operações em grupo são atômicas: permissão insuficiente ou versão antiga de um integrante impede o lote inteiro. Remover um token do mapa não exclui sua ficha.

O mestre administra camadas, visibilidade e destinatários das cenas. Camadas privadas não entregam suas entidades e referências privadas aos jogadores. Um jogador só recebe a cena atribuída; o mestre pode visualizar outra cena sem mudar o mapa da mesa inteira.

A limpeza geral de desenhos usa identidades e versões explícitas e abrange os traços públicos da camada de mapa original. Traços marcados individualmente como ocultos, traços movidos para outras camadas e imagens são preservados. Escritas de clientes antigos acrescentam ou atualizam os traços informados; omitir um traço da lista não o exclui. A exclusão individual usa os controles atuais.

## Visão automática

As cenas novas podem usar visão automática com alcance por token, paredes e portas. Cenas antigas preservam o modo anterior até a conversão pelo mestre. Paredes bloqueiam visão; não acrescentam colisão ou cálculo automático de caminhos.

A visão de um jogador é a união dos seus tokens habilitados na cena atribuída. Bloquear o movimento de um token não remove sua visão. Espectadores acompanham um jogador definido pelo mestre. Sem uma fonte de visão válida, o participante vê névoa e uma orientação.

A área explorada pode permanecer escurecida, mas não revela o estado atual de inimigos fora da visão. Só posições confirmadas exploram o mapa; arrastar uma prévia não revela todo o trajeto. A resolução inicial é por célula, inclusive quando a grade não está desenhada.

A máscara e as entidades autorizadas vêm do servidor na mesma revisão de visibilidade. Alterações em portas, paredes, controle, camadas ou destinatários invalidam resultados antigos. A imagem-base é um arquivo de cena entregue para renderização: a névoa não fornece sigilo dos pixels do arquivo original. Imagens exclusivamente privadas de camadas ou cenas continuam sujeitas às permissões de arquivos.

Informações já publicadas no chat e na iniciativa compartilhada permanecem públicas. Colocar um NPC privado na iniciativa é uma divulgação separada de sua representação no mapa.

## Instalação e publicação

1. Faça uma cópia de segurança e confira quais migrações já foram aplicadas no ambiente de destino.
2. Depois das migrações existentes até `202610190015_compendio_tempo_consulta.sql`, aplique nesta ordem: `202610280016_combate_chat.sql`, `202610280017_visao_mapa.sql` `202610280018_operacoes_mapa.sql`, `202610280019_compendio_escolhas_proficiencia.sql` e `202610280020_compendio_contexto_seletivo.sql`. Não repita migrações antigas nem substitua seu histórico.
3. Gere e confira o compêndio com `npm run compendium:check` e `npm run compendium:seed`. O gerador escreve arquivos locais; ele não conecta ao banco remoto.
4. Aplique o novo `supabase/compendium-seed.sql` depois das migrações. Conserve as revisões antigas: fichas existentes podem referenciá-las.
5. Execute `npm test`, `npm run build` e os testes de navegador relevantes. O build atualiza o motor em `supabase/functions/_shared/creation-engine.js`.
6. Publique a Edge Function de criação com o motor atualizado e o frontend correspondente. Confira as permissões e o transporte de atualização no ambiente de destino.

Testes SQL locais e testes de navegador com backend simulado têm finalidades diferentes. Um teste simulado de interface não confirma as políticas ou a entrega de eventos do Supabase hospedado. Os registros de validação e eventuais limitações do ambiente devem acompanhar a revisão da alteração.


## Validação local da implementação inicial

- 453 testes unitários e de banco passaram, incluindo histórico completo das migrações, permissões, recibos e transições de vínculo de áreas.
- 36 verificações de navegador passaram em desktop e celular. O transporte HTTP/WebSocket é simulado; as políticas SQL são exercitadas no PostgreSQL do PGlite.
- Typecheck e build de produção passaram; os 122 arquivos originais conferidos pelo verificador de publicação permaneceram idênticos.
- A atualização do compêndio preservou o conteúdo das 3.563 revisões anteriores; aplicar o novo seed novamente não gerou conflito.

O runtime Node empacotado apresentou uma falha nativa de JIT do WebAssembly durante um teste do PGlite. A execução final dos testes usou `node --no-wasm-tier-up --import tsx --test tests/*.test.js tests/*.test.ts`; nenhuma configuração de produção foi alterada. O build ainda apresenta o aviso de tamanho de alguns chunks. A entrega de eventos no Supabase hospedado precisa ser conferida na publicação.

## Escolhas de implementação

- O trabalho fica em uma branch e checkout isolados e foi dividido em três frentes paralelas. Isso exige revisão de integração; a branch local deve ser integrada antes de publicar.
- A validação global foi centralizada na integração, além dos testes focados de cada frente. Uma regressão entre frentes pode aparecer apenas nessa etapa; a suíte completa final cobre o conjunto.
- As mensagens existentes de auditoria de PV foram mantidas. A entrada de uma expressão não acrescenta uma segunda mensagem automática de dados; a auditoria de PV continua aparecendo no chat.
- A versão do resolvedor do compêndio passou de 6 para 7. Isso aumenta a carga de revisões novas e exige aplicar o seed correspondente, conservando os dados históricos.
- Listas antigas de desenhos funcionam como acréscimo/atualização. Omitir uma identidade não pode apagar um desenho quando a leitura antiga não informa essas identidades; a remoção individual usa os controles atuais com versão.
- Áreas vinculadas herdam a visibilidade atual do token de origem. O efeito também desaparece para quem não vê o token; desvincular permite sua exibição independente e remove os metadados privados da âncora, preservando posição e ângulo.


## Revisão funcional e de experiência

A revisão posterior conferiu os fluxos de criação, ficha/chat e ferramentas do mapa. O problema observado foi separado entre interface local e dados publicados: o compêndio hospedado consultado ainda não continha grupos de escolha para Inamons ou Talpas. As escolhas de Inamon existiam no catálogo local, mas ficavam abaixo de cinco descrições de traços; agora aparecem antes das descrições.

| Fluxo | Problema confirmado | Correção |
| --- | --- | --- |
| Espécie | Talpa Ferramenteiro não tinha decisões estruturadas | Seis engenhocas selecionáveis, com descrições canônicas e limite pelo bônus de proficiência; seleção opcional de projetos ativos |
| Espécie | Decisões de Inamon pouco visíveis e catálogo hospedado antigo | Escolhas antes dos traços; seed atualizado necessário no ambiente hospedado |
| Navegação | Vida/defesas e magias disponíveis sem os pré-requisitos | Etapas e atalhos indisponíveis desabilitados; anterior/próxima pulam etapas inaplicáveis |
| Magias | Chips fora do campo e opções incompatíveis na lista | Chips dentro do controle de busca, descrições acessíveis e filtragem por origem, círculo e escolhas; abas sem cota desabilitadas |
| Ficha/chat | Ação de descrição separada encostada no título | O próprio nome envia a descrição; botões de rolagem continuam disponíveis |
| Regras | Uma classe carregava regras de todas as outras classes | Nova RPC seletiva conserva identidades de requisitos e listas sem percorrer regras não relacionadas |
| Cache | Acrescentar referências podia refazer a consulta completa | Reutilização de regras já carregadas e busca apenas dos contextos ausentes, sem prolongar o prazo do cache |
| Mapa | Prévia de área persistia ao trocar ferramenta e Escape dependia de foco | Cancelamento comum de gestos e foco no mapa ao iniciar posicionamento |
| Mapa | Seleção múltipla podia incluir token sem permissão de movimento | Seleção e movimento em grupo filtram permissões, inclusive pelo teclado |
| Mapa | Painéis sobrepunham controles de régua/área e paredes | Controles de administração recolhem ao desenhar; painéis conflitantes não bloqueiam o controle ativo |
| Mapa | Redimensionar a janela apagava o rascunho de área; setas em desenho moviam tokens | Ajuste de câmera preserva o rascunho; movimento pelo teclado exige a ferramenta de seleção |
| Busca | Adicionar chips deslocava a lista além da tela; preparar magia fechava a lista | Posição recalculada quando o campo muda de tamanho e foco preservado nos controles internos |

### Medições e limites da revisão

A leitura pública hospedada de Mago levou aproximadamente 10,5 segundos e retornou 11,3 MB/1.043 registros. Os três payloads hospedados examinados (Inamon, Talpa e Mago) passaram pelo decoder e pela validação do cache. A mensagem genérica de falha não foi reproduzida nessa consulta; atribuí-la especificamente a timeout seria uma hipótese.

No teste PostgreSQL local com dados completos, Mago + Talpa passou de 1.057 registros/10.914.261 bytes/5.402 ms para 278 registros/1.788.620 bytes/1.369 ms, preservando o resultado de criação. São medições locais; latência do serviço hospedado ainda depende da publicação e verificação lá.

O novo leitor tem endpoint próprio. Clientes antigos conservam o endpoint anterior. O cliente atualizado só usa o leitor anterior quando o servidor informa que a nova função ainda não existe (`PGRST202`); não repete consultas por erro de autenticação ou timeout.

O resolvedor do compêndio passa à versão 8. As revisões anteriores continuam preservadas. Rascunhos que apontam para revisões antigas mantêm essas revisões: após atualizar o seed, selecione novamente a espécie/linhagem atual para receber as novas decisões. Fichas existentes não são reescritas automaticamente.

A inspeção visual utilizou a criação de demonstração no navegador local e cenários isolados de desktop/celular para ficha/chat/mapa. O navegador inspecionado não tinha sessão autenticada; nenhuma mensagem foi enviada à campanha real. As migrações e o seed não foram aplicados ao projeto hospedado nesta revisão.


### Verificação final da revisão

- 461 testes unitários e de banco passaram, sem falhas.
- Criação/ficha/chat: 120 casos de navegador passaram na varredura ampliada; os 14 restantes falhavam porque os simuladores desconheciam o novo endpoint, foram corrigidos e passaram na nova execução. A verificação final de chips, redimensionamento, teclado e seleção passou em 24/24 casos de desktop/celular.
- Mapa: 92/92 casos de desktop/celular passaram; após o ajuste visual da amostra de cor, mais 6/6 verificações focadas e 4/4 capturas passaram. Os 55 testes específicos de geometria/banco/visibilidade também passaram e fazem parte da validação de domínio.
- Build final e typecheck passaram. Os 122 arquivos legados preservados foram conferidos novamente. Continua o aviso de chunks grandes, sem falha de build.
- A atualização do seed foi aplicada duas vezes no banco local de verificação; o conteúdo das 3.567 revisões do baseline anterior permaneceu intacto.
- A compatibilidade foi conferida com uma consulta pública ao serviço hospedado: o endpoint novo respondeu 404 e o cliente recuperou o contexto pelo endpoint anterior. Isso confirma o fallback; não confirma a publicação da migração.

Capturas locais desta revisão (arquivos de trabalho ignorados pelo Git):

1. Início e navegação: `output/ux-review-2026-10-28/01-creation-start-before.png`.
2. Escolhas de espécie: `output/ux-review-2026-10-28/04-talpa-choices-after.png` mostra duas engenhocas selecionadas e o limite aplicado.
3. Busca de magias: `artifacts/task-review/mobile-spell-search-chips.png` mostra chips no campo; teclado, preparo e redimensionamento têm testes de interação.
4. Ficha/chat: `artifacts/task-review/desktop-description-sessão.png` mostra nomes clicáveis e controles de rolagem.
5. Mapa: `output/map-ux-review/ruler-mobile.png` e `output/map-ux-review/area-desktop.png` mostram controles e prévia.

As capturas apoiam a revisão visual; não constituem certificação de acessibilidade. Login real, entrega de eventos e os tempos finais de resposta do ambiente hospedado dependem da publicação e validação nesse ambiente.

## Publicação corretiva — 29/10/2026

A criação autenticada ainda consultava revisões hospedadas sem escolhas estruturadas de Inamons e Talpas. Uma nova consulta pública confirmou zero grupos tanto para Inamons quanto para a linhagem Talpa Ferramenteiro; N0-V4 já continha seus quatro grupos. A interface atualizada, sozinha, não corrigia esses dados.

No projeto `wmfusotfddhgvjwgobtg`, foram aplicadas as migrações `016`, `019` e `020`. As definições efetivas de `014` e `015` já estavam instaladas, embora o histórico remoto tenha começado com um snapshot. Foram publicadas 110 revisões de Inamons, Talpas, suas linhagens/traços e dependências, usando o mesmo serializador do seed completo. A função `criar-personagem` foi atualizada para a versão 6 com o motor atual e `verify_jwt=true`; os dois arquivos publicados foram comparados com os locais.

Consultas novas à API pública e ao resolvedor confirmaram:

- Inamon: quatro alternativas de aprimoramento, com uma escolha no nível 1 e outra a partir do nível 7, além de arma integrada condicionada à proficiência.
- Talpa Ferramenteiro: seis engenhocas, com capacidade de 2/3/4 dispositivos nos níveis 1/6/10, respectivamente.
- N0-V4: escolhas anteriores continuam disponíveis.
- A função de chat agora reconhece ações de descrição; a RPC privada continua sem acesso direto para jogadores. O frontend também traduz falhas de descrição sem mostrar instruções de dados.

Rascunhos antigos conservam as revisões anteriores. Para obter as novas opções, recarregue a aplicação e selecione novamente a espécie e, no caso de Talpa, a linhagem Ferramenteiro. A publicação não converte fichas ou rascunhos automaticamente.

Foram preservados, com comparação de hashes, as 12.810 revisões publicadas e as 131.307 linhas anteriores nas 61 tabelas de domínio. As contagens de 4 fichas, 3 campanhas e 131 mensagens também permaneceram iguais. Colunas novas nulas foram excluídas da comparação apenas nas tabelas alteradas. O transporte foi validado por SHA-256 antes da execução atômica, e a tabela privada de preparação foi removida na mesma transação da publicação.

A validação específica passou em 29 testes de regras/chat/banco, 14 testes de navegador em desktop/celular e no build com typecheck. A carga direcionada também foi aplicada duas vezes em PostgreSQL local sobre um seed histórico, preservando os dados anteriores. O catálogo real foi exercitado pelo resolvedor nos níveis 1, 6 e 10. Uma chamada sem sessão à função de criação continuou retornando HTTP 401. Nenhuma mensagem ou personagem de teste foi criado na campanha hospedada.

Esta primeira publicação foi direcionada à criação e ao chat. As migrações de mapa `017`/`018` foram aplicadas na correção posterior descrita abaixo; a carga completa das demais revisões continua pendente. Os artefatos de conferência, backups de funções e resultados ficam em `output/backend-release-2026-10-29/` neste checkout; o SQL direcionado tem SHA-256 `bb80d3e4664f408fc5d8892589697976e34b5e6c806c1cac80a7f8c8a1a08ee3` após retirar os delimitadores externos de transação.

## Correções de interação da mesa — 29/10/2026

Ao soltar um token, a prévia de arraste era apagada antes da confirmação e da releitura do servidor. Agora as coordenadas pendentes permanecem visíveis durante esse intervalo e nas tentativas com resultado de rede incerto. A projeção não altera a versão do token, só é aplicada a registros ainda autorizados na mesma cena/contexto e deixa de prevalecer quando chega uma versão mais recente. Rejeição explícita ou liberação da tentativa remove a projeção. Movimento em grupo segue o mesmo caminho; perder controle durante o arraste cancela o envio. A névoa e a prévia de visão continuam usando posições confirmadas, e invalidações de visibilidade continuam removendo dados imediatamente.

O botão de dano no chat passou a verificar a entrada salva. Magias de cura/utilidade, entradas removidas e fichas inacessíveis não oferecem “Rolar dano”. Consultas são compartilhadas pelas mensagens da mesma ficha/versão; o clique continua consultando a versão atual antes de enviar a ação.

A ferramenta Selecionar agora permite Ctrl/Cmd+clique para alternar tokens, arraste no espaço vazio para seleção por retângulo, clique vazio/Escape para limpar e Ctrl/Cmd+A para selecionar tokens controlados. Shift continua disponível. O botão direito ou do meio arrasta o mapa. A interação dá foco ao mapa para evitar que os atalhos atuem no campo de chat. A lista de tokens é um auxílio opcional, e seu botão de retorno apenas fecha a lista. A referência de fluxo foi a [documentação oficial de seleção e navegação do Roll20](https://help.roll20.net/hc/en-us/articles/360039674873-Select-and-Pan-Tools); o comportamento específico de Ctrl/Cmd+clique segue o pedido deste projeto.

A ficha flutuante pode atravessar mapa, chat e cabeçalho. O controle com ícone e texto “Pop Out” fica imediatamente à esquerda de recolher/expandir, com espaçamento de 6 px. A janela separada conserva a mesma árvore React, campos, aba, ações e operações pendentes. Fechar/retornar restaura a ficha; sair da campanha, encerrar a página ou perder acesso fecha a janela. A atualização de permissões continua ativa quando a página principal está em segundo plano. Navegadores móveis podem apresentar o pop-up como uma aba. O bloqueio de pop-ups mostra orientação em português e preserva a ficha.

O vínculo de área falhava porque o servidor antigo recusava `acompanhar_rotacao`. As migrações `017` e `018` foram publicadas como `20261029133225` e `20261029133235`. Antes da publicação, um teste combinado identificou que o `REVOKE` amplo da `017` interromperia o acesso público ao compêndio. O comando foi limitado às funções de mapa. As 40 permissões privadas anteriores permaneceram idênticas; consultas anônimas/autenticadas ao compêndio continuam retornando somente conteúdo publicado. As 11 contagens de entidades conferidas permaneceram iguais, inclusive 3 cenas, 3 tokens, 4 fichas, 5 usuários e 135 mensagens. As 3 cenas existentes conservaram visão manual. Não foram criadas áreas ou mensagens de teste no ambiente hospedado.

Verificação desta correção: 470 testes unitários/de banco passaram; 86 verificações de mapa/seleção/agilidade, 58 de janela/ficha/sessão/dados e 20 de chat passaram em cenários de navegador desktop/celular. O build e o typecheck passaram, com os 122 arquivos legados preservados. As regressões incluem atraso de RPC e releitura, resposta incerta/reenvio, versão nova, perda de controle, remoção de token, névoa confirmada, pop-up real, operação pendente ao fechar e revogação com a página principal oculta. Os cenários HTTP/WebSocket do navegador usam campanha de desenvolvimento simulada; o navegador da campanha real estava sem login. As verificações de SQL e da publicação hospedada estão em `output/map-runtime-release-2026-10-29/verification-summary.json`.

Capturas de desenvolvimento conferidas: `artifacts/map-interactions/direct-selection-desktop.png`, `artifacts/map-interactions/direct-selection-mobile.png` e `artifacts/sheet-window-{drag,popup,return}-{desktop,mobile}.png`.
