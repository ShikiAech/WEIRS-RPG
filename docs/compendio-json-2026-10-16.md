# Auditoria das fontes JSON do compêndio

Inspeção em 16/10/2026 do commit [84e6289 — pasta data com arquivos json prontos](https://github.com/ShikiAech/WEIRS-RPG/commit/84e62891dc37802b69adbf82920259d0c66036fc), por leitura integral dos três arquivos via GitHub. O código local não foi sincronizado ou alterado durante a inspeção. Esta é uma auditoria estrutural; não certifica a fidelidade de todas as regras traduzidas aos livros de origem.

## Inventário

| Arquivo | Registros | Campos principais | Blob Git |
| --- | --- | --- | --- |
| `data/background.json` | 71 | Nome PT/original, livro, editora, descrição, atributos, talento, perícias, ferramentas, equipamentos A/B e tags | `8b90419277424e79027ae45c8acec045a92aecf3` |
| `data/feats.json` | 204 | Nome PT/original, livro, editora, categoria, descrição e tags; 169 registros com pré-requisito e 128 com atributos | `299dc979718c5e1e2d1521df421083f711ab1dbc` |
| `data/races.json` | 30 | Nome PT, livro, imagens, descrição, tipo, tamanho, deslocamento, idade, traços e tags; duas espécies com subraças | `a8cdf96953524897bc1e458d6e911a50364b8e3a` |

Todos os arquivos são arrays JSON válidos. Não há nomes PT repetidos após normalização de acentos, caixa e pontuação dentro de cada arquivo. Não há IDs persistentes, versão de esquema ou URL de referência por registro.

Antecedentes: 16 indicam `Player's Handbook (2024)` no campo de livro; os demais indicam outras fontes. Talentos: 49 indicam esse livro, 22 indicam apenas `Player's Handbook` e cinco indicam `WEIRS`; os demais têm outras fontes. Os rótulos são metadados fornecidos pelo JSON e precisam de revisão editorial para classificar a edição. As 30 espécies indicam `WEIRS - Homebrew` e somam 153 traços de espécie, além dos traços das subraças. Não são um catálogo de espécies oficiais do núcleo.

## O que já pode ser aproveitado

- Campos separados de antecedentes, incluindo os três atributos elegíveis, perícias, ferramentas e alternativas A/B de equipamento.
- Identificação original/PT dos talentos e antecedentes, útil para relacionar traduções alternativas.
- Categoria de talento e atributos potencialmente aumentados.
- Traços de espécie como itens independentes, com nome e descrição; relações explícitas de Elfos/Meio-Elfo e Humanos/Manchados/Marcados.
- Conteúdo de Weirs já traduzido, sem necessidade de reextrair essas descrições do HTML.

## Transformações necessárias para o banco

1. Atribuir identidade estável e revisão às entidades; guardar o commit, caminho e hash como procedência de importação. A identidade não deve mudar quando a tradução mudar.
2. Resolver `feat`, perícias, ferramentas, equipamentos e magias mencionadas para FKs. Strings como `Iniciado em Magia (Clérigo) (Magic Initiate)` também contêm uma escolha de variante/perfil, além da referência ao talento.
3. Transformar pré-requisitos em condições tipadas, preservando E/OU. Exemplo presente: `Nível 4+, Força ou Destreza 13+`.
4. Separar quantidades e moedas dos nomes de itens. Exemplo de pacote: pergaminho com 10 folhas e 8 PO; alternativa B com 50 PO. Os kits precisam apontar aos equipamentos reais, não apenas guardar arrays de texto.
5. Representar escolhas de talento por categoria. Há antecedentes que permitem escolher um Dom Sombrio ou Pacto Planar; não são referências a um único talento fixo.
6. Estruturar efeitos relevantes à criação. Exemplo: Carapaça Óssea dos Cranoris descreve CA `13 + Constituição` sem armadura, com escudo permitido. Essa regra precisa ser um efeito consultável, além de sua descrição.
7. Separar tamanho, modo de movimento, distância, unidade e condição. Há valores como `9 metros (Terrestre); 9 metros (Voo Inato)` e `20 pés (Forma Natural) / 30 pés (dentro do Exotraje)`. Alternativas condicionais não podem ser somadas.
8. Preservar descrições completas no compêndio e sanitizar qualquer conteúdo rico exibido. Validar os limites da ficha antes de projetar os benefícios, sem truncar silenciosamente o conteúdo.

## Conciliação com o catálogo existente

O índice local de referência tem 61 antecedentes, 203 talentos e 31 espécies, além de classes/magias. Comparação por nome traduzido encontra muitas diferenças que são apenas traduções: não usar ausência de nome PT como prova de remoção. Exemplos:

| Catálogo existente | JSON novo | Tratamento |
| --- | --- | --- |
| Aumento no Valor de Habilidade | Melhoria de Valor de Habilidade | Conferir a versão de `Ability Score Improvement` e cadastrar aliases. |
| Luta Cega | Luta às Cegas | Conferir fontes e mecânicas. O legado já tem duas variantes de Luta Cega. |
| Agente da Casa | Agente de Casa | Relacionar pelo conceito original e fonte revisada. |
| Neflins | Ausente de `races.json` | Importar também do HTML; não remover a espécie do compêndio. |

Os três JSONs não cobrem classes, subclasses, progressões, magias, equipamentos nem idiomas. Esses domínios continuam no escopo de importação a partir do restante do acervo e das referências adotadas. O total consolidado só poderá ser informado depois da resolução de aliases e variantes.

## Pendências editoriais concretas

- O traço Mancha de Humanos/Manchados concede um talento chamado **Mancha Espiritual**. Em `feats.json`, o talento de Origem correspondente em contexto é chamado **Espírito Manchado**. Registrar a referência como não resolvida até confirmar a equivalência, sem conceder outro talento automaticamente.
- Alguns antecedentes chamam a categoria de **Dom Sombrio**, enquanto os talentos usam **Presente Sombrio**. A conciliação de rótulos deve ficar explícita no glossário/cadastro de categorias.
- `Player's Handbook` sem ano não determina sozinho a versão de uma mecânica. Fonte de referência, edição e adaptação precisam de campos separados.

## Referência Wikidot informada pelo usuário

A página [D&D 5e Wikidot](https://dnd5e.wikidot.com/) aponta para [D&D 2024 Wikidot](https://dnd2024.wikidot.com/) ao apresentar as regras dos livros de 2024. Preservar ambas as URLs como referências de consulta quando utilizadas, com o livro indicado na página e a tradução/adaptação do projeto. O catálogo deve identificar o conjunto de regras de cada registro, incluindo os conteúdos antigos e homebrew mantidos em Weirs.

## Consequência para a implementação

Usar os JSONs como entrada preferencial para os domínios que cobrem. Complementar pelo HTML; aplicar curadoria tipada e resolver referências antes de publicar. Os seletores da aplicação consultarão o PostgreSQL. Acrescentar outro arquivo JSON no futuro não deve exigir alterações de interface, mas sua importação precisa passar pelas mesmas validações e relações do banco.
