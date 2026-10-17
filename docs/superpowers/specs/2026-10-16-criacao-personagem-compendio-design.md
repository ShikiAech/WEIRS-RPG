# Criação de personagem e compêndio D&D 5e 2024

Data: 16/10/2026. Estado: direção arquitetural aprovada na conversa; atualização das fontes JSON incorporada ao planejamento. Implementação e migração remota ainda não iniciadas.

## 1. Objetivo e critérios de sucesso

Construir a criação assistida de personagem descrita nas três páginas de `C:/Users/Tony/Downloads/Criação de Personagem.pdf`, integrada à ficha e à mesa existentes. O pedido da conversa define o escopo; o PDF fornece requisitos funcionais e referências visuais do simulador.

O PostgreSQL/Supabase será a fonte de verdade do compêndio em português brasileiro. Espécies/raças, linhagens/subraças, classes, subclasses, antecedentes, talentos, magias, equipamentos, progressões, características, escolhas e referências mecânicas terão entidades e relações consultáveis. Os menus buscarão opções dessas tabelas, com filtros de contexto. Adicionar conteúdo compatível com as mecânicas suportadas deverá depender de cadastro de dados, preparando o CRUD futuro.

Preservar o acervo de Weirs, as fichas atuais, importação Roll20/JSON, exportação, permissões, controle de versão, equipamentos, combate e chat. A tela administrativa de CRUD fica para uma etapa futura, conforme o pedido.

## 2. Situação encontrada no repositório

Inspeção da revisão `71c0153`, na branch `feat-app-v0-4-pdf-regua`:

| Área | Evidência e consequência |
| --- | --- |
| Compêndio | `tools/content-import/index.ts` extrai HTML para `content/generated/`. `Compendium.tsx`, `Sheets.tsx` e `SpellPicker.tsx` consultam arquivos estáticos. |
| Inventário atual do índice | 477 magias, 203 talentos, 61 antecedentes, 17 classes e 31 espécies: 789 registros. São registros importados, sem validação de edição por registro. |
| Classes e espécies | A extração agrega páginas inteiras. Subclasses, traços, progressões, invocações e outras opções ainda não são entidades independentes. |
| Dados ausentes do índice | Os equipamentos de `pages/itens/` e os idiomas de `pages/mundo.html` não são importados pelo compêndio atual. Há equipamentos em objetos JavaScript embutidos nas páginas. |
| Identificação | `ContentEntry.edition` é sempre `revisao-pendente`. Nomes iguais não garantem a mesma regra. O manifesto aponta variantes de Luta Cega e Luta com Arma de Arremesso. |
| Fichas | `public.fichas.conteudo` armazena JSONB v1. Classe, subclasse, espécie e antecedente são principalmente texto; selecionar uma sugestão não aplica suas regras. |
| Cálculos | `packages/sheets/calculos.js` calcula modificadores, perícias, proficiência e perfis de conjuração. A criação ainda não resolve benefícios por origem. |
| Simulador original | `javascript/simulador.js` já oferece dois conjuntos de seis resultados de 4d6, descartando o menor dado de cada resultado, distribuição sem reutilização e PV fixos ou rolados. |
| Segurança e operações | As migrações existentes chegam a `202610120010_danos_magias.sql`. Há RLS, admins globais, RPCs, versões e testes PostgreSQL com PGlite. |

Esses números não incluem todos os elementos contidos nas páginas: a migração precisará ampliar a cobertura, além de transportar os 789 registros.

Atualização informada pelo usuário: o commit remoto `84e62891dc37802b69adbf82920259d0c66036fc` adicionou `data/background.json` (71 antecedentes), `data/feats.json` (204 talentos) e `data/races.json` (30 espécies de Weirs). Os três arquivos foram lidos integralmente e contêm JSON válido. O checkout local permanece na revisão acima; o plano prevê iniciar a execução na revisão atualizada. A [auditoria dos JSONs](../../compendio-json-2026-10-16.md) registra campos, lacunas e conflitos relevantes.

## 3. Abordagens consideradas

