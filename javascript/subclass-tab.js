// Sistema de Abas para Subclasses (sem scroll automático na inicialização)
document.addEventListener('DOMContentLoaded', function() {
  const containers = document.querySelectorAll('.subclasses-container');
  
  containers.forEach(container => {
    const tabsHeader = container.querySelector('.tabs-header');
    const tabButtons = container.querySelectorAll('.tab-btn');
    const tabPanes = container.querySelectorAll('.tab-pane');
    
    if (tabButtons.length === 0) return;
    
    // Flag para controlar se é a primeira ativação (inicialização)
    let isInitializing = true;
    
    // Ativa uma aba específica
    function activateTab(index, shouldScroll = false) {
      // Atualiza botões
      tabButtons.forEach((btn, i) => {
        if (i === index) {
          btn.classList.add('active');
          // Só rola se shouldScroll for true E não for inicialização
          if (shouldScroll && !isInitializing) {
            btn.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'nearest', 
              inline: 'center' 
            });
          }
        } else {
          btn.classList.remove('active');
        }
      });
      
      // Atualiza painéis
      tabPanes.forEach((pane, i) => {
        if (i === index) {
          pane.classList.add('active');
        } else {
          pane.classList.remove('active');
        }
      });
      
      // Salva a aba ativa no sessionStorage
      const containerId = container.id || 'subclasses-default';
      sessionStorage.setItem(`activeTab-${containerId}`, index);
    }
    
    // Adiciona eventos aos botões (scroll apenas quando clicado pelo usuário)
    tabButtons.forEach((btn, index) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        activateTab(index, true); // scroll ativado no clique
      });
    });
    
    // Restaura a última aba ativa (sem scroll)
    const containerId = container.id || 'subclasses-default';
    const savedTab = sessionStorage.getItem(`activeTab-${containerId}`);
    
    if (savedTab && parseInt(savedTab) < tabButtons.length) {
      activateTab(parseInt(savedTab), false); // scroll desativado
    } else {
      activateTab(0, false); // scroll desativado
    }
    
    // Após a inicialização, permite scroll nos próximos cliques
    isInitializing = false;
  });
});