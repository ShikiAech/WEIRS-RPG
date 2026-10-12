# Participação e administração

Usuários autenticados podem consultar as campanhas e entrar explicitamente como jogadores. A entrada é idempotente e preserva vínculos existentes, sem permitir escolher outro usuário ou se promover a mestre.

Administradores globais são cadastrados exclusivamente no banco, em tabela separada dos perfis e dos metadados de login. Recebem acesso de mestre às campanhas, inclusive fichas, chat, segredos, mesa e mapas. A revogação vale nas próximas operações. A interface deve permitir copiar uma ficha salva para outra campanha mantendo seu proprietário; o original permanece na campanha de origem e a cópia começa uma história independente.

- [x] Testar a entrada, as permissões, as operações de admin e a revogação no PostgreSQL local.
- [x] Criar migração 009, sem alterar migrações já aplicadas.
- [x] Integrar os acessos efetivos nos repositórios e nas telas.
- [x] Adicionar participação e cópia entre campanhas com estados de espera, erro e nova tentativa.
- [x] Verificar regressões, uso em celular e teclado; revisar permissões.
- [x] Documentar aplicação da migração e cadastro/revogação de admin via SQL.

Sem alteração remota de usuários ou publicação nesta tarefa. O cadastro de admin exige o UUID de um usuário que já entrou com Google.

## Verificação concluída

- PostgreSQL local: 3 testes novos de acesso; suíte geral 84/84.
- Interface: 10 cenários novos em computador/celular; teste de rascunho observado falhar antes da correção e passar depois.
- Regressão completa com PDF real: 153/154 passaram no primeiro run. Um teste de upload de mapa excedeu a espera de 5 s para abrir a tela; os dois reenvios isolados passaram em 2 s cada. Não foi alterado código de upload.
- 54 testes direcionados de participação, agilidade, segredos e persistência passaram após corrigir a simulação de revogação de papéis.
- Build e typecheck concluídos; 122 arquivos legados preservados; git diff --check sem erros.
- Revisão independente não encontrou elevação de privilégios; identificou e foi corrigido o compartilhamento indevido de rascunhos de nova ficha entre campanhas.
- O usuário confirmou explicitamente o alcance de mestre global para admins.
- Migração remota, concessão real de papéis e publicação permanecem ações do ambiente de implantação, documentadas em docs/acessos-campanhas.md.
