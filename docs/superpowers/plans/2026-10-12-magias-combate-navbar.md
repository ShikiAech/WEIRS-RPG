# Magias de combate e cabeçalho — plano de implementação

> Execução no projeto atual, preservando as alterações anteriores. Usar executing-plans, testes antes da implementação e revisão independente ao concluir.

**Objetivo:** cadastrar cada magia uma vez, configurar suas parcelas de dano e rolar pela aba Combate e pelo painel da sessão; tornar o cabeçalho tão legível quanto o site original.

**Desenho:** o cadastro permanece em `conteudo.magias`. A lista opcional `danos` reutiliza as parcelas de armas (id, dado, atributo, tipo); `dano` e `tipoDano` são mantidos para compatibilidade com fichas v1. O PostgreSQL resolve os modificadores a partir da ficha salva, rola uma vez e identifica o subtotal de cada parcela a partir dos mesmos dados. A ação `magia_dano`, os favoritos, os recibos e as permissões permanecem os mesmos. Não duplicar magia em `ataques`.

**Interface:** editor de parcelas na aba Magias; resumo e botões das mesmas magias em Combate; resumo de fórmulas/tipos no pop-up; total e subtotais no chat somente após a animação. Manter cadastro manual e compêndio, campos livres para homebrew e fórmulas antigas. Cabeçalho com marca de 32 px, links de 16 px, áreas de clique de 44 px e organização responsiva sem rolagem horizontal da página, inclusive na mesa.

**Arquivos:** novo `packages/sheets/magias.js`, componente `SpellDamageEditor.tsx`, migração `202610120010_danos_magias.sql`; alterar contratos, validação/importação, SheetForm/SheetPlay/SheetChat/favoritos/Message e estilos. Nenhuma nova dependência.

- [x] Escrever e observar falhar testes de normalização, limites, favoritos, rolagem autoritativa com tipos e cadastro único na interface.
- [x] Implementar domínio/validação com compatibilidade para fórmulas antigas e parcelas vazias em edição.
- [x] Implementar a migração para calcular modificadores no banco, preservar os dados da rolagem e os recibos; testar propriedade, versão, segredo e limites conjuntos.
- [x] Integrar o editor e a vista de combate/painel, sem cópia de registros; confirmar ocultação dos subtotais durante animação.
- [x] Ajustar e comparar o cabeçalho com o original em desktop, celular e 320 px.
- [x] Revisar a implementação, executar testes pertinentes, suíte geral e build; documentar a migração e o uso.

**Foco de revisão:** fórmulas legadas; parcela com sinal negativo; IDs duplicados e limites de até 20 parcelas/100 dados/120 caracteres no total; ausência de perfil para dano independente; subtotais secretos ou durante animação; espectador e admin; mudanças de atributo depois do cadastro; cabeçalho da mesa e nomes de usuário longos.

Não aplicar migração remota, conceder papéis, criar commits ou publicar nesta tarefa.

## Resultado em 12/10/2026

- `npm test`: 91 testes unitários e de banco aprovados.
- `npx playwright test --workers=4`, com o PDF de exemplo do Roll20: 162 testes aprovados em desktop/celular.
- `npm run build`: TypeScript e publicação aprovados; 122 arquivos originais preservados.
- Revisão independente corrigiu perda de foco ao editar a primeira parcela de uma magia antiga; teste de teclado observado falhar e passar após o ajuste.
- Ajuste do cabeçalho móvel da mesa corrigiu sobreposição no mapa; os três testes afetados passaram antes da repetição completa da suíte.
- Prévia nativa do cabeçalho: `artifacts/magias-combate/cabecalho.png`; magia única com Fogo/Frio em Combate: `artifacts/magias-combate/magias-na-aba-combate.png`. Em 320 px, links de 15 px/44,75 px e sem overflow horizontal da página.
- Guia: [magias-combate.md](../../magias-combate.md). Migração remota e publicação permanecem não executadas.
