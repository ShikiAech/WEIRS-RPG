# Auditoria de criação de fichas — 17/10/2026

As três rodadas de dez agentes distintos foram concluídas, com triagem de PO, correções e verificação entre rodadas. O código ficou congelado durante cada rodada. Evidências individuais em `artifacts/ux-swarm/rN/aNN/report.md`; a matriz registra os 30 escopos. As fontes homebrew locais prevalecem.

## Backlog consolidado pelo PO

| ID | Prioridade | Problema confirmado | Decisão / resultado |
| --- | --- | --- | --- |
| UX-01 | P1 | Patrulheiro sem lista de magias pelo token legado guardião | Corrigido; listas e negativos aprovados na R2 |
| UX-02 | P1 | Invocações de Bruxo e Metamagia sem seleção/alvo permanente | Corrigido; limites, requisitos, alvo conhecido e repetição distinta; motor/regressões aprovados |
| UX-03 | P1 | Perícias/instrumentos de Bardo e especializações Bardo/Ladino/Mago ausentes | Corrigido; escolhas nos níveis da fonte, treino anterior e duplicatas validados; Arcana mapeada para Arcanismo |
| UX-04 | P1 | Mestre de Batalha conclui sem manobras, perícia ou ferramenta | Corrigido; ficha final R2 com três manobras e treinamentos |
| UX-05 | P1 | Três antecedentes especiais exigem talento vazio ou rejeitado por requisitos incompletos | Corrigido PO2; categorias corretas,12 talentos curados, escolhas/perfis e exclusividade Pacto; três fichas do motor válidas |
| UX-06 | P1 | Humano e Elfo base forçam variante opcional | Corrigido; variantes opcionais, todas18linhagens vinculadas |
| UX-07 | P2 | Mago confunde grimório e preparadas; cotas pouco claras | Corrigido; contadores6/4 distintos, orientação e preparação automática até cota |
| UX-08 | P2 | Magias/perfil/atributo racial ausentes em Onis, Yun'kais, Elfos e Gélido | Corrigido em catálogo/motor; progressão1/3/5, atributo conforme fonte; cobertura UI ampliada R3 |
| UX-09 | P1 | Escolhas raciais de proficiência/talento/configuração sem controles ou opções | Corrigido; talentos Human/Meio-Elfo preenchidos ao final, novas perícias/expertise/configurações tipadas |
| UX-10 | P2 | N0-V4 ignora forma, PV, CA e deslocamento | Corrigido; ficha/export R2 verifica natural/exotraje e módulos sem vazamento |
| UX-11 | P2 | Movimentos, sentidos e resistências fixas omitidos | Corrigido; voo/natação/escalada/visão e resistências de 12 origens conforme fonte; condições narrativas preservadas |
| UX-12 | P2 | Maestrias ausentes/ilegais, incluindo Etherforge à distância como corpo a corpo | Corrigido; maestrias e classificação da arma, preservando arremesso de Adaga |
| UX-13 | P2 | Conhecimento Primitivo e ferramenta/instrumento Monge ausentes; perícia adicional repetida | Corrigido; controles/treinamentos, seleção de perícia nova validada |
| UX-14 | P2 | Estilos conjuradores Paladino/Patrulheiro ausentes | Corrigido; dois truques Clérigo/CAR ou Druida/SAB; fichas R2 aprovadas |
| UX-15 | P2 | Iniciado sem lista mostra magias de todo o catálogo | Corrigido; busca bloqueada até lista, stale removível e origem independente preservada |
| UX-16 | P3 | Rótulo 0 conhecidas sem cota; filtro inicial vazio | Corrigido; rótulos por método e círculo inicial disponível |
| UX-17 | P1 | Nível não aceita vazio; digitar3→12 apaga subclasse/PV no intermediário1 | Corrigido; obrigatório/inválidos bloqueiam, aplicação no blur preserva dados; ficha mobile12 aprovada |
| UX-18 | P1 | Ordens Clérigo/Druida e idioma/Herbalismo ausentes; Druídico bloqueia ficha; truque extra repete base | Corrigido; escolhas e benefícios suportados, truque distinto e Druida completo com regressão |
| UX-19 | P2 | Objeto de kit não acompanha jogo/ferramenta escolhida; Couro/Escudo/Foice sem tipos equipáveis | Corrigido; vínculo obrigatório mesmo com objeto antigo, kitB remove objeto mantendo treino; CA15 aprovada |
| UX-20 | P2 | Magias sempre preparadas Paladino/Patrulheiro não concedidas | Corrigido; Golpe Divino e Hunter's Mark/Marca do Predador fora da cota, usos/recuperação e progressão corretos |
| UX-21 | P1 | SQL/decode descarta novos metadados; seed conflita em commit de fonte idêntica | Corrigido; migração 13 e upgrade idempotente preservam 2.985 revisões e 38 entradas com metadados; diferença de conteúdo continua rejeitada |
| UX-22 | P1 | Artífice sem quatro planos conhecidos, ferramentas e truque fixo | Corrigido; planos e tiers da fonte, ferramentas fixas/escolhida, Reparar/Mending automático fora da cota; dez regressões aprovadas |
| UX-23 | P2 | Recarregar página perde rascunho; edição de nível restaurada não sincroniza cálculo | Melhoria aceita e corrigida; sessionStorage por conta/campanha, limpeza e idempotência; níveis válidos restaurados aplicados sem alterar campo em foco |
| UX-24 | P2 | Exclusividade de Pacto impede substituir o talento no mesmo campo | Corrigido; requisitos consideram remoção da escolha anterior, preservando exclusividade entre origens |

