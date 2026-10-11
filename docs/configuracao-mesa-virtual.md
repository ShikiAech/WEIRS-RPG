# Ativar e usar a mesa virtual

A tela **Chat** agora é a mesa virtual: mapa ao centro, conversa à direita e janelas móveis de ficha, combate e dados. No celular, **Mapa** e **Chat** alternam a área principal. O login, as campanhas, as fichas e o conteúdo original continuam no mesmo projeto.

## Instalar no Supabase existente

Esta etapa depende das migrações `001` a `004` já instaladas. Não repita essas migrações, o seed ou a configuração de OAuth.

1. No [Supabase](https://supabase.com/dashboard), abra seu projeto e **SQL Editor → New query**.
2. Copie todo o arquivo [`202610110005_rolagens_secretas.sql`](../supabase/migrations/202610110005_rolagens_secretas.sql), incluindo `BEGIN;` e `COMMIT;`, e execute **Run** com a conexão administrativa padrão `postgres`.
3. Aguarde o sucesso. Em **outra consulta**, execute todo o arquivo [`202610110006_mesa_virtual.sql`](../supabase/migrations/202610110006_mesa_virtual.sql).
4. Execute cada arquivo **uma vez**, nessa ordem. Ambos preservam campanhas, fichas e mensagens. Se houver erro, a transação é revertida; guarde o erro antes de tentar novamente.
5. Se o aplicativo disser que a função não existe, atualize o cache da API:

```sql
NOTIFY pgrst, 'reload schema';
```

Confira o resultado:

```sql
SELECT n.nspname AS esquema, c.relname AS tabela, c.relrowsecurity AS rls
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE (n.nspname,c.relname) IN (
 ('private','rolagens_secretas'), ('private','operacoes_mapa'),
 ('public','cenas_mapa'), ('public','tokens_mapa'),
 ('public','arquivos_mapa'), ('public','marcadores_mapa'));

SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id='weirs-mesa';

SELECT schemaname, tablename FROM pg_publication_tables
WHERE pubname='supabase_realtime' AND schemaname='public'
 AND tablename IN ('mensagens_chat','cenas_mapa','tokens_mapa','arquivos_mapa','marcadores_mapa');
```

As seis tabelas devem indicar `rls=true`, o bucket deve ter `public=false`, e a publicação deve conter as cinco tabelas. A migração configura essa publicação quando a publicação padrão do Supabase existe. A interface também recupera alterações periodicamente enquanto está visível. Não crie um bucket público nem adicione chaves administrativas ao navegador.

O bucket aceita PNG, JPEG, WebP e PDF de até **5 MiB**, com reserva de até **100 MiB por campanha**, incluindo uploads pendentes. Imagens grandes são reduzidas para até 4096 pixels antes do envio; o original local não é alterado. PDFs não são convertidos. O arquivo enviado deve ter até 20 MiB para essa redução local. Downloads usam a sessão autenticada e URLs locais temporárias; arquivos privados não recebem URLs públicas. Consulte os [buckets privados do Supabase](https://supabase.com/docs/guides/storage/buckets/fundamentals).

Ao abrir a mesa, somente o fundo da cena e os retratos utilizados são baixados. Outras imagens são carregadas ao abrir a biblioteca e ficam em cache durante aquela sessão, reduzindo tráfego para a mesa de oito pessoas.

Execute `npm run dev` e abra `http://127.0.0.1:5173/WEIRS-RPG/app.html#/chat`. Esta sessão validou o banco e o app localmente; a instalação no projeto hospedado deve ser feita pelo SQL Editor conforme acima.

## Rolar em segredo

Com uma conta cujo papel é **mestre** nessa campanha:

1. No chat, escolha **Visibilidade da rolagem → Só mestres** e envie `/r 1d20+5`, ou use diretamente `/gmroll 1d20+5` (`/gr` também funciona).
2. Os jogadores recebem apenas **Rolagem secreta** e quem rolou. Expressão, nome da ação, dados individuais, bônus e total não estão no registro público nem no evento Realtime.
3. Os mestres autorizados veem o resultado e sua própria animação. Ao clicar em **Revelar resultado**, todos recebem uma nova mensagem com o mesmo resultado já calculado. Revelar ou reenviar não rola outra vez.
4. Volte para **Pública** antes de rolar iniciativa, testes de morte ou dados de vida. Essas ações modificam informações da mesa/ficha; o servidor recusa usá-las em segredo.

A opção também vale para testes, ataques e magias enviados pela ficha durante a sessão. Ser mestre em outra campanha não concede acesso aos segredos desta campanha. A autorização é conferida novamente nas leituras, revelações e reenvios.

## Preparar mapas e tokens

1. Como mestre, abra **Cenas e mapas** na barra de ferramentas do mapa e clique em **Nova cena**. Defina nome, dimensões de 4 a 100 células, distância por célula e grade. Uma célula começa com 5 pés.
2. Desmarque **Disponível aos jogadores** para preparar uma cena privada. A primeira cena publicada é exibida automaticamente; **Exibir na mesa** publica e ativa uma cena preparada em uma única operação. Todos acompanham a cena ativa; o mestre pode selecionar outras cenas para prévia.
3. Em **Arquivos da campanha**, envie uma imagem. Edite a cena e escolha esse arquivo como fundo. Imagens públicas da campanha podem ser usadas em cenas exibidas; o banco recusa publicar uma cena com um fundo reservado aos mestres.
4. Clique em **Novo token**. Defina nome, tamanho, cor e posição. É possível escolher um retrato, vincular uma ficha, atribuir um controlador ou vincular um NPC já adicionado ao combate.
5. **Oculto para jogadores** cria um token da camada do mestre. Seus dados não são entregues aos jogadores. **Bloquear movimento** impede os jogadores de arrastá-lo. O mestre mantém controle de todos os tokens.
6. O dono da ficha ou o controlador atribuído move o próprio token. Arraste para posicionar, use as setas após selecionar/focar ou segure **Alt** para mover sem encaixar na grade. Movimento é salvo ao soltar, com proteção contra edições simultâneas.

Tokens vinculados exibem PV e sinais de condições/concentração quando esses dados estão autorizados ou disponíveis no combate. O combatente atual recebe um aro de destaque. **Ficha do token** ou duplo clique abre a ficha autorizada. Remover um NPC do encontro preserva o token e desfaz seu vínculo com aquele combatente.

## Explorar e jogar

- **Mover mapa**, arrastar o fundo ou botão central/direito: deslocar a câmera. Roda do mouse e botões **+/−**: zoom. **Enquadrar mapa**: retornar ao enquadramento completo.
- **Régua**: arraste entre dois locais para medir distância em pés. A diagonal usa a mesma distância de uma célula, conforme a regra básica de D&D.
- **Marcar local**: aponta uma posição aos participantes da mesma cena por seis segundos. Marcadores de prévias privadas ficam somente para os mestres. Espectadores podem ver, mas não criar marcadores.
- **Cobrir áreas não reveladas** e **Revelar área**: o mestre abre retângulos no mapa. **Cobrir novamente** restaura a cobertura. Essa é uma máscara visual: o fundo completo é baixado pelo participante autorizado; use tokens ocultos e arquivos privados para segredos que precisam de proteção real.
- **Desenhar no mapa**: o mestre cria traços compartilhados. **Limpar desenhos** remove-os. Formas e áreas reveladas persistem com a cena.
- **Minha ficha**, **Combate** e **Loja** continuam disponíveis na barra da sessão. Arraste o cabeçalho das janelas para mover ou use as setas ao focar o puxador. **−/+** recolhem e expandem sem perder o estado da ficha. A posição fica salva neste navegador.
- A janela de dados conserva a última rolagem. Durante a animação, o total aguarda no chat. Recolher/desligar o 3D libera resultados pendentes. Janelas ociosas cedem espaço às ferramentas de mapa abertas.

Se uma confirmação se perder, use **Reenviar alteração** para recuperar a mesma operação. Se houver conflito de versão, a posição atual é recarregada; confira antes de tentar de novo. Uma tentativa ainda desconhecida bloqueia a troca de cena e a saída da conta até confirmar ou liberar explicitamente. A biblioteca permite remover uploads interrompidos; arquivos vinculados a cenas/tokens precisam ser desvinculados antes de excluir.

## Cobertura e próximos avanços

A organização segue a referência de [mapa, ferramentas e sidebar do Roll20](https://help.roll20.net/hc/en-us/articles/360039734913-Tabletop-Overview), conservando a identidade visual e o acervo WEIRS.

| Fluxo de campanha      | Disponível nesta entrega                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Narração e testes      | Chat persistente, dados 3D, vantagem/desvantagem, rolagens secretas e revelação.                                                  |
| Personagens e homebrew | Ficha completa existente, ajustes e fórmulas livres, botões de testes/ataques/magias/dano, recursos, inventário, descanso e PV.   |
| Combate                | Iniciativa/turnos/rodadas, NPCs, PV/condições/concentração, tokens vinculados e destaque do turno.                                |
| Exploração             | Cenas compartilhadas/privadas, mapas enviados, tokens controlados, grade, câmera, régua, marcadores, desenhos e cobertura manual. |
| Comércio e materiais   | Loja transacional existente, compra/venda, moedas/estoque e biblioteca de imagens/PDFs compartilhados ou privados.                |

Iluminação dinâmica com paredes/linha de visão, áudio/vídeo, medição de áreas de magia e automação completa de regras D&D continuam fora desta versão. Ataques/dano são rolados pela ficha; o mestre decide acerto e aplica dano pelos controles existentes. Os campos homebrew não impõem regras oficiais automaticamente. Nenhuma dependência de produto ou assinatura paga foi adicionada.

## Verificar com duas contas

Depois de instalar as migrações, use um perfil como mestre e outro como jogador: role em segredo e revele, publique uma cena, envie fundo/retrato, atribua um token, mova pelas duas sessões, altere PV pela ficha e avance o turno. Confira a recusa de movimento no token alheio, ausência de tokens/arquivos privados, marcador compartilhado e recuperação após recarregar. Os testes automatizados usam PostgreSQL/PGlite e o SDK real com HTTP/WebSocket simulados; essa checagem confirma também suas configurações externas de Auth, Realtime e Storage.
