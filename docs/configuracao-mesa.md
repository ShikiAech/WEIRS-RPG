# Jogar a campanha pelo chat

O chat agora reúne **Minha ficha**, **Combate** e **Loja**. A sessão usa as fichas, campanhas, Google OAuth e projeto Supabase existentes. Nenhuma biblioteca ou serviço pago foi acrescentado.

## Ativação no Supabase existente

1. Abra seu projeto no [painel do Supabase](https://supabase.com/dashboard).
2. Entre em **SQL Editor → New query**.
3. Abra [`supabase/migrations/202610070004_mesa.sql`](../supabase/migrations/202610070004_mesa.sql) e copie **todo** o arquivo, de `BEGIN;` até `COMMIT;`.
4. Cole na consulta e execute **Run**, com a conexão administrativa padrão `postgres`.
5. Aguarde a confirmação de sucesso. Execute esse arquivo **uma vez**. Ele depende das migrações anteriores; se o chat ainda não estiver instalado, siga primeiro o [guia do chat](configuracao-chat.md).

O arquivo cria `public.mesas`, os recibos privados e duas funções públicas, amplia as ações de rolagem e habilita a publicação de `mesas` e `fichas` no Realtime. **RLS está habilitada nas duas tabelas novas**, e clientes não podem escrever nelas diretamente. Campanhas, fichas, mensagens e conteúdo original são preservados. Não repita as migrações de criação anteriores ou o seed.

Confira em outra consulta:

```sql
SELECT n.nspname AS esquema, c.relname AS tabela, c.relrowsecurity AS rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE (n.nspname, c.relname) IN
  (('public', 'mesas'), ('private', 'operacoes_mesa'));

SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
  AND tablename IN ('mensagens_chat', 'mesas', 'fichas');
```

A primeira consulta deve retornar duas linhas com `rls = true`. A segunda deve listar as três tabelas. Se a publicação padrão não existir no projeto, habilite-a antes de adicionar essas tabelas, conforme a [documentação de Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes). O painel também consulta os dados a cada seis segundos enquanto a página está visível e ao voltar a conexão.

Se aparecer “função não encontrada”, aguarde o cache da API ou execute:

```sql
NOTIFY pgrst, 'reload schema';
```

Se aparecer “tabela já existe”, verifique se a instalação anterior terminou; não apague dados para repetir a consulta. Esta entrega foi validada localmente; a migração remota precisa ser instalada no seu projeto.

Execute `npm run dev` e abra `http://127.0.0.1:5173/WEIRS-RPG/app.html#/chat`. O login e o `.env.local` continuam os mesmos. Cada conta deve ter uma linha em `membros_campanha`: mestre administra o encontro e a loja, jogador opera suas próprias fichas e espectador acompanha. Veja o [guia de participantes](configuracao-supabase.md).

## Preparar a ficha

Na ficha completa, selecione a campanha, preencha os dados e salve:

- Atributos, proficiências, especializações e ajustes homebrew determinam testes e resistências.
- Ataques precisam de nome, bônus ou CD e fórmula de dano, como `1d8+3`.
- Magias podem vincular um perfil de conjuração e ter uma **fórmula de dano opcional**, como `2d6+1`. A descrição livre é preservada.
- Configure espaços, pacto, dados de vida, recursos de classe e sua recuperação (`curto`, `longo` ou `manual`).
- Defina PV máximo, CA, inventário, sintonizações e moedas.

Fichas antigas continuam válidas; o campo opcional de dano não exige importar ou recriar personagens. O mestre pode selecionar qualquer ficha autorizada da campanha no painel.

## Ficha durante a sessão

Clique em **Minha ficha** no chat. A ficha abre em uma janela móvel, com rolagem interna. Arraste o cabeçalho ou use as setas no puxador para movê-la; **−/+** recolhem/expandem sem perder seu estado. Veja também o [guia de mapas, tokens e rolagens secretas](configuracao-mesa-virtual.md).

| Seção      | Operações                                                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Testes     | Atributos, resistências, perícias, iniciativa e salvaguardas contra morte; modo normal, vantagem ou desvantagem.                        |
| Ações      | Ataque, anúncio de CD, dano, conjuração, ataque de magia e dano configurado; aplicar/remover condições livres e controlar concentração. |
| Recursos   | Gastar/recuperar espaços, pacto e recursos; rolar e gastar dados de vida; descansos.                                                    |
| Inventário | Consultar moedas e itens; consumir uma unidade de item.                                                                                 |
| PV         | Dano, cura e PV temporários. Dano absorve temporários primeiro, cura respeita o máximo e temporários usam o maior valor.                |

Os botões leem a **versão salva da ficha no banco**. O servidor calcula o bônus e os dados; a animação 3D e a revelação do resultado usam o fluxo do chat existente. Clicar na ficha preserva o texto que você está escrevendo no chat.

Gaste o espaço escolhido em **Recursos** quando conjurar uma magia. Isso permite truques, rituais, conjuração em círculo maior e exceções homebrew sem assumir regras pela descrição. Consumo de poção reduz a quantidade; role a cura e aplique o valor nos PV. Resistências, vulnerabilidades, acerto, crítico, alcance, duração, concentração após dano e economia de ações são decisões da mesa.

O teste de morte atualiza os contadores, considera os resultados naturais 1 e 20 e impede novas rolagens após três sucessos ou falhas. Dano recebido com zero PV, morte instantânea e estabilização por outros meios são ajustados pelo mestre na ficha completa. Dados de vida gastam uma unidade e curam o resultado somado à Constituição, limitado ao PV máximo.

Descanso curto recupera pacto e recursos marcados `curto`. Longo recupera PV, espaços e recursos `curto`/`longo`, zera PV temporários e contadores de morte e reduz exaustão em um. Por padrão recupera **todos** os dados de vida, conforme [D&D 2024](https://www.dndbeyond.com/sources/dnd/br-2024/rules-glossary/); o seletor oferece metade do total para 2014 ou nenhum para ajuste manual. A ordem de recuperação pela metade segue a lista de dados de vida. Comece o descanso com PV positivos, após confirmação do mestre; o aplicativo não contabiliza horas, alimentação ou interrupções.

## Combate compartilhado

1. Cada jogador clica em **Iniciativa · entrar no combate** na ficha. A rolagem inclui o ajuste configurado e registra o personagem no encontro.
2. O mestre abre **Combate**, adiciona NPCs com nome, PV máximo, CA e iniciativa e clica em **Iniciar combate**.
3. A lista segue a iniciativa decrescente. Empates usam o identificador para manter uma ordem estável. **Próximo turno** avança a vez e incrementa a rodada ao retornar ao início.
4. Ataque e dano são rolados pela ficha ou por `/r`. A mesa compara ataque e CA e aplica dano/cura: na ficha para personagens e nos controles de PV do encontro para NPCs.
5. PV, temporários, CA, condições e concentração dos personagens refletem as fichas atuais. O mestre pode remover combatentes e encerrar o encontro. Remover quem está agindo passa ao seguinte; remover o último da rodada inicia a próxima.

O encontro persiste ao fechar o painel ou recarregar a página. Encerrar mantém a lista para consulta; remova combatentes antigos antes de preparar outro encontro. Rolar iniciativa novamente atualiza a entrada do personagem.

Os participantes veem os dados de combate necessários dos personagens, incluindo PV/CA/condições. Histórias privadas, moedas, inventário e a ficha completa dos outros jogadores continuam sujeitos às permissões de ficha.

## Loja em popup

O mestre clica em **Loja**, define o nome, cadastra produtos e seus preços de compra/venda em **PC**, estoque e abre os negócios. O preço de venda não pode superar o preço de compra.

O jogador seleciona sua ficha, escolhe a quantidade e usa **Comprar** ou **Vender**. A venda exige um item do inventário com o mesmo nome de uma oferta; o mestre cadastra itens aceitos pela loja. Itens sintonizados devem ser dessintonizados na ficha antes da venda.

Saldo, estoque e inventário mudam na **mesma transação**. A conversão utiliza PC/PP/PE/PO/PL sem perder valor, dando o troco em moedas normalizadas. Uma compra cria uma entrada de inventário; peso, cargas e outros detalhes são configurados depois na ficha completa. A loja não importa automaticamente equipamentos do compêndio.

Editar uma oferta preserva a versão de quando a edição começou. Se outra janela negociar ou alterar a mesa, o servidor recusa o rascunho antigo; reabra a oferta para revisar estoque e preços atuais antes de salvar. Isso evita restaurar estoque já vendido.

A compra/venda também confirma o preço unitário exibido. Se ele mudou no servidor, a transação é recusada sem gastar moedas e a oferta atual é recarregada para você revisar.

## Conexão, versões e segurança

- Uma alteração em outra janela recarrega a versão atual e pede que você confira antes de repetir a intenção. O editor completo mantém seu controle de conflitos e exportação de rascunho.
- Se uma resposta se perder, **Reenviar operação** recupera o mesmo recibo: não compra, vende, gasta recurso nem altera PV duas vezes. Navegação, saída da conta e fechamento do painel ficam bloqueados durante confirmação ou tentativa sem resposta.
- **Liberar nova operação** abandona a tentativa local após conferir o histórico. Fechar forçadamente o navegador não cria uma fila offline; confira o histórico antes de repetir.
- Perder acesso limpa os dados da ficha e da mesa no painel. O banco confere usuário, campanha, papel e propriedade a cada operação, inclusive reenvios.
- Relatos de operação aparecem no histórico. São limitados a 40 operações novas em dez segundos por usuário/campanha; rolagens seguem o limite do chat.

## Revisão frente ao Roll20 e alcance desta entrega

As referências foram a [ficha do Roll20: cabeçalho, PV, testes e iniciativa](https://roll20.net/compendium/dnd5e/00%20Start%20Here:Help-%20DnD%20Fifth%20Edition%20Character%20Sheet-%20Header) e o [inventário com moedas](https://app.roll20.net/compendium/dnd5e/00%20Start%20Here%3AHelp-%20DnD%20Fifth%20Edition%20Character%20Sheet-%20Inventory%20Tab). O objetivo funcional foi reunir os controles durante a conversa e manter as ações ligadas à ficha.

| Necessidade                        | Antes                                       | Agora                                                               |
| ---------------------------------- | ------------------------------------------- | ------------------------------------------------------------------- |
| Testar e atacar durante a conversa | Alternar para o editor ou digitar comandos. | Ficha lateral com botões, fórmulas salvas e animação integrada.     |
| Acompanhar luta                    | Campos de ficha e texto no chat.            | Encontro persistente, iniciativa, turnos, rodadas e PV de PCs/NPCs. |
| Gastar e recuperar recursos        | Editar a ficha inteira.                     | Operações incrementais com limites, versão e registro no chat.      |
| Comprar/vender                     | Alterar moedas e inventário manualmente.    | Loja modal com administração pelo mestre e transações atômicas.     |
| Receber alterações                 | Atualizar ou reabrir ficha.                 | Realtime e recuperação periódica do painel de sessão.               |

É possível jogar uma campanha por **teatro da mente**, da narrativa ao combate e comércio, com adjudicação do mestre. **Mapas com tokens, iluminação, neblina, mensagens privadas, upload de arquivos e automação completa de regras permanecem pendentes.** Esta entrega não declara equivalência a uma plataforma VTT completa. O caminho de mapas/storage continua no [plano geral](plans/2026-10-07-webapp-migration.md).

## Verificação local

`npm test` aplica as migrações em PostgreSQL/PGlite e verifica permissões, versões, repetição, dados de vida/morte, limites de recursos, privacidade e comércio com rollback. `npm run test:browser -- --workers=1` usa Chromium em desktop e celular, o SDK real do Supabase e HTTP/WebSocket simulados; verifica a interface, respostas perdidas, conflitos e revogação. O build verifica os 86 arquivos originais. Isso não substitui um teste de duas contas após instalar a migração no Supabase real.
