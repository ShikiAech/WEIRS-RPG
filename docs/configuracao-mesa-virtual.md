# Ativar e usar a mesa virtual

A tela **Chat** é a mesa virtual: mapa ao centro, conversa à direita e janelas móveis de ficha, combate e dados. No celular, **Mapa** e **Chat** alternam a área principal. Controles de PV, condições e ações favoritas aparecem ao selecionar um token. O diário, bestiário, login, campanhas, fichas e conteúdo original continuam no mesmo projeto.

## Instalar no Supabase existente

Esta etapa depende das migrações `001` a `004` já instaladas. **Se você já instalou `005` e `006`, execute apenas `007` no passo 4.** Não repita migrações concluídas, o seed ou a configuração de OAuth.

1. No [Supabase](https://supabase.com/dashboard), abra seu projeto e **SQL Editor → New query**.
2. Copie todo o arquivo [`202610110005_rolagens_secretas.sql`](../supabase/migrations/202610110005_rolagens_secretas.sql), incluindo `BEGIN;` e `COMMIT;`, e execute **Run** com a conexão administrativa padrão `postgres`.
3. Aguarde o sucesso. Em **outra consulta**, execute todo o arquivo [`202610110006_mesa_virtual.sql`](../supabase/migrations/202610110006_mesa_virtual.sql).
4. Depois de `006`, em **outra consulta**, execute todo o arquivo [`202610110007_agilidade.sql`](../supabase/migrations/202610110007_agilidade.sql). Ele adiciona áreas de magia, auras, alinhamento de fundo e operações de vários tokens.
5. Execute cada arquivo **uma vez**, nessa ordem: `005 → 006 → 007`. Eles preservam campanhas, fichas e mensagens. Se houver erro, a transação é revertida; guarde o erro antes de tentar novamente.
6. Atualize o cache da API e recarregue o aplicativo:

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
 ('public','arquivos_mapa'), ('public','marcadores_mapa'),
 ('public','areas_mapa'));

SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id='weirs-mesa';

SELECT schemaname, tablename FROM pg_publication_tables
WHERE pubname='supabase_realtime' AND schemaname='public'
 AND tablename IN ('mensagens_chat','cenas_mapa','tokens_mapa','arquivos_mapa','marcadores_mapa','areas_mapa');
