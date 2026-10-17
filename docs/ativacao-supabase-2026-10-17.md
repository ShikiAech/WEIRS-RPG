# Ativação do compêndio no Supabase — 17/10/2026

Projeto: **Weirs** (`wmfusotfddhgvjwgobtg`, ca-central-1, PostgreSQL 17).

## Auditoria das migrações

O histórico remoto começou com um snapshot `remote_schema`. Por isso, a conferência foi feita contra os objetos efetivos do banco, e não apenas contra os nomes do histórico.

Foram comparados colunas e nulabilidade, chaves e restrições, índices, políticas, funções e seus corpos/permissões, e gatilhos com uma instalação local das migrações `001`–`012`. As restrições NOT NULL que o PostgreSQL local representa separadamente foram conferidas pela nulabilidade das colunas no PostgreSQL 17 remoto.

A ausência encontrada nas migrações até `010` foi o conteúdo da **008**: `private.limpar_vinculos_equipamento()` e o gatilho `weirs_limpar_vinculos_equipamento`. O trecho foi aplicado pelo MCP e a existência, o corpo e as permissões foram conferidos novamente. Ele limpa ataques, recursos e sintonia associados a um item removido, antes da validação da ficha.

As estruturas de `011` e `012` já existiam. Não foram recriadas. A ativação adicional de RLS em `private.compendio_dominios`, já presente no projeto, foi preservada.

## Carga executada

`supabase/compendium-seed.sql` foi carregado pelo MCP, sem exigir a execução manual do comando Docker.

O arquivo foi preparado no cliente e enviado em blocos base64 para uma tabela temporária de operação no schema `private`, com RLS e privilégios dos clientes revogados. Antes de executar, foram conferidos os 48 blocos e o checksum do SQL reconstruído. O SQL original, sem seus delimitadores externos de transação, foi executado dentro de uma única transação; a publicação e a remoção da área de preparação fizeram parte dela.

Essa operação não leu arquivos do servidor nem executou comandos de sistema por SQL. A tabela de preparação foi removida após o sucesso. A carga mantém as verificações de conflitos editoriais e a idempotência do arquivo original.

| Verificação remota | Resultado |
| --- | ---: |
| Conceitos / revisões publicadas | 2.985 / 2.985 |
| Referências bibliográficas | 439 |
| Pendências obrigatórias de importação | 0 |
| Avisos editoriais/manuais preservados | 1.923 |
| Tabelas públicas do compêndio com RLS | 75 de 75 |
| Restrições não validadas em public/private | 0 |

Classes, subclasses, espécies, linhagens, antecedentes, talentos, magias e os demais domínios estão disponíveis pela consulta publicada. A carga conserva os estados editoriais do [guia do compêndio](compendio-banco.md); publicação não representa certificação geral de revisão 2024 ou automação integral.

As contagens anteriores à operação foram preservadas: **1 ficha, 3 campanhas e 86 mensagens de chat**. Nenhuma ficha de teste foi criada no projeto.

## Função e verificações de acesso

A função **`criar-personagem`**, versão 1, foi publicada com `verify_jwt=true`, usando o motor compartilhado regenerado. O cliente não recebeu a chave de serviço.

- API pública `buscar_compendio`: HTTP 200 e resultados reais de classes.
- Leitura SQL como `anon`: 2.985 registros publicados e busca de espécies funcionando.
- Função de criação com credencial pública e sem usuário: HTTP 401 emitido pelo próprio handler.
- `registrar_criacao_personagem`: execução recusada a `anon`/`authenticated`, permitida somente ao servidor.
- `recuperar_criacao_personagem`: disponível a usuários autenticados; acesso ao recibo continua condicionado à conta/campanha.
- `compendio_indice`: `security_invoker=true`.
- Build do motor e os dois testes HTTP/recuperação do artefato: aprovados após a ativação.

A criação completa com login deve ser conferida pela interface normal. Não foram emitidas credenciais de usuários nem criados registros de campanha para esse teste.

## Avisos dos advisors

Não foi detectada tabela pública sem RLS. Os avisos restantes foram avaliados sem ampliar privilégios para silenciá-los:

- [RLS sem políticas em tabelas privadas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy): acesso direto dos clientes bloqueado; uso interno por funções autorizadas.
- [Funções SECURITY DEFINER públicas](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) e [autenticadas](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable): RPCs intencionais, com filtros de publicação ou validação de sessão/permissões.
- [Proteção contra senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection): configuração de Auth identificada e não alterada nesta operação.
- [FKs sem índice](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [índices ainda não usados](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) e [políticas permissivas sobrepostas](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies): oportunidades de desempenho, sem remover índices ou regras de autorização durante a carga.

## Publicação da interface

Banco, compêndio e função de servidor estão ativados. A publicação do frontend da branch `codex/criacao-personagem-compendio` não foi executada nesta operação.
