function filtrarTalentos(tipo) {
  // 1. Atualizar o visual dos botões de filtro
  const botoes = document.querySelectorAll('.btn-filtro');
  botoes.forEach(btn => btn.classList.remove('ativo'));
  
  // Encontrar qual botão disparou e aplicar a classe ativo
  event.target.classList.add('ativo');

  // 2. Filtrar os cards na tela
  const cards = document.querySelectorAll('.grid-talentos');
  cards.forEach(card => {
    if (tipo === 'todos' || card.getAttribute('data-tipo') === tipo) {
      card.style.display = 'grid';
    } else {
      card.style.display = 'none';
    }
  });
}

// Código extra para ler a URL se o usuário vier clicado de outra página
window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const tipoUrl = urlParams.get('tipo');
  if (tipoUrl) {
    const botaoAlvo = Array.from(document.querySelectorAll('.btn-filtro')).find(btn => btn.getAttribute('onclick').includes(tipoUrl));
    if (botaoAlvo) {
      botaoAlvo.click();
    }
  }
});