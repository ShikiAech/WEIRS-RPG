# Configuração da mesa no Supabase

Esta entrega usa React/TypeScript e o backend gerenciado do Supabase. O banco aplica as permissões; esconder um botão no navegador não concede nem revoga acesso. Não é necessário manter um servidor Rust nesta etapa.

## O que já funciona

- Campanhas e compêndio importados das páginas existentes, com textos completos, links e imagens locais.
- Ficha completa e editável: multiclasse, seis atributos, dezoito perícias, combate, recursos, características, magia/pacto, inventário e história. Campos livres e ajustes comportam homebrew; escolher uma classe não aplica todas as suas regras automaticamente.
- Criação, leitura, edição e exclusão via Supabase; conflitos por versão; importação/exportação JSON. O mestre edita fichas da sua campanha. Só o proprietário com acesso de escrita pode excluir.
- Sem configuração, o compêndio e a ficha temporária funcionam. A ficha temporária é mantida apenas na página; baixe uma cópia para recuperá-la posteriormente.

Chat/dados autoritativos, armazenamento de uploads e mapas com tokens são os próximos marcos. A migração atual ainda não cria tabelas ou buckets dessas funcionalidades.

## 1. Executar localmente

Requer Node.js 22.23.1 ou uma versão compatível com Vite 8. Na raiz:

```powershell
npm ci
npm run dev
```

Abra `http://127.0.0.1:5173/WEIRS-RPG/app.html`. O endereço do site original continua em `/WEIRS-RPG/index.html`. `npm run dev` importa o conteúdo antes de iniciar; execute `npm run import:content` novamente após editar páginas originais.

O importador gera um índice leve, um JSON por registro, campanhas e um manifesto de hashes em `content/generated/`. Esse diretório não entra no Git. As fontes HTML continuam sendo a origem do compêndio nesta etapa; a ficha salva e a participação na mesa ficam no PostgreSQL. As biografias existentes não contêm todos os dados de uma ficha: são preservadas nas crônicas, sem inventar atributos ou equipamentos ausentes.

## 2. Criar o projeto gratuito e instalar o banco

