// Sistema de Abas para Subclasses (versão sem setas)
document.addEventListener('DOMContentLoaded', function() {
  const containers = document.querySelectorAll('.subclasses-container');
  
  containers.forEach(container => {
    const tabsHeader = container.querySelector('.tabs-header');
    const tabsList = container.querySelector('.tabs-list');
    const tabButtons = container.querySelectorAll('.tab-btn');
    const tabPanes = container.querySelectorAll('.tab-pane');
    
    if (tabButtons.length === 0) return;
    
    // Ativa uma aba específica
    function activateTab(index) {
      // Atualiza botões
      tabButtons.forEach((btn, i) => {
        if (i === index) {
          btn.classList.add('active');
          // Rola a aba ativa para visível (suave)
          btn.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'nearest', 
            inline: 'center' 
          });
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
      
      // Salva a aba ativa no sessionStorage (opcional)
      const containerId = container.id || 'subclasses-default';
      sessionStorage.setItem(`activeTab-${containerId}`, index);
    }
    
    // Adiciona eventos aos botões
    tabButtons.forEach((btn, index) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        activateTab(index);
      });
    });
    
    // Restaura a última aba ativa (se disponível)
    const containerId = container.id || 'subclasses-default';
    const savedTab = sessionStorage.getItem(`activeTab-${containerId}`);
    if (savedTab && parseInt(savedTab) < tabButtons.length) {
      activateTab(parseInt(savedTab));
    } else {
      // Ativa a primeira aba por padrão
      activateTab(0);
    }
  });
});