Na rodada final também foram corrigidos Arcanismo inicial do Mago, repetição de invocações no mesmo nível, disponibilidade de manobras já aprendidas, resistências fixas de 12 origens e armadura de couro cravejado tipada. A UI identifica magias automáticas como concedidas e fora da cota normal.

## Evidência que passou na rodada 1

- Linhagens/castas/clãs: 18 opções vinculadas às espécies corretas, incluindo os casos iniciais Oni e Talpa.
- Limites de círculo por classe e espaços de Pacto separados dos espaços normais nas multiclasses exercitadas.
- Mago não oferece Curar Ferimentos; Clérigo não oferece Mísseis Mágicos nos casos negativos inspecionados.
- Criminoso 2024 produziu ficha temporária com atributos, perícias, Alerta, ferramenta, kit e moedas esperados.
- Quatro jornadas marciais chegaram à ficha temporária, permitindo comprovar omissões e seleção inválida no resultado, além dos formulários.

## Limites atuais

Validação final: **302 testes e 76 testes de navegador aprovados**, em desktop/mobile; TypeScript e build aprovados, com 122 arquivos originais preservados. Integração SQL real aprovada com carga integral duas vezes, upgrade da versão anterior e paridade dos metadados. Revisão independente comparou 54 prévias das 18 linhagens entre snapshot e dados relacionais, sem divergências. Catálogo gerado: 3.126 registros, 18 linhagens, 336 grupos de escolhas e 35 perfis de conjuração, sem erros de validação. Pacote de atualização final testado e idempotente; revisões e correções priorizadas encerradas.

As 30 avaliações foram concluídas e os achados priorizados receberam correções e revisão independente. O teste de rascunho é uma melhoria autorizada pelo PO; o contrato anterior previa apenas memória da aba. A auditoria usou demonstração local e não criou fichas reais.

Ao encerrar a auditoria, antes da autorização de publicação, sub-raças iniciais e migração 13 já estavam aplicadas diretamente no Supabase; catálogo de mecânicas, Edge Function e frontend estavam preparados localmente. A publicação foi autorizada pelo usuário em 17/10/2026 para a `main` e o site oficial. A entrega usa implantação coordenada desses três componentes para manter a validação canônica do servidor compatível com a prévia do cliente.

Na preparação da publicação, os 302 testes unitários passaram novamente. A suíte completa de navegador aprovou 241 cenários e identificou uma corrida no teste de revogação do chat: o segundo catch-up inicial revogava corretamente o acesso antes do clique. O teste passou a aguardar a sincronização inicial; seis repetições desktop/mobile passaram, preservando as exigências de revogação e limpeza. As 3.126 novas revisões do catálogo foram carregadas como rascunho com hashes conferidos; as 3.043 revisões publicadas e os apontamentos ativos anteriores foram preservados antes da ativação.

Produção ativada em 17/10/2026: [commit funcional 0f1521e](https://github.com/ShikiAech/WEIRS-RPG/commit/0f1521eda79f110a29b0bc8a23a489ed6a67cfaa), [deploy GitHub Pages aprovado](https://github.com/ShikiAech/WEIRS-RPG/actions/runs/39066817426), Edge Function `criar-personagem` versão2 ativa com JWT obrigatório e 3.126 revisões novas atuais/publicadas no Supabase, sem rascunhos restantes. As 3.043 revisões publicadas anteriores foram preservadas. No [site oficial](https://shikiaech.github.io/WEIRS-RPG/app.html), smoke desktop/mobile aprovou Oni3, Talpa3, nível vazio obrigatório, digitação de12 com subclasse preservada e recuperação após reload; sem erros JavaScript. A API real aprovou contextos de Oni/Talpa/N0-V4/Artífice/Bruxo, os metadados novos e quatro consultas positivas/negativas de magias de Mago/Clérigo. Nenhuma ficha real foi criada.

O CI integral do commit funcional aprovou241cenários e encontrou uma corrida adicional no teardown do teste de privacidade de áreas do mapa; a leitura assíncrona de uma resposta continuava depois de `player.close()`. O teste passou a acompanhar as leituras, exigir resposta inspecionada, validar erros e drenar os bodies antes da asserção/fechamento. A conferência completa é repetida pelo [workflow de validação da main](https://github.com/ShikiAech/WEIRS-RPG/actions/workflows/check.yml).

A substituição de Silvestre quando já conhecido permanece descrita no talento. Planos genéricos de item comum do Artífice dependem de itens específicos elegíveis: o único comum atual é uma poção, proibida pela fonte, portanto não foi criada uma opção fictícia. Planos nomeados e maravilhosos de tipo/raridade comprovados estão disponíveis. Condições narrativas/de combate sem decisão permanente ficam no texto fonte.

A cobertura inclui jornadas completas/exportações e casos negativos em desktop/mobile. Não afirma todas as combinações possíveis de D&D nem 30 fichas finalizadas; cada relatório declara precisamente os cenários executados e seus limites.
