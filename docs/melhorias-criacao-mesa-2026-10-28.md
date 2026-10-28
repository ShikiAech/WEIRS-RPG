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
2. Depois das migrações existentes até `202610190015_compendio_tempo_consulta.sql`, aplique nesta ordem: `202610280016_combate_chat.sql`, `202610280017_visao_mapa.sql` e `202610280018_operacoes_mapa.sql`. Não repita migrações antigas nem substitua seu histórico.
3. Gere e confira o compêndio com `npm run compendium:check` e `npm run compendium:seed`. O gerador escreve arquivos locais; ele não conecta ao banco remoto.
4. Aplique o novo `supabase/compendium-seed.sql` depois das migrações. Conserve as revisões antigas: fichas existentes podem referenciá-las.
5. Execute `npm test`, `npm run build` e os testes de navegador relevantes. O build atualiza o motor em `supabase/functions/_shared/creation-engine.js`.
6. Publique a Edge Function de criação com o motor atualizado e o frontend correspondente. Confira as permissões e o transporte de atualização no ambiente de destino.

Testes SQL locais e testes de navegador com backend simulado têm finalidades diferentes. Um teste simulado de interface não confirma as políticas ou a entrega de eventos do Supabase hospedado. Os registros de validação e eventuais limitações do ambiente devem acompanhar a revisão da alteração.


## Validação local desta alteração

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