| Abordagem | Consequência |
| --- | --- |
| **Compêndio relacional e ficha com escolhas rastreáveis — recomendada** | Domínios e vínculos reais no banco; mantém a projeção JSONB de jogo para compatibilidade com a mesa. Permite cadastro futuro e automatização gradual verificável. |
| Catálogo único com HTML/metadados em JSONB | Importação mais rápida, mas requisitos, progressões e relações continuariam dependendo de interpretação de texto. Não atende ao banco estruturado solicitado. |
| Normalizar também todo o estado da mesa e de todas as fichas | Amplia a mudança para chat, loja, combate e importação, sem ser necessário para o compêndio e a criação assistida. |

## 4. Edição, idioma e procedência

- Adotar um conjunto de regras explícito `dnd-5e-2024`. Usar os JSONs e as traduções mantidas pelo projeto como fontes de ingestão preferenciais quando disponíveis; incorporar o restante do acervo original por extração. O [SRD 5.2.1](https://www.dndbeyond.com/srd) permanece uma referência primária para conferência das regras do núcleo, sem limitar o catálogo ao seu conteúdo.
- O usuário informou o [Wikidot D&D 5e](https://dnd5e.wikidot.com/) como referência predominante das traduções. Essa página encaminha regras de 2024 ao [Wikidot D&D 2024](https://dnd2024.wikidot.com/). Registrar URL de consulta, livro indicado, conjunto de regras e adaptação/tradução separadamente. A presença no Wikidot ou o valor de `publisher` no JSON não valida automaticamente a procedência ou a edição de um registro.
- Nomes, descrições, opções e mensagens serão em `pt-BR`; conservar nome original e aliases para busca. A lista oficial de traduções do SRD consultada não inclui português; tradução editorial do projeto não será identificada como tradução oficial.
- Distinguir procedência oficial, adaptação de Weirs, terceiro e homebrew. Separar procedência de compatibilidade com 2024. Um texto já traduzido no site pode ser reaproveitado sem passar automaticamente a ser uma regra oficial.
- Fontes terão título, URL/caminho, edição, revisão, autoria e atribuição aplicável. Os detalhes de origem acompanham os registros; nomes semelhantes não substituem essa identificação.
- Preservar variantes antigas e customizadas com identidade própria. Não substituir a espécie Humano de Weirs por uma espécie de mesmo nome do núcleo de regras.
- A carga inicial inclui integralmente o conteúdo de personagem do acervo existente, seus equipamentos e referências mecânicas, complementado pelo núcleo de criação do SRD 5.2.1. A cobertura será publicada por fonte; “compêndio completo” não significará todos os livros e suplementos já publicados.
- Conteúdo consultável, conteúdo revisado para 2024 e conteúdo com criação automatizada são estados distintos. Toda pendência terá registro explícito no relatório de cobertura; ausência de informação não será preenchida por suposição.

## 5. Modelo relacional proposto

Nomes abaixo definem os domínios e os contratos da proposta; a migração fixará os nomes finais de colunas e constraints.

### 5.1. Identidade e revisões

| Tabelas | Responsabilidade |
| --- | --- |
| `compendio_conjuntos_regras`, `compendio_fontes` | Edição, regras da mesa, origem e atribuição. |
| `compendio_registros` | Identidade estável do conceito, tipo e slug. Sem identidade derivada do texto ou do nome. |
| `compendio_revisoes` | Revisão imutável após publicação: registro, número, fonte, conjunto de regras, nome PT, nome original, descrição, estado editorial, cobertura de automação e localização/hash da fonte. |
| `compendio_aliases`, `compendio_referencias_legadas` | Busca por traduções e resolução dos IDs/URLs antigos. |
| `compendio_importacoes`, `compendio_pendencias` | Versão do importador, hashes, resultados, conflitos e lacunas por elemento da fonte. |

As entidades de domínio têm chave `revisao_id`, com FK para `compendio_revisoes`. Os vínculos mecânicos apontam para a revisão exata. A publicação define a revisão corrente de cada registro; uma ficha existente conserva suas referências. Uma revisão publicada não pode ser alterada ou removida enquanto estiver em uso. O banco verifica a compatibilidade entre o tipo do registro e sua entidade de domínio.

### 5.2. Domínios e relacionamentos

| Tabelas e relações | Dados estruturados essenciais |
| --- | --- |
| `compendio_atributos`, `compendio_pericias` | Códigos estáveis, nomes PT e atributo associado. |
| `compendio_tipos_criatura`, `compendio_tamanhos`, `compendio_idiomas`, `compendio_tipos_dano`, `compendio_condicoes` | Referências compartilhadas; idiomas de Weirs conservam sua origem. |
| `compendio_especies`, `compendio_linhagens`, `compendio_especie_tamanhos`, `compendio_deslocamentos`, `compendio_sentidos` | Tipo de criatura, tamanhos possíveis, parentesco, modos de movimento e sentidos. Linhagem pertence a uma espécie. |
| `compendio_antecedentes`, `compendio_antecedente_atributos` | Atributos elegíveis e padrão de distribuição; perícias, ferramentas, talento e equipamento por concessões relacionadas. |
| `compendio_classes`, `compendio_subclasses` | Dado de vida, atributos primários e relação classe/subclasse. |
| `compendio_classe_niveis`, `compendio_subclasse_niveis` | Progressão por nível, características e quantidades de recursos. Unicidade por origem/nível. |
| `compendio_proficiencias`, `compendio_classe_proficiencias` | Salvaguardas, perícias, armas, armaduras e ferramentas; distinguir classe inicial e entrada por multiclasse. |
| `compendio_caracteristicas`, `compendio_concessoes` | Traços, características, invocações, metamagias, manobras, estilos e outros recursos. Concessão liga a origem à característica/talento/magia, com nível e condição de aquisição. |
| `compendio_talentos`, `compendio_requisitos` | Categoria, repetibilidade, atributos aumentados, limites e condições de elegibilidade. Requisitos permitem combinações E/OU. |
| `compendio_grupos_escolha`, `compendio_opcoes_escolha` | Quantidade mínima/máxima, opções elegíveis, exclusividade e dependências. Reaproveitados em perícias, linhagens, talentos, magias e equipamentos. |
| `compendio_efeitos`, `compendio_efeito_atributos`, `compendio_efeito_defesas`, `compendio_efeito_recursos` | Efeitos tipados de criação: bônus, fórmula alternativa de CA, PV, movimento, resistências e recursos; alvo, operação, nível, condição e regra de acumulação explícitos. |
| `compendio_magias`, `compendio_magia_classes`, `compendio_magia_componentes`, `compendio_magia_danos`, `compendio_magia_escalas` | Círculo, escola, tempo, alcance/área, duração, concentração, ritual, componentes/custo/consumo, listas, danos e escalonamento. Preservar descrição completa. |
| `compendio_perfis_conjuracao`, `compendio_conjuracao_progressao`, `compendio_espacos_magia`, `compendio_magias_concedidas` | Atributos permitidos, preparação/aprendizado, truques, contribuição multiclasse e arredondamento; espaços normais e pacto; magias fixas ou escolhidas, nível de aquisição e usos próprios. |
| `compendio_equipamentos`, `compendio_armas`, `compendio_armaduras`, `compendio_escudos`, `compendio_ferramentas` | Nome, categoria, peso, custo e moeda; estatísticas tipadas por equipamento. |
| `compendio_propriedades_arma`, `compendio_maestrias`, `compendio_arma_propriedades`, `compendio_equipamento_danos` | Propriedades, maestria e parcelas de dano relacionadas por FK. |
| `compendio_pacotes`, `compendio_pacote_itens`, `compendio_opcoes_equipamento` | Composição de kits com quantidades, escolhas aninhadas e alternativas de moedas. |
| `compendio_moedas`, `compendio_itens_magicos`, `compendio_servicos`, `compendio_veiculos` | Demais categorias existentes no acervo e suas regras/preços. Moedas de Weirs e moedas do núcleo mantêm conjuntos de conversão separados. |

Estatísticas de criaturas/companheiros já embutidas em características serão entidades relacionadas (`compendio_criaturas`, ações, defesas e ataques), preservando o vínculo com quem as concede. Isso cobre o acervo sem criar, nesta etapa, uma nova interface de bestiário.

Quantidades, níveis, distâncias e custos usam colunas numéricas e unidades explícitas. Muitas relações usam tabelas de ligação. Descrições usam conteúdo textual/rico sanitizado no banco. JSONB fica reservado a expressões condicionais/fórmulas validadas e extensões que não substituam os domínios centrais. Não executar código vindo de descrições, HTML ou fórmulas cadastradas.

## 6. Importação e cobertura do acervo

1. Inventariar os 789 registros atuais, os três JSONs novos e os elementos internos: subclasses, progressões, traços, escolhas, tabelas, equipamentos, idiomas e blocos de criaturas. Excluir os arquivos de modelo `teste*.html`, conforme o importador existente. Não somar os índices para inferir quantidade de conceitos: há sobreposição e traduções diferentes.
2. Ler os JSONs diretamente; extrair o conteúdo complementar do HTML e os datasets de itens por análise de sintaxe, sem executar scripts das páginas. Conservar a fonte original e seu hash. Os arquivos novos são entradas de migração, e não substituem as tabelas do compêndio.
3. Converter os dados para contratos tipados e resolver vínculos. O texto permanece como descrição; dado de vida, atributo, listas de magias, níveis e equipamentos são campos/linhas próprios.
4. Classificar fonte, versão e compatibilidade. Complementar os dados do núcleo com a referência SRD e revisão editorial em português, sem sobrescrever adaptações.
5. Gerar uma carga reproduzível com manifesto. Duplicatas exatas podem compartilhar conceito e referência; variantes mecânicas ganham registros diferentes. Conflitos vão ao relatório com o caminho exato de origem.
6. Importar em transação; reexecução idempotente. Nova execução não sobrescreve conteúdo que tiver sido mantido pelo futuro CRUD: divergências de hash/revisão são conflitos explícitos.
7. Conferir completude por domínio e por elemento de fonte. Um recurso exigido por um pacote, concessão ou lista não pode ficar sem destino relacionado.

Conciliação conhecida: preservar Neflins, presente no HTML e ausente de `races.json`; mapear traduções alternativas sem fundir variantes mecânicas. O autor confirmou em 2026-10-16 que “Mancha Espiritual” citado em Manchados é o talento “Espírito Manchado”; aplicar o alias editorial sem duplicar o cadastro. Converter pacotes, pré-requisitos textuais, talentos alternativos, tamanhos e deslocamentos condicionais em relações/valores tipados. Conservar pés/metros e condições de forma, como o exotraje, sem somar alternativas incompatíveis.

O núcleo de criação adotado como publicado precisa estar completo para os níveis 1–20 das classes suportadas, incluindo as escolhas necessárias à criação. Opções customizadas precisam ter descrição e mecânicas relevantes estruturadas; as que exigirem um comportamento ainda não suportado serão identificadas na consulta e terão pendência explícita. Preservar uma página como HTML, isoladamente, não satisfaz a migração estruturada nem a revisão mecânica.

O relatório final distinguirá: importado, relações conferidas, revisado para 2024, criação automatizada e pendências. Não declarar cobertura integral enquanto houver conteúdo do escopo ausente do banco.

## 7. Fluxo de criação

Manter o tema escuro/dourado e os componentes de formulário existentes. Abrir o assistente em **Criar personagem**, com etapas navegáveis e resumo dos seis atributos, nível total, CA, PV e movimento. Em celular, o resumo será compacto e expansível, sem ocultar os campos. Usar “Espécie (raça)” e “Linhagem/subraça” onde isso ajudar a reconhecer o acervo.

| Etapa | Comportamento esperado |
| --- | --- |
| 1. Atributos | Gerar até dois conjuntos independentes de seis resultados de 4d6, descartando o menor de cada resultado. Escolher qualquer conjunto e distribuir por índice, sem reutilizar um resultado. Alternativa de seis campos inicialmente vazios para valores externos/adaptações. Mostrar valor base, bônus por origem, total e modificador. |
| 2. Espécie | Dropdown com busca; filtrar linhagens pela espécie selecionada. Aplicar tipo, tamanho, movimentos, sentidos e traços. Solicitar escolhas opcionais, talentos e magias concedidas. |
| 3. Antecedente | Mostrar atributos elegíveis, distribuir bônus, aplicar perícias/ferramenta/talento e escolher kit ou moedas. Expandir o kit completo no inventário. |
| 4. Classes e níveis | Escolher a classe inicial e seus níveis; botão para adicionar outra classe. Somar o nível total e mostrar escolhas de perícias/equipamento. Subclasse e talentos surgem na progressão correspondente. Registrar a ordem dos níveis para resolver requisitos e PV. |
| 5. Vida e defesas | Escolher ganho fixo ou rolagens, detalhando cada nível e dado. Mostrar fórmula e origem de modificadores de PV, CA e movimentos. Alterar Constituição recalcula a prévia sem gerar novos dados. |
| 6. Magias | Criar perfis por fonte, com atributo correto ou escolha entre atributos permitidos. Mostrar espaços, pacto, truques e opções elegíveis. Inserir também magias de espécie/talento e seus usos próprios. |
| 7. Revisão | Listar escolhas pendentes e origem dos benefícios; revisar nome/campanha e criar uma única ficha. Depois abrir o editor completo existente e disponibilizar a mesma projeção na mesa. |

O esquema representa as duas tentativas de atributos como regra de Weirs, distinguindo-as do método de geração do núcleo. Os controles devem preservar a escolha do jogador, sem selecionar o conjunto pela soma.

Trocar uma seleção invalida apenas as escolhas dependentes. Exibir a diferença antes de descartar entradas manuais. Ações repetidas não duplicam talento, equipamento, moeda, recurso ou magia. Rascunhos permanecem na sessão da aba por conta e campanha, com recuperação após recarregar via sessionStorage e fallback em memória, sendo encerrados ao fechar a aba, sair da conta ou concluir; finalização exige escolhas obrigatórias válidas. O modo manual e fichas antigas continuam disponíveis.

## 8. Regras de criação e multiclasse

Usar os dados da revisão selecionada e validar a elegibilidade no nível de aquisição. Guardar a ordem dos níveis, além dos totais por classe. Regras de criação ficam separadas das decisões manuais de combate.

A [referência oficial de criação](https://www.dndbeyond.com/sources/dnd/br-2024/creating-a-character#Multiclassing) fundamenta estas distinções: benefícios iniciais e de multiclasse diferem; o máximo do dado de vida vale apenas para o primeiro nível total; proficiência usa o nível total; CA usa uma fórmula aplicável por vez. Antecedentes do núcleo distribuem +2/+1 ou +1/+1/+1 entre atributos permitidos, respeitando o limite previsto na regra.

Para espaços combinados, classes conjuradoras completas contribuem integralmente; paladino/patrulheiro contribuem pela metade, arredondada para cima; subclasses conjuradoras pertinentes de guerreiro/ladino contribuem um terço, arredondado para baixo. Com apenas uma fonte de Conjuração, usar sua progressão própria. Preparação e atributo permanecem por classe; possuir espaço superior não libera uma magia superior. Pacto permanece separado, com sua recuperação e intercâmbio permitido. Pré-requisitos específicos são cadastrados por classe/variante. Essas regras não serão deduzidas pelo nome da classe.

Talentos, subclassificação e demais características seguem suas linhas de progressão, sem presumir que todas as classes tenham os mesmos marcos. O motor aplica somente efeitos tipados suportados e mostra a descrição das decisões que exigem julgamento. Uma mecânica inédita poderá exigir extensão do motor, mesmo quando seu cadastro já couber no banco; o futuro CRUD não elimina essa necessidade.

## 9. Escolhas, efeitos e compatibilidade com fichas

- A biblioteca `packages/character-creation/` resolve uma prévia determinística: dados do compêndio + escolhas + rolagens registradas → pendências + concessões + projeção de ficha. Distinguir entradas manuais das entradas geradas.
- Atribuir identidade estável por instância de concessão. Reaplicar a mesma escolha atualiza suas entradas; não acrescenta cópias. A mesma magia obtida por duas fontes preserva perfis, atributos e usos distintos.
- Identificar cada parcela de atributos, proficiência, CA, PV e movimento pela origem. Fórmulas alternativas de CA não são somadas. Recursos e moedas também têm procedência.
- Acrescentar `ficha_criacoes`, `ficha_criacao_classes`, `ficha_criacao_niveis`, `ficha_criacao_escolhas` e `ficha_criacao_concessoes`, com FKs para a ficha e revisões do compêndio. Guardar bases, método/conjuntos de atributos, distribuição, resultados de vida, ordem dos níveis, escolhas e versão do motor.
- A projeção em `fichas.conteudo` continua atendendo os consumidores JSONB v1. Campos opcionais de procedência recebem validação explícita em TypeScript/JavaScript e SQL. Não alterar o contrato v1 para exigir campos de criação em fichas existentes.
- A RPC de criação grava ficha e relações em uma transação. O servidor valida referências/elegibilidade, recalcula os valores essenciais e rejeita divergências. A resolução mecânica do servidor usa o mesmo motor TypeScript em uma Edge Function autenticada, alimentada pelo PostgreSQL; a RPC de gravação é exclusiva de service_role. Os testes comparam a projeção do grafo efetivamente lido do PostgreSQL com a do snapshot. Essa decisão de execução evita duplicar regras em PLpgSQL e exige deploy da Edge Function.
- Manter geração de atributos/vida do assistente separada do chat. Registrar resultados para reabrir a criação; essa etapa não muda as regras de rolagens públicas/secretas da mesa.
- A edição manual posterior não é reaplicada automaticamente pelo assistente. Nesta etapa, o assistente cria novas fichas e permite revisar as escolhas antes de finalizar; a edição de fichas salvas continua no editor atual. Uma futura reconstrução de ficha salva exigirá prévia das diferenças e preservação das entradas manuais e do estado de jogo.
- Referências antigas `compendioId` continuam resolvíveis pelo mapa de IDs legados. Não tentar vincular automaticamente classes/espécies antigas apenas pelo nome.
- Exportação conserva o snapshot da ficha e um bloco opcional com os dados de criação. Importação valida o bloco; se o catálogo de destino não tiver a revisão, conserva a ficha como manual e informa que a automação daquela origem não está disponível. Importação Roll20 continua produzindo ficha manual até revisão explícita das seleções.

## 10. Consultas e componentes

Criar um repositório tipado de compêndio, compartilhado pela página Compêndio, assistente, seleção de magias e outros seletores. Consultar listas resumidas com paginação; buscar detalhes e relacionamentos quando necessários. Filtrar por conjunto de regras, fonte, classe/subclasse, nível, círculo e estado de publicação.

Busca por português e nome original será insensível a acentos/caixa, com índices adequados. Relações e filtros serão resolvidos pelo banco; não carregar todas as descrições e depois interpretar o HTML no navegador. Dropdowns pequenos podem usar `select` nativo; listas extensas precisam de busca acessível e paginação.

Com Supabase configurado, esses fluxos consultam o banco. Falha de rede ou migração ausente mostra erro específico e opção de tentar novamente, preservando escolhas. Não recorrer silenciosamente ao HTML antigo. Para a demonstração sem banco, um snapshot explicitamente identificado poderá ser exportado do mesmo modelo publicado; não haverá um segundo catálogo de regras mantido manualmente.

O build continuará preservando os arquivos legados e suas verificações de integridade. A importação atual terá função de migração/compatibilidade; recompilar o frontend não poderá sobrescrever o banco ou desfazer cadastros futuros.

## 11. Permissões e integridade

- Compêndio publicado terá leitura pública compatível com a consulta atual sem login. Rascunhos editoriais não ficam expostos. Publicação considera a disponibilidade definida para cada fonte.
- Somente administradores globais poderão manter o catálogo, por políticas/RPCs que reutilizem a autoridade existente em `private.eh_admin()`. Ser mestre de uma campanha não concede edição global de regras.
- Estado de criação privado acompanha as permissões da ficha: proprietário, mestres autorizados e administradores, sem ampliar acesso entre campanhas. Nenhuma consulta pública retorna dados das fichas.
- Usar PKs/FKs, unicidade, faixas numéricas, validação de tipos e constraints para vínculos incompatíveis. Publicação falha com referências incompletas ou escolhas impossíveis.
- Operação de criar personagem recebe ID de tentativa e é idempotente. Atualizações usam a versão esperada; conflito não sobrescreve edição alheia.
- Conteúdo rico será sanitizado antes de exibir. O navegador recebe somente credenciais publicáveis; importação administrativa não usa chaves privilegiadas no frontend.

## 12. Migração e ativação

Preparar novas migrações após a 010, sem reescrever as anteriores. Separar estrutura/permissões, carga revisada e integração das escolhas de criação para facilitar conferência. Testar tudo em PostgreSQL local antes de preparar a execução hospedada.

Migração aditiva: fichas existentes continuam manuais e jogáveis; não reescrever nomes, atributos, moedas ou inventários antigos. Validar a carga e seus relatórios antes de habilitar os dropdowns de produção. Atualizar o guia Supabase com a ordem exata e o relatório de ativação. Publicação do frontend e aplicação no banco hospedado serão relatadas separadamente da preparação local.

## 13. Mapa de requisitos do PDF

| Requisito | Local da proposta | Verificação principal |
| --- | --- | --- |
| 1 — Duas rolagens e preenchimento externo | Fluxo 1; bases e histórico | Dois conjuntos, seleção livre, índices únicos e campos vazios no modo externo. |
| 2A — Raça/subraça e traços | Espécies, linhagens e concessões; fluxo 2 | Filtro pelo pai; movimentos, tipo, traços, escolhas e magias aplicados uma vez. |
| 2B — Antecedente | Antecedentes, atributos, proficiências e pacotes; fluxo 3 | Distribuição permitida; perícias/ferramenta/talento; kit completo ou moedas. |
| 2C — Classe e multiclasse | Classes, proficiências e ordem de níveis; fluxo 4 | Dado de vida, salvaguardas, treinamento, escolhas e distinção da classe inicial. |
| 2D — Progressão | Níveis, concessões, efeitos e conjuração | Marcos da classe, subclasses, talentos, atributos e recursos por nível. |
| 3 — Vida, CA e movimento | Efeitos, histórico de PV; fluxo 5 | Dados corretos por classe, primeiro nível, Constituição, ganho mínimo por nível e fórmulas de CA. |
| 4 — Magias e espaços | Perfis e progressões; fluxo 6 | Fontes raciais/talentos/classes, atributos elegíveis, espaços combinados e pacto. |
| Pedido adicional — Banco estruturado e CRUD futuro | Modelo relacional, carga e repositório | Alterar/adicionar conteúdo compatível no banco altera os seletores sem modificar o frontend. |

## 14. Validação prevista para a implementação

1. **Dados:** inventário de todos os elementos de fonte, IDs legados resolvíveis, relações completas, variantes preservadas, PT-BR e importação idempotente sem sobrescrever edições posteriores.
2. **Banco:** executar migrações e carga em PGlite; testar FK/constraints, publicação, leitura pública, bloqueio de escrita para jogador/mestre, manutenção por admin e isolamento das escolhas privadas.
3. **Regras:** atributos com valores repetidos distribuídos por índice; troca de antecedente/espécie; talentos com requisitos e limites; concessões comuns sem duplicação; mesma magia por duas fontes; equipamentos alternativos; progressão e mudanças de Constituição.
4. **PV:** primeiro nível total máximo; entrada em uma nova classe sem novo máximo; mistura de d6/d8/d10/d12; ganhos mínimos por nível; alteração de Constituição sem rerrolagem.
5. **Conjuração:** classe única, duas conjuradoras, paladino/patrulheiro com níveis ímpares, subclasses de um terço, bruxo com outra classe e magia de espécie/talento em personagem sem classe conjuradora. Conferir espaços separadamente das magias elegíveis.
6. **Persistência:** criar uma vez mesmo com reenvio; falha não deixa relações parciais; snapshot e revisão fixados; conflito de edição; exportar/importar fichas novas e antigas; importação Roll20 preservada.
7. **Interface:** percorrer todo o assistente em desktop e celular; teclado, foco, rótulos, erros, escolhas dependentes, voltar entre etapas, perda de conexão e preservação de valores. Conferir capturas e ausência de overflow.
8. **Regressão:** `npm test`, `npm run build` e testes Playwright pertinentes a fichas, compêndio, magias, sessão, persistência e Roll20. Conferir a integridade legada já existente no build.

## 15. Decisões propostas para aprovação

Aprovar a abordagem relacional com revisões e procedência, todo o acervo existente incluído no inventário de migração, núcleo 2024 revisado em português, criação em sete etapas e integração compatível com as fichas atuais. Preservar o modo manual/homebrew e deixar a interface de CRUD para depois.

Após a revisão desta especificação, preparar o plano de implementação com tarefas, migrações, contratos, carga e testes. Este documento descreve o resultado pretendido; não afirma que o compêndio ou o assistente já tenham sido implementados.
