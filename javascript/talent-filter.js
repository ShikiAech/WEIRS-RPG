document.addEventListener('DOMContentLoaded', () => {
  const buscaInput = document.getElementById('busca-nome-talento');
  const dropdownTipo = document.getElementById('filtro-tipo-talento');
  const gridsTalento = document.querySelectorAll('.grid-talentos');
  
  const modal = document.getElementById('modal-talento');
  const modalBody = document.getElementById('modal-talento-body');
  const closeBtn = document.querySelector('.close-modal-talento');

  // =====================================================
  // 1. FILTRO AVANÇADO COMBINADO (Input de Busca + Dropdown)
  // =====================================================
  function filtrarTalentos() {
    const termoBusca = buscaInput ? buscaInput.value.toLowerCase().trim() : '';
    const tipoAtivo = dropdownTipo ? dropdownTipo.value : 'todos';

    gridsTalento.forEach(grid => {
      const tipoGrid = grid.getAttribute('data-tipo') || '';
      const cardsDentro = grid.querySelectorAll('.card-talento');
      let temCardVisivelNaGrid = false;

      // 1.1. Filtra cada card individual por texto
      cardsDentro.forEach(card => {
        // Coleta o nome limpando as badges internas para não dar falso negativo
        const h4Clone = card.querySelector('h4').cloneNode(true);
        const badge = h4Clone.querySelector('.badge-tipo');
        if (badge) badge.remove();
        
        const nomeTalento = h4Clone.textContent.toLowerCase().trim();
        const bateNome = nomeTalento.includes(termoBusca);

        if (bateNome) {
          card.style.display = 'flex';
          temCardVisivelNaGrid = true;
        } else {
          card.style.display = 'none';
        }
      });

      // 1.2. Filtra as Grids Inteiras (evitando margens de seções vazias)
      const bateTipoGrid = (tipoAtivo === 'todos' || tipoGrid === tipoAtivo);

      if (bateTipoGrid && temCardVisivelNaGrid) {
        grid.style.display = 'grid';
      } else {
        grid.style.display = 'none';
      }
    });
  }

  // Escuta os eventos nos dois elementos da barra de filtro
  if (buscaInput) {
    buscaInput.addEventListener('input', filtrarTalentos);
  }

  if (dropdownTipo) {
    dropdownTipo.addEventListener('change', filtrarTalentos);
  }

  // Captura parâmetros vindos da URL externa (Ex: talentos.html?tipo=origem)
  const urlParams = new URLSearchParams(window.location.search);
  const tipoUrl = urlParams.get('tipo');
  if (tipoUrl && dropdownTipo) {
    // Altera o valor selecionado do dropdown para o da URL e roda o filtro
    dropdownTipo.value = tipoUrl;
    // Caso a URL tenha um valor que não existe, força voltar para o padrão 'todos'
    if (dropdownTipo.selectedIndex === -1) {
      dropdownTipo.value = 'todos';
    }
    filtrarTalentos();
  }

  // =====================================================
  // 2. GERENCIAMENTO DINÂMICO DO MODAL
  // =====================================================
  const cardsTalento = document.querySelectorAll('.card-talento');
  cardsTalento.forEach(card => {
    card.addEventListener('click', () => {
      const tituloHTML = card.querySelector('h4').innerHTML;
      const requisitoElement = card.querySelector('.requisito');
      const requisitoTexto = requisitoElement ? requisitoElement.textContent : 'Pré-requisito: Nenhum';
      
      const divOculta = card.querySelector('.talento-detalhes-oculto');
      const conteudoCompleto = divOculta ? divOculta.innerHTML : card.innerHTML;

      if (modalBody && modal) {
        modalBody.innerHTML = `
          <h3>${tituloHTML}</h3>
          <p class="modal-requisito">${requisitoTexto}</p>
          <div class="modal-detalhes-corpo">
            ${conteudoCompleto}
          </div>
        `;
        
        // Limpeza caso o card não possua a div oculta estruturada separadamente
        const corpoModal = modalBody.querySelector('.modal-detalhes-corpo');
        if (!divOculta && corpoModal) {
          const h4Repetido = corpoModal.querySelector('h4');
          const reqRepetido = corpoModal.querySelector('.requisito');
          const resumoRepetido = corpoModal.querySelector('.resumo-talento');
          if (h4Repetido) h4Repetido.remove();
          if (reqRepetido) reqRepetido.remove();
          if (resumoRepetido) resumoRepetido.remove();
        }

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
      }
    });
  });

  // Funções para fechar o Modal
  function fecharModal() {
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }
  }

  if (closeBtn) closeBtn.addEventListener('click', fecharModal);
  
  window.addEventListener('click', (e) => {
    if (e.target === modal) fecharModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharModal();
  });
});