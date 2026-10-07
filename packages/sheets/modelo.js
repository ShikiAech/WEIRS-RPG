export const ATRIBUTOS = {
  for: 'Força',
  des: 'Destreza',
  con: 'Constituição',
  int: 'Inteligência',
  sab: 'Sabedoria',
  car: 'Carisma',
};
export const PERICIAS = {
  acrobacia: ['Acrobacia', 'des'],
  adestrarAnimais: ['Adestrar Animais', 'sab'],
  arcanismo: ['Arcanismo', 'int'],
  atletismo: ['Atletismo', 'for'],
  atuacao: ['Atuação', 'car'],
  enganacao: ['Enganação', 'car'],
  furtividade: ['Furtividade', 'des'],
  historia: ['História', 'int'],
  intimidacao: ['Intimidação', 'car'],
  intuicao: ['Intuição', 'sab'],
  investigacao: ['Investigação', 'int'],
  medicina: ['Medicina', 'sab'],
  natureza: ['Natureza', 'int'],
  percepcao: ['Percepção', 'sab'],
  persuasao: ['Persuasão', 'car'],
  prestidigitacao: ['Prestidigitação', 'des'],
  religiao: ['Religião', 'int'],
  sobrevivencia: ['Sobrevivência', 'sab'],
};
export const ENTRADAS = {
  classes: { nome: '', subclasse: '', nivel: 1 },
  'combate.dadosVida': { dado: 'd8', maximo: 1, gastos: 0 },
  'combate.deslocamentosAdicionais': { nome: '', valor: 0 },
  'combate.condicoes': { nome: '' },
  ataques: { nome: '', tipo: 'bonus', valor: 0, dano: '', tipoDano: '', observacoes: '' },
  caracteristicas: { nome: '', descricao: '' },
  tracos: { nome: '', descricao: '' },
  talentos: { nome: '', descricao: '' },
  idiomas: { nome: '' },
  recursos: { nome: '', maximo: 0, gastos: 0, recuperacao: 'manual' },
  'conjuracao.perfis': {
    nome: '',
    classeId: '',
    atributo: 'int',
    ajusteModificador: 0,
    ajusteCd: 0,
    ajusteAtaque: 0,
  },
  magias: {
    perfilId: '',
    circulo: 0,
    nome: '',
    preparada: false,
    tempo: '',
    alcance: '',
    concentracao: false,
    ritual: false,
    verbal: false,
    somatico: false,
    material: '',
    duracao: '',
    descricao: '',
    observacoes: '',
  },
  'inventario.itens': {
    nome: '',
    quantidade: 1,
    peso: 0,
    equipado: false,
    cargasMaximas: 0,
    cargasGastas: 0,
    observacoes: '',
  },
  'inventario.sintonizados': { nome: '', itemId: '' },
};
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function novaEntrada(caminho) {
  return { id: crypto.randomUUID(), ...structuredClone(ENTRADAS[caminho]) };
}
export function criarConteudo() {
  return {
    identidade: {
      jogador: '',
      campanha: '',
      especie: '',
      antecedente: '',
      tamanho: 'Médio',
      experiencia: 0,
    },
    classes: [novaEntrada('classes')],
    atributos: Object.fromEntries(
      Object.keys(ATRIBUTOS).map((k) => [
        k,
        { valor: 10, ajusteModificador: 0, resistenciaProficiente: false, ajusteResistencia: 0 },
      ]),
    ),
    pericias: Object.fromEntries(
      Object.entries(PERICIAS).map(([k, [, a]]) => [
        k,
        { atributo: a, grau: 'nenhuma', ajuste: 0 },
      ]),
    ),
    combate: {
      ca: 10,
      escudo: false,
      ajusteProficiencia: 0,
      ajusteIniciativa: 0,
      deslocamento: 9,
      unidade: 'metros',
      deslocamentosAdicionais: [],
      ajustePercepcaoPassiva: 0,
      inspiracao: false,
      pvMaximos: 1,
      pvAtuais: 1,
      pvTemporarios: 0,
      dadosVida: [],
      sucessosMorte: 0,
      falhasMorte: 0,
      condicoes: [],
      exaustao: 0,
      concentracaoAtiva: '',
      resistencias: '',
      imunidades: '',
      vulnerabilidades: '',
      sentidos: '',
    },
    ataques: /** @type {Array<typeof ENTRADAS.ataques & {id: string}>} */ ([]),
    caracteristicas: [],
    tracos: [],
    talentos: [],
    idiomas: [],
    treinamento: {
      leves: false,
      medias: false,
      pesadas: false,
      escudos: false,
      armas: '',
      ferramentas: '',
    },
    conjuracao: {
      perfis: /** @type {Array<typeof ENTRADAS['conjuracao.perfis'] & {id: string}>} */ ([]),
      espacos: Array.from({ length: 9 }, (_, i) => ({ circulo: i + 1, total: 0, gastos: 0 })),
      pacto: { circulo: 1, total: 0, gastos: 0 },
    },
    magias: /** @type {Array<typeof ENTRADAS.magias & {id: string}>} */ ([]),
    inventario: {
      itens: [],
      moedas: { pc: 0, pp: 0, pe: 0, po: 0, pl: 0 },
      limiteSintonizacao: 3,
      sintonizados: [],
    },
    recursos: [],
    historia: {
      aparencia: '',
      alinhamento: '',
      historia: '',
      personalidade: '',
      tracosPersonalidade: '',
      ideais: '',
      vinculos: '',
      defeitos: '',
      anotacoes: '',
    },
  };
}
export function limparReferencias(c) {
  const classes = new Set(c.classes.map((x) => x.id)),
    perfis = new Set(c.conjuracao.perfis.map((x) => x.id)),
    itens = new Set(c.inventario.itens.map((x) => x.id));
  for (const x of c.conjuracao.perfis) if (x.classeId && !classes.has(x.classeId)) x.classeId = '';
  for (const x of c.magias) if (x.perfilId && !perfis.has(x.perfilId)) x.perfilId = '';
  for (const x of c.inventario.sintonizados) if (x.itemId && !itens.has(x.itemId)) x.itemId = '';
  return c;
}
export function validarFicha(f) {
  const erros = [];
  const erro = (campo, mensagem) => erros.push({ campo, mensagem });
  if (typeof f.nome !== 'string' || !f.nome.trim() || f.nome.trim().length > 120)
    erro('nome', 'Informe um nome de 1 a 120 caracteres.');
  if (f.versao_esquema !== 1) erro('versao_esquema', 'Versão da ficha não suportada.');
  const padrao = criarConteudo(),
    ids = new Set();
  function validar(v, p, caminho) {
    if (Array.isArray(p)) {
      if (!Array.isArray(v)) {
        erro(caminho, 'Informe uma lista válida.');
        return;
      }
      if (v.length > 1000) erro(caminho, 'Há entradas demais nesta lista.');
      const template =
        caminho === 'conjuracao.espacos' ? { circulo: 1, total: 0, gastos: 0 } : ENTRADAS[caminho];
      if (
        caminho === 'conjuracao.espacos' &&
        (v.length !== 9 || v.some((x, i) => x?.circulo !== i + 1))
      )
        erro(caminho, 'Informe os nove círculos de magia em ordem.');
      v.forEach((x, i) =>
        validar(
          x,
          template
            ? { ...(caminho === 'conjuracao.espacos' ? {} : { id: '' }), ...template }
            : p[0],
          caminho + '.' + i,
        ),
      );
      return;
    }
    if (p && typeof p === 'object') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) {
        erro(caminho, 'Preencha esta seção da ficha.');
        return;
      }
      for (const k of Object.keys(p)) validar(v[k], p[k], caminho ? caminho + '.' + k : k);
      const total = v.maximo ?? v.total ?? v.cargasMaximas;
      const gasto = v.gastos ?? v.cargasGastas;
      if (typeof total === 'number' && typeof gasto === 'number' && gasto > total)
        erro(caminho, 'O gasto não pode superar o total.');
      return;
    }
    if (typeof v !== typeof p) {
      erro(caminho, 'Valor inválido.');
      return;
    }
    const key = caminho.split('.').pop();
    if (typeof p === 'number') {
      let min = 0,
        max = 9999,
        inteiro = true;
      if (key.startsWith('ajuste')) {
        min = -99;
        max = 99;
      } else if (key === 'pvAtuais') {
        min = -9999;
      } else if (key === 'pvMaximos') {
        min = 1;
      } else if (key === 'nivel') {
        min = 1;
        max = 20;
      } else if (caminho.startsWith('atributos.') && key === 'valor') {
        min = 1;
        max = 99;
      } else if (key === 'valor' && caminho.startsWith('ataques.')) {
        min = -99;
        max = 99;
      } else if (key === 'circulo') {
        max = 9;
      } else if (key === 'sucessosMorte' || key === 'falhasMorte') {
        max = 3;
      } else if (key === 'exaustao') {
        max = 6;
      } else if (caminho.startsWith('inventario.moedas.')) {
        max = 999999999;
      } else if (key === 'experiencia') {
        max = 999999999;
      }
      if (
        key === 'peso' ||
        key === 'deslocamento' ||
        caminho.startsWith('combate.deslocamentosAdicionais.')
      )
        inteiro = false;
      if (!Number.isFinite(v) || v < min || v > max || (inteiro && !Number.isInteger(v)))
        erro(
          caminho,
          'Informe um número ' + (inteiro ? 'inteiro ' : '') + 'entre ' + min + ' e ' + max + '.',
        );
    }
    if (typeof p === 'string') {
      const longo =
        /descricao|observacoes|historia|aparencia|personalidade|Personalidade|ideais|vinculos|defeitos|anotacoes|resistencias|imunidades|vulnerabilidades|sentidos|ferramentas|armas/.test(
          caminho,
        );
      if (v.length > (longo ? 10000 : 120)) erro(caminho, 'Texto acima do limite permitido.');
      if (key === 'id') {
        if (!UUID.test(v) || ids.has(v)) erro(caminho, 'Identificador inválido ou duplicado.');
        ids.add(v);
      }
      if (key === 'atributo' && !Object.hasOwn(ATRIBUTOS, v))
        erro(caminho, 'Escolha um atributo válido.');
      if (key === 'grau' && !['nenhuma', 'meia', 'proficiente', 'especializacao'].includes(v))
        erro(caminho, 'Escolha a proficiência.');
      if (key === 'tipo' && !['bonus', 'cd'].includes(v)) erro(caminho, 'Escolha bônus ou CD.');
      if (key === 'recuperacao' && !['curto', 'longo', 'manual'].includes(v))
        erro(caminho, 'Escolha a recuperação.');
      if (key === 'dado' && !['d6', 'd8', 'd10', 'd12'].includes(v))
        erro(caminho, 'Escolha o dado de vida.');
    }
  }
  validar(f.conteudo, padrao, '');
  if (erros.length === 0) {
    if (f.conteudo.classes.length === 0 || f.conteudo.classes.reduce((s, x) => s + x.nivel, 0) > 20)
      erro('classes', 'O nível total deve ser de 1 a 20.');
    const refs = [
      ['conjuracao.perfis', 'classeId', new Set(f.conteudo.classes.map((x) => x.id))],
      ['magias', 'perfilId', new Set(f.conteudo.conjuracao.perfis.map((x) => x.id))],
      ['inventario.sintonizados', 'itemId', new Set(f.conteudo.inventario.itens.map((x) => x.id))],
    ];
    for (const [path, key, validos] of refs) {
      const list = path.split('.').reduce((o, k) => o[k], f.conteudo);
      if (list.some((x) => x[key] && !validos.has(x[key])))
        erro(path, 'A origem selecionada não existe mais.');
    }
  }
  try {
    if (new TextEncoder().encode(JSON.stringify(f.conteudo)).length > 240 * 1024)
      erro('conteudo', 'A ficha excede o tamanho permitido.');
  } catch {
    erro('conteudo', 'Conteúdo inválido.');
  }
  return erros;
}
