# Mesa persistente durante sincronização

## Intenção e diagnóstico

A mesa é um espaço de jogo compartilhado e contínuo. Movimentar um token, alterar uma camada ou receber uma alteração remota não pode desmontar a interface, perder seleção, foco, rascunhos, câmera ou imagens. O usuário pediu planejamento e implementação desta correção após a solução limitada ao fundo não resolver os demais elementos.

O problema está em `useTabletop`: cada notificação de `invalidacoes_mapa` limpa o snapshot e as coleções, ativa o carregamento bloqueante e depois publica partes da resposta em momentos diferentes. Os componentes condicionais desaparecem, revogam URLs e perdem estado local. Há também inputs com `key` baseado em versão, que remontam quando um token apenas se move. Os testes antigos que exigiam desaparecimento durante uma atualização codificavam esse comportamento incorreto.

## Referência de interação

O [Select and Pan do Roll20](https://help.roll20.net/hc/en-us/articles/360039674873-Select-and-Pan-Tools) descreve manipulação direta, seleção por retângulo e pan acessível durante o uso de outras ferramentas. O [Tabletop Overview](https://help.roll20.net/hc/en-us/articles/360039734913-Tabletop-Overview) separa os objetos da mesa de sua navegação. Nossa decisão de arquitetura é manter esse espaço e suas ferramentas estáveis durante a sincronização. A documentação pública não é evidência da implementação interna do Roll20.

## Abordagens e decisão técnica

1. Preservar individualmente fundo, tokens e painéis: mantém exceções frágeis e ainda permite combinar dados de revisões diferentes.
2. Mesa persistente com substituição atômica do estado confirmado: mantém a API autoritativa existente e resolve o ciclo destrutivo em sua origem. **Escolhida para esta implementação.**
3. Protocolo de deltas por entidade: pode reduzir tráfego futuramente, mas exige novas garantias de ordenação, privacidade e recuperação no servidor; não é necessário para eliminar a desmontagem.

## Contrato

- Notificação significa que existem dados novos, não que o conteúdo já autorizado deva desaparecer. Reter a última visualização coerente até confirmar a próxima.
- Preparar cenas, cena selecionada, snapshot, tokens, áreas e arquivos antes de publicar um único estado. Máscara de visão e geometria vêm do mesmo snapshot.
- Carregamento bloqueante somente na primeira leitura, troca explícita de cena e mudança de campanha, identidade ou papel. Atualização de fundo não desabilita ferramentas.
- Fichas e sessão usam uma leitura compartilhada por contexto, separada da cena: um serviço lento não bloqueia o mapa nem acumula consultas. Respostas dessas fontes não são descartadas por simples movimento de token; contexto e negação confirmada continuam cercando sua aplicação.
- Erro transitório mantém a mesa e informa falha de sincronização. Uma resposta confirmando acesso negado limpa os dados; listas autorizadas vazias e entidades excluídas removem apenas o que deixou de existir/estar visível.
- Conteúdo anteriormente autorizado pode permanecer visível pelo tempo da revalidação. Não antecipar visibilidade, revelar novas células usando movimentos locais ou restaurar dados de uma leitura anterior a uma notificação mais recente. Escritas continuam validadas pelo servidor.
- Eventos em rajada são agrupados em uma leitura ativa e uma próxima leitura. Respostas de outra geração/cena/identidade ou anteriores a uma invalidação pendente não substituem o estado atual.
- Movimento otimista altera só coordenadas já permitidas e permanece até confirmação autoritativa, rejeição ou cancelamento. Falha de releitura após sucesso da escrita não devolve visualmente o token ao ponto inicial.
- Identidade de componentes é o ID estável da entidade. Campos preservam o valor digitado e o foco durante atualizações de outros campos; campos não editados recebem o valor novo. Conflitos reais continuam sujeitos à versão do servidor.
- Texto novo na interface em português brasileiro. Sem mudanças de permissões, migrações de banco ou novas dependências.

## Verificação exigida

Playwright com SDK real, WebSocket ativo e respostas controladas: observar identidade/conectividade de nós, ausência de remoções intermediárias, imagens, campos, foco e valores enquanto uma resposta está bloqueada e depois de sua aplicação. Cobrir movimentos locais/remotos, camadas, falhas e recuperação, neblina, acesso revogado, exclusão e respostas atrasadas. Testar desktop e celular. Os cenários simulam campanhas; não afirmar teste autenticado em produção.
