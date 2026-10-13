# Importar ficha do Roll20 por PDF

Na página da ficha, use **Importar PDF do Roll20**, selecione o PDF impresso da ficha **D&D 2024 by Roll20**, confira a prévia e aplique os dados ao rascunho. Os avisos continuam disponíveis em **Pontos para revisar na importação do PDF**. Revise as abas e use **Salvar ficha** para gravar na mesa, ou **Baixar ficha** para obter o JSON WEIRS. A campanha e as permissões vêm do projeto.

A extração acontece localmente no navegador, usando PDF.js e um worker distribuído junto do aplicativo. Não depende de assinatura Pro, acesso à API do Roll20, OCR ou serviço externo. O PDF precisa conter texto selecionável. O leitor reconhece o layout impresso em inglês da ficha D&D 2024, inclusive dados e descrições em português e conteúdo homebrew.

## Cobertura

- Nome, espécie, antecedente, tamanho, experiência, múltiplas classes e suas subclasses, inclusive cabeçalhos comprimidos.
- Seis atributos, modificadores, bônus/proficiência em resistências e perícias, iniciativa, percepção passiva, CA, PV, dados de vida e marcações impressas.
- Ataques completos, nomes em várias linhas, bônus ou CD, fórmula de dano, tipo, alcance e notas; referência de combate adicional vai para Anotações.
- Magias, círculos, preparação, tempo, alcance, descrições e componentes marcados. Perfis de conjuração quando os atributos/bônus estão explicitamente impressos, incluindo vários perfis. Espaços normais e de pacto quando a tabela contém os totais. A coluna PR, quando presente, determina a preparação; truques permanecem disponíveis.
- Equipamento e posses em ambas as colunas e páginas de continuação, quantidades (inclusive zero), estado de equipado, descrições, moedas, idiomas e sintonia. A classificação usa a linha de categoria impressa, evitando confundir menções na descrição com o tipo do item.
- História, aparência, alinhamento, características de classe/subclasse, traços de espécie e talentos; descrições em colunas separadas e continuação sem entrada nova. Entradas Other, Custom e Background são preservadas em Características com a origem indicada.

O peso da linha do inventário impresso é o peso total daquela pilha. A importação divide pela quantidade e converte libras para **kg por unidade**. O total de peso informado pelo PDF também é preservado em Anotações.

## Revisão necessária

O PDF é uma representação impressa; configurações internas não exportadas não podem ser recuperadas. Campos vazios mantêm os padrões da ficha e aparecem na revisão quando relevantes. Confira deslocamento, origem/atributo das magias, duração e materiais, cargas/recuperação de recursos, efeitos ativos e parâmetros de armadura/crítico. Ataques ficam manuais para preservar os valores impressos; configure vínculos e atributos no editor quando desejar progressão automática.

Entradas de dano ou cura sem jogada de ataque/CD são mantidas com bônus 0 e uma observação explícita: use somente o dano/cura e confira antes de rolar. Quando há vários perfis de conjuração, a importação preserva os números de cada perfil; os vínculos entre classe, perfil e magia precisam de revisão porque a ordem impressa não os identifica.

Os marcadores impressos identificam proficiência simples. Um bônus mais alto pode vir de especialização ou de outro ajuste: o leitor conserva o valor como proficiência mais ajuste e pede confirmação, sem inventar especialização.

Na página resumida, nomes podem estar abreviados e descrições ausentes. Inclua referências completas de combate, magias, inventário e características ao imprimir. PDFs digitalizados, fichas de 2014, versões traduzidas dos rótulos ou layouts diferentes são recusados ou precisam de adaptação. Não há importação de fotografia/OCR.

Limites: **10 MiB**, **30 páginas**, dimensões de página até **1.800 pontos** em cada eixo e área até **1.500.000 pontos²** antes de renderizar. Conteúdo extraído passa pela mesma validação das fichas JSON. Textos acima do limite de um campo são reduzidos com aviso; valores incompatíveis impedem a aplicação.

## Verificação

Os testes usam uma ficha fictícia gerada em código e cenários de colunas, nomes semelhantes, proficiência ambígua e continuação. As regressões também cobrem multiclasses, dados de vida múltiplos, deslocamento com unidade, ataques sem bônus, coluna PR de magias, limites de linhas nas quebras de página, perfis múltiplos, pacto e inventário com quantidade zero. Uma verificação local adicional lê o PDF fornecido pelo usuário sem incluí-lo no repositório:

```powershell
$env:ROLL20_PDF_SAMPLE='C:\caminho\personagem.pdf'
npx playwright test tests/browser/roll20-pdf.spec.ts --workers=1
```

Esse cenário local verifica o personagem TONY OLLI: 8 ataques, 3 magias, 11 itens, 9 características de classe, 3 traços e 2 talentos; também confere marcações, moedas e a separação das descrições. O arquivo convertido fica em `artifacts/roll20-import/tony-olli.json`, ignorado pelo Git. Para outra ficha, adapte as expectativas desse teste; o importador não depende do nome ou desses números.
