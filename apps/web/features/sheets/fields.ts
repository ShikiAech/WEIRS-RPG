import { ATRIBUTOS, PERICIAS } from '../../../../packages/sheets/modelo.js';

export interface FieldSpec {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'textarea' | 'checkbox' | 'select';
  options?: [string, string][];
  min?: number;
  max?: number;
  maxLength?: number;
  step?: string;
  nullable?: boolean;
  hint?: string;
  suggestions?: 'classe' | 'especie' | 'antecedente';
}
const number = (key: string, label: string, min = 0, max = 9999): FieldSpec => ({
  key,
  label,
  type: 'number',
  min,
  max,
});
const text = (key: string, label: string, long = false): FieldSpec => ({
  key,
  label,
  type: long ? 'textarea' : 'text',
});
const flag = (key: string, label: string): FieldSpec => ({ key, label, type: 'checkbox' });
const attributeOptions: [string, string][] = [
  ['for', 'Força'],
  ['des', 'Destreza'],
  ['con', 'Constituição'],
  ['int', 'Inteligência'],
  ['sab', 'Sabedoria'],
  ['car', 'Carisma'],
];
export const identity: FieldSpec[] = [
  text('identidade.jogador', 'Jogador'),
  { key: 'identidade.especie', label: 'Espécie', suggestions: 'especie' },
  { key: 'identidade.antecedente', label: 'Antecedente', suggestions: 'antecedente' },
  text('identidade.tamanho', 'Tamanho'),
  number('identidade.experiencia', 'Experiência', 0, 999999999),
];
export const combat: FieldSpec[] = [
  number('combate.ca', 'Classe de armadura'),
  flag('combate.escudo', 'Usando escudo'),
  number('combate.pvMaximos', 'PV máximos', 1),
  number('combate.pvAtuais', 'PV atuais', -9999),
  number('combate.pvTemporarios', 'PV temporários'),
  number('combate.ajusteIniciativa', 'Ajuste de iniciativa', -99, 99),
  { ...number('combate.deslocamento', 'Deslocamento'), step: '0.1' },
  text('combate.unidade', 'Unidade de deslocamento'),
  number('combate.ajustePercepcaoPassiva', 'Ajuste de percepção passiva', -99, 99),
  flag('combate.inspiracao', 'Inspiração heroica'),
  number('combate.sucessosMorte', 'Sucessos contra a morte', 0, 3),
  number('combate.falhasMorte', 'Falhas contra a morte', 0, 3),
  number('combate.exaustao', 'Exaustão', 0, 6),
  text('combate.concentracaoAtiva', 'Concentração ativa'),
  text('combate.resistencias', 'Resistências', true),
  text('combate.imunidades', 'Imunidades', true),
  text('combate.vulnerabilidades', 'Vulnerabilidades', true),
  text('combate.sentidos', 'Sentidos especiais', true),
];
export const story: FieldSpec[] = [
  ['aparencia', 'Aparência'],
  ['alinhamento', 'Alinhamento'],
  ['historia', 'História'],
  ['personalidade', 'Personalidade'],
  ['tracosPersonalidade', 'Traços de personalidade'],
  ['ideais', 'Ideais'],
  ['vinculos', 'Vínculos'],
  ['defeitos', 'Defeitos'],
  ['anotacoes', 'Anotações'],
].map(([key, label]) => text('historia.' + key, label, true));
export const training: FieldSpec[] = [
  flag('treinamento.leves', 'Armaduras leves'),
  flag('treinamento.medias', 'Armaduras médias'),
  flag('treinamento.pesadas', 'Armaduras pesadas'),
  flag('treinamento.escudos', 'Escudos'),
  text('treinamento.armas', 'Proficiências em armas', true),
  text('treinamento.ferramentas', 'Proficiências em ferramentas', true),
];
export interface ListSpec {
  path: string;
  title: string;
  add: string;
  fields: FieldSpec[];
}
export const lists: Record<string, ListSpec> = {
  classes: {
    path: 'classes',
    title: 'Classes e níveis',
    add: 'Adicionar classe',
    fields: [
      { key: 'nome', label: 'Classe', suggestions: 'classe' },
      text('subclasse', 'Subclasse'),
      number('nivel', 'Nível', 1, 20),
    ],
  },
  attacks: {
    path: 'ataques',
    title: 'Ataques',
    add: 'Adicionar ataque',
    fields: [
      text('nome', 'Nome do ataque'),
      {
        key: 'tipo',
        label: 'Tipo de teste',
        type: 'select',
        options: [
          ['bonus', 'Bônus de ataque'],
          ['cd', 'CD de resistência'],
        ],
      },
      number('valor', 'Bônus ou CD', -99, 99),
      { ...text('dano', 'Dano'), hint: 'Ex.: 1d8+4. Use fórmulas de dados e números.' },
      text('tipoDano', 'Tipo de dano'),
      text('observacoes', 'Observações do ataque', true),
    ],
  },
  hitDice: {
    path: 'combate.dadosVida',
    title: 'Dados de vida',
    add: 'Adicionar dado de vida',
    fields: [
      {
        key: 'dado',
        label: 'Dado de vida',
        type: 'select',
        options: [
          ['d6', 'd6'],
          ['d8', 'd8'],
          ['d10', 'd10'],
          ['d12', 'd12'],
        ],
      },
      number('maximo', 'Dados de vida: máximo'),
      number('gastos', 'Dados de vida: gastos'),
    ],
  },
  speeds: {
    path: 'combate.deslocamentosAdicionais',
    title: 'Outros deslocamentos',
    add: 'Adicionar deslocamento',
    fields: [
      text('nome', 'Tipo de deslocamento'),
      { ...number('valor', 'Distância de deslocamento'), step: '0.1' },
    ],
  },
  conditions: {
    path: 'combate.condicoes',
    title: 'Condições',
    add: 'Adicionar condição',
    fields: [text('nome', 'Condição')],
  },
  resources: {
    path: 'recursos',
    title: 'Recursos de classe e homebrew',
    add: 'Adicionar recurso',
    fields: [
      text('nome', 'Nome do recurso'),
      number('maximo', 'Recurso: máximo'),
      number('gastos', 'Recurso: gastos'),
      {
        key: 'recuperacao',
        label: 'Recuperação do recurso',
        type: 'select',
        options: [
          ['manual', 'Manual'],
          ['curto', 'Descanso curto'],
          ['longo', 'Descanso longo'],
        ],
      },
    ],
  },
  features: {
    path: 'caracteristicas',
    title: 'Características de classe',
    add: 'Adicionar característica',
    fields: [
      text('nome', 'Nome da característica'),
      text('descricao', 'Descrição da característica', true),
    ],
  },
  traits: {
    path: 'tracos',
    title: 'Traços da espécie',
    add: 'Adicionar traço',
    fields: [text('nome', 'Nome do traço'), text('descricao', 'Descrição do traço', true)],
  },
  feats: {
    path: 'talentos',
    title: 'Talentos',
    add: 'Adicionar talento',
    fields: [text('nome', 'Nome do talento'), text('descricao', 'Descrição do talento', true)],
  },
  languages: {
    path: 'idiomas',
    title: 'Idiomas',
    add: 'Adicionar idioma',
    fields: [text('nome', 'Idioma')],
  },
  profiles: {
    path: 'conjuracao.perfis',
    title: 'Perfis de conjuração',
    add: 'Adicionar perfil de conjuração',
    fields: [
      text('nome', 'Nome do perfil'),
      { key: 'classeId', label: 'Classe de origem', type: 'select' },
      {
        key: 'atributo',
        label: 'Atributo de conjuração',
        type: 'select',
        options: attributeOptions,
      },
      number('ajusteModificador', 'Ajuste de conjuração', -99, 99),
      number('ajusteCd', 'Ajuste de CD', -99, 99),
      number('ajusteAtaque', 'Ajuste de ataque de magia', -99, 99),
    ],
  },
  spells: {
    path: 'magias',
    title: 'Truques e magias',
    add: 'Adicionar magia',
    fields: [
      text('nome', 'Nome da magia'),
      number('circulo', 'Círculo da magia', 0, 9),
      { key: 'perfilId', label: 'Perfil de origem', type: 'select' },
      flag('preparada', 'Magia preparada'),
      { ...text('tempo', 'Tempo de conjuração'), maxLength: 10000 },
      { ...text('alcance', 'Alcance'), maxLength: 10000 },

      flag('concentracao', 'Exige concentração'),
      flag('ritual', 'Ritual'),
      flag('verbal', 'Componente verbal'),
      flag('somatico', 'Componente somático'),
      text('material', 'Material necessário', true),
      { ...text('duracao', 'Duração'), maxLength: 10000 },
      text('descricao', 'Descrição da magia', true),
      text('observacoes', 'Observações da magia', true),
    ],
  },
  items: {
    path: 'inventario.itens',
    title: 'Equipamentos',
    add: 'Adicionar item',
    fields: [
      text('nome', 'Nome do item'),
      number('quantidade', 'Quantidade'),
      { ...number('peso', 'Peso (kg)'), step: '0.1' },
      flag('equipado', 'Item equipado'),
      number('cargasMaximas', 'Cargas: máximo'),
      number('cargasGastas', 'Cargas: gastas'),
      text('observacoes', 'Observações do item', true),
    ],
  },
  attuned: {
    path: 'inventario.sintonizados',
    title: 'Itens sintonizados',
    add: 'Adicionar sintonização',
    fields: [
      text('nome', 'Nome da sintonização'),
      { key: 'itemId', label: 'Item vinculado', type: 'select' },
    ],
  },
};
export { attributeOptions, number };

