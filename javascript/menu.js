document.addEventListener("DOMContentLoaded", function() {
    // 1. Identifica qual página está aberta no momento
    const paginaAtual = window.location.pathname.split("/").pop() || "index.html";

    // 2. Cria a estrutura do menu (Adicione novas páginas aqui!)
    const linksMenu = [
        { texto: "Início", url: "/WEIRS-RPG/index.html" },
        { texto: "Campanhas", url: "/WEIRS-RPG/pages/campaigns/campanhas.html" },
        { texto: "Raças", url: "/WEIRS-RPG/pages/races/racas.html" },
        { texto: "Classes", url: "/WEIRS-RPG/pages/classes/classes.html" },
        { texto: "Talentos", url: "/WEIRS-RPG/pages/talentos.html" },
        { texto: "Antecedentes", url: "/WEIRS-RPG/pages/antecedentes.html" },
        { texto: "Magias", url: "/WEIRS-RPG/pages/magias.html" }
    ];

    // 3. Monta o HTML do menu dinamicamente
    let htmlMenu = `
    <div id="header-wrap">
      <header id="header">
        <a href="/WEIRS-RPG/index.html" class="logo">Weirs</a>
        <nav class="nav">
          <ul>
    `;

    linksMenu.forEach(link => {
        // Se a página atual for igual ao link, adiciona a classe active para acender o botão
        const classeAtiva = (paginaAtual === link.url.split("/").pop()) ? 'class="active"' : '';
        htmlMenu += `<li><a href="${link.url}" ${classeAtiva}>${link.texto}</a></li>`;
    });

    htmlMenu += `
          </ul>
        </nav>
      </header>
    </div>
    `;

    // 4. Injeta o menu no topo do body
    document.body.insertAdjacentHTML('afterbegin', htmlMenu);

    // 5. Cria e injeta o footer dinamicamente
    const htmlFooter = `
    <footer>
        &copy; 2026 Weirs RPG — Todos os direitos reservados.
    </footer>
    `;

    // Injeta o footer antes do fechamento do body
    document.body.insertAdjacentHTML('beforeend', htmlFooter);
});