# Criação guiada de personagens

**Fichas → Criar personagem** abre o assistente. **Preencher manualmente** mantém o editor livre anterior. A demonstração está em `app.html#/fichas/nova?demo=1` e termina em uma ficha temporária que pode ser conferida e baixada.

## Etapas

1. **Atributos:** informe seis valores externos inicialmente vazios, ou gere dois conjuntos de seis resultados de 4d6 descartando o menor dado. Nenhum conjunto é escolhido automaticamente. A distribuição usa índices: valores iguais de resultados diferentes podem ser usados, mas um mesmo resultado não se repete.
2. **Espécie:** selecione a espécie, leia os traços e faça as escolhas cadastradas. Forma e tamanho só aparecem quando existem alternativas; linhagens opcionais continuam disponíveis quando cadastradas.
3. **Antecedente:** distribua +2/+1 ou +1/+1/+1 entre os atributos permitidos, respeitando o limite do registro. Complete as decisões do antecedente/talento; o kit ou as moedas são escolhidos na etapa 5.
4. **Classes:** defina os níveis por classe e a ordem em que foram adquiridos. A classe inicial e a entrada em multiclasse têm proficiências distintas. Subclasses, estilos de luta, maestrias e talentos aparecem conforme seus níveis e escolhas cadastradas.
5. **Vida e defesas:** confira o máximo do dado no primeiro nível total e escolha PV fixos ou resultados rolados/externos nos demais. As rolagens ficam registradas; mudar Constituição recalcula os ganhos. Em **Equipamentos iniciais**, escolha os kits ou moedas da classe inicial e do antecedente; depois equipe os itens recebidos e confira CA e movimentos.
6. **Magias:** escolha os atributos permitidos por perfil e as magias de suas listas. As seleções aparecem em chips com descrição acessível pelo ponteiro, teclado ou toque. Truques, magias conhecidas/preparadas, grimório, usos concedidos e pacto permanecem separados por origem.
7. **Revisão:** confira benefícios, fontes, valores e pendências; informe nome e campanha e conclua. O servidor devolve a ficha que será aberta no editor existente.

O resumo acompanha o preenchimento. Trocar uma origem remove suas decisões dependentes. Reduzir níveis ou trocar um kit limpa seleções que deixaram de existir. O rascunho fica separado por conta/campanha na memória e no armazenamento da aba, quando disponível, e é eliminado ao sair da conta. Recarregar a página conserva o rascunho; fechar a aba ou bloquear o armazenamento pode perdê-lo. O cache de consultas do compêndio é separado do rascunho e evita repetir buscas bem-sucedidas ao navegar entre etapas.

## Cálculos e cobertura

`packages/character-creation/` resolve uma prévia pura e determinística. A ordem de retorno das linhas do banco não altera a ficha. Benefícios recebem identidades de instância e procedência; resolver novamente não acrescenta cópias.

- PV: máximo apenas no primeiro nível total, dado correto de cada classe, mínimo 1 por ganho e Constituição retroativa. Bônus de vida tipados conservam sua origem.
- Defesa: uma fórmula de CA por vez, escudo quando permitido, armaduras e formas de movimento. Há curadoria para Cranoris, Bárbaro e Monge; efeitos narrativos ainda exigem acompanhamento.
- Progressão: proficiência pelo nível total; requisitos de multiclasse e talentos avaliados no momento de aquisição. Um aumento obtido depois não satisfaz um pré-requisito anterior.
- Conjuração: uma fonte usa sua tabela; várias fontes somam contribuições cadastradas, com metades arredondadas para cima e terços para baixo onde aplicável. Pacto fica separado. Espaços superiores não liberam magias superiores para uma classe de nível insuficiente.
- Origens: Iniciado em Magia respeita a lista escolhida/restrita pelo antecedente; conjuração inata curada inclui Fadas, Archais, Ímpios, Baphoritas e Telecinese Anansi. A mesma magia recebida por duas origens conserva perfis/usos distintos. Um truque que não exige atributo não recebe um atributo inventado.
- Inventário: kits preservam quantidades e moedas; armas tipadas criam ataques vinculados com danos e proficiência. O editor e a mesa continuam usando as listas v1.

A cobertura completa está no [guia do compêndio](compendio-banco.md). Não há automação integral de todos os textos legados/homebrew. Pré-requisito não interpretado impede a concessão automática afetada; descrições e decisões manuais continuam visíveis. Conferir os traços é necessário, especialmente para condições, escolhas narrativas, recursos e regras ainda sem curadoria.

## Servidor, privacidade e retentativa

A Edge Function `criar-personagem` verifica a sessão com Supabase Auth e executa o mesmo motor da prévia. Rejeita divergências e pendências e chama uma RPC restrita a `service_role`. A função SQL revalida o acesso à campanha e as revisões publicadas e grava ficha, classes, níveis, escolhas, concessões e recibo em uma transação.

O navegador envia um ID de tentativa estável. Se a resposta se perder, o servidor consulta o recibo antes de carregar novamente o catálogo; recupera a ficha confirmada sem duplicar, inclusive após mudança das regras. Enquanto o resultado estiver incerto, as escolhas ficam congeladas e a tentativa pode ser reenviada mesmo com o catálogo indisponível. A confirmação deve ocorrer antes da edição, evitando duplicatas e conflitos de recibo. Uma rejeição definitiva de validação libera a correção; reutilizar um recibo confirmado com dados incompatíveis é recusado. Alterações de permissão continuam sendo verificadas na recuperação.

As tabelas `ficha_criacao_*` só são lidas por quem já pode ler a ficha. Clientes não escrevem nelas nem chamam o gravador privilegiado. A chave de serviço pertence exclusivamente ao ambiente da Edge Function.

## Depois da criação

A ficha continua editável e jogável: gastos, descansos, inventário, ataques, recursos, perfis e espaços usam os fluxos existentes. O histórico descreve a criação inicial e não reaplica benefícios após uma edição manual.

O formato JSON v1 aceita o bloco opcional `conteudo.criacao`. Arquivos antigos e PDFs Roll20 continuam funcionando. A exportação conserva rascunho, revisões e procedência; a importação valida esse histórico e mantém a ficha disponível para edição manual mesmo se uma origem não existir no catálogo de destino. O histórico de uma ficha validada no servidor é imutável. Copiar para outra campanha conserva suas relações com a autoridade administrativa já existente.

## Verificação e ativação

```powershell
npm test
npm run compendium:verify
npm run build
npm run test:browser
```

O build também gera o motor empacotado em `supabase/functions/_shared/creation-engine.js`. Veja a [ordem de instalação](configuracao-supabase.md#compêndio-e-criação-guiada) antes de habilitar a criação no ambiente hospedado. A migração remota e o deploy da Edge Function não são executados pelos testes ou pelo build.

Veja também o [guia das melhorias de criação, chat e mesa de 28 de outubro de 2026](melhorias-criacao-mesa-2026-10-28.md).
