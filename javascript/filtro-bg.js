document.addEventListener('DOMContentLoaded', () => {
  const buscaInput = document.getElementById('busca-nome-antecedente');
  const dropdownCategoria = document.getElementById('filtro-categoria-antecedente');
  const gridsAntecedente = document.querySelectorAll('.grid-antecedentes');

  function filtrarAntecedentes() {
    const termoBusca = buscaInput ? buscaInput.value.toLowerCase().trim() : '';
    const categoriaAtiva = dropdownCategoria ? dropdownCategoria.value : 'todos';

    gridsAntecedente.forEach(grid => {
      // Captura a categoria da grid atual (ex: "comum", "eberron", etc.)
      const categoriaGrid = grid.getAttribute('data-categoria') || '';
      const cardsDentro = grid.querySelectorAll('.card-antecedente');
      let temCardVisivelNaGrid = false;

      // 1. Filtrar os cards individuais dentro desta grid por texto
      cardsDentro.forEach(card => {
        const nomeAntecedente = card.getAttribute('data-nome') || '';
        const tituloTexto = card.querySelector('h3') ? card.querySelector('h3').textContent.toLowerCase() : '';
        
        // Verifica se o texto digitado bate com o atributo ou com o título visível
        const bateNome = nomeAntecedente.includes(termoBusca) || tituloTexto.includes(termoBusca);

        if (bateNome) {
          card.style.display = 'flex';
          temCardVisivelNaGrid = true; // Encontrou um resultado válido por texto nesta grid
        } else {
          card.style.display = 'none';
        }
      });

      // 2. Controlar a exibição da Grid Inteira (sumindo com as bordas e margens)
      const bateCategoriaGrid = (categoriaAtiva === 'todos' || categoriaGrid === categoriaAtiva);

      // A grid só fica visível se ela pertencer à categoria selecionada E se houver algum card que passou na busca por texto
      if (bateCategoriaGrid && temCardVisivelNaGrid) {
        grid.style.display = 'grid'; // Exibe a grid e mantém os estilos em linha (borders/margins)
      } else {
        grid.style.display = 'none';  // Apaga completamente a div e seu espaçamento do layout
      }
    });
  }

  // Registra os ouvintes de evento para digitação e mudança no dropdown
  if (buscaInput) {
    buscaInput.addEventListener('input', filtrarAntecedentes);
  }

  if (dropdownCategoria) {
    dropdownCategoria.addEventListener('change', filtrarAntecedentes);
  }
});