1. No [Supabase](https://supabase.com/dashboard), crie um projeto no plano Free. Escolha uma região próxima aos jogadores; São Paulo é uma opção para uma mesa no Brasil.
2. No SQL Editor do projeto novo, execute uma vez `supabase/migrations/202610070001_foundation.sql`. A migração cria perfis, campanhas, membros, fichas e a função de salvamento. Não execute novamente sobre as mesmas tabelas.
3. Execute `supabase/seed.sql`. Ele é gerado das campanhas originais, conserva os mesmos IDs do frontend e pode ser repetido sem duplicar campanhas. Não adiciona jogadores.

Os papéis são `jogador`, `mestre` e `espectador`, por campanha. Um mestre de Othans não recebe acesso a outra campanha. Uma conta que só fez login ainda não pertence à mesa. O papel nunca vem de metadados editáveis do Google ou de um formulário do aplicativo.

O banco verifica a estrutura principal do JSON, versão e tamanho máximo de 256 KiB. O domínio da ficha valida os campos detalhados no aplicativo e ao carregar registros. Qualquer ferramenta administrativa que escreva JSON diretamente deve usar o mesmo validador; automações futuras de regras precisarão validar seus comandos no servidor.

## 3. Configurar Google OAuth

Faça primeiro o teste local em Chrome ou Edge. As instruções abaixo usam o aplicativo no seu computador e um projeto **hospedado** no Supabase.

O login percorre este caminho:

```text
WEIRS → Supabase → Google → Supabase → WEIRS
```

Por isso existem dois endereços de retorno. O Google entrega sua resposta ao Supabase; depois o Supabase devolve você ao aplicativo. Cada endereço é cadastrado em um painel diferente.

| Campo | Onde preencher | Valor para o teste local |
| --- | --- | --- |
| Authorized JavaScript origins / Origens JavaScript autorizadas | Cliente OAuth no Google | `http://127.0.0.1:5173` |
| Authorized redirect URIs / URIs de redirecionamento autorizados | Cliente OAuth no Google | URL copiada do provedor Google no Supabase, terminando em `/auth/v1/callback` |
| Site URL | Supabase → Authentication → URL Configuration | `http://127.0.0.1:5173/WEIRS-RPG/app.html` |
| Redirect URLs | Supabase → Authentication → URL Configuration | `http://127.0.0.1:5173/WEIRS-RPG/app.html` |

### 3.1. Copiar o endereço de retorno do Supabase

1. Abra o [painel do Supabase](https://supabase.com/dashboard) e selecione o projeto da mesa.
2. Entre em **Authentication → Sign In / Providers**. Em algumas versões do painel, o menu aparece como **Providers**.
3. Abra **Google**.
4. Copie o campo **Callback URL** ou **OAuth Redirect URL**. Ele se parece com `https://abcdefgh.supabase.co/auth/v1/callback`, mas use o endereço real mostrado no seu painel.
5. Mantenha essa aba aberta. Você voltará a ela depois de criar as credenciais no Google.

O campo de redirecionamento no Google receberá essa URL completa. A integração está descrita no [guia oficial do provedor Google do Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google).

### 3.2. Criar o projeto e a tela de consentimento no Google

1. Abra o [Google Cloud Console](https://console.cloud.google.com/) com sua conta Google.
2. Clique no seletor de projeto na barra superior e escolha **Novo projeto / New project**. Use o nome `WEIRS RPG`. Se já criou um projeto para esse login, selecione-o.
3. Após a criação, confira se ele está selecionado na barra superior.
4. Procure **Google Auth Platform** pela busca do console. Abra **Visão geral / Overview** e clique em **Começar / Get started**, se aparecer.
5. Em **App information**, use `WEIRS RPG` como nome e seu email em **User support email**.
6. Em **Audience / Público-alvo**, selecione **External / Externo**, adequado para participantes com contas Google pessoais.
7. Em **Contact information**, informe seu email. Conclua os campos e termos apresentados e clique em **Create / Criar**.

Se a configuração inicial já existir, seus campos ficam em **Branding**, **Audience** e **Data Access**. Os nomes em inglês estão incluídos para facilitar a localização quando o console não estiver traduzido. Veja a [orientação do Google Auth Platform](https://support.google.com/cloud/answer/15544987).

### 3.3. Configurar público e permissões de perfil

Em **Audience / Público-alvo**, mantenha **Testing / Em teste** durante esta configuração. Em **Test users / Usuários de teste → Add users / Adicionar usuários**, você pode cadastrar seu email e os demais participantes.

O Google possui uma exceção para login que solicita apenas nome, email e perfil: nesse caso, a lista de teste não limita necessariamente quem consegue autenticar. **O acesso às fichas é controlado pelos membros da campanha no nosso banco**, configurados na seção 5. Essa distinção consta na [documentação de público do Google](https://support.google.com/cloud/answer/15549945).

Em **Data Access / Acesso a dados → Add or remove scopes / Adicionar ou remover escopos**, selecione os três escopos abaixo. Caso algum não apareça, utilize **Manually add scopes / Adicionar escopos manualmente**:

```text
openid
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
```

Clique em **Update / Atualizar** e em **Save / Salvar**, se solicitado. Esses escopos identificam o jogador. O WEIRS atual usa apenas esse login de perfil; deixe permissões de Gmail, Drive e outros serviços para futuras integrações que realmente precisem delas. Consulte o [guia de escopos do Google](https://support.google.com/cloud/answer/15549135).

### 3.4. Criar o cliente OAuth e copiar as credenciais

1. No Google Auth Platform, entre em **Clients / Clientes → Create client / Criar cliente**.
2. Em **Application type / Tipo de aplicativo**, escolha **Web application / Aplicativo da Web**.
3. Em **Name / Nome**, use `WEIRS — teste local`.
4. Em **Authorized JavaScript origins**, clique em **Add URI** e insira `http://127.0.0.1:5173`. Uma origem contém protocolo, endereço e porta; o caminho `/WEIRS-RPG/app.html` entra no campo do Supabase indicado na tabela inicial.
5. Em **Authorized redirect URIs**, clique em **Add URI** e cole a URL completa copiada na etapa 3.1: `https://SEU-PROJETO.supabase.co/auth/v1/callback`. Substitua o exemplo pelo valor real do seu projeto.
6. Clique em **Create / Criar**. Copie o **Client ID** e o **Client Secret** imediatamente para os campos do provedor Google no Supabase, na etapa seguinte.

O Google exibe o segredo completo na criação; se você o perdeu, a página do cliente permite gerar outro com **Add Secret / Adicionar segredo**. Veja as [instruções atuais para clientes OAuth](https://support.google.com/cloud/answer/15549257). Mantenha qualquer cópia do segredo fora da pasta do projeto.

### 3.5. Habilitar o Google no Supabase

Volte à aba **Supabase → Authentication → Sign In / Providers → Google**. Ative **Enable Sign in with Google**, preencha **Client IDs** com o Client ID criado no Google e **Client Secret** com o segredo correspondente. Salve e conserve as demais opções padrão.

Essas credenciais ficam no Supabase. O arquivo `.env.local` do WEIRS receberá a URL e a chave publicável do **Supabase**, descritas na seção 4.

### 3.6. Cadastrar o retorno ao aplicativo

No Supabase, entre em **Authentication → URL Configuration**. Para testar localmente agora, preencha **Site URL** com:

```text
http://127.0.0.1:5173/WEIRS-RPG/app.html
```

Em **Redirect URLs**, clique em **Add URL**, cadastre esse mesmo endereço completo e salve. Aqui o endereço aponta para o aplicativo; o retorno para `/auth/v1/callback` já foi cadastrado no Google.

O código do WEIRS informa um `redirectTo` explícito e ele precisa estar permitido nessa lista. Use o endereço exato, incluindo porta e caminho, conforme o [guia de redirecionamentos do Supabase](https://supabase.com/docs/guides/auth/redirect-urls). A aplicação acrescenta `#/fichas` após concluir o login; cadastre o retorno terminando em `app.html`.

### 3.7. Fazer o primeiro login

1. Preencha `.env.local` conforme a seção 4.
2. Se houver um dev server aberto, pare-o com `Ctrl+C`. Na raiz do projeto, execute:

```powershell
npm run dev -- --port 5173 --strictPort
```

3. Abra `http://127.0.0.1:5173/WEIRS-RPG/app.html` no Chrome ou Edge.
4. Clique em **Entrar com Google**, escolha sua conta e conclua o login no mesmo navegador.
5. Ao retornar ao WEIRS, o botão deve mudar para **Sair**.
6. Em **Supabase → Authentication → Users**, confirme que seu email foi cadastrado. Depois vincule a conta à campanha pela seção 5.

Use `127.0.0.1` ao longo de todo o teste. Se preferir `localhost`, cadastre também essa origem e seu retorno completo nos respectivos painéis. O código usa a origem aberta no navegador e guarda a verificação do login naquele navegador.

Se você estiver usando o preview na porta **4174**, cadastre `http://127.0.0.1:4174` nas origens do Google e `http://127.0.0.1:4174/WEIRS-RPG/app.html` nos Redirect URLs do Supabase. Ao alterar `.env.local`, rode `npm run build` novamente antes de iniciar o preview: suas configurações são incorporadas durante o build.

### 3.8. Acrescentar a URL publicada, quando o novo aplicativo estiver online

Quando `app.html` estiver publicado no endereço atual do GitHub Pages, configure:

| Campo | Valor publicado |
| --- | --- |
| Origem JavaScript no cliente Google destinado à produção | `https://shikiaech.github.io` |
| Redirect URI no cliente Google | O callback do projeto Supabase usado em produção, terminando em `/auth/v1/callback` |
| Site URL no Supabase | `https://shikiaech.github.io/WEIRS-RPG/app.html` |
| Redirect URL adicional no Supabase | `https://shikiaech.github.io/WEIRS-RPG/app.html` |

A configuração local permite validar o login enquanto a publicação ainda está pendente. Para separar desenvolvimento e produção, configure o cliente Google e o projeto Supabase correspondentes ao ambiente publicado. Se o endereço de hospedagem mudar, use o novo domínio e caminho em todos os campos desse ambiente.

### 3.9. Identificar erros comuns

| O que apareceu | O que conferir |
| --- | --- |
| `redirect_uri_mismatch` na tela do Google | Abra **Google Auth Platform → Clients → seu cliente** e confira se a URI corresponde exatamente ao callback do provedor Google do Supabase, incluindo `/auth/v1/callback`. |
| Google conclui o login, mas você volta ao endereço errado | Confira **Supabase → Authentication → URL Configuration** e o endereço realmente aberto no navegador, incluindo a porta. |
| `invalid_client` | Confira se Client ID e Client Secret no Supabase pertencem ao mesmo cliente Google e se o segredo continua habilitado. |
| `disallowed_useragent` | Abra o aplicativo em Chrome ou Edge diretamente. O Google pode rejeitar login dentro de navegadores incorporados a outros aplicativos. |
| Botão **Entrar com Google** desabilitado | Preencha a URL e a chave publicável em `.env.local` e reinicie o dev server; para preview, refaça o build. |
| Botão virou **Sair**, mas nenhuma campanha aparece | O login funcionou. Adicione sua conta aos membros da campanha, conforme a seção 5. |
| Não foi possível concluir o login após trocar de navegador/endereço | Reinicie o login na página original e conclua no mesmo navegador e origem. |

Os erros de redirecionamento e navegador são descritos na [documentação OAuth do Google](https://developers.google.com/identity/protocols/oauth2/web-server#errors). As mensagens e campos do WEIRS são verificados no código desta entrega.

## 4. Configuração pública do frontend

Copie `.env.example` para `.env.local` e preencha somente:

```dotenv
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE_PUBLICA
VITE_BASE_PATH=/WEIRS-RPG/
```

A URL e a chave publicável podem ser obtidas no painel do projeto. Elas identificam o projeto e são visíveis no JavaScript publicado. A segurança depende da sessão e das políticas RLS testadas, não de esconder essa chave. Chaves `sb_secret_`, `service_role`, senha do banco e segredo Google não pertencem ao frontend.

Reinicie o dev server depois de editar o arquivo. No build de produção, essas variáveis precisam estar presentes no ambiente de build. O arquivo `.env.local` é ignorado pelo Git.

## 5. Adicionar os oito participantes

Cada participante entra uma vez com Google para aparecer em `Authentication → Users`. Depois, o administrador executa no SQL Editor, substituindo o email, a campanha e o papel:

```sql
INSERT INTO public.membros_campanha (campanha_id,usuario_id,papel)
SELECT '508cdfdb-e6c0-8aac-ab86-dd036a4234d3'::uuid, id, 'jogador'
FROM auth.users
WHERE lower(email)=lower('jogador@example.com')
ON CONFLICT (campanha_id,usuario_id) DO UPDATE SET papel=EXCLUDED.papel;
```

Use `mestre` para quem conduz a campanha. Confirme que o comando afetou uma linha; email ainda não cadastrado não recebe convite por esse SQL.

| Campanha | ID |
| --- | --- |
| Crônicas de Othans | `508cdfdb-e6c0-8aac-ab86-dd036a4234d3` |
| EPM | `6400a630-0781-8129-ad1a-424ae39fc615` |
| Taverna de Jungle Jack | `17931442-e319-8d9e-aac6-e15c953d7341` |

Para retirar acesso, remova o membro dessa campanha no painel/SQL. A conta perde acesso às fichas daquela campanha, inclusive às próprias. Isso não apaga suas fichas. Nenhuma tela pública administra papéis nesta etapa.

## 6. Uso e cópias

Abra **Fichas → Criar personagem**, selecione a campanha e salve. A confirmação aparece depois da resposta do banco. Os campos continuam editáveis enquanto um save está em andamento, e novas alterações permanecem pendentes.

Use **Baixar ficha** antes de fechar uma edição importante ou resolver um conflito. **Importar ficha** aceita uma cópia JSON válida e substitui os campos, mantendo a campanha, propriedade e versão atuais. Importar não salva automaticamente. Assim também é possível levar uma ficha temporária para a mesa depois de entrar.

Rascunhos de fichas autenticadas ficam só na memória da aba, separados por conta e ficha, durante a navegação. Recarregar ou fechar a aba pode perdê-los. Não armazenamos automaticamente fichas privadas no localStorage; o SDK guarda ali a sessão de login. Se houver conflito, exporte sua versão, recarregue a versão do banco e reconcilie as alterações.

O plano gratuito pode pausar projetos com pouca atividade em sete dias; verifique o painel antes da sessão e restaure o projeto se necessário. Essa condição consta na [documentação de disponibilidade](https://supabase.com/docs/guides/deployment/going-into-prod). Não criamos tráfego artificial para evitar a pausa.

Mantenha cópias externas do banco além dos JSON individuais. Para Free, o Supabase recomenda exportações regulares com `supabase db dump`; siga o [guia de backups](https://supabase.com/docs/guides/platform/backups) e ensaie a restauração em um projeto separado. Depois que uploads existirem, seus arquivos precisarão de cópia própria: backup do banco não inclui os objetos do Storage. Credenciais administrativas e dumps privados ficam fora do repositório e da pasta publicada.

## 7. Verificar e preparar a publicação

```powershell
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run preview
```

`npm test` verifica conteúdo, modelo/cálculos, configuração, arquivos de ficha e SQL em PostgreSQL local via PGlite. Playwright usa o SDK real com respostas HTTP interceptadas **somente nos testes** para verificar falhas de rede, salvamento e isolamento visual da sessão. Esses testes não afirmam que um projeto hospedado ou um login real do Google foi configurado.

O build verifica os hashes de todas as fontes legadas e gera `dist/`, incluindo `index.html`, páginas, imagens e o novo `app.html`. Publique o conteúdo de `dist/` quando a configuração estiver pronta. A nova workflow `check.yml` executa verificações; ela não publica automaticamente.

Para GitHub Pages, mantenha `VITE_BASE_PATH=/WEIRS-RPG/`. O legado usa URLs absolutas nesse caminho. Hospedagem em outro prefixo exigirá também ajustar os caminhos das páginas legadas, embora os links da nova aplicação respeitem a base configurada.

Antes de usar o banco com dados reais, valide com duas contas da mesa: login/logout, criação, edição pelo mestre da campanha, recusa de acesso entre campanhas, exclusão somente pelo dono e recuperação de um conflito. Esta validação remota depende das contas e configurações externas.
