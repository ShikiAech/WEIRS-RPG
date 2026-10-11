# Agilidade durante o jogo

Objetivo autorizado: implementar a etapa 1 da comparação com Roll20 e corrigir a facilidade de uso da mesa atual. Diário e bestiário existentes ficam fora desta etapa. O usuário mantém autorização para decisões autônomas de produto.

## Experiência

- Manter identidade escura/dourada, mapa central e chat lateral. Usar controles contextuais e detalhes recolhíveis; evitar novos painéis permanentes.
- Ao selecionar token autorizado, abrir controles compactos de ficha, PV, condições e favoritos. Operações usam os RPCs existentes e versões atuais; controlador de token não ganha permissão de editar ficha alheia. Tokens ocultos não operam estado público pelo novo contexto.
- Favoritos guardam apenas referências de ação/entrada por usuário/campanha/ficha no navegador, até 12. Rolagem reconstrói comando da ficha salva atual; remover entrada invalida favorito. Não armazenar resultados, nomes privados ou snapshots de ficha. Usar visibilidade de rolagem definida no chat.
- Áreas de magia: círculo, cone, quadrado e linha com tamanho em pés, cor, origem e direção. Arraste para posicionar/orientar, prévia antes de salvar, ajuste ou remova pela lista contextual. Persistir no banco e compartilhar entre sessões autorizadas.
- Mestre seleciona vários tokens com Shift/clique ou Shift/arraste e movimenta em conjunto, preservando distâncias e limites. Duplicação cria novas identidades e desfaz vínculo de NPC em combate.
- Desfazer/refazer local à cena (até 20 alterações confirmadas): posição/edição de tokens, duplicação, alinhamento do fundo e desenhos/neblina. Não incluir PV, compras, dados, exclusão definitiva ou operações de outros participantes. Guardar versões esperadas, rejeitar conflitos sem sobrescrever terceiros; reenvio desconhecido usa mesma tentativa. Cancelar histórico ao trocar cena/papel/usuário ou liberar uma tentativa desconhecida.
- Fundo: ajustes de deslocamento e escala para alinhar imagens à grade; aura opcional no token.

## Dados

Migração 007 preserva 001–006. Contratos adicionam fundo_x/fundo_y/fundo_escala, aura no token, tokens_lote/tokens_duplicar, public.areas_mapa e comandos area_criar/atualizar/excluir. Áreas possuem autor, versão e token opcional; vínculos ocultos continuam privados e são removidos com o token. RLS, recebimentos idempotentes, permissões atuais, limites e locks seguem os padrões existentes. Lote é atômico e exclusivo do mestre, até 40 tokens. Nenhuma dependência paga ou servidor adicional.

## Auditoria e aceitação

Capturas novas dos seis passos (entrada na mesa, seleção, ficha, rolagem, combate, loja) em desktop/celular identificaram sobreposição dos dados no combate, topo de ficha extenso, ausência de ações contextuais e tokens pequenos no zoom de enquadramento. Corrigir sobreposição priorizando painel ativo; facilitar seleção por lista; tornar abas da ficha acessíveis sem scroll; compactar cabeçalho se preservar navegação.

Verificar operações reais em PostgreSQL/PGlite, geometria, histórico com conflito, favoritos com versão alterada e navegador com transporte simulado: PV/condições no contexto, favorito/segredo/3D, áreas em duas sessões, lote e duplicação com undo/redo, perda de confirmação, autorização, teclado, telefone e regressão de combate/loja. Inspecionar capturas finais e documentar limitações de validação externa.
