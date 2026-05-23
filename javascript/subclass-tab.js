// Sistema de Abas para Subclasses
document.addEventListener('DOMContentLoaded', function() {
  const containers = document.querySelectorAll('.subclasses-container');
  
  containers.forEach(container => {
    const tabsHeader = container.querySelector('.tabs-header');
    const tabsList = container.querySelector('.tabs-list');
    const tabButtons = container.querySelectorAll('.tab-btn');
    const tabPanes = container.querySelectorAll('.tab-pane');
    
    // Cria as setas se não existirem
    let prevBtn = container.querySelector('.tabs-nav.prev');
    let nextBtn = container.querySelector('.tabs-nav.next');
    
    if (!prevBtn) {
      prevBtn = document.createElement('button');
      prevBtn.className = 'tabs-nav prev';
      prevBtn.innerHTML = '◀';
      prevBtn.setAttribute('aria-label', 'Anterior');
      tabsHeader.insertBefore(prevBtn, tabsHeader.firstChild);
    }
    
    if (!nextBtn) {
      nextBtn = document.createElement('button');
      nextBtn.className = 'tabs-nav next';
      nextBtn.innerHTML = '▶';
      nextBtn.setAttribute('aria-label', 'Próximo');
      tabsHeader.appendChild(nextBtn);
    }
    
    if (tabButtons.length === 0) return;
    
    // Verifica se há overflow e adiciona classe
    function checkOverflow() {
      if (tabsHeader && tabsList) {
        // Calcula a largura total da lista
        const listWidth = tabsList.scrollWidth;
        const headerWidth = tabsHeader.clientWidth;
        const hasOverflow = listWidth > headerWidth;
        container.classList.toggle('has-overflow', hasOverflow);
        
        // Mostra/esconde setas baseado na posição do scroll
        updateArrowsVisibility();
      }
    }
    
    // Atualiza visibilidade das setas baseado na posição do scroll
    function updateArrowsVisibility() {
      if (!tabsHeader || !prevBtn || !nextBtn) return;
      
      const scrollLeft = tabsHeader.scrollLeft;
      const maxScroll = tabsList.scrollWidth - tabsHeader.clientWidth;
      
      // Seta anterior (esquerda) - visível apenas se não estiver no início
      if (scrollLeft <= 5) {
        prevBtn.style.opacity = '0.5';
        prevBtn.style.cursor = 'not-allowed';
      } else {
        prevBtn.style.opacity = '1';
        prevBtn.style.cursor = 'pointer';
      }
      
      // Seta próxima (direita) - visível apenas se não estiver no final
      if (scrollLeft >= maxScroll - 5) {
        nextBtn.style.opacity = '0.5';
        nextBtn.style.cursor = 'not-allowed';
      } else {
        nextBtn.style.opacity = '1';
        nextBtn.style.cursor = 'pointer';
      }
    }
    
    // Rola as abas
    function scrollTabs(direction) {
      if (!tabsHeader) return;
      const scrollAmount = tabsHeader.clientWidth * 0.7;
      const newScrollLeft = direction === 'next' 
        ? tabsHeader.scrollLeft + scrollAmount 
        : tabsHeader.scrollLeft - scrollAmount;
      
      tabsHeader.scrollTo({
        left: newScrollLeft,
        behavior: 'smooth'
      });
      
      // Atualiza visibilidade das setas após o scroll
      setTimeout(updateArrowsVisibility, 200);
    }
    
    // Ativa uma aba específica
    function activateTab(index) {
      // Atualiza botões
      tabButtons.forEach((btn, i) => {
        if (i === index) {
          btn.classList.add('active');
          // Rola a aba ativa para visível
          btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
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
      
      // Atualiza setas após mudar de aba
      setTimeout(updateArrowsVisibility, 100);
    }
    
    // Adiciona eventos aos botões
    tabButtons.forEach((btn, index) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        activateTab(index);
      });
    });
    
    // Adiciona eventos às setas
    prevBtn.addEventListener('click', () => scrollTabs('prev'));
    nextBtn.addEventListener('click', () => scrollTabs('next'));
    
    // Adiciona evento de scroll para atualizar setas
    tabsHeader.addEventListener('scroll', updateArrowsVisibility);
    
    // Verifica overflow ao carregar e ao redimensionar
    checkOverflow();
    window.addEventListener('resize', () => {
      checkOverflow();
      setTimeout(updateArrowsVisibility, 100);
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