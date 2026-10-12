# WEIRS-RPG

[![GitHub Pages](https://img.shields.io/badge/GitHub-Pages-brightgreen)](https://shikiaech.github.io/WEIRS-RPG/index.html)

Um aplicativo web para recordação de campanhas, guia de criação básico e conteúdo traduzido de D&D 2024.

## Webapp em desenvolvimento

A nova área em `app.html` reúne campanhas, compêndio pesquisável, fichas completas com homebrew e mesa virtual com mapa central e chat lateral. As páginas e imagens originais continuam disponíveis. PostgreSQL/Supabase mantém fichas, conversas e mapas com acesso por campanha e login Google; sem configuração, é possível experimentar uma ficha temporária e importar/exportar JSON.

```powershell
npm ci
npm run dev
```

Abra `http://127.0.0.1:5173/WEIRS-RPG/app.html`. Consulte o [guia de configuração da mesa](docs/configuracao-supabase.md) para instalar o banco, configurar o Google e adicionar participantes.

Usuários autenticados podem entrar como jogadores pela página **Campanhas**. Administradores globais são definidos exclusivamente no banco e podem editar fichas alheias e copiá-las para outras campanhas. Instale `202610120009_acessos.sql` após as migrações anteriores e siga o [guia de participação, mestres e admins](docs/acessos-campanhas.md).

A ficha aceita também o PDF impresso do Roll20 D&D 2024, com extração local e prévia antes de aplicar. Veja [como importar a ficha do Roll20](docs/importacao-roll20.md), a cobertura e os campos que precisam de revisão.

Verificações: `npm test`, `npm run build` e `npm run test:browser` (instale Chromium com `npx playwright install chromium`). O build gera `dist/` e verifica que todas as fontes legadas foram preservadas. O compêndio é reimportado a partir do HTML durante o build; o JSON gerado não entra no Git. Para publicar a mesa, siga o [guia do GitHub Pages](docs/publicacao-github-pages.md); o site deve servir `dist/`, e não o `app.html` de desenvolvimento da raiz.

O chat inclui histórico, Realtime, `/r` e `/roll`, vantagem/desvantagem e ações das fichas. Mestres podem esconder resultados com `/gmroll` e revelá-los depois. Rolagens são calculadas e gravadas no banco, com proteção contra duplicação. Dados 3D gratuitos animam os seus envios confirmados em uma janela móvel e recolhível; total e faces são revelados quando a animação termina. Há opção de desligar e suporte a movimento reduzido. Para ativar o chat no projeto existente, siga o [guia do chat](docs/configuracao-chat.md).

**Minha ficha**, **Combate** e **Loja** permitem jogar pela mesa: testes, ataques, magias/danos configurados, PV/condições/concentração, dados de vida/morte, espaços, recursos e descansos; iniciativa, NPCs, turnos e rodadas; compra/venda com moedas e estoque transacionais. Para ativar esses controles, instale `202610070004_mesa.sql` seguindo o [guia de sessão jogável](docs/configuracao-mesa.md).

Mapas incluem cenas públicas/privadas, uploads, tokens ligados à ficha/combate, controle por jogador, PV e condições contextuais, favoritos, áreas de magia, auras, seleção e movimento de grupos, cópias e desfazer/refazer. O [guia da mesa virtual](docs/configuracao-mesa-virtual.md) detalha o uso e a instalação das migrações `005 → 006 → 007`; quem já instalou `005` e `006` executa apenas `202610110007_agilidade.sql`. Não há servidor ou assinatura adicional. Iluminação dinâmica e automação completa de regras permanecem pendentes; decisões e exceções homebrew ficam com o mestre. A publicação e a migração remota não foram executadas nesta entrega local.

## 📋 Changelog

### Versão 1.18.0

- **Data:** 12/10/2026
- **Melhorias:**
  - Melhoria da pagina Mundos
  - Adição das seções: cosmologia, divindades, regiões, idiomas
  - Finalização de Cosmologia com todas as forças fundamentais

### Versão 1.17.2 (app v0.1)

As [melhorias da ficha de jogador](docs/melhorias-ficha-jogador.md) incluem equipamentos por categoria, ataques com múltiplos danos, recursos por item, sintonia e busca de magias no compêndio. A página completa e o painel da sessão exibem os mesmos dados. Para usar na mesa salva, instale `202610120008_ficha.sql` conforme o guia.

### Versão 1.17.1

- **Data:** 08/10/2026
- **Melhorias:**
  - Finalização das raças extraterrestres e correção de pequenos erros

### Versão 1.17.0

- **Data:** 08/10/2026
- **Melhorias:**
  - Adição das raças Espaciais.
  - Atualização dos Cranoris e Humanos Manchados.
  - Adição dos talentos exclusivos de Humanos Manchados.

### Versão 1.16.3

- **Data:** 07/10/2026
- **Melhorias:**
  - Adição de Nemeios, Fenrirs, Yokais, Nanuks, Malteanos e Zoldyanos na página de raças.

### Versão 1.16.2

- **Data:** 03/10/2026
- **Melhorias:**
  - Adição de Talpas e Inamons na página de raças.

### Versão 1.16.1

- **Data:** 01/10/2026
- **Melhorias:**
  - Finalização da classe Pugilista

### Versão 1.16.0

- **Data:** 30/09/2026
- **Melhorias:**
  - Adição da classe Pugilista.

### Versão 1.15.5

- **Data:** 30/09/2026
- **Melhorias:**
  - Atualização da subclasse Guarda do Vazio de Patrulheiro.

### Versão 1.15.4

- **Data:** 30/09/2026
- **Melhorias:**
  - Adição dos personagens da Oneshot EPM.
  - Adição da sessão da Oneshot 1 da EPM.
  - Adição do capítulo 14 de Othans.

### Versão 1.15.3

- **Data:** 20/08/2026
- **Melhorias:**
  - Adição do Joseph Loro na página Othans.

### Versão 1.15.2

- **Data:** 20/08/2026
- **Melhorias:**
  - Correção da descrição do True Strike e da Blade Ward.

### Versão 1.15.1

- **Data:** 17/08/2026
- **Melhorias:**
  - Adição da pagina Mundo (Império Unificado e Xintai)

### Versão 1.15.0

- **Data:** 15/08/2026
- **Melhorias:**
  - Adição das raças tenebrianas (Archais, Baphoritas, Ímpios, Lilins e Zebulins)

### Versão 1.14.11

- **Data:** 04/08/2026
- **Melhorias:**
  - Adição do capítulo 10 da mesa Othans.
  - Correção das datas dos capítulos anteriores.

### Versão 1.14.10

- **Data:** 03/08/2026
- **Melhorias:**
  - Adição do capítulo 9 da mesa Othans.

### Versão 1.14.9

- **Data:** 29/07/2026
- **Melhorias:**
  - Adição da campanha EPM - Escola de Princípios Místicos.

- **Data:** 25/07/2026
- **Melhorias:**
  - Adição do personagem Sun na página dos Othans.

### Versão 1.14.7

- **Data:** 24/07/2026
- **Melhorias:**
  - Adição do capítulo 8 da mesa Othans.

### Versão 1.14.6

- **Data:** 09/07/2026
- **Melhorias:**
  - Adição do capítulo 7 da mesa Othans.
  - Correção da página feiticeiro (adição das metamagias)
  - Remoção do footer duplicado da página de magias.

### Versão 1.14.5

- **Data:** 09/07/2026
- **Melhorias:**
  - Adição do capítulo 6 da mesa Othans.

### Versão 1.14.4

- **Data:** 08/07/2026
- **Melhorias:**
  - Adição dos capítulos 3, 4 e 5 da mesa Othans.

### Versão 1.14.3

- **Data:** 05/06/2026
- **Melhorias:**
  - Adição do capítulo 2 da mesa Othans.

### Versão 1.14.3

- **Data:** 04/06/2026
- **Melhorias:**
  - Adição de todos os backgrounds do wikidot.

### Versão 1.14.2

- **Data:** 04/06/2026
- **Melhorias:**
  - Mudança na página de talentos.
    - Remoção das dragonmarks que estavam na categoria geral.
    - Adição de filtro para a página de antecetendes.

### Versão 1.14.1

- **Data:** 04/06/2026
- **Melhorias:**
  - Mudança na página de talentos.
    - Alteração no sistema de filtro.
    - Adição de todos os talentos presentes no wikidot.

### Versão 1.14.0

- **Data:** 02/06/2026
- **Melhorias:**
  - Página do paladino finalizada.
  - Página do patrulheiro finalizada.
  - Página do pistoleiro finalizada.
  - Página do psionista finalizada.

### Versão 1.13.0

- **Data:** 02/06/2026
- **Melhorias:**
  - Página do monge finalizada.

### Versão 1.12.0

- **Data:** 02/06/2026
- **Melhorias:**
  - Página do feiticeiro finalizada.
  - Correção da página do mago e do feiticeiro.
    - A página do feiticeiro estava com as características do mago.
      - O código foi transferido para a página correta.

### Versão 1.11.0

- **Data:** 02/06/2026
- **Melhorias:**
  - Página do ladino finalizada.
  - Pequenas correções nas páginas do guerreiro e feiticeiro.
    - Adição da div class="overflow-table" para visualização em celulares.

### Versão 1.10.0

- **Data:** 30/05/2026
- **Melhorias:**
  - Página do feiticeiro finalizada.
  - Página do guerreiro finalizada.

### Versão 1.9.1

- **Data:** 28/05/2026
- **Melhorias:**
  - Mudança na estrutura da página de campanhas.
    - Cards clicáveis para a abertura de janelas modais com o texto resumo da sessão.

### Versão 1.9.0

- **Data:** 28/05/2026
- **Melhorias:**
  - Reformulação da Página de Magias
  - Conserto da página de Equipamentos - Armas - Armaduras - Equipamentos de Aventura

### Versão 1.8.0

- **Data:** 28/05/2026
- **Melhorias:**
  - Finalização da página do Druida.

### Versão 1.7.0

- **Data:** 25/05/2026
- **Melhorias:**
  - Add a página Equipamentos

### Versão 1.6.0

- **Data:** 24/05/2026
- **Melhorias:**
  - Finalização da página do Clérigo.

### Versão 1.5.0

- **Data:** 24/05/2026
- **Melhorias:**
  - Correção da Página Antecedentes (add link para talentos)
  - Correção da Página de Talentos (add sistema de grade de cards e filtro dinamico)

### Versão 1.4.1

- **Data:** 24/05/2026
- **Melhorias:**
  - Correção das subclasses do bárbaro.

### Versão 1.4.0

- **Data:** 24/05/2026
- **Melhorias:**
  - Finalização da página do Bruxo.
  - Adição de subclasses UA para Artífice, Bárbaro e Bardo.
  - Correção do botão do Artífice na página classes.

### Versão 1.3.0

- **Data:** 24/05/2026
- **Melhorias:**
  - Finalização da página do Bárbaro.

### Versão 1.2.1

- **Data:** 23/05/2026
- **Melhorias:**
  - Finalização da página do Artífice.

### Versão 1.1.4

- **Data:** 23/05/2026
- **Melhorias:**
  - Adição da página de testes para classe, servindo de base para a reconstrução das demais.
  - Mudanças no arquivo styles.css e adição do arquivo class-styles.css para cumprir com os estilos das páginas de classe especificamente.
  - Adição do arquivo subclass-tab.js para funcionalidade de aba de subclasses.

### Versão 1.1.3

- **Data:** 22/05/2026
- **Melhorias:**
  - Mudanaça no codigo css de badges (definição do tipo de ação usada em um feat).

### Versão 1.1.2

- **Data:** 23/05/2026
- **Melhorias:**
  - Alteração do Simulador de Ficha: Add Classes novas/Add Opções de Atributos
  - Pequenas correções de Textos em Campanhas, Humanos e Simyaris

### Versão 1.1.1

- **Data:** 22/05/2026
- **Melhorias:**
  - Alterações na estrutura da página dos Elfos.

### Versão 1.1.0

- **Data:** 22/05/2026
- **Melhorias:**
  - Footer agora é gerado por JS.
  - Pequenas mudanças e correções textuais em diversas páginas.
  - Adição de novas classes Homebrews conhecidas.
    - Caçador Sanguinário (Versão alternativa 2024, ainda em análise)
    - Pistoleiro (2024)
    - Psionista (UA 2024, disponível no Wikidot)

  ### Versão 1.0.0

- **Data:** 21/05/2026
- **Melhorias:**
  - Entrega inicial utilizável.
  - Reorganização dos arquivos em pastas.
  - Reescrita dos códigos de referência para navegação entre páginas.
