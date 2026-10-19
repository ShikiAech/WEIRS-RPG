# Compêndio relacional de Weirs

O compêndio da aplicação é consultado no PostgreSQL/Supabase. Os JSONs enviados e o acervo HTML são entradas de importação; os seletores usam registros publicados do banco. A manutenção futura pode cadastrar conteúdo compatível sem alterar a interface.

## Acervo carregado

A carga local contém **3.563 conceitos**, derivados de **4.464 elementos de fonte**, incluindo versões conciliadas, com **477 referências bibliográficas versionadas**. O teste integral aplica o SQL duas vezes, verifica uma revisão antiga fixada e cria uma ficha a partir das relações efetivamente lidas do banco.

| Domínio                             |   Registros |
| ----------------------------------- | ----------: |
| Classes / subclasses                |    20 / 155 |
| Espécies / linhagens                |     31 / 18 |
| Antecedentes / talentos             |    71 / 406 |
| Características / criaturas         |   1.620 / 9 |
| Magias                              |         670 |
| Equipamentos / pacotes              |   281 / 183 |
| Idiomas / moedas                    |      26 / 5 |
| Maestrias / propriedades / serviços | 8 / 29 / 31 |

Há 340 grupos de escolhas, 1.452 concessões, 211 efeitos, 35 perfis de conjuração e 183 alternativas de equipamento. Consulte os valores e as pendências atuais em `content/compendium/coverage.json`; as contagens podem mudar com nova curadoria.

**Legibilidade, revisão editorial e automação são estados distintos.** A carga preserva conteúdos de 2014, 2024 e homebrew, com fonte e edição. Nenhum registro recebeu certificação geral `revisado_2024` ou `automacao=completa`. Os 1.046 avisos restantes identificam texto e mecânicas que exigem revisão. Ter um registro publicado não significa que todos os seus efeitos sejam calculados automaticamente.

O núcleo de progressão usa as referências de 2024 indicadas nos arquivos de curadoria. As traduções são do projeto. A referência [Wikidot 5e](https://dnd5e.wikidot.com/) também aponta para o [Wikidot 2024](https://dnd2024.wikidot.com/). A presença de “Player's Handbook” sem ano não é usada para certificar uma edição.

## Organização

| Família                                                        | Responsabilidade                                                                    |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `compendio_registros`, `compendio_revisoes`                    | Identidade estável, revisão imutável e revisão atual                                |
| `compendio_fontes`, `compendio_variantes_fonte`                | Edição, autoria, atribuição, arquivo/commit/hash e evidência de versões conciliadas |
| `compendio_classes`, `compendio_subclasses` e níveis/atributos | Dados de vida, entrada em multiclasse, progressão e vínculo de subclasse            |
| Espécies, linhagens, tamanhos e deslocamentos                  | Tipo, formas e movimentos sem misturar alternativas incompatíveis                   |
| Antecedentes, talentos, características e proficiências        | Benefícios, treinamento, pré-requisitos e limites                                   |
| Grupos/opções de escolha, requisitos, concessões e efeitos     | Decisões e relações tipadas; fórmulas limitadas, sem executar código de fonte       |
| Perfis, listas, progressões, espaços e magias concedidas       | Conjuração por origem, usos próprios e pacto                                        |
| Equipamentos e subtipos, pacotes/itens, moedas e serviços      | Estatísticas, quantidades, preços e alternativas iniciais                           |

`Mancha Espiritual` é o alias confirmado de **Espírito Manchado**. O cadastro preferencial usa o JSON; a identidade e o ID legado são preservados, com a versão HTML registrada como evidência. Variantes de outros talentos não são unificadas apenas pela semelhança do nome.

As revisões publicadas e suas tabelas filhas são imutáveis. A manutenção cria uma revisão nova e chama `publicar_compendio` ou `publicar_compendio_lote`. A publicação valida tipos, requisitos, vínculos e dependências; o lote permite ciclos legítimos entre listas de magias e classes. Apenas admins globais podem manter/publicar o catálogo. Jogadores e mestres de campanha não recebem essa autoridade global.

## Importação reproduzível

```powershell
npm run compendium:check
npm run compendium:seed
npm run compendium:verify
```

Os dois primeiros comandos geram relatório e SQL, sem abrir conexão remota. O segundo também exporta `public/compendium/demo.json`, apenas com o grafo publicável. `compendium:verify` usa PGlite local, aplica toda a carga duas vezes e compara a ficha gerada do banco com a do snapshot.

O importador mantém UUIDs no manifesto `identities.json`, prefere os JSONs nos domínios cobertos e conserva referências antigas. Não executa os scripts encontrados no acervo. Uma revisão importada com alterações editoriais divergentes cancela a carga com `WC004`; a importação não apaga nem sobrescreve essa manutenção. Mudanças mecânicas futuras devem produzir novas revisões, atualizando a versão do resolver/curadoria.

`data/classes.json` fornece 20 classes e 143 subclasses; 12 subclasses complementares permanecem do HTML. `data/spells.json` fornece 656 variantes e há 14 magias complementares do HTML. A conciliação usa o nome original e a fonte, conserva traduções anteriores como aliases e mantém variantes de livros diferentes. As duas versões de Aura Mágica de Nystul presentes no mesmo JSON permanecem separadas, sem atribuir uma edição que o arquivo não informa.

As classes usam dado de vida, atributos, salvaguardas, proficiências, equipamento e características do JSON. Tabelas de progressão e quantidades de perícias ausentes nele são obtidas do HTML correspondente. Classes sem esses dados recebem avisos de revisão; o importador não inventa sua progressão. O hash das revisões inclui o grafo de fontes e os dados complementares, para preservar revisões fixadas quando qualquer dependência muda. Características e itens gerados substituídos saem da busca atual, mantendo suas revisões históricas no banco.

As magias preservam descrição, aumento de círculo, componentes, custos, consumo, alcance, duração, ritual e listas de classes. Danos simples têm parcelas tipadas; modos alternativos, invocações de criaturas e efeitos condicionais ficam no texto para resolução manual. Ao criar a ficha ou adicionar um truque, seu dano considera o nível total do personagem. Aumento de círculo e ajustes posteriores continuam disponíveis pelo editor de danos.

## Consultas da aplicação

`buscar_compendio` oferece busca sem acentos, aliases, filtros de tipo/fonte/classe/círculo/pai e paginação por nome + identidade. `obter_compendio` lê revisões publicadas fixadas e suas dependências. `referencia_legada_compendio` resolve os IDs antigos. Os detalhes são convertidos em DTOs tipados; componentes não interpretam HTML para descobrir regras.

Sem configuração, a interface identifica a demonstração. Um banco configurado indisponível apresenta erro e retentativa. O snapshot não substitui silenciosamente uma consulta que falhou.

O CRUD administrativo continua fora desta entrega. Novos conteúdos que utilizem os contratos existentes podem alimentar os seletores; uma mecânica nova pode exigir novos campos e suporte no motor. Efeitos tipados sem implementação são recusados na criação automática, em vez de aplicados parcialmente.

## Ativação

Siga a ordem em [configuração do Supabase](configuracao-supabase.md#compêndio-e-criação-guiada), incluindo a migração `014` de leitura do catálogo. Aplicar a carga no projeto hospedado e publicar o frontend são operações separadas. A carga, o frontend e a função de criação do projeto Weirs foram [publicados em produção em 19/10/2026](atualizacao-classes-magias-2026-10-19.md).
