import type { CompendiumEntry, CompendiumRef } from '../../packages/contracts/compendium';
import type { ResolvedCatalog } from './resolved';
import { stableId, hash, canonical } from './identity';
import { validateCatalog } from './validate';

type Row = Record<string, unknown>;
export type SeedTables = Map<string, Row[]>;
const target = (ref: CompendiumRef | null | undefined) => ref?.revisionId ?? null;

/** Table and column names are fixed by this serializer; source text is always a value. */
export function catalogTables(c: ResolvedCatalog): SeedTables {
  const tables: SeedTables = new Map();
  const add = (name: string, row: Row) => {
    const rows = tables.get(name) ?? [];
    rows.push(row);
    tables.set(name, rows);
  };
  const child = (name: string, owner: string, key: string, row: Row) =>
    add(name, { id: stableId(owner + ':' + name + ':' + key), revisao_id: owner, ...row });
  for (const origin of c.origins) {
    const entry = c.entries.find((e) => e.ref.recordId === origin.id);
    if (!entry) continue;
    for (const alternative of origin.alternatives) {
      const source =
        c.sources.find((s) => s.id === alternative.sourceId) ??
        c.sources.find((s) => s.path === alternative.sourcePath);
      if (!source) throw Error('A fonte da variante não está disponível.');
      child(
        'compendio_variantes_fonte',
        entry.ref.revisionId,
        alternative.sourcePath + alternative.pointer,
        {
          fonte_id: source.id,
          caminho: alternative.sourcePath,
          ponteiro: alternative.pointer,
          hash_fonte: alternative.sourceHash ?? source.hash,
          dados_originais: alternative.payload,
        },
      );
    }
  }
  for (const e of c.entries) {
    const id = e.ref.revisionId;
    switch (e.kind) {
      case 'moeda':
        add('compendio_moedas', {
          revisao_id: id,
          codigo: e.data.code,
          simbolo: e.data.symbol,
          valor_cobre: e.data.copperValue,
        });
        break;
      case 'idioma':
        add('compendio_idiomas', {
          revisao_id: id,
          categoria: e.data.category,
          origem_pt: e.data.origin,
        });
        break;
      case 'maestria':
        add('compendio_maestrias', { revisao_id: id, chave: e.data.key });
        break;
      case 'propriedade_arma':
        add('compendio_propriedades_arma', { revisao_id: id, chave: e.data.key });
        break;
      case 'classe':
        add('compendio_classes', {
          revisao_id: id,
          dado_vida: e.data.hitDie,
          nivel_subclasse: e.data.subclassLevel ?? null,
        });
        e.data.primaryAbilities.forEach((ability) =>
          child('compendio_classe_atributos', id, 'primario:' + ability, {
            atributo_codigo: ability,
            papel: 'primario',
            grupo_alternativo: 0,
            valor_minimo: null,
          }),
        );
        e.data.multiclassAbilities.forEach((a) =>
          child('compendio_classe_atributos', id, 'multiclasse:' + a.ability, {
            atributo_codigo: a.ability,
            papel: 'multiclasse',
            grupo_alternativo: a.alternativeGroup,
            valor_minimo: a.minimum,
          }),
        );
        e.data.levels.forEach((l) =>
          child('compendio_classe_niveis', id, String(l.level), { nivel: l.level }),
        );
        e.data.proficiencies.forEach((p, i) =>
          child('compendio_classe_proficiencias', id, String(i), {
            proficiencia_id: p.proficiencyId,
            aquisicao: p.acquisition,
          }),
        );
        break;
      case 'subclasse':
        add('compendio_subclasses', {
          revisao_id: id,
          classe_revisao_id: target(e.data.classRef),
          nivel_aquisicao: e.data.acquisitionLevel,
        });
        e.data.levels.forEach((l) =>
          child('compendio_subclasse_niveis', id, String(l.level), { nivel: l.level }),
        );
        break;
      case 'especie':
        add('compendio_especies', {
          linhagem_obrigatoria: e.data.lineageRequired ?? false,
          revisao_id: id,
          tipo_criatura_codigo: e.data.creatureType,
          tamanho_codigo: e.data.defaultSize,
          idade_pt: e.data.age,
          regras_forma: e.data.formRules ?? null,
        });
        e.data.senses.forEach((s, i) =>
          child('compendio_sentidos', id, String(i), {
            tipo: s.type,
            distancia_pes: s.distanceFeet,
            condicao_pt: s.condition,
          }),
        );
        break;
      case 'linhagem':
        add('compendio_linhagens', {
          revisao_id: id,
          especie_revisao_id: target(e.data.speciesRef),
          herdar_tracos: e.data.inheritTraits,
        });
        break;
      case 'antecedente':
        add('compendio_antecedentes', {
          revisao_id: id,
          distribuicao_atributos: e.data.distribution,
          limite_atributo: e.data.abilityLimit,
        });
        e.data.abilities.forEach((a) =>
          child('compendio_antecedente_atributos', id, a, { atributo_codigo: a }),
        );
        break;
      case 'talento':
        add('compendio_talentos', {
          revisao_id: id,
          categoria_codigo: e.data.category,
          repetivel: e.data.repeatable,
          pre_requisito_pt: e.data.prerequisiteText,
          requisitos_completos: e.data.requirementsComplete,
        });
        break;
      case 'caracteristica':
        add('compendio_caracteristicas', {
          revisao_id: id,
          categoria: e.data.category,
          decisao_manual: e.data.manualDecision,
          origem_revisao_id: target(e.data.parentRef),
          nivel: e.data.level ?? null,
          opcional: e.data.optional ?? false,
          efeitos_forma: e.data.formEffects ?? null,
          pre_requisito_magia: e.data.spellPrerequisite ?? null,
          bonus_pericias: e.data.skillBonuses ?? null,
        });
        break;
      case 'magia': {
        const d = e.data;
        add('compendio_magias', {
          revisao_id: id,
          circulo: d.circle,
          escola: d.school,
          tempo_pt: d.castingTime,
          alcance_pt: d.range,
          alcance_pes: d.rangeFeet,
          duracao_pt: d.duration,
          duracao_segundos: d.durationSeconds,
          concentracao: d.concentration,
          ritual: d.ritual,
          area_tipo: null,
          area_pes: null,
          salvaguarda_atributo: null,
        });
        child('compendio_magia_componentes', id, 'componentes', {
          verbal: d.components.verbal,
          somatico: d.components.somatic,
          material_pt: d.components.material,
          custo_cobre: d.components.costCopper,
          consumido: d.components.consumed,
        });
        d.classRefs.forEach((r) =>
          child('compendio_magia_classes', id, r.revisionId, {
            classe_revisao_id: target(r),
            sempre_preparada: false,
          }),
        );
        d.damages.forEach((d) =>
          add('compendio_magia_danos', {
            id: d.id,
            revisao_id: id,
            ordem: d.order,
            formula_dados: d.dice,
            tipo_dano_codigo: d.damageType,
          }),
        );
        d.scales.forEach((s, i) =>
          child('compendio_magia_escalas', id, String(i), {
            nivel: s.level,
            base: s.basis,
            formula_dados: s.dice,
          }),
        );
        break;
      }
      case 'equipamento': {
        const d = e.data;
        add('compendio_equipamentos', {
          revisao_id: id,
          categoria_codigo: d.category,
          variante_de_revisao_id: target(d.variantOf),
          peso: d.weight,
          unidade_peso: d.weightUnit,
          custo: d.cost,
          moeda_revisao_id: target(d.currencyRef),
          requer_sintonia: d.requiresAttunement,
        });
        if (d.weapon) {
          const w = d.weapon;
          add('compendio_armas', {
            revisao_id: id,
            alcance_tipo: w.rangeType,
            alcance_normal_pes: w.normalRangeFeet,
            alcance_longo_pes: w.longRangeFeet,
            maestria_revisao_id: target(w.masteryRef),
            critico_minimo: w.criticalMinimum,
          });
          w.propertyRefs.forEach((p) =>
            child('compendio_arma_propriedades', id, p.revisionId, {
              propriedade_revisao_id: target(p),
              valor: null,
            }),
          );
          w.damages.forEach((v, i) =>
            child('compendio_equipamento_danos', id, String(i), {
              ordem: i,
              formula_dados: v.dice,
              tipo_dano_codigo: v.damageType,
              atributo_codigo: v.ability,
            }),
          );
        }
        if (d.armor) {
          const a = d.armor;
          add('compendio_armaduras', {
            revisao_id: id,
            ca_base: a.baseAc,
            adicionar_destreza: a.addDexterity,
            limite_destreza: a.dexterityLimit,
            forca_minima: a.strengthMinimum,
            desvantagem_furtividade: a.stealthDisadvantage,
          });
        }
        if (d.shield) add('compendio_escudos', { revisao_id: id, bonus_ca: d.shield.acBonus });
        if (d.tool)
          add('compendio_ferramentas', {
            revisao_id: id,
            atributo_codigo: d.tool.ability,
            utilizacao_pt: d.tool.usage,
          });
        if (d.magicItem)
          add('compendio_itens_magicos', {
            revisao_id: id,
            raridade: d.magicItem.rarity,
            limite_cargas: d.magicItem.maximumCharges,
          });
        if (d.vehicle)
          add('compendio_veiculos', {
            revisao_id: id,
            capacidade_kg: d.vehicle.capacityKg,
            velocidade_pes: d.vehicle.speedFeet,
            tripulacao_minima: d.vehicle.minimumCrew,
          });
        break;
      }
      case 'pacote':
        add('compendio_pacotes', { revisao_id: id, observacoes_pt: e.data.notes });
        e.data.items.forEach((item) =>
          add('compendio_pacote_itens', {
            id: item.id,
            revisao_id: id,
            equipamento_revisao_id: target(item.equipmentRef),
            moeda_revisao_id: target(item.currencyRef),
            quantidade: item.quantity,
          }),
        );
        break;
      case 'servico':
        add('compendio_servicos', {
          revisao_id: id,
          custo: e.data.cost,
          moeda_revisao_id: target(e.data.currencyRef),
          unidade_cobranca: e.data.unit,
        });
        break;
      case 'criatura': {
        const d = e.data,
          a = d.abilities;
        add('compendio_criaturas', {
          revisao_id: id,
          tipo_criatura_codigo: d.creatureType,
          tamanho_codigo: d.size,
          ca: d.armorClass,
          ca_formula_pt: d.armorClassText,
          pv_formula: d.hitPointFormula,
          forca: a.for ?? null,
          destreza: a.des ?? null,
          constituicao: a.con ?? null,
          inteligencia: a.int ?? null,
          sabedoria: a.sab ?? null,
          carisma: a.car ?? null,
          desafio: d.challenge,
        });
        d.actions.forEach((action) =>
          add('compendio_criatura_acoes', {
            id: action.id,
            revisao_id: id,
            nome_pt: action.name,
            tipo: action.type,
            descricao_pt: action.description,
            bonus_ataque: action.attackBonus,
            cd: action.saveDc,
          }),
        );
        break;
      }
    }
    if (e.kind === 'especie' || e.kind === 'linhagem') {
      e.data.sizes.forEach((s) =>
        child('compendio_especie_tamanhos', id, s.code + ':' + s.form, {
          tamanho_codigo: s.code,
          forma_codigo: s.form,
          padrao: s.default,
        }),
      );
      e.data.movements.forEach((m) =>
        add('compendio_deslocamentos', {
          id: m.id,
          revisao_id: id,
          modo: m.mode,
          distancia: m.distance,
          unidade: m.unit,
          forma_codigo: m.form,
          condicao_pt: m.condition,
          pairar: m.hover,
        }),
      );
    }
    e.aliases.forEach((alias) =>
      child('compendio_aliases', id, alias, { nome: alias, idioma: 'pt-BR' }),
    );
    e.legacyIds.forEach((legacy) =>
      child('compendio_referencias_legadas', id, legacy, {
        legado_id: legacy,
        caminho: e.sourcePath,
        ancora: e.pointer,
      }),
    );
  }
  for (const p of c.proficiencies)
    add('compendio_proficiencias', {
      id: p.id,
      revisao_id: p.ownerRevisionId,
      tipo: p.type,
      pericia_codigo: p.skill ?? null,
      atributo_codigo: p.ability ?? null,
      equipamento_revisao_id: target(p.equipment),
      categoria_codigo: p.category ?? null,
      idioma_revisao_id: target(p.language),
    });
  for (const r of c.requirements)
    add('compendio_requisitos', {
      id: r.id,
      revisao_id: r.ownerRevisionId,
      pai_id: r.parentId,
      operador: r.operator,
      atributo_codigo: r.ability,
      alvo_revisao_id: target(r.targetRef),
      minimo: r.minimum,
      escolha_chave: r.choiceKey,
      proficiencia_id: r.proficiencyId,
    });
  for (const g of c.choices) {
    add('compendio_grupos_escolha', {
      id: g.id,
      revisao_id: g.ownerRevisionId,
      chave: g.key,
      nome_pt: g.name,
      minimo: g.minimum,
      maximo: g.maximum,
      aquisicao: g.acquisition,
      pontos_atributo: g.abilityPoints,
      limite_atributo: g.abilityLimit,
      tipo_opcao: g.optionKind,
      categoria_talento_codigo: g.featCategory,
      requisito_id: g.requirementId,
      nivel: g.level,
    });
    for (const o of g.options)
      add('compendio_opcoes_escolha', {
        id: o.id,
        revisao_id: g.ownerRevisionId,
        grupo_id: g.id,
        nome_pt: o.name,
        tipo: o.type,
        alvo_revisao_id: target(o.targetRef),
        atributo_codigo: o.ability,
        proficiencia_id: o.proficiencyId,
        valor: o.value,
        quantidade: o.quantity,
      });
  }
  for (const g of c.grants)
    add('compendio_concessoes', {
      id: g.id,
      revisao_id: g.ownerRevisionId,
      chave: g.key,
      tipo: g.kind,
      alvo_revisao_id: target(g.targetRef),
      grupo_id: g.groupId,
      requisito_id: g.requirementId,
      nivel: g.level,
      aquisicao: g.acquisition,
      quantidade: g.quantity,
    });
  for (const e of c.effects) {
    add('compendio_efeitos', {
      id: e.id,
      revisao_id: e.ownerRevisionId,
      chave: e.key,
      tipo: e.type,
      formula: e.formula,
      requisito_id: e.requirementId,
      nivel: e.level,
      acumulacao: e.stacking,
      condicao_pt: e.condition,
    });
    e.abilities.forEach((a, i) =>
      child('compendio_efeito_atributos', e.ownerRevisionId, e.id + ':' + i, {
        efeito_id: e.id,
        atributo_codigo: a.ability,
        aumento: a.increase,
        limite: a.limit,
      }),
    );
    e.defenses.forEach((d, i) =>
      child('compendio_efeito_defesas', e.ownerRevisionId, e.id + ':' + i, {
        efeito_id: e.id,
        tipo_dano_codigo: d.damageType,
        sem_armadura: d.unarmored,
        permite_escudo: d.permitsShield,
      }),
    );
    e.resources.forEach((r, i) =>
      child('compendio_efeito_recursos', e.ownerRevisionId, e.id + ':' + i, {
        efeito_id: e.id,
        nome_pt: r.name,
        recuperacao: r.recovery,
      }),
    );
    e.proficiencies.forEach((p, i) =>
      child('compendio_efeito_proficiencias', e.ownerRevisionId, e.id + ':' + i, {
        efeito_id: e.id,
        proficiencia_id: p.proficiencyId,
        grau: p.degree,
      }),
    );
  }
  for (const p of c.castingProfiles) {
    add('compendio_perfis_conjuracao', {
      chave_escolha_lista: p.listChoiceKey ?? null,
      usos_selecao: p.selectionUses ?? null,
      recuperacao_selecao: p.selectionRecovery ?? null,
      id: p.id,
      revisao_id: p.ownerRevisionId,
      chave: p.key,
      tipo: p.type,
      metodo: p.method,
      contribuicao_numerador: p.contributionNumerator,
      contribuicao_denominador: p.contributionDenominator,
      arredondamento: p.rounding,
      nivel_inicial: p.firstLevel,
    });
    p.listClassRefs?.forEach((r) =>
      child('compendio_perfil_listas', p.ownerRevisionId, p.id + r.revisionId, {
        perfil_id: p.id,
        classe_revisao_id: r.revisionId,
      }),
    );
    p.abilities.forEach((a) =>
      child('compendio_perfil_atributos', p.ownerRevisionId, p.id + a, {
        perfil_id: p.id,
        atributo_codigo: a,
      }),
    );
    p.progression.forEach((l) =>
      child('compendio_conjuracao_progressao', p.ownerRevisionId, p.id + ':' + l.level, {
        perfil_id: p.id,
        nivel: l.level,
        truques: l.cantrips,
        magias_preparadas: l.prepared,
        magias_conhecidas: l.known,
        circulo_maximo: l.maximumCircle,
      }),
    );
    p.slots.forEach((s) =>
      child('compendio_espacos_magia', p.ownerRevisionId, p.id + ':' + s.level + ':' + s.circle, {
        perfil_id: p.id,
        nivel: s.level,
        circulo: s.circle,
        total: s.total,
      }),
    );
    p.spells.forEach((s, i) =>
      child('compendio_magias_concedidas', p.ownerRevisionId, p.id + ':' + i, {
        perfil_id: p.id,
        magia_revisao_id: target(s.spellRef),
        nivel: s.level,
        sempre_preparada: s.alwaysPrepared,
        usa_espacos: s.usesSlots,
        usos_proprios: s.ownUses,
        recuperacao: s.recovery,
      }),
    );
  }
  for (const o of c.equipmentOptions)
    add('compendio_opcoes_equipamento', {
      id: o.id,
      revisao_id: o.ownerRevisionId,
      chave: o.key,
      nome_pt: o.name,
      pacote_revisao_id: target(o.packageRef),
      aquisicao: o.acquisition,
    });
  for (const cell of c.progressionCells)
    child(
      'compendio_progressao_celulas',
      cell.ownerRevisionId,
      [cell.table, cell.row, cell.column].join(':'),
      {
        tabela: cell.table,
        linha: cell.row,
        coluna: cell.column,
        cabecalho_pt: cell.heading,
        valor_pt: cell.value,
      },
    );
  return tables;
}
const literal = (value: unknown): string => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw Error('Número inválido na carga');
    return String(value);
  }
  return (
    "'" +
    (typeof value === 'object' ? JSON.stringify(value) : String(value))
      .replace(/'/g, "''")
      .replace(/\u0000/g, '') +
    "'"
  );
};
function doBlock(body: string): string {
  let index = 0;
  while (body.includes('$compendio_' + index + '$')) index++;
  const delimiter = '$compendio_' + index + '$';
  return 'DO ' + delimiter + ' ' + body + ' ' + delimiter + ';';
}
// Real table row types give NULLs, UUIDs and JSON their database types, even on empty columns.
function insert(name: string, rows: Row[], key = 'id', check = true): string {
  if (!rows.length) return '';
  const columns = Object.keys(rows[0]);
  if (rows.some((r) => Object.keys(r).join() !== columns.join()))
    throw Error('Colunas inconsistentes em ' + name);
  const data = literal(rows);
  const recordset = `jsonb_populate_recordset(NULL::public.${name},${data}::jsonb)`;
  const names = columns.join(',');
  // A source keeps the commit recorded when its content was first imported. A
  // later repository commit does not change that content or its editorial data.
  const compared = columns
    .filter((column) => name !== 'compendio_fontes' || column !== 'commit_fonte')
    .join(',');
  const sql = `INSERT INTO public.${name}(${names}) SELECT ${columns.map((k) => 'e.' + k).join(',')} FROM ${recordset} e WHERE NOT EXISTS(SELECT 1 FROM public.${name} a WHERE a.${key}=e.${key});`;
  return (
    sql +
    (check
      ? '\n' +
        doBlock(
          `BEGIN IF EXISTS(SELECT ${compared} FROM ${recordset} EXCEPT SELECT ${compared} FROM public.${name}) THEN RAISE EXCEPTION 'Conflito editorial na carga: ${name}. Nenhuma alteração foi aplicada.' USING ERRCODE='WC004'; END IF; END`,
        )
      : '')
  );
}
export function publicationIds(c: ResolvedCatalog, tables = catalogTables(c)): string[] {
  const blocked = new Set(
    validateCatalog(c)
      .filter((i) => i.severity === 'error' && i.revisionId)
      .map((i) => i.revisionId!),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const rows of tables.values())
      for (const row of rows) {
        if (typeof row.revisao_id !== 'string' || blocked.has(row.revisao_id)) continue;
        for (const [key, id] of Object.entries(row))
          if (key.endsWith('_revisao_id') && typeof id === 'string' && blocked.has(id)) {
            blocked.add(row.revisao_id);
            changed = true;
            break;
          }
      }
  }
  return c.entries.filter((e) => !blocked.has(e.ref.revisionId)).map((e) => e.ref.revisionId);
}
export function coverageReport(c: ResolvedCatalog) {
  const published = new Set(publicationIds(c));
  return {
    schemaVersion: 1,
    sources: c.sources.length,
    concepts: c.entries.length,
    sourceElements: c.origins.reduce((n, r) => n + 1 + r.alternatives.length, 0),
    byKind: Object.fromEntries(
      [...new Set(c.entries.map((e) => e.kind))].map((kind) => [
        kind,
        {
          total: c.entries.filter((e) => e.kind === kind).length,
          publishable: c.entries.filter((e) => e.kind === kind && published.has(e.ref.revisionId))
            .length,
          reviewed2024: c.entries.filter((e) => e.kind === kind && e.reviewed2024).length,
          completeAutomation: c.entries.filter(
            (e) => e.kind === kind && e.automation === 'completa',
          ).length,
        },
      ]),
    ),
    relations: {
      grants: c.grants.length,
      requirements: c.requirements.length,
      choices: c.choices.length,
      effects: c.effects.length,
      castingProfiles: c.castingProfiles.length,
      equipmentOptions: c.equipmentOptions.length,
    },
    issues: validateCatalog(c),
  };
}
export function generateSeed(c: ResolvedCatalog): string {
  const tables = catalogTables(c),
    parts = [
      '-- Gerado por npm run compendium:seed. Aplicação local/revisada; não executa rede.',
      'BEGIN;',
      'SET LOCAL standard_conforming_strings=on;',
    ];
  const report = coverageReport(c),
    manifest = hash(
      canonical({ sources: c.sources, curation: c.entries.map((e) => e.ref), report }),
    ),
    importId = stableId('importacao:' + manifest);
  parts.push(
    insert(
      'compendio_categorias_talento',
      [
        { codigo: 'selvagem', nome_pt: 'Talentos Selvagens' },
        { codigo: 'vilania', nome_pt: 'Caminhos da Vilania' },
        { codigo: 'weirs', nome_pt: 'Weirs' },
      ],
      'codigo',
    ),
  );
  parts.push(
    insert(
      'compendio_fontes',
      c.sources.map((s) => ({
        id: s.id,
        titulo: s.title,
        edicao: s.edition,
        idioma: s.language,
        origem: s.origin,
        autoria: s.author,
        referencia_url: s.referenceUrl,
        atribuicao: s.attribution,
        caminho: s.path,
        commit_fonte: s.commit,
        hash_fonte: s.hash,
      })),
    ),
  );
  parts.push(
    insert(
      'compendio_registros',
      c.entries.map((e) => ({ id: e.ref.recordId, tipo: e.kind, slug: e.slug })),
      'id',
      false,
    ),
  );
  // Allocate a revision number only when this immutable import revision is new.
  for (let i = 0; i < c.entries.length; i += 150) {
    const entries = c.entries.slice(i, i + 150);
    const rows = entries.map((e) => ({
      id: e.ref.revisionId,
      registro_id: e.ref.recordId,
      conjunto_regras_codigo: e.ruleSetId,
      fonte_id: e.sourceId,
      nome_pt: e.name,
      nome_original: e.originalName,
      descricao_pt: e.description,
      descricao_html: e.descriptionHtml,
      revisado_2024: e.reviewed2024,
      automacao: e.automation,
      caminho_fonte: e.sourcePath,
      ancora_fonte: e.pointer,
      hash_fonte: e.sourceHash,
    }));
    const columns = Object.keys(rows[0]);
    parts.push(
      `INSERT INTO public.compendio_revisoes(${columns.join(',')},numero) SELECT ${columns.map((k) => 'e.' + k).join(',')},coalesce((SELECT max(numero) FROM public.compendio_revisoes r WHERE r.registro_id=e.registro_id),0)+1 FROM jsonb_populate_recordset(NULL::public.compendio_revisoes,${literal(rows)}::jsonb) e WHERE NOT EXISTS(SELECT 1 FROM public.compendio_revisoes r WHERE r.id=e.id);`,
    );
    parts.push(
      doBlock(
        `BEGIN IF EXISTS(SELECT ${columns.join(',')} FROM jsonb_populate_recordset(NULL::public.compendio_revisoes,${literal(rows)}::jsonb) EXCEPT SELECT ${columns.join(',')} FROM public.compendio_revisoes) THEN RAISE EXCEPTION 'Conflito editorial na revisão importada.' USING ERRCODE='WC004'; END IF; END`,
      ),
    );
  }
  // Fixed topological table order, including self-FK requirements (parents appear first).
  const order = [
    'compendio_moedas',
    'compendio_idiomas',
    'compendio_maestrias',
    'compendio_propriedades_arma',
    'compendio_equipamentos',
    'compendio_armas',
    'compendio_armaduras',
    'compendio_escudos',
    'compendio_ferramentas',
    'compendio_itens_magicos',
    'compendio_veiculos',
    'compendio_classes',
    'compendio_subclasses',
    'compendio_especies',
    'compendio_linhagens',
    'compendio_talentos',
    'compendio_caracteristicas',
    'compendio_antecedentes',
    'compendio_magias',
    'compendio_criaturas',
    'compendio_pacotes',
    'compendio_servicos',
    'compendio_proficiencias',
    'compendio_requisitos',
    'compendio_grupos_escolha',
    'compendio_opcoes_escolha',
    'compendio_concessoes',
    'compendio_efeitos',
    'compendio_perfis_conjuracao',
  ];
  const ordered = [
    ...order.filter((t) => tables.has(t)),
    ...[...tables.keys()].filter((t) => !order.includes(t)),
  ];
  for (const table of ordered) {
    const rows = tables.get(table)!;
    for (let i = 0; i < rows.length; i += 150)
      parts.push(
        insert(table, rows.slice(i, i + 150), Object.hasOwn(rows[0], 'id') ? 'id' : 'revisao_id'),
      );
  }
  // Detect extra editorial rows as well as changed/missing imported rows. No deletes.
  const counts = [...tables.entries()].flatMap(([table, rows]) => {
    const owners = new Map<string, number>();
    for (const row of rows)
      owners.set(String(row.revisao_id), (owners.get(String(row.revisao_id)) ?? 0) + 1);
    return [...owners].map(([revisao_id, quantidade]) => ({
      tabela: table,
      revisao_id,
      quantidade,
    }));
  });
  parts.push(`CREATE TEMP TABLE compendio_contagens_esperadas(tabela text,revisao_id uuid,quantidade bigint) ON COMMIT DROP;
    INSERT INTO compendio_contagens_esperadas SELECT * FROM jsonb_populate_recordset(NULL::compendio_contagens_esperadas,${literal(counts)}::jsonb);
    ${doBlock(`DECLARE d record; divergente boolean; BEGIN
    FOR d IN SELECT nome FROM private.compendio_dominios LOOP
      EXECUTE format('SELECT EXISTS(SELECT revisao_id,count(*) FROM public.%I WHERE revisao_id=ANY($1) GROUP BY revisao_id EXCEPT SELECT revisao_id,quantidade FROM pg_temp.compendio_contagens_esperadas WHERE tabela=$2)',d.nome)
      INTO divergente USING ARRAY[${c.entries.map((e) => literal(e.ref.revisionId)).join(',')}]::uuid[],d.nome;
      IF divergente THEN RAISE EXCEPTION 'Linhas editoriais adicionais em %. Carga cancelada.',d.nome USING ERRCODE='WC004'; END IF;
    END LOOP; END`)}`);
  parts.push(
    insert('compendio_importacoes', [
      {
        id: importId,
        commit_fonte: c.sources.find((s) => s.commit)?.commit ?? '',
        versao_importador: '1',
        hash_manifesto: manifest,
        relatorio: report,
      },
    ]),
  );
  parts.push(
    insert(
      'compendio_pendencias',
      validateCatalog(c).map((i, n) => ({
        id: stableId(importId + ':issue:' + n),
        revisao_id: c.entries.some((e) => e.ref.revisionId === i.revisionId) ? i.revisionId : null,
        importacao_id: importId,
        codigo: i.code,
        mensagem: i.message,
        caminho: i.path,
        ponteiro: i.pointer,
        severidade: i.severity,
        resolvida: false,
      })),
    ),
  );
  const ids = publicationIds(c, tables);
  // Calling the privileged publication RPC requires an authenticated admin. SQL editor
  // loads run as postgres and set the same existing administrator identity locally.
  parts.push(
    `SELECT public.publicar_compendio_lote(ARRAY[${ids.map(literal).join(',')}]::uuid[]);`,
  );
  const published = new Set(ids);
  const superseded = c.origins.flatMap((origin) =>
    c.entries.some((e) => e.ref.recordId === origin.id && published.has(e.ref.revisionId))
      ? (origin.supersededIds ?? [])
      : [],
  );
  if (superseded.length)
    parts.push(
      `UPDATE public.compendio_registros SET ativo=false WHERE id=ANY(ARRAY[${superseded.map(literal).join(',')}]::uuid[]);`,
    );
  parts.push('COMMIT;');
  return parts.filter(Boolean).join('\n\n') + '\n';
}
