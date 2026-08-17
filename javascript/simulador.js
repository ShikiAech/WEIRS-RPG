document.addEventListener("DOMContentLoaded", () => {
  // --- ELEMENTOS DO DOM ---
  const modal = document.getElementById("modal-simulador");
  const btnAbrir = document.getElementById("btn-abrir-simulador");
  const btnFechar = document.querySelector(".fechar-modal");

  const btnRolar = document.getElementById("btn-rolar-atributos");
  const txtTentativas = document.getElementById("contador-tentativas");
  const poolDados = document.getElementById("pool-dados");
  const selectClasse = document.getElementById("select-classe");
  const selectNivel = document.getElementById("select-nivel");
  const selectAnt = document.getElementById("select-antecedente");
  const resultadoVida = document.getElementById("resultado-vida");
  const detalheCalculoVida = document.getElementById("detalhe-calculo-vida");
  const caixaRec = document.getElementById("caixa-recomendacao");
  const textoRec = document.getElementById("texto-recomendacao");

  // NOVOS ELEMENTOS DO MODO DE VIDA (Certifique-se que estes IDs existem no seu HTML)
  const selectModoVida = document.getElementById("select-modo-vida"); 
  const btnRolarVida = document.getElementById("btn-rolar-vida");

  const painelAsi = document.getElementById("painel-asi");
  const txtAsiDisponiveis = document.getElementById("asi-disponiveis");
  const painelAnt = document.getElementById("painel-bonus-antecedente");

  const selectsAtributos = {
    for: document.getElementById("input-for"),
    des: document.getElementById("input-des"),
    con: document.getElementById("input-con"),
    int: document.getElementById("input-int"),
    sab: document.getElementById("input-sab"),
    car: document.getElementById("input-car")
  };

  const mods = {
    for: document.getElementById("mod-for"),
    des: document.getElementById("mod-des"),
    con: document.getElementById("mod-con"),
    int: document.getElementById("mod-int"),
    sab: document.getElementById("mod-sab"),
    car: document.getElementById("mod-car")
  };

  // --- ESTADO INTERNO ---
  let dadosRolados = [];
  let tentativasRestantes = 2;

  let pontosAsiGasto = { for: 0, des: 0, con: 0, int: 0, sab: 0, car: 0 };
  let pontosAntGasto = { for: 0, des: 0, con: 0, int: 0, sab: 0, car: 0 };
  let totalAsiDisponivel = 0;

  let historicoRolagens = { r1: null, r2: null };
  let rolagemSelecionada = null;

  // Estado dos dados de vida no modo "rolagem"
  let rolagensVidaAtuais = []; 

  // --- CONTROLE DO MODAL ---
  if (btnAbrir) btnAbrir.onclick = () => modal.style.display = "block";
  if (btnFechar) btnFechar.onclick = () => modal.style.display = "none";
  window.onclick = (e) => { if (e.target == modal) modal.style.display = "none"; };

  // --- REGRAS E ROLAGENS ---
  function rolar4d6k3() {
    let dados = [];
    for (let i = 0; i < 4; i++) dados.push(Math.floor(Math.random() * 6) + 1);
    dados.sort((a, b) => b - a);
    return dados[0] + dados[1] + dados[2];
  }

  if (btnRolar) {
    btnRolar.onclick = function () {
      if (tentativasRestantes <= 0) return;

      btnRolar.disabled = true;
      tentativasRestantes--;
      txtTentativas.innerHTML = `Tentativas de rolagem restantes: <strong>${tentativasRestantes}</strong>`;

      if (tentativasRestantes === 0) {
        txtTentativas.style.color = "#ff4757";
        txtTentativas.style.background = "rgba(255,71,87,0.1)";
        txtTentativas.style.borderColor = "rgba(255,71,87,0.3)";
      }

      let frames = 0;
      const intervalo = setInterval(() => {
        let fakes = [];
        for (let i = 0; i < 6; i++) fakes.push(Math.floor(Math.random() * 16) + 3);
        poolDados.innerText = fakes.join("   |   ");
        frames++;

        if (frames > 12) {
          clearInterval(intervalo);
          finalizarRolagem();
        }
      }, 70);
    };
  }

  function finalizarRolagem() {
    let novosDados = [];
    for (let i = 0; i < 6; i++) novosDados.push(rolar4d6k3());
    novosDados.sort((a, b) => b - a);

    if (!historicoRolagens.r1) {
      historicoRolagens.r1 = novosDados;
      escolherConjuntoDados("r1");
    } else if (!historicoRolagens.r2) {
      historicoRolagens.r2 = novosDados;
      escolherConjuntoDados("r2");
    }

    renderizarPainelRolagens();

    if (tentativasRestantes > 0) {
      btnRolar.disabled = false;
    } else {
      btnRolar.innerText = "Escolha sua Rolagem";
      btnRolar.style.background = "#333";
      btnRolar.style.cursor = "default";
    }
  }

  function renderizarPainelRolagens() {
    poolDados.innerHTML = "";
    poolDados.style.display = "flex";
    poolDados.style.flexDirection = "column";
    poolDados.style.gap = "12px";
    poolDados.style.marginTop = "10px";

    if (historicoRolagens.r1) criarCardRolagem("r1", "1ª Rolagem", historicoRolagens.r1);
    if (historicoRolagens.r2) criarCardRolagem("r2", "2ª Rolagem", historicoRolagens.r2);
  }

  function criarCardRolagem(chave, label, conjunto) {
    const card = document.createElement("div");
    const estaSelecionado = rolagemSelecionada === chave;

    card.style.background = estaSelecionado ? "rgba(214,175,55,0.15)" : "#1a1a1d";
    card.style.border = estaSelecionado ? "2px solid #d4af37" : "1px solid #3a3a3e";
    card.style.padding = "12px 16px";
    card.style.borderRadius = "6px";
    card.style.cursor = "pointer";
    card.style.display = "flex";
    card.style.alignItems = "center";
    card.style.justifyContent = "space-between";
    card.style.transition = "all 0.2s";

    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <input type="radio" name="opcao-rolagem" ${estaSelecionado ? "checked" : ""} style="cursor: pointer; accent-color: #d4af37;">
        <span style="font-family: 'Cinzel', serif; color: #bfa36b; font-size: 0.9rem;">${label}:</span>
      </div>
      <span style="font-weight: bold; letter-spacing: 1px; color: ${estaSelecionado ? '#fff' : '#aaa'}">${conjunto.join("   |   ")}</span>
    `;

    card.onclick = () => escolherConjuntoDados(chave);
    poolDados.appendChild(card);
  }

  function escolherConjuntoDados(chave) {
    rolagemSelecionada = chave;
    dadosRolados = [...historicoRolagens[chave]];

    pontosAsiGasto = { for: 0, des: 0, con: 0, int: 0, sab: 0, car: 0 };
    pontosAntGasto = { for: 0, des: 0, con: 0, int: 0, sab: 0, car: 0 };

    Object.keys(selectsAtributos).forEach(attr => {
      selectsAtributos[attr].value = "";
      reconstruirSelectOptions(selectsAtributos[attr]);
    });

    renderizarPainelRolagens();
    atualizarCalculos();
  }

  function reconstruirSelectOptions(selectElement) {
    selectElement.innerHTML = '<option value="">—</option>';
    dadosRolados.forEach((valor, index) => {
      selectElement.innerHTML += `<option value="${index}_${valor}">Dado ${index + 1} (${valor})</option>`;
    });
  }

  function recalcularDicionarioDeOpcoes() {
    let indicesOcupados = {};
    Object.keys(selectsAtributos).forEach(attr => {
      const stringValue = selectsAtributos[attr].value;
      if (stringValue) {
        const idx = stringValue.split("_")[0];
        indicesOcupados[idx] = attr;
      }
    });

    Object.keys(selectsAtributos).forEach(attr => {
      const select = selectsAtributos[attr];

      Array.from(select.options).forEach(option => {
        if (!option.value) return;
        const idxOpcao = option.value.split("_")[0];

        if (indicesOcupados[idxOpcao] && indicesOcupados[idxOpcao] !== attr) {
          option.disabled = true;
          option.text = `❌ [Em uso]`;
        } else {
          option.disabled = false;
          const valorOriginal = option.value.split("_")[1];
          option.text = `Dado ${parseInt(idxOpcao) + 1} (${valorOriginal})`;
        }
      });
    });
  }

  function calcularModificador(valor) {
    if (!valor || valor < 3) return 0;
    return Math.floor((valor - 10) / 2);
  }

  // --- GERENCIAMENTO DE BÔNUS ---
  function atualizarBotoesAntecedente() {
    const antecedenteSelecionado = selectAnt.value;
    if (!antecedenteSelecionado) {
      painelAnt.style.display = "none";
      document.querySelectorAll(".btn-ant").forEach(btn => btn.style.display = "none");
      return;
    }

    painelAnt.style.display = "block";
    const attrsPermitidos = selectAnt.options[selectAnt.selectedIndex].getAttribute("data-attrs").split(",");

    Object.keys(selectsAtributos).forEach(attr => {
      const btn = document.querySelector(`.btn-ant[data-attr="${attr}"]`);
      if (attrsPermitidos.includes(attr) && selectsAtributos[attr].value !== "") {
        btn.style.display = "inline-block";
        let atual = pontosAntGasto[attr];
        btn.innerText = atual > 0 ? `A:+${atual}` : `Ant`;
      } else {
        btn.style.display = "none";
        pontosAntGasto[attr] = 0;
      }
    });
  }

  document.querySelectorAll(".btn-ant").forEach(button => {
    button.onclick = function (e) {
      e.preventDefault();
      const attr = this.getAttribute("data-attr");
      let totalGastosAnt = Object.values(pontosAntGasto).reduce((a, b) => a + b, 0);
      let atual = pontosAntGasto[attr];

      if (atual === 0) {
        if (totalGastosAnt < 3) pontosAntGasto[attr] = 1;
      } else if (atual === 1) {
        let possuiDois = Object.values(pontosAntGasto).includes(2);
        if (!possuiDois && totalGastosAnt < 3) pontosAntGasto[attr] = 2;
        else pontosAntGasto[attr] = 0;
      } else {
        pontosAntGasto[attr] = 0;
      }
      atualizarCalculos();
    };
  });

  function calcularAsiDisponiveis() {
    const nivel = parseInt(selectNivel.value);
    let totalAsi = 0;
    if (nivel >= 4) totalAsi += 2;
    if (nivel >= 8) totalAsi += 2;
    if (nivel >= 12) totalAsi += 2;
    if (nivel >= 16) totalAsi += 2;

    totalAsiDisponivel = totalAsi;
    let gastos = Object.values(pontosAsiGasto).reduce((a, b) => a + b, 0);
    let restantes = totalAsiDisponivel - gastos;

    if (totalAsiDisponivel > 0) {
      painelAsi.style.display = "block";
      txtAsiDisponiveis.innerText = restantes;
      Object.keys(selectsAtributos).forEach(attr => {
        const btn = document.querySelector(`.btn-asi[data-attr="${attr}"]`);
        if (selectsAtributos[attr].value !== "") {
          btn.style.display = "inline-block";
          btn.innerText = pontosAsiGasto[attr] > 0 ? `N:+${pontosAsiGasto[attr]}` : `Nív`;
        } else {
          btn.style.display = "none";
        }
      });
    } else {
      painelAsi.style.display = "none";
      document.querySelectorAll(".btn-asi").forEach(btn => btn.style.display = "none");
      pontosAsiGasto = { for: 0, des: 0, con: 0, int: 0, sab: 0, car: 0 };
    }
  }

  document.querySelectorAll(".btn-asi").forEach(button => {
    button.onclick = function (e) {
      e.preventDefault();
      const attr = this.getAttribute("data-attr");
      let restantes = totalAsiDisponivel - Object.values(pontosAsiGasto).reduce((a, b) => a + b, 0);

      if (restantes > 0) {
        pontosAsiGasto[attr]++;
      } else {
        pontosAsiGasto[attr] = 0;
      }
      atualizarCalculos();
    };
  });

  // --- NOVA LÓGICA DE DADOS DE VIDA ---
  function gerarNovasRolagensVida(dadoVida, nivel) {
    rolagensVidaAtuais = [dadoVida]; // Nível 1 é sempre fixo no máximo
    for (let i = 1; i < nivel; i++) {
      let rolagem = Math.floor(Math.random() * dadoVida) + 1;
      rolagensVidaAtuais.push(rolagem);
    }
  }

  if (btnRolarVida) {
    btnRolarVida.onclick = (e) => {
      e.preventDefault();
      const dadoVida = parseInt(selectClasse.value);
      const nivel = parseInt(selectNivel.value);
      if (dadoVida && nivel) {
        gerarNovasRolagensVida(dadoVida, nivel);
        atualizarCalculos();
      }
    };
  }

  // --- CÁLCULO GERAL E ATUALIZAÇÃO DA UI ---
  function atualizarCalculos() {
    recalcularDicionarioDeOpcoes();
    atualizarBotoesAntecedente();
    calcularAsiDisponiveis();

    Object.keys(selectsAtributos).forEach(attr => {
      const stringValue = selectsAtributos[attr].value;
      let valorDado = stringValue ? parseInt(stringValue.split("_")[1]) : 0;

      const bAnt = pontosAntGasto[attr];
      const bAsi = pontosAsiGasto[attr];
      const valorTotal = valorDado > 0 ? (valorDado + bAnt + bAsi) : 0;

      const mod = calcularModificador(valorTotal);

      if (valorTotal === 0) {
        mods[attr].innerText = "(—)";
        mods[attr].style.color = "#888";
      } else {
        let txtMod = mod >= 0 ? `+${mod}` : `${mod}`;
        mods[attr].innerText = `${valorTotal} [${txtMod}]`;
        mods[attr].style.color = mod >= 0 ? "#27ae60" : "#e74c3c";
      }
    });

    const opcaoSelecionada = selectClasse.options[selectClasse.selectedIndex];
    if (opcaoSelecionada && opcaoSelecionada.value) {
      caixaRec.style.display = "block";
      textoRec.innerText = opcaoSelecionada.getAttribute("data-rec");
    }

    const dadoVida = parseInt(selectClasse.value);
    const nivel = parseInt(selectNivel.value);

    const stringCon = selectsAtributos.con.value;
    let valorConDado = stringCon ? parseInt(stringCon.split("_")[1]) : 0;

    const conTotal = valorConDado > 0 ? (valorConDado + pontosAntGasto.con + pontosAsiGasto.con) : 0;
    const modCon = calcularModificador(conTotal);

    const modoVida = selectModoVida ? selectModoVida.value : "media";

    if (btnRolarVida) {
      btnRolarVida.style.display = (modoVida === "rolagem" && dadoVida && valorConDado > 0) ? "inline-block" : "none";
    }

    if (dadoVida && valorConDado > 0) {
      let vidaFinal = 0;

      if (modoVida === "rolagem") {
        // Gera novos dados caso a quantidade tenha mudado (ex: subiu de nível)
        if (rolagensVidaAtuais.length !== nivel || rolagensVidaAtuais[0] !== dadoVida) {
          gerarNovasRolagensVida(dadoVida, nivel);
        }

        const somaDados = rolagensVidaAtuais.reduce((acc, val) => acc + val, 0);
        const conAcumulada = nivel * modCon;
        
        vidaFinal = Math.max(nivel, somaDados + conAcumulada);

        resultadoVida.innerText = vidaFinal;
        detalheCalculoVida.innerText = `Rolagens: [${rolagensVidaAtuais.join(", ")}] | Mod. CON Total: ${conAcumulada >= 0 ? '+' + conAcumulada : conAcumulada}`;

      } else {
        // Cálculo por Média (Padrão)
        const vidaNivel1 = dadoVida + modCon;
        const mediaDado = Math.floor((dadoVida / 2) + 0.5); // Arredondamento D&D5e
        const vidaNiveisSeguintes = (nivel - 1) * (mediaDado + modCon);
        
        vidaFinal = Math.max(nivel, vidaNivel1 + vidaNiveisSeguintes);

        resultadoVida.innerText = vidaFinal;
        detalheCalculoVida.innerText = `Nível 1: ${dadoVida} + Níveis 2-${nivel}: ${(nivel - 1)}x${mediaDado} | Mod. CON Total: ${(nivel * modCon) >= 0 ? '+' + (nivel * modCon) : (nivel * modCon)}`;
      }
    } else {
      resultadoVida.innerText = "—";
      if (valorConDado === 0 && dadoVida) detalheCalculoVida.innerText = "Defina o atributo de CON para calcular a vida.";
    }
  }

  // Escutadores Reativos
  Object.values(selectsAtributos).forEach(select => select.onchange = atualizarCalculos);
  if (selectClasse) selectClasse.onchange = atualizarCalculos;
  if (selectNivel) selectNivel.onchange = atualizarCalculos;
  if (selectAnt) selectAnt.onchange = atualizarCalculos;
  if (selectModoVida) selectModoVida.onchange = atualizarCalculos;
});