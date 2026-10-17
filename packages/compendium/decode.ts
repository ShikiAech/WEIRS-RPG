import type { CreationCatalog } from '../contracts/character-creation';
import type {
  CompendiumEntry,
  CompendiumRef,
  CompendiumSource,
  CompendiumSummary,
  CompendiumKind,
  NumericFormula,
} from '../contracts/compendium';
import type { Ability } from '../contracts/sheets';

type Row = Record<string, any>;
export interface DatabaseCatalog {
  records: Row[];
  tables: Record<string, Row[]>;
}
const s = (r: Row, k: string, f = ''): string => (typeof r[k] === 'string' ? r[k] : f);
const n = (r: Row, k: string, f = 0): number =>
  r[k] === null || r[k] === undefined ? f : Number(r[k]);
const nullable = (r: Row, k: string): number | null =>
  r[k] === null || r[k] === undefined ? null : Number(r[k]);
const b = (r: Row, k: string) => r[k] === true;
export function summaryFromRow(r: Row): CompendiumSummary {
  return {
    ref: { recordId: s(r, 'registro_id'), revisionId: s(r, 'revisao_id', s(r, 'id')) },
    kind: r.tipo as CompendiumKind,
    slug: s(r, 'slug'),
    name: s(r, 'nome_pt'),
    originalName: s(r, 'nome_original'),
    sourceId: s(r, 'fonte_id'),
    sourceTitle: s(r, 'fonte_titulo', r.fonte?.titulo ?? ''),
    ruleSetId: s(r, 'conjunto_regras_codigo'),
    revision: n(r, 'numero', 1),
    reviewed2024: b(r, 'revisado_2024'),
    automation: r.automacao,
    origin: r.origem ?? r.fonte?.origem ?? 'nao-revisada',
    ...(r.circulo !== null && r.circulo !== undefined
      ? {
          circle: n(r, 'circulo'),
          school: s(r, 'escola'),
          ritual: b(r, 'ritual'),
          concentration: b(r, 'concentracao'),
        }
      : {}),
    legacyIds: Array.isArray(r.legados) ? r.legados : [],
  };
}
export function decodeCatalog(raw: DatabaseCatalog, ruleSetId = 'dnd-5e-2024'): CreationCatalog {
  if (!raw || !Array.isArray(raw.records) || !raw.tables || typeof raw.tables !== 'object')
    throw Error('Resposta de compêndio inválida.');
  const heads = new Map(raw.records.map((r) => [s(r, 'id'), r]));
  const indexed = new Map<string, Map<string, Row[]>>();
  for (const [name, rows] of Object.entries(raw.tables)) {
    const owners = new Map<string, Row[]>();
    if (!Array.isArray(rows)) throw Error('Tabela de compêndio inválida.');
    for (const row of rows) {
      const id = s(row, 'revisao_id'),
        list = owners.get(id) ?? [];
      list.push(row);
      owners.set(id, list);
    }
    indexed.set(name, owners);
  }
  const rows = (table: string, id: string) => indexed.get('compendio_' + table)?.get(id) ?? [];
  const one = (table: string, id: string) => rows(table, id)[0] ?? {};
  const ref = (id: unknown): CompendiumRef | null => {
    if (id === null || id === undefined) return null;
    const head = heads.get(String(id));
    if (!head) throw Error('Dependência do compêndio indisponível.');
    return { recordId: s(head, 'registro_id'), revisionId: s(head, 'id') };
  };
  const movements = (id: string) =>
    rows('deslocamentos', id).map((r) => ({
      id: s(r, 'id'),
      mode: r.modo,
      distance: n(r, 'distancia'),
      unit: r.unidade,
      form: s(r, 'forma_codigo'),
      condition: s(r, 'condicao_pt'),
      hover: b(r, 'pairar'),
    }));
  const sizes = (id: string) =>
    rows('especie_tamanhos', id).map((r) => ({
      code: s(r, 'tamanho_codigo'),
      form: s(r, 'forma_codigo'),
      default: b(r, 'padrao'),
    }));
  const entries: CompendiumEntry[] = raw.records.map((r) => {
    const id = s(r, 'id'),
      kind = r.tipo as CompendiumKind;
    let data: unknown;
    switch (kind) {
      case 'classe': {
        const d = one('classes', id),
          attrs = rows('classe_atributos', id);
        data = {
          hitDie: n(d, 'dado_vida'),
          subclassLevel: nullable(d, 'nivel_subclasse') ?? undefined,
          fixedHitPoints: n(d, 'pv_fixo'),
          primaryAbilities: attrs
            .filter((a) => a.papel === 'primario')
            .map((a) => a.atributo_codigo),
          multiclassAbilities: attrs
            .filter((a) => a.papel === 'multiclasse')
            .map((a) => ({
              ability: a.atributo_codigo,
              minimum: n(a, 'valor_minimo'),
              alternativeGroup: n(a, 'grupo_alternativo'),
            })),
          levels: rows('classe_niveis', id).map((l) => ({ level: n(l, 'nivel') })),
          proficiencies: rows('classe_proficiencias', id).map((p) => ({
            proficiencyId: s(p, 'proficiencia_id'),
            acquisition: p.aquisicao,
          })),
        };
        break;
      }
      case 'subclasse': {
        const d = one('subclasses', id);
        data = {
          classRef: ref(d.classe_revisao_id),
          acquisitionLevel: n(d, 'nivel_aquisicao'),
          levels: rows('subclasse_niveis', id).map((l) => ({ level: n(l, 'nivel') })),
        };
        break;
      }
      case 'especie': {
        const d = one('especies', id);
        data = {
          creatureType: s(d, 'tipo_criatura_codigo'),
          lineageRequired: b(d, 'linhagem_obrigatoria'),
          defaultSize: s(d, 'tamanho_codigo'),
          age: s(d, 'idade_pt'),
          sizes: sizes(id),
          movements: movements(id),
          senses: rows('sentidos', id).map((a) => ({
            type: s(a, 'tipo'),
            distanceFeet: nullable(a, 'distancia_pes'),
            condition: s(a, 'condicao_pt'),
          })),
        };
        break;
      }
      case 'linhagem': {
        const d = one('linhagens', id);
        data = {
          speciesRef: ref(d.especie_revisao_id),
          inheritTraits: b(d, 'herdar_tracos'),
          sizes: sizes(id),
          movements: movements(id),
        };
        break;
      }
      case 'antecedente': {
        const d = one('antecedentes', id);
        data = {
          abilities: rows('antecedente_atributos', id).map((a) => a.atributo_codigo),
          distribution: d.distribuicao_atributos,
          abilityLimit: n(d, 'limite_atributo'),
        };
        break;
      }
      case 'talento': {
        const d = one('talentos', id);
        data = {
          category: s(d, 'categoria_codigo'),
          repeatable: b(d, 'repetivel'),
          prerequisiteText: s(d, 'pre_requisito_pt'),
          requirementsComplete: b(d, 'requisitos_completos'),
        };
        break;
      }
      case 'caracteristica': {
        const d = one('caracteristicas', id);
        data = {
          category: s(d, 'categoria'),
          manualDecision: b(d, 'decisao_manual'),
          parentRef: ref(d.origem_revisao_id) ?? undefined,
          level: nullable(d, 'nivel'),
          optional: b(d, 'opcional'),
        };
        break;
      }
      case 'magia': {
        const d = one('magias', id),
          c = one('magia_componentes', id);
        data = {
          circle: n(d, 'circulo'),
          school: s(d, 'escola'),
          castingTime: s(d, 'tempo_pt'),
          range: s(d, 'alcance_pt'),
          rangeFeet: nullable(d, 'alcance_pes'),
          duration: s(d, 'duracao_pt'),
          durationSeconds: nullable(d, 'duracao_segundos'),
          concentration: b(d, 'concentracao'),
          ritual: b(d, 'ritual'),
          components: {
            verbal: b(c, 'verbal'),
            somatic: b(c, 'somatico'),
            material: s(c, 'material_pt'),
            costCopper: nullable(c, 'custo_cobre'),
            consumed: b(c, 'consumido'),
          },
          classRefs: rows('magia_classes', id).map((x) => ref(x.classe_revisao_id)),
          damages: rows('magia_danos', id).map((x) => ({
            id: s(x, 'id'),
            order: n(x, 'ordem'),
            dice: s(x, 'formula_dados'),
            damageType: x.tipo_dano_codigo,
          })),
          scales: rows('magia_escalas', id).map((x) => ({
            level: n(x, 'nivel'),
            basis: x.base,
            dice: s(x, 'formula_dados'),
          })),
        };
        break;
      }
      case 'equipamento': {
        const d = one('equipamentos', id),
          w = rows('armas', id)[0],
          a = rows('armaduras', id)[0],
          shield = rows('escudos', id)[0],
          tool = rows('ferramentas', id)[0],
          magic = rows('itens_magicos', id)[0],
          vehicle = rows('veiculos', id)[0];
        data = {
          category: s(d, 'categoria_codigo'),
          variantOf: ref(d.variante_de_revisao_id) ?? undefined,
          weight: nullable(d, 'peso'),
          weightUnit: s(d, 'unidade_peso'),
          cost: nullable(d, 'custo'),
          currencyRef: ref(d.moeda_revisao_id),
          requiresAttunement: b(d, 'requer_sintonia'),
          ...(w
            ? {
                weapon: {
                  rangeType: w.alcance_tipo,
                  normalRangeFeet: nullable(w, 'alcance_normal_pes'),
                  longRangeFeet: nullable(w, 'alcance_longo_pes'),
                  masteryRef: ref(w.maestria_revisao_id),
                  criticalMinimum: n(w, 'critico_minimo'),
                  propertyRefs: rows('arma_propriedades', id).map((p) =>
                    ref(p.propriedade_revisao_id),
                  ),
                  damages: rows('equipamento_danos', id).map((v) => ({
                    dice: s(v, 'formula_dados'),
                    damageType: s(v, 'tipo_dano_codigo'),
                    ability: v.atributo_codigo,
                  })),
                },
              }
            : {}),
          ...(a
            ? {
                armor: {
                  baseAc: n(a, 'ca_base'),
                  addDexterity: b(a, 'adicionar_destreza'),
                  dexterityLimit: nullable(a, 'limite_destreza'),
                  strengthMinimum: nullable(a, 'forca_minima'),
                  stealthDisadvantage: b(a, 'desvantagem_furtividade'),
                },
              }
            : {}),
          ...(shield ? { shield: { acBonus: n(shield, 'bonus_ca') } } : {}),
          ...(tool
            ? { tool: { ability: tool.atributo_codigo, usage: s(tool, 'utilizacao_pt') } }
            : {}),
          ...(magic
            ? {
                magicItem: {
                  rarity: s(magic, 'raridade'),
                  maximumCharges: nullable(magic, 'limite_cargas'),
                },
              }
            : {}),
          ...(vehicle
            ? {
                vehicle: {
                  capacityKg: nullable(vehicle, 'capacidade_kg'),
                  speedFeet: nullable(vehicle, 'velocidade_pes'),
                  minimumCrew: nullable(vehicle, 'tripulacao_minima'),
                },
              }
            : {}),
        };
        break;
      }
      case 'pacote':
        data = {
          notes: s(one('pacotes', id), 'observacoes_pt'),
          items: rows('pacote_itens', id).map((i) => ({
            id: s(i, 'id'),
            equipmentRef: ref(i.equipamento_revisao_id),
            currencyRef: ref(i.moeda_revisao_id),
            quantity: n(i, 'quantidade'),
          })),
        };
        break;
      case 'moeda': {
        const d = one('moedas', id);
        data = {
          code: s(d, 'codigo'),
          symbol: s(d, 'simbolo'),
          copperValue: nullable(d, 'valor_cobre'),
        };
        break;
      }
      case 'idioma': {
        const d = one('idiomas', id);
        data = { category: s(d, 'categoria'), origin: s(d, 'origem_pt') };
        break;
      }
      case 'maestria':
        data = { key: s(one('maestrias', id), 'chave') };
        break;
      case 'propriedade_arma':
        data = { key: s(one('propriedades_arma', id), 'chave') };
        break;
      case 'servico': {
        const d = one('servicos', id);
        data = {
          cost: n(d, 'custo'),
          currencyRef: ref(d.moeda_revisao_id),
          unit: s(d, 'unidade_cobranca'),
        };
        break;
      }
      case 'criatura': {
        const d = one('criaturas', id),
          keys = {
            for: 'forca',
            des: 'destreza',
            con: 'constituicao',
            int: 'inteligencia',
            sab: 'sabedoria',
            car: 'carisma',
          };
        data = {
          creatureType: s(d, 'tipo_criatura_codigo'),
          size: s(d, 'tamanho_codigo'),
          armorClass: nullable(d, 'ca'),
          armorClassText: s(d, 'ca_formula_pt'),
          hitPointFormula: d.pv_formula,
          challenge: d.desafio,
          abilities: Object.fromEntries(
            Object.entries(keys)
              .filter(([, key]) => d[key] !== null)
              .map(([ability, key]) => [ability, n(d, key)]),
          ),
          actions: rows('criatura_acoes', id).map((x) => ({
            id: s(x, 'id'),
            name: s(x, 'nome_pt'),
            type: s(x, 'tipo'),
            description: s(x, 'descricao_pt'),
            attackBonus: nullable(x, 'bonus_ataque'),
            saveDc: nullable(x, 'cd'),
          })),
        };
        break;
      }
      default:
        throw Error('Domínio de compêndio desconhecido.');
    }
    const f = r.fonte ?? {};
    const source: CompendiumSource = {
      id: s(f, 'id'),
      title: s(f, 'titulo'),
      edition: s(f, 'edicao'),
      language: s(f, 'idioma'),
      origin: f.origem,
      author: s(f, 'autoria'),
      referenceUrl: s(f, 'referencia_url'),
      attribution: s(f, 'atribuicao'),
      path: s(f, 'caminho'),
      commit: s(f, 'commit_fonte'),
      hash: s(f, 'hash_fonte'),
    };
    return {
      ...summaryFromRow(r),
      kind,
      description: s(r, 'descricao_pt'),
      descriptionHtml: s(r, 'descricao_html'),
      aliases: r.aliases ?? [],
      source,
      data,
    } as CompendiumEntry;
  });
  const all = (table: string) => raw.tables['compendio_' + table] ?? [];
  const requirements = all('requisitos').map((r) => ({
    id: s(r, 'id'),
    ownerRevisionId: s(r, 'revisao_id'),
    parentId: r.pai_id,
    operator: r.operador,
    ability: r.atributo_codigo,
    targetRef: ref(r.alvo_revisao_id),
    minimum: nullable(r, 'minimo'),
    choiceKey: r.escolha_chave,
    proficiencyId: r.proficiencia_id,
  }));
  const choices = all('grupos_escolha').map((g) => ({
    id: s(g, 'id'),
    ownerRevisionId: s(g, 'revisao_id'),
    key: s(g, 'chave'),
    name: s(g, 'nome_pt'),
    minimum: n(g, 'minimo'),
    maximum: n(g, 'maximo'),
    acquisition: g.aquisicao,
    abilityPoints: nullable(g, 'pontos_atributo'),
    abilityLimit: nullable(g, 'limite_atributo'),
    optionKind: g.tipo_opcao,
    featCategory: g.categoria_talento_codigo,
    requirementId: g.requisito_id,
    level: n(g, 'nivel'),
    options: all('opcoes_escolha')
      .filter((o) => o.grupo_id === g.id)
      .map((o) => ({
        id: s(o, 'id'),
        groupId: s(o, 'grupo_id'),
        name: s(o, 'nome_pt'),
        type: s(o, 'tipo'),
        targetRef: ref(o.alvo_revisao_id),
        ability: o.atributo_codigo,
        proficiencyId: o.proficiencia_id,
        value: o.valor,
        quantity: n(o, 'quantidade'),
      })),
  }));
  const grants = all('concessoes').map((g) => ({
    id: s(g, 'id'),
    ownerRevisionId: s(g, 'revisao_id'),
    key: s(g, 'chave'),
    kind: g.tipo,
    targetRef: ref(g.alvo_revisao_id),
    groupId: g.grupo_id,
    requirementId: g.requisito_id,
    level: n(g, 'nivel'),
    acquisition: g.aquisicao,
    quantity: n(g, 'quantidade'),
  }));
  const effects = all('efeitos').map((e) => ({
    id: s(e, 'id'),
    ownerRevisionId: s(e, 'revisao_id'),
    key: s(e, 'chave'),
    type: e.tipo,
    formula: e.formula as NumericFormula | null,
    requirementId: e.requisito_id,
    level: n(e, 'nivel'),
    stacking: e.acumulacao,
    condition: s(e, 'condicao_pt'),
    abilities: all('efeito_atributos')
      .filter((a) => a.efeito_id === e.id)
      .map((a) => ({
        ability: a.atributo_codigo,
        increase: n(a, 'aumento'),
        limit: n(a, 'limite'),
      })),
    defenses: all('efeito_defesas')
      .filter((a) => a.efeito_id === e.id)
      .map((a) => ({
        damageType: a.tipo_dano_codigo,
        unarmored: b(a, 'sem_armadura'),
        permitsShield: b(a, 'permite_escudo'),
      })),
    resources: all('efeito_recursos')
      .filter((a) => a.efeito_id === e.id)
      .map((a) => ({ name: s(a, 'nome_pt'), recovery: a.recuperacao })),
    proficiencies: all('efeito_proficiencias')
      .filter((a) => a.efeito_id === e.id)
      .map((a) => ({ proficiencyId: s(a, 'proficiencia_id'), degree: a.grau })),
  }));
  const proficiencies = all('proficiencias').map((p) => ({
    id: s(p, 'id'),
    ownerRevisionId: s(p, 'revisao_id'),
    type: p.tipo,
    skill: p.pericia_codigo ?? undefined,
    ability: p.atributo_codigo ?? undefined,
    equipment: ref(p.equipamento_revisao_id) ?? undefined,
    category: p.categoria_codigo ?? undefined,
    language: ref(p.idioma_revisao_id) ?? undefined,
  }));
  const castingProfiles = all('perfis_conjuracao').map((p) => ({
    listClassRefs: all('perfil_listas')
      .filter((l) => l.perfil_id === p.id)
      .map((l) => ref(l.classe_revisao_id)!),
    listChoiceKey: p.chave_escolha_lista ?? null,
    selectionUses: nullable(p, 'usos_selecao'),
    selectionRecovery: p.recuperacao_selecao ?? null,
    id: s(p, 'id'),
    ownerRevisionId: s(p, 'revisao_id'),
    key: s(p, 'chave'),
    type: p.tipo,
    method: p.metodo,
    contributionNumerator: n(p, 'contribuicao_numerador'),
    contributionDenominator: n(p, 'contribuicao_denominador') as 1 | 2 | 3,
    rounding: p.arredondamento,
    firstLevel: n(p, 'nivel_inicial'),
    abilities: all('perfil_atributos')
      .filter((a) => a.perfil_id === p.id)
      .map((a) => a.atributo_codigo as Ability),
    progression: all('conjuracao_progressao')
      .filter((l) => l.perfil_id === p.id)
      .map((l) => ({
        level: n(l, 'nivel'),
        cantrips: n(l, 'truques'),
        prepared: nullable(l, 'magias_preparadas'),
        known: nullable(l, 'magias_conhecidas'),
        maximumCircle: nullable(l, 'circulo_maximo'),
      })),
    slots: all('espacos_magia')
      .filter((l) => l.perfil_id === p.id)
      .map((l) => ({ level: n(l, 'nivel'), circle: n(l, 'circulo'), total: n(l, 'total') })),
    spells: all('magias_concedidas')
      .filter((l) => l.perfil_id === p.id)
      .map((l) => ({
        spellRef: ref(l.magia_revisao_id)!,
        level: n(l, 'nivel'),
        alwaysPrepared: b(l, 'sempre_preparada'),
        usesSlots: b(l, 'usa_espacos'),
        ownUses: nullable(l, 'usos_proprios'),
        recovery: l.recuperacao,
      })),
  }));
  const equipmentOptions = all('opcoes_equipamento').map((o) => ({
    id: s(o, 'id'),
    ownerRevisionId: s(o, 'revisao_id'),
    key: s(o, 'chave'),
    name: s(o, 'nome_pt'),
    packageRef: ref(o.pacote_revisao_id)!,
    acquisition: o.aquisicao,
  }));
  return {
    ruleSetId,
    entries,
    requirements,
    choices,
    grants,
    effects,
    proficiencies,
    castingProfiles,
    equipmentOptions,
    multiclassSlots: castingProfiles.find((p) => p.key === 'multiclasse')?.slots ?? [],
  };
}
