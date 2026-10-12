# Magias de combate

O cadastro de cada magia fica na aba **Magias**. A aba **Combate** e o painel **Minha ficha → Ações**, durante a sessão, mostram as mesmas magias e usam o mesmo registro para as rolagens.

## Cadastrar e rolar

1. Na aba **Magias**, crie uma magia manualmente ou escolha **Buscar magias no compêndio**.
2. Em **Dano da magia**, use **Adicionar dano à magia**. Preencha a fórmula, o tipo de dano e, se a regra pedir, o atributo cujo modificador será somado.
3. Adicione outras parcelas quando a magia causar danos de tipos diferentes. Por exemplo: `2d6` de Fogo e `1d4` de Frio.
4. Salve a ficha. Em **Combate → Magias de combate**, use **Rolar dano**; a mesma ação fica disponível no painel da sessão e pode ser favoritada.

Cada rolagem mostra o total e o subtotal de cada parcela, com sua fórmula e seu tipo. Os subtotais usam os mesmos dados que produziram o total; não há outra rolagem para calcular os tipos. Com dados 3D ativados, esses resultados aparecem após a animação. Resultados secretos continuam privados até o mestre revelá-los.

O dano pode ser rolado mesmo sem perfil de conjuração. Para rolar um **ataque de magia**, associe o perfil com atributo e bônus de ataque. Magias sem dano continuam disponíveis para consultar e usar conforme suas regras. O gasto de espaços permanece uma ação separada na sessão.

Fórmulas antigas continuam funcionando e podem ser editadas no mesmo formulário. O JSON da ficha permanece v1. Os tipos aceitam texto livre, com sugestões de tipos usuais, para permitir homebrew. Há limites de 20 parcelas por magia, 100 dados e 120 caracteres na fórmula conjunta; os dados aceitam faces de 2 a 1.000. Parcelas vazias podem ser mantidas durante a edição e não entram na rolagem.

## Instalar no Supabase

Para usar as novas parcelas nas rolagens da mesa salva, execute **uma vez**, no SQL Editor do seu projeto Supabase, [202610120010_danos_magias.sql](../supabase/migrations/202610120010_danos_magias.sql), de `BEGIN;` a `COMMIT;`, depois das migrações `001 → 009`. Se elas já estão instaladas, execute somente `010`.

A migração calcula os modificadores a partir da ficha salva, mantém os limites conjuntos e preserva a versão da ficha, permissões, segredos e recibos de reenvio. Ela aborta caso a função de ações instalada não corresponda à versão esperada, sem trocar silenciosamente outras regras. Esta entrega não aplicou a migração no banco remoto.

## Cabeçalho e navegação

O cabeçalho usa a tipografia do site original, com marca de 32 px, links de 16 px no computador e 15 px no celular, além de alvos de pelo menos 44 px. A navegação da ficha se reorganiza em telas estreitas; a mesa usa uma linha com navegação horizontal para preservar o espaço do mapa. A página foi conferida também em 320 px, sem rolagem horizontal da página.

## Verificação

Os testes cobrem cadastro único, salvamento, uso no Combate e no painel, edição por teclado de fórmulas antigas, favoritos, mudanças de atributos, parcelas negativas, limites conjuntos e resultados ocultos durante animação. O PostgreSQL local também verifica jogador, espectador, admin, versão, reenvio e rolagem secreta. Os testes de navegador usam um backend simulado; a migração foi executada em PostgreSQL local via PGlite.

Resultado em 12/10/2026: **91 testes unitários/de banco e 162 testes de navegador aprovados**, além de TypeScript, build e integridade dos 122 arquivos originais.
