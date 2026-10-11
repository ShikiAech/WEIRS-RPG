# Mesa virtual e rolagens secretas

Usuário autoriza execução autônoma e decisões de produto. Desenvolvimento solo, reaproveitando React, Supabase, fichas, dados 3D e o acervo existente. Uso pessoal de oito pessoas; nenhum serviço pago adicional. Esta entrega deve produzir uma mesa persistente utilizável, não um mockup.

## Experiência

Área de jogo ocupa a viewport: barra superior compacta, ferramentas do mapa à esquerda, mapa ao centro e chat à direita. No celular, mapa/chat são alternáveis. A ficha e dados são janelas móveis por arraste de cabeçalho, recolhíveis e mantidas dentro da viewport. Combate, loja, cenas e arquivos abrem por intenção; não ficam todos expostos. Preservar tema escuro/dourado, reduzir títulos decorativos e texto repetido durante o jogo.

## Segredo no banco

Somente mestres podem enviar rolagens secretas. Tabela pública guarda aviso, autor e sequência; expressão, rótulo e resultado vivem em tabela privada com RLS, fora da publicação Realtime. RPC verifica papel atual antes de entregar dados privados. Histórico, Realtime, reenvio e animação preservam esse isolamento. Revelar cria uma mensagem pública nova com o resultado original, sem rerrolar; repetição de revelação não duplica. Ações que alteram estado público (iniciativa, morte e dado de vida) permanecem públicas, com explicação explícita antes do envio.

## Mapas e tokens

Cenas persistentes por campanha, com dimensões em células, grade/escala, fundo por imagem e cena ativa compartilhada. GM cria/edita/publica cenas e controla tokens de NPC; jogador movimenta apenas token ligado à própria ficha ou atribuído pelo mestre. Token pode vincular ficha ou participante NPC do combate, mostrando os PV/condições atuais. Arrastar, teclado, zoom/pan, ajuste à grade, seleção e abrir ficha pelo token. Posições usam controle de versão e reenvio seguro. Nenhuma atualização por frame nem mensagem de chat por movimento.

Camada do mestre tem tokens ocultos com RLS, sem envio a jogadores. Máscara de neblina manual por retângulos revelados; serve como auxílio visual de exploração, não como proteção contra extração da imagem completa já compartilhada. Régua usa escala da cena; ping compartilhado temporário e desenho simples oferecem comunicação espacial. Publicar cenas futuras é escolha explícita do mestre.

## Arquivos

Supabase Storage privado, isolado por campanha e visibilidade (mestre/campanha), com imagens PNG/JPEG/WebP e documentos PDF. Uploads limitados, sem HTML/SVG executável; metadados com RLS, nomes/paths validados, arquivo carregado via download autenticado e blob local. Não usar links públicos permanentes para arquivos privados. Imagens reduzidas no navegador para economizar espaço; PDF pode ser aberto/baixado. Fundo e retrato do token reutilizam esses arquivos. Não implantar backend Rust ou serviços de imagem externos.

## Critérios de revisão

Testar segredo por SELECT direto, RPC, histórico, eventos e reenvio; revogação e revelação repetida. Testar autorização de cena/token/assets, versão, movimento fora dos limites, arquivo privado e vínculo de ficha/combate. Navegador desktop/celular: mapa, chat acessível, janelas móveis/recolhíveis, segredo, token, iniciativa/PV integrados, criação/upload e reconexão. Preservar editor e conteúdo legado. Documentar migrações remotas necessárias e limitações reais (iluminação dinâmica, paredes automáticas, áudio e motor completo de regras são evoluções posteriores).

Referências: [Roll20 Tabletop Overview](https://help.roll20.net/hc/en-us/articles/360039734913-Tabletop-Overview), [Storage privado Supabase](https://supabase.com/docs/guides/storage/buckets/fundamentals), [downloads autenticados](https://supabase.com/docs/guides/storage/serving/downloads).
