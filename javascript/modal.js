// =====================================================
// SISTEMA DE MODAL PARA NARRATIVAS
// =====================================================

// Função para abrir o modal
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // Impede rolagem da página principal
  }
}

// Função para fechar o modal
function closeModal(modalElement) {
  if (modalElement) {
    modalElement.style.display = 'none';
    document.body.style.overflow = ''; // Restaura rolagem da página principal
  }
}

// Configurar todos os cards para abrir o modal correspondente
function setupCards() {
  const cards = document.querySelectorAll('.camp-card');
  cards.forEach(card => {
    card.addEventListener('click', function() {
      const modalId = this.getAttribute('data-modal');
      if (modalId) {
        openModal(modalId);
      }
    });
  });
}

// Configurar todos os modais (fechamento e eventos)
function setupModals() {
  const modals = document.querySelectorAll('.modal');
  
  modals.forEach(modal => {
    // Botão de fechar
    const closeBtn = modal.querySelector('.close-modal');
    if (closeBtn) {
      closeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeModal(modal);
      });
    }
    
    // Fechar ao clicar fora do conteúdo (no overlay)
    modal.addEventListener('click', function(event) {
      if (event.target === modal) {
        closeModal(modal);
      }
    });
  });
}

// Configurar fechamento com tecla ESC
function setupEscapeKey() {
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
      const openModals = document.querySelectorAll('.modal');
      openModals.forEach(modal => {
        if (modal.style.display === 'flex') {
          closeModal(modal);
        }
      });
    }
  });
}

// Inicializar tudo quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', function() {
  setupCards();
  setupModals();
  setupEscapeKey();
});