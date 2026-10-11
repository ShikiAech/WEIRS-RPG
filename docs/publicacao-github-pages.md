# Publicar o webapp no GitHub Pages

O `app.html` da raiz é a entrada de desenvolvimento do Vite. Publicar a raiz da
branch diretamente faz o navegador solicitar `/apps/web/main.tsx`, causando 404.
A publicação deve usar `dist/`, que contém o HTML compilado, os arquivos em
`assets/` e as páginas e imagens do diário/bestiário.

## Configuração inicial no GitHub

1. Abra o repositório **ShikiAech/WEIRS-RPG → Settings → Secrets and variables →
   Actions → Variables → New repository variable**.
2. Adicione `VITE_SUPABASE_URL`, com a URL do projeto Supabase, e
   `VITE_SUPABASE_PUBLISHABLE_KEY`, com a chave publicável `sb_publishable_...`.
   São os mesmos valores públicos configurados em `.env.local`. O workflow também
   aceita esses nomes como repository secrets, caso já estejam cadastrados assim.
   Não copie o arquivo `.env.local` para o GitHub nem use `service_role`, `sb_secret_`,
   senha do banco ou segredo do Google. A chave publicável ficará no JavaScript do
   site; as políticas RLS controlam o acesso aos dados.
3. Abra **Settings → Pages → Build and deployment → Source** e selecione
   **GitHub Actions**, em vez de **Deploy from a branch**. Se essa configuração não
   estiver disponível para sua conta, peça ao administrador do repositório.
4. Integre `.github/workflows/pages.yml` à `main`. O push na `main` inicia
   **Actions → Publicar GitHub Pages** automaticamente. Para repetir uma publicação,
   abra esse workflow, clique **Run workflow**, escolha `main` e confirme.
5. Aguarde os jobs `build` e `deploy` concluírem. O workflow valida a configuração,
   executa testes, gera o build e publica somente `dist/`.

O prefixo `/WEIRS-RPG/` já está definido no workflow. Não substitua o script em
`app.html` manualmente por um arquivo com hash: o Vite gera essa referência a cada
build.

## Conferir a publicação

Abra <https://shikiaech.github.io/WEIRS-RPG/app.html>. O código-fonte publicado
deve carregar JavaScript em `/WEIRS-RPG/assets/`, sem referências a `.tsx`.
Confira também <https://shikiaech.github.io/WEIRS-RPG/index.html> e uma página
antiga do compêndio; o build preserva esses arquivos.

Para o login, confirme no Supabase **Authentication → URL Configuration** que
o Site URL e uma Redirect URL são
`https://shikiaech.github.io/WEIRS-RPG/app.html`. Os detalhes de OAuth e banco estão
no [guia da mesa](configuracao-supabase.md).

Se ainda aparecer `main.tsx`, confira se **Source** está em **GitHub Actions**,
se o último job `deploy` terminou e recarregue a página sem cache (`Ctrl+F5`).
Se o build informar configuração pública ausente, preencha as duas variáveis e
execute **Run workflow** novamente. O `.env.local` do computador não está presente
nos runners do GitHub.

Esse fluxo usa as ações oficiais descritas na
[documentação do GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
