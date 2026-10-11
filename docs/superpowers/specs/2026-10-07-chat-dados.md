# Chat de campanha e dados

Para oito participantes, usando a infraestrutura Supabase já configurada, manter a identidade visual e toda a interface em português brasileiro. Implementação pelo único desenvolvedor, nesta sessão.

## Fluxo

Uma nova aba Chat permite escolher uma campanha autorizada, consultar as últimas 50 mensagens, carregar mensagens anteriores e enviar texto ou `/r expressão` e `/roll expressão`. Botões rápidos de dados e vantagem/desvantagem facilitam o uso. Resultados mostram autor, horário, expressão, cada dado, dados descartados e total; texto nunca executa HTML.

Rolagens e mensagens são públicas **para os membros daquela campanha**. Espectadores consultam, jogadores e mestres enviam. Sussurros, consumo de espaços/recursos, aplicação de dano e mapas ficam para as próximas etapas; esta entrega não altera contadores automaticamente.

## Backend

Usar uma RPC PostgreSQL autenticada, em vez de uma Edge Function nesta fatia: cálculo e persistência acontecem na mesma transação, sem outra implantação ou segredo. Realtime Postgres Changes entrega somente INSERTs autorizados por RLS. Nenhum cliente pode inserir, modificar ou apagar resultados diretamente.

Gramática limitada: soma/subtração de constantes e dados, incluindo `4d6kh3`, `2d20kl1`, `2d6+1d4-2`. Até 120 caracteres, 100 dados por expressão, faces entre 2 e 1000, constantes até 9999. Sem eval, multiplicação ou funções. Aleatoriedade forte do PostgreSQL: primeiros 32 bits de `gen_random_uuid()`, sem os bits fixos da versão, com amostragem por rejeição para evitar viés. Limite de 30 novos comandos por usuário/campanha em 10 segundos. Identificador de tentativa conserva o mesmo resultado após perda da resposta; reutilizar esse identificador com outro comando gera conflito.

Mensagens recebem sequência por campanha dentro de um bloqueio transacional, garantindo ordem de commit. Histórico pagina por sequência, reconexão busca todos os registros posteriores em lotes. Assinar antes de buscar e mesclar eventos por ID. Se WS falhar, sincronizar periodicamente enquanto a página estiver visível; indicar o estado. Não avançar o cursor a partir de um evento avulso, pois pode haver lacuna. Trocar conta/campanha remove o histórico e encerra a assinatura anterior.

## Fichas

Ações da ficha enviam apenas ficha, versão salva, entrada e modo. O banco verifica campanha, papel, propriedade e versão, e lê o bônus/dano da ficha salva. Ataques com CD publicam a CD; ataques com bônus rolam d20; dano usa o campo existente de fórmula. Magias permitem anunciar a conjuração com CD e rolar ataque do perfil vinculado. Não inferir dano de texto livre nem consumir espaços. Exibir botões junto às entradas de ataques/magias, desabilitados enquanto existirem alterações pendentes, e confirmação com link ao chat após envio.

## Referências verificadas

- [Funções de banco Supabase](https://supabase.com/docs/guides/database/functions): RPC e SECURITY DEFINER com search_path restrito.
- [Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes): publicação e autorização por RLS.
- [Implementação PostgreSQL 17 de UUID](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/utils/adt/uuid.c): gen_random_uuid usa pg_strong_random e fixa apenas bytes 6 e 8.