```

As sete tabelas devem indicar `rls=true`, o bucket deve ter `public=false`, e a publicação deve conter as seis tabelas. A migração configura essa publicação quando a publicação padrão do Supabase existe. A interface também recupera alterações periodicamente enquanto está visível. Não crie um bucket público nem adicione chaves administrativas ao navegador.

`areas_mapa` já recebe RLS na migração: membros leem apenas áreas autorizadas, e todas as alterações passam pelo RPC `operar_mapa`, que confere papel, campanha, controle do token e versão. Os recibos de operações continuam em `private.operacoes_mapa`, com RLS e sem acesso direto dos clientes. Reenviar uma operação confere as permissões atuais antes de devolver o resultado salvo; perder o papel de mestre impede recuperar snapshots privados de operações antigas.

Esta etapa usa o Supabase e a hospedagem existentes. Não adiciona servidor, assinatura ou dependência de produto; continua consumindo as quotas de banco, Storage e tráfego do projeto atual.

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

### Alinhar fundo e mostrar aura

- Depois de criar uma cena com imagem, abra **Editar cena → Alinhar imagem à grade**. Deslocamentos horizontal/vertical usam células; valores positivos movem para a direita/baixo. **Escala do fundo (%)** começa em 100% e aceita 10% a 1000%. Salve para conferir; **Restaurar alinhamento** volta os campos para 0/0/100% antes de salvar.
- Em **Editar token → Aura do token**, marque **Mostrar aura**, defina raio em pés e cor. O raio parte do centro do token, com limite de 0,25 a 20 células convertido para a distância da cena. A aura é visual; não aplica condições, alcance ou efeitos automaticamente.

## PV e ações sem abrir a ficha completa

1. Selecione um token no mapa. Se estiver pequeno pelo zoom, abra **Selecionar tokens** na barra lateral e escolha o personagem na lista. O foco retorna ao token; **Mover token** no cartão de ações oferece botões de direção para mover sem arrastar, inclusive no celular.
2. Abra **PV e condições**, informe a quantidade e escolha **Aplicar dano no token**, **Curar token** ou **PV temporários do token**. Na ficha, o dano absorve PV temporários primeiro; cura respeita o máximo. PV temporários usam o maior valor, sem somar.
3. **Condição do token** aceita condições sugeridas ou texto homebrew. Use **Aplicar condição no token**; clique na condição com **×** para removê-la. Se houver concentração, **Encerrar concentração no token** limpa o efeito.
4. O proprietário da ficha e o mestre podem operar esses controles. Controlar o movimento de um token não concede permissão de editar a ficha alheia. Espectadores acompanham sem alterar.

NPCs sem ficha, vinculados ao combate, têm **dano/cura pelo mestre**. Condições, concentração e PV temporários nesses controles usam uma ficha; não há editor universal desses estados para NPCs nesta etapa. Tokens sem ficha ou vínculo de combate precisam de um desses vínculos antes de controlar PV.

As alterações de estado aparecem no chat. **Tokens ocultos bloqueiam essas ações rápidas**, para que o contexto não anuncie nomes ou PV privados. Revele o token antes de usá-las; a opção de rolagem secreta não torna alterações de combate privadas.

### Favoritar e rolar rapidamente

1. Abra **Minha ficha** ou **Ficha do token**. Clique na **☆** ao lado de um teste, resistência, ataque, magia ou dano. A estrela vira **★**. Cada ficha aceita até **12 favoritos** neste navegador, separados por usuário e campanha.
2. Os favoritos aparecem no bloco recolhível **Ações favoritas** da ficha e em **Ações rápidas** do token. Escolha **Modo dos testes** na ficha ou **Modo das ações rápidas** no token: normal, vantagem ou desvantagem.
3. Clique na ação favorita para enviar ao chat. Ela usa a ficha salva e a versão atual, incluindo modificadores e nomes alterados. Dano, anúncio de CD, conjuração, teste de morte e dado de vida usam modo normal quando a ação exige isso.
4. A visibilidade segue **Visibilidade da rolagem** do chat. O mestre pode usar **Só mestres**; iniciativa, morte e dado de vida continuam exigindo rolagem pública.
5. Use **★** para retirar um favorito. Uma entrada removida da ficha deixa o atalho indisponível; remova-o dos favoritos para liberar espaço.

Favoritos guardam somente referências de ação/entrada em preferências locais. Não guardam resultados, fórmulas calculadas, nomes privados ou cópias da ficha, e não sincronizam automaticamente entre dispositivos. Dados de vida esgotados e testes de morte indisponíveis ficam bloqueados.

## Áreas de magia

1. Abra **Áreas de magia** na barra do mapa. Defina nome, forma, tamanho em pés e cor.
2. **Círculo:** tamanho é o **raio**. **Cone:** tamanho é o **comprimento**. **Quadrado:** tamanho é o **lado**, com posição no centro. **Linha:** tamanho é o **comprimento**, com largura em campo separado.
3. Use **Posicionar no mapa**. Clique para definir a origem ou arraste da origem na direção desejada. A área aparece como prévia; ainda não foi compartilhada. Use **Criar área** para gravar.
4. Se preferir precisão, preencha X/Y em células e direção em graus. Tamanho aceita 0,25 a 100 células; a largura da linha aceita 0,1 a 20 células, convertidas para pés pela unidade da cena.
5. Na lista **Áreas nesta cena**, use **Ajustar** para editar ou **Remover** para excluir. O mestre pode administrar todas; jogadores administram as suas áreas ou áreas ligadas a tokens que controlam. Espectadores apenas veem.

As áreas persistem e chegam às sessões autorizadas da mesma cena, com limite de **100 por cena**. **Vincular ao token** define vínculo e controle da área; uma área ligada a token oculto permanece privada para mestres. Excluir o token remove suas áreas vinculadas. Áreas são marcações visuais: não rolam dano nem escolhem alvos automaticamente.

## Selecionar grupos, duplicar e desfazer

- **Mestre:** use **Shift + clique** para adicionar/remover tokens da seleção ou **Shift + arrastar** no fundo para selecionar com um retângulo. **Selecionar tokens** oferece caixas de seleção para usar também no celular.
- Arraste um token selecionado ou use as setas/botões de movimento para mover o grupo. As distâncias entre tokens são preservadas e o grupo para nos limites da cena. Cada operação aceita até **40 tokens**, com gravação atômica: um conflito impede o lote inteiro.
- **Duplicar seleção** cria novas identidades perto dos originais e seleciona as cópias. O vínculo com NPC de combate é removido. Copiar um token não cria outra ficha: cópias ligadas à mesma ficha continuam compartilhando seus PV e estado.
- **Desfazer alteração / Refazer alteração**, ou **Ctrl+Z / Ctrl+Shift+Z** com foco no mapa, percorrem até **20 alterações confirmadas** desta sessão e cena: movimentos/edições de tokens, duplicação, alinhamento de fundo e desenhos/neblina reversíveis.

Esse histórico fica na memória da aba, sem afetar dados, compras, PV ou operações de outros participantes. Trocar cena, papel ou usuário, recarregar a página, excluir definitivamente um token/cena, ativar/publicar/redimensionar uma cena ou liberar uma tentativa desconhecida limpa o histórico. Áreas de magia não têm desfazer nesta etapa. Se outra sessão alterar o mesmo objeto, desfazer/refazer recusa o conflito em vez de sobrescrever a edição; confira a versão atual antes de continuar. Uma nova alteração após uma edição externa também inicia um histórico novo.

## Explorar e jogar

- **Mover mapa**, arrastar o fundo ou botão central/direito: deslocar a câmera. Roda do mouse e botões **+/−**: zoom. **Enquadrar mapa**: retornar ao enquadramento completo.
- **Régua**: arraste entre dois locais para medir distância em pés. A diagonal usa a mesma distância de uma célula, conforme a regra básica de D&D.
- **Marcar local**: aponta uma posição aos participantes da mesma cena por seis segundos. Marcadores de prévias privadas ficam somente para os mestres. Espectadores podem ver, mas não criar marcadores.
- **Cobrir áreas não reveladas** e **Revelar área**: o mestre abre retângulos no mapa. **Cobrir novamente** restaura a cobertura. Essa é uma máscara visual: o fundo completo é baixado pelo participante autorizado; use tokens ocultos e arquivos privados para segredos que precisam de proteção real.
- **Desenhar no mapa**: o mestre cria traços compartilhados. **Limpar desenhos** remove-os. Formas e áreas reveladas persistem com a cena.
- **Minha ficha**, **Combate** e **Loja** continuam disponíveis na barra da sessão. Arraste o cabeçalho das janelas para mover ou use as setas ao focar o puxador. **−/+** recolhem e expandem sem perder o estado da ficha. A posição fica salva neste navegador.
- As abas e o modo da ficha ficam acessíveis durante a rolagem da janela. A ficha pode ser recolhida para consultar o mapa e reaberta sem perder seu estado.
- A janela de dados conserva a última rolagem. Durante a animação, o total aguarda no chat. Recolher/desligar o 3D libera resultados pendentes. No celular, abrir ficha/combate recolhe temporariamente dados já concluídos; a próxima rolagem reabre a janela. Abrir um painel durante a animação não a interrompe. A preferência manual de animação/recolhimento continua valendo.

Se uma confirmação se perder, use **Reenviar alteração** para recuperar a mesma operação. Se houver conflito de versão, a posição atual é recarregada; confira antes de tentar de novo. Uma tentativa ainda desconhecida bloqueia a troca de cena e a saída da conta até confirmar ou liberar explicitamente. A biblioteca permite remover uploads interrompidos; arquivos vinculados a cenas/tokens precisam ser desvinculados antes de excluir.

## Cobertura e próximos avanços

A organização segue a referência de [mapa, ferramentas e sidebar do Roll20](https://help.roll20.net/hc/en-us/articles/360039734913-Tabletop-Overview), conservando a identidade visual e o acervo WEIRS.

| Fluxo de campanha      | Disponível nesta entrega                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Narração e testes      | Chat persistente, dados 3D, vantagem/desvantagem, rolagens secretas e revelação.                                          |
| Personagens e homebrew | Ficha completa, favoritos, testes/ataques/magias/dano, recursos, inventário, descanso e PV.                               |
| Combate                | Iniciativa/turnos/rodadas, NPCs, PV contextual, condições/concentração da ficha, tokens vinculados e áreas de magia.      |
| Exploração             | Cenas, fundo alinhável, tokens controlados, grupos/cópias, auras, câmera, régua, marcadores, desenhos e cobertura manual. |
| Comércio e materiais   | Loja transacional existente, compra/venda, moedas/estoque e biblioteca de imagens/PDFs compartilhados ou privados.        |

Iluminação dinâmica com paredes/linha de visão, áudio/vídeo e automação completa de regras D&D continuam fora desta versão. O mestre decide acerto, resistências e dano aplicado. Os campos homebrew e áreas visuais não impõem regras oficiais automaticamente. Diário e bestiário continuam atendidos pelo site existente.

## Verificar com duas contas

Depois de instalar as migrações, use um perfil como mestre e outro como jogador: role em segredo e revele, publique uma cena, envie fundo/retrato, atribua um token, mova pelas duas sessões, altere PV pelo contexto e avance o turno. Favorite uma ação na ficha, feche a ficha e role pelo token. Crie uma área e confira sua chegada na outra conta; teste recusa de edição de área/token alheio, grupo com duplicação/desfazer e conflito após edição pela outra sessão. Confira ausência de tokens/arquivos/áreas privados, marcador compartilhado e recuperação após recarregar.

Os testes automatizados usam PostgreSQL/PGlite e o SDK real com HTTP/WebSocket simulados; essa checagem confirma também suas configurações externas de Auth, Realtime e Storage. Nenhuma instalação remota ou publicação foi executada por estes testes.
