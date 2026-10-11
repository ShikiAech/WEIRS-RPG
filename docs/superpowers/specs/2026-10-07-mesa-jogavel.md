# Mesa jogável integrada

Objetivo: oito participantes conseguirem narrar, testar habilidades, lutar, controlar recursos e negociar itens sem sair do chat. Desenvolvimento autônomo autorizado pelo usuário; execução solo, em ciclos de implementação, testes e revisão.

Referências funcionais: [ficha e PV do Roll20](https://roll20.net/compendium/dnd5e/00%20Start%20Here:Help-%20DnD%20Fifth%20Edition%20Character%20Sheet-%20Header), [inventário e moedas](https://app.roll20.net/compendium/dnd5e/00%20Start%20Here%3AHelp-%20DnD%20Fifth%20Edition%20Character%20Sheet-%20Inventory%20Tab). São referências de fluxo, sem copiar interface, conteúdos ou código.

Reutilizar React, Supabase, modelos das fichas e rolagens autoritativas existentes. Sem serviços pagos novos. Interface em português e estilos existentes. Combate por teatro da mente: iniciativa, rodada, turno, PCs e NPCs, PV, CA, condições e concentração. Resistências, alcance, acerto, economia de ações e exceções homebrew são adjudicados pelo mestre. Não prometer um motor completo de todas as regras de D&D nem mapas com tokens nesta entrega.

Ficha dentro do chat: atributos, resistências, perícias, iniciativa, morte, ataques/danos, magias/CD/ataque/dano configurado e dados de vida. Alterações incrementais de PV/condições/concentração, recursos, espaços, itens e descanso usam transações e versão da ficha. A ficha completa continua disponível para edição estrutural; nenhuma sincronização sobrescreve rascunhos desse editor.

Estado público de sessão isolado por campanha. Somente mestre administra NPCs, turnos e ofertas. Jogadores alteram as próprias fichas; espectadores somente leem. Publicar somente os dados de combate necessários, sem expor histórias, moedas ou inventários dos demais jogadores. Realtime e recuperação periódica atualizam os painéis, com limpeza ao perder acesso.

Loja em modal: mestre abre/fecha e cadastra ofertas, preço de compra/venda e estoque; jogadores compram/vendem pela ficha selecionada. Valor em cobre inteiro, com moedas D&D convertidas sem perda; estoque, saldo e quantidade atualizados atomicamente. Reenvio recupera a operação confirmada. Falhas não podem gastar duas vezes. Itens que não constam nas ofertas exigem cadastro pelo mestre.

Critério de conclusão: simular uma sessão narrativa → testes → iniciativa → ataque/dano → PV/condições → recursos/descanso → compra/venda → recarga/reconexão, com permissões e concorrência verificadas no PostgreSQL e fluxos desktop/celular no navegador. A migração deve ser entregue com instruções de ativação; implantação remota depende do acesso real disponível.
