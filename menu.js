
document.addEventListener("DOMContentLoaded", function() {
    // 1. Identifica qual página está aberta no momento
    const paginaAtual = window.location.pathname.split("/").pop() || "index.html";

    // 2. Cria a estrutura do menu (Adicione novas páginas aqui!)
    const linksMenu = [
        { texto: "Início", url: "index.html" },
        { texto: "Campanhas", url: "campanhas.html" },
        { texto: "Raças", url: "racas.html" },
        { texto: "Classes", url: "classes.html" },
        { texto: "Talentos", url: "talentos.html" },
        { texto: "Antecedentes", url: "antecedentes.html" },
        { texto: "Magias", url: "magias.html" }
    ];

    // 3. Monta o HTML do menu dinamicamente
    let htmlMenu = `
    <div id="header-wrap">
      <header id="header">
        <a href="index.html" class="logo">Weirs</a>
        <nav class="nav">
          <ul>
    `;

    linksMenu.forEach(link => {
        // Se a página atual for igual ao link, adiciona a classe active para acender o botão
        const classeAtiva = (paginaAtual === link.url) ? 'class="active"' : '';
        htmlMenu += `<li><a href="${link.url}" ${classeAtiva}>${link.texto}</a></li>`;
    });

    htmlMenu += `
          </ul>
        </nav>
      </header>
    </div>
    `;

    // 4. Injeta o menu no topo do body do seu HTML
    document.body.insertAdjacentHTML('afterbegin', htmlMenu);
});