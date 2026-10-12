# Participação em campanhas e administradores

## Instalar

No SQL Editor do projeto Supabase, aplique as migrações em ordem: `001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009`. Para um banco que já recebeu as oito primeiras, execute apenas [202610120009_acessos.sql](../supabase/migrations/202610120009_acessos.sql), uma vez. A migração depende das funções de chat, mesa e mapa anteriores; se suas definições divergirem, ela aborta a transação para evitar uma atualização parcial.

Esta entrega foi verificada em PostgreSQL local via PGlite e no navegador com o SDK Supabase e HTTP simulado. A migração remota e a publicação ainda precisam ser executadas no seu ambiente.

## Entrar como jogador

Depois do login Google, abra **Campanhas → Participar de uma campanha → Entrar como jogador**. A campanha passa a oferecer **Abrir mesa** e **Criar personagem nesta campanha**; esse último já seleciona a campanha escolhida.

Qualquer conta autenticada pode entrar nas campanhas cadastradas. A RPC `entrar_campanha` usa o usuário da sessão e sempre cria o papel `jogador`; não aceita outro usuário nem papel. Repetir a entrada mantém uma única participação. Quem já é mestre ou espectador conserva seu papel. O catálogo mostra nomes das campanhas, mas fichas, segredos e mapas continuam sujeitos às permissões.

Remover um vínculo pelo banco tira o acesso correspondente, sem apagar fichas. Como a participação é aberta, a pessoa pode entrar novamente pelo botão como jogador. Não há bloqueio permanente de contas nem sistema de convites nesta implementação.

## Definir um mestre por campanha

A pessoa deve ter entrado com Google pelo menos uma vez. Consulte os IDs:

```sql
SELECT id, nome FROM public.campanhas ORDER BY nome;
```

Depois substitua campanha e email:

```sql
INSERT INTO public.membros_campanha (campanha_id, usuario_id, papel)
SELECT 'UUID_DA_CAMPANHA'::uuid, id, 'mestre'
FROM auth.users
WHERE lower(email) = lower('mestre@example.com')
ON CONFLICT (campanha_id, usuario_id)
DO UPDATE SET papel = EXCLUDED.papel
RETURNING campanha_id, usuario_id, papel;
```

Esse mestre atua apenas nas campanhas em que recebeu o papel.

## Definir um administrador global

No SQL Editor, substitua o email por uma conta que já fez login:

```sql
INSERT INTO public.administradores (usuario_id)
SELECT id
FROM auth.users
WHERE lower(email) = lower('admin@example.com')
ON CONFLICT (usuario_id) DO NOTHING
RETURNING usuario_id;
```

Se não retornar uma linha, confira se a conta já existe ou já é admin:

```sql
SELECT u.id, u.email
FROM auth.users u
JOIN public.administradores a ON a.usuario_id = u.id
WHERE lower(u.email) = lower('admin@example.com');
```

Atualize a página do aplicativo depois do cadastro. O admin recebe acesso de mestre em todas as campanhas, mesmo sem um vínculo individual: abre e edita fichas alheias, cria personagens, usa combate/loja/mapas e acessa rolagens secretas. Na página de campanhas, aparece **Acesso de administrador**.

A tabela permite ao navegador consultar apenas o cadastro do próprio usuário. Inserir, alterar ou remover admins exige acesso administrativo ao banco. Metadados do Google, campos da ficha e requisições do jogador não concedem esse papel. A exclusão de fichas continua disponível apenas ao dono com acesso de escrita.

Para revogar:

```sql
DELETE FROM public.administradores
WHERE usuario_id IN (
  SELECT id FROM auth.users
  WHERE lower(email) = lower('admin@example.com')
)
RETURNING usuario_id;
```

As próximas consultas e operações do banco passam a considerar somente os vínculos individuais remanescentes. A revogação não remove vínculos de jogador/mestre já existentes. Atualize a página para refletir os controles disponíveis; o chat também revalida acesso nas consultas de histórico.

## Adicionar uma ficha a outra campanha

O rótulo **Administração** identifica uma seção dentro da página de uma ficha salva. Não há um item com esse nome no menu principal nem uma página separada de administração.

1. Entre com a conta cadastrada em `public.administradores`.
2. Abra **Fichas** e escolha uma ficha que já esteja salva no banco.
3. Abaixo dos campos **Nome do personagem** e **Campanha**, antes das abas da ficha, procure a seção **Adicionar a outra campanha**, marcada como **Administração**.
4. Salve alterações pendentes, selecione a **Campanha de destino** e clique em **Adicionar cópia**.

A seção aparece somente para admins em fichas salvas. Ela não aparece em **Experimentar ficha** (`#/fichas/teste`), em uma ficha nova ainda não salva ou no pop-up da sessão. Ser mestre de uma campanha, por si só, também não habilita essa seção.

Se a seção não aparecer em uma ficha salva, abra **Campanhas** e confira se sua conta exibe **Acesso de administrador**. Caso não exiba, verifique se a migração `009` foi aplicada e se o UUID da conta logada está cadastrado em `public.administradores`, conforme a seção anterior, e atualize a página. O cadastro de admins e de mestres é feito pelo SQL Editor do Supabase.

A operação mantém o proprietário, copia a versão salva da ficha, cria uma nova ficha com versão inicial 1 e preserva a original. As edições futuras são independentes. Caso o dono não participe do destino, ele recebe um vínculo de jogador; vínculos existentes, inclusive espectador ou mestre, são preservados. A operação não transfere tokens, histórico de chat ou combate.

Se a confirmação de rede falhar, use **Confirmar mesma cópia**. A tentativa mantém seu identificador até receber a confirmação e não duplica a ficha. A navegação é bloqueada enquanto a cópia está sendo confirmada.

## Uso e verificação

Os controles têm rótulos explícitos, espera, erro e confirmação anunciados, botões com altura mínima de 44 px e disposição em uma coluna no celular. Foram usados como referência [WCAG 2.2: tamanho dos alvos](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) e [mensagens de estado](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).

Os testes do banco cobrem entrada somente pelo próprio usuário, preservação de papéis, recusa de promoção via navegador, administração global, edição/cópia/versionamento e revogação em fichas, chat, segredos, mesa e mapa. Os testes de interface verificam entrada, criação na campanha escolhida, edição alheia, confirmação perdida sem duplicação e ausência de controles de admin para jogadores/espectadores.
