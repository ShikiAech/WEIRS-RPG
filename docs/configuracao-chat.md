# Ativar o chat e as rolagens

O login Google e as fichas já estão funcionando. Esta etapa usa **o mesmo projeto Supabase e o mesmo `.env.local`**. Não precisa criar outro backend, mudar o OAuth ou adicionar chaves.

## 1. Instalar a migração no banco existente

1. Abra o painel do [Supabase](https://supabase.com/dashboard) e selecione o projeto que você configurou para o WEIRS.
2. No menu lateral, abra **SQL Editor** e clique em **New query**.
3. Abra o arquivo `supabase/migrations/202610070002_chat.sql` deste projeto.
4. Copie **todo o conteúdo**, incluindo `BEGIN;` e `COMMIT;`, e cole na consulta nova.
5. Execute com **Run**, usando a conexão administrativa padrão do SQL Editor (`postgres`).
6. Aguarde a confirmação de sucesso. É normal aparecer “Success. No rows returned”.

Execute esta migração **uma vez**. Ela cria o histórico, a função de envio/rolagem, as permissões e habilita a tabela no Realtime quando a publicação padrão está disponível. Suas campanhas e fichas existentes são preservadas. Você não precisa executar novamente a migração de fundação ou o seed.

### Aviso sobre RLS em `private.comandos_chat`

**Habilite RLS.** O arquivo atualizado já inclui `ALTER TABLE private.comandos_chat ENABLE ROW LEVEL SECURITY;`. Se você ainda não executou a consulta, copie novamente o conteúdo do arquivo atualizado para o SQL Editor.

Se já executou a versão anterior, execute **somente** `supabase/migrations/202610070003_chat_receipts_rls.sql`; ela habilita RLS na tabela existente e preserva os recibos e mensagens. Não repita a migração completa de criação nesse caso.

Essa tabela guarda os identificadores que evitam duplicação de rolagens. Ela permanece sem políticas de acesso para clientes, além dos privilégios já revogados. A função de envio acessa os recibos como proprietária da tabela, depois de verificar o usuário e a campanha. Com RLS habilitada e sem políticas, o PostgreSQL nega o acesso normal por padrão; o proprietário continua podendo operar a tabela. [Documentação do PostgreSQL](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

Se aparecer que `mensagens_chat` já existe, a migração pode já ter sido instalada. Confira a tabela e a função antes de repetir comandos; não apague o histórico para tentar novamente.

## 2. Conferir o Realtime

Ainda no SQL Editor, crie outra consulta e execute:

```sql
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
  AND tablename = 'mensagens_chat';
```

O resultado deve conter uma linha com `public` e `mensagens_chat`.

**Se não retornar nenhuma linha**, habilite a tabela `mensagens_chat` na publicação `supabase_realtime`, na seção de publicações do banco no painel. Também pode executar o comando abaixo, somente se a consulta anterior retornou vazio e a publicação padrão existe:

```sql
ALTER PUBLICATION supabase_realtime
ADD TABLE public.mensagens_chat;
```

Essa configuração segue a [documentação oficial de Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes). A interface assina somente as mensagens da campanha selecionada, e o Supabase verifica a permissão de leitura de cada participante.

## 3. Abrir e testar

Na pasta do projeto, execute:

```powershell
npm run dev
```

Abra `http://127.0.0.1:5173/WEIRS-RPG/app.html#/chat`, entre com Google e selecione a campanha. As contas precisam continuar cadastradas em `membros_campanha`, conforme o [guia da mesa](configuracao-supabase.md).

1. Envie uma mensagem comum, como `A porta está trancada?`.
2. Envie `/r 1d20+5`.
3. Confira o cartão com expressão, dado individual, bônus e total.
4. Atualize a página: a mensagem e a rolagem devem continuar no histórico.
5. Abra a mesma campanha em outro navegador ou perfil, com outra conta autorizada. As novas mensagens devem aparecer nos dois, com o indicador **Ao vivo**.

Jogadores e mestres enviam mensagens e rolam dados. Espectadores acompanham a conversa com envio desabilitado. Cada campanha tem seu próprio histórico.

## 4. Comandos e dados rápidos

| O que você quer                        | Comando           |
| -------------------------------------- | ----------------- |
| Teste com bônus                        | `/r 1d20+5`       |
| Dano com vários tipos de dado          | `/roll 2d6+1d4-2` |
| Vantagem                               | `/r 2d20kh1+5`    |
| Desvantagem                            | `/r 2d20kl1+5`    |
| Quatro dados, mantendo os três maiores | `/r 4d6kh3`       |

`kh` mantém os maiores dados e `kl` mantém os menores. Os descartados aparecem riscados; o total considera somente os selecionados. Soma e subtração são permitidas. Multiplicação, parênteses e código não são aceitos.

Os botões `d4` até `d100`, **Vantagem** e **Desvantagem** preenchem o campo para você ajustar o bônus. Depois clique em **Enviar**. Enter envia; Shift+Enter insere uma linha nova.

Limites: expressão de até 120 caracteres, até 100 dados no total, faces entre 2 e 1000, constantes até 9999 e texto de até 2000 caracteres. Até 30 novos envios por participante/campanha em 10 segundos.

## 5. Usar ataques e magias da ficha

1. Abra uma ficha salva na mesma campanha.
2. Na aba **Combate**, adicione um ataque e preencha nome, tipo, bônus/CD e fórmula de dano. Exemplo: `Espada longa`, bônus `7`, dano `1d8+4`.
3. **Salve a ficha.** Os botões de rolagem ficam indisponíveis enquanto houver alterações pendentes.
4. Escolha **Normal**, **Vantagem** ou **Desvantagem** e clique em **Rolar ataque**. O banco lê o bônus da versão salva e envia o resultado ao chat.
5. Clique em **Rolar dano** para uma rolagem separada usando a fórmula de dano. Ataques configurados com CD oferecem **Anunciar CD**.
6. Use **Ver no chat** para abrir o resultado na campanha correta.

Na aba **Magias**, vincule a magia a um **perfil de conjuração**, configure o atributo e os ajustes e salve. **Conjurar no chat** anuncia a magia e a CD do perfil. **Rolar ataque** usa o bônus de ataque do perfil; use esse botão para magias que pedem uma jogada de ataque. Uma magia personalizada sem perfil pode ser anunciada sem CD.

Os cálculos incluem nível total da multiclasse, proficiência, atributo e ajustes homebrew. O servidor confere campanha, proprietário/papel e versão da ficha; o navegador não escolhe o resultado dos dados. Mestres podem usar as fichas da campanha que administram; jogadores usam suas próprias fichas.

Para acessar a ficha dentro do chat, registrar iniciativa/turnos, alterar PV e recursos e comprar/vender itens, instale a migração adicional seguindo o [guia da sessão jogável](configuracao-mesa.md). Ele também permite configurar dano de magia em um campo próprio; o aplicativo não extrai fórmulas de descrições livres.

## 6. Falhas de conexão e reenvio

Se aparecer **Reenviar mesma tentativa** ou **Reenviar mesma ação**, use esse botão. A operação conserva seu identificador: se o servidor já gravou o resultado, ele devolve a mesma mensagem, sem rolar outra vez.

**Liberar nova mensagem/ação** inicia uma tentativa diferente. Confira o histórico antes de fazer isso. Se você atualizar ou fechar a página, consulte a conversa antes de repetir a rolagem: o resultado salvo permanece no banco, mas a tentativa pendente do navegador não é uma fila offline.

O chat recupera mensagens depois de reconectar e oferece **Carregar mensagens anteriores**. Quando o WebSocket estiver indisponível, há sincronização periódica enquanto a página está visível. O indicador mostra esse estado. Se a leitura falhar, use **Atualizar histórico**; o retorno da conexão também tenta recuperar a conversa.

## 7. Dados em 3D

**Mesa de dados 3D** é um accordion integrado ao chat e às fichas. Ele começa aberto, conserva a última rolagem e permanece visível enquanto você percorre a conversa. **Animar meus dados em 3D** fica ligado por padrão. Ao enviar `/r` ou `/roll`, ou usar um botão de ataque/dano que realmente lança dados, a animação começa após a confirmação do servidor. Experimente `/r 2d20kh1+5` ou `/r 2d6+1d4+3`.

No chat, a mesa fica em um cartão com borda no rodapé da conversa, próximo da mensagem mais recente. No desktop, ela divide a linha com o campo de envio; no celular, fica logo acima dele. O cartão tem até 360 px de largura e acomoda seis modelos em duas linhas de três. Conversas curtas são alinhadas ao fim da área de mensagens para manter os resultados próximos do painel. A mesa fica fora da área rolável do histórico, conservando sua posição enquanto você consulta mensagens antigas.

A animação termina nos valores já gravados no chat. Enquanto os dados se movem, o chat mostra **Rolando dados…**; total, faces individuais e resumo do painel são revelados juntos ao final. Esse comportamento também cobre confirmações que chegam por Realtime ou pelas consultas de recuperação antes da resposta HTTP. Dados descartados usam números cinza; o resumo identifica os descartes e conserva o total com os modificadores. Um d100 aparece como dois dados: dezenas e unidades. Nas unidades, a face `10` representa zero; `00` + `10` representa 100. Texto, anúncio de CD e expressões somente com constantes são exibidos imediatamente.

Use **Recolher −** e **Expandir +** no cabeçalho para controlar o accordion. A preferência de aberto/recolhido fica salva neste navegador. Recolher durante uma animação libera os resultados imediatamente; reabrir mostra a última pose parada, sem repetir a rolagem. O painel conserva o resultado até a próxima rolagem ou até você mudar de página/campanha ou sair da conta. Envios consecutivos entram em uma fila de animações e cada resultado aguarda a sua vez. Só os seus envios confirmados acionam o 3D: histórico e eventos fora de uma tentativa de envio permanecem disponíveis para leitura imediata. Se uma tentativa pendente for confirmada durante recuperação da conexão, ela também é animada; reenviar a mesma tentativa conserva o resultado e não repete a animação.

Para economizar GPU ou evitar movimento, desmarque a opção. Essa preferência fica salva neste navegador. A preferência de **movimento reduzido** do dispositivo pausa as animações automaticamente. Desligar o 3D, recolher o accordion, falha dos modelos ou ausência/perda de WebGL libera os resultados pendentes e preserva os valores gravados no banco.

Os modelos cobrem d4, d6, d8, d10, d12, d20 e o par percentual. A cena exibe até **20 modelos**, preservando pares percentuais inteiros. Faces homebrew fora desse conjunto e dados excedentes permanecem no resultado completo do chat.

Não há nova migração ou configuração no Supabase. Os modelos e texturas são arquivos do próprio app, copiados automaticamente de `public/dice` para `dist/dice` pelo build. O módulo Three.js é carregado sob demanda. Publique o `dist` completo, incluindo a pasta `dice` e os chunks em `assets`.

Modelos gratuitos: [Dice Themes, de Frank Ali / 3D Dice](https://github.com/3d-dice/dice-themes), sob [licença MIT](https://github.com/3d-dice/dice-themes/blob/main/LICENSE). Renderização: [Three.js](https://github.com/mrdoob/three.js), também MIT. Origem, revisão, hashes e textos das licenças estão em `public/dice/SOURCES.md`, `LICENSE` e `THREE-LICENSE`. A animação usa trajetórias e rotações visuais; a aleatoriedade da partida continua exclusivamente no servidor.

## Problemas comuns

| Sintoma                                            | O que conferir                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Login funciona, mas o chat não carrega             | Execute a nova migração no mesmo projeto Supabase usado no `.env.local`.                                      |
| Função não encontrada após instalar a migração     | Aguarde a atualização do cache da API; se necessário, execute `NOTIFY pgrst, 'reload schema';` no SQL Editor. |
| Mensagens aparecem após atualizar, mas não ao vivo | Confira a publicação no passo 2, a conexão WebSocket e se as duas contas participam da mesma campanha.        |
| Conta não participa de campanha                    | Adicione a conta em `membros_campanha`; login Google sozinho não concede acesso.                              |
| Envio desabilitado                                 | Confira se a conta é espectador, se o histórico ainda está carregando ou se o acesso foi encerrado.           |
| Dados da ficha desabilitados                       | Salve as alterações e confira se você pode editar essa ficha.                                                 |
| Ficha alterada ao rolar                            | Outra edição mudou a versão no banco. Feche e reabra a ficha para carregar a versão atual.                    |
| Fórmula de dano rejeitada                          | Use somente dados, constantes, soma/subtração e kh/kl, dentro dos limites acima.                              |

## Evidências locais

Dados 3D: 23 testes de lógica/banco e 62 testes de navegador passaram, incluindo desktop e Pixel 7. Os testes carregam os modelos locais e o renderizador WebGL real; cobrem todas as orientações do catálogo, percentuais, descartes, preferência visual, confirmação atrasada, histórico sem animação, ações da ficha e ausência/perda de WebGL. O accordion foi verificado dentro do chat, visível na viewport durante o lançamento, mantendo a última pose e a preferência de aberto/recolhido. A revelação foi testada com Realtime antes da RPC, recuperação de resposta perdida e rolagens consecutivas em fila. Recolher e desligar liberam os números; reabrir e reenviar não repetem a animação. Capturas em desktop e celular foram inspecionadas. O build preservou os 86 arquivos originais e separou o renderizador em um chunk carregado sob demanda. O Vite ainda avisa sobre chunks maiores que 500 kB; o chunk 3D tem aproximadamente 132 kB comprimidos e não é baixado antes de uma animação.

Os testes de banco usam PostgreSQL/PGlite real para permissões, dados, limites, versões e reenvio. Os testes de navegador usam o SDK Supabase real com HTTP/WebSocket simulados, incluindo entrega entre duas janelas e reconexão. A instalação da migração e o teste com duas contas no seu Supabase hospedado são os passos de ativação desta entrega; não foram executados automaticamente nesta sessão.