export function fieldLabel(path: string): string {
  const names: Record<string, string> = {
    nome: 'Nome do personagem',
    arquivo: 'Arquivo da ficha',
    conteudo: 'Conteúdo da ficha',
    versao_esquema: 'Formato da ficha',
    'combate.ajusteProficiencia': 'Ajuste de proficiência',
    'inventario.limiteSintonizacao': 'Limite de sintonização',
  };
  if (names[path]) return names[path];
  const direct = [...identity, ...combat, ...story, ...training].find((f) => f.key === path);
  if (direct) return direct.label;
  for (const list of Object.values(lists)) {
    if (path === list.path) return list.title;
    if (path.startsWith(list.path + '.')) {
      const [index, key] = path.slice(list.path.length + 1).split('.');
      const field = list.fields.find((f) => f.key === key);
      return `${field?.label || list.title} (${list.title}, entrada ${Number(index) + 1})`;
    }
  }
  const [, key] = path.split('.');
  if (path.startsWith('atributos.')) return ATRIBUTOS[key as keyof typeof ATRIBUTOS] || 'Atributos';
  if (path.startsWith('pericias.'))
    return PERICIAS[key as keyof typeof PERICIAS]?.[0] || 'Perícias';
  if (path.startsWith('conjuracao.espacos.'))
    return `Espaços de magia, círculo ${Number(path.split('.')[2]) + 1}`;
  if (path.startsWith('conjuracao.pacto')) return 'Espaços de pacto';
  if (path.startsWith('inventario.moedas')) return 'Moedas';
  return 'Ficha';
}
