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

Siga o [guia oficial do Supabase para Google](https://supabase.com/docs/guides/auth/social-login/auth-google). Crie um cliente OAuth do tipo aplicativo web no Google Auth Platform e configure sua audiência para os participantes autorizados. Se usar modo de teste, adicione as oito contas como usuários de teste.

- Origem JavaScript local: `http://127.0.0.1:5173`.
- Origem do site atual: `https://shikiaech.github.io`.
- URI autorizada de redirecionamento no **Google**: a URL exibida no provedor Google do Supabase, normalmente `https://SEU-PROJETO.supabase.co/auth/v1/callback`.
- Client ID e Client Secret ficam no painel **Supabase → Authentication → Providers → Google**. Nunca coloque o Client Secret em variáveis `VITE_`.

Em **Supabase → Authentication → URL Configuration**, use a URL final como Site URL e adicione explicitamente estes Redirect URLs:

```text
http://127.0.0.1:5173/WEIRS-RPG/app.html
https://shikiaech.github.io/WEIRS-RPG/app.html
```

Se a hospedagem ou porta mudar, atualize esses endereços. O callback da aplicação é `app.html`; o callback do provedor Google é `/auth/v1/callback` do Supabase. A aplicação usa PKCE, troca o código uma vez e remove os parâmetros de autenticação da URL. Nenhum parâmetro `next` escolhe um domínio externo.

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
