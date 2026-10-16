import type {
  CreationCatalog,
  CreationDraft,
  DefenseBreakdown,
  HitPointBreakdown,
  SpellcastingBreakdown,
} from '../contracts/character-creation';
import type { SheetContent, EquipmentItem } from '../contracts/sheets';
import { criarConteudo, novaEntrada } from '../sheets/modelo.js';
import { spellToSheet } from '../compendium/sheet-adapter';
import { instanceUuid } from './concessions';
import type { CreationState } from './state';
import { evaluateFormula } from './formula';
export function projectSheet(
  catalog: CreationCatalog,
  draft: CreationDraft,
  state: CreationState,
  hp: HitPointBreakdown,
  defenses: DefenseBreakdown,
  casting: SpellcastingBreakdown,
): SheetContent {
  const sheet: SheetContent = criarConteudo();
  const entry = (revision: string) => catalog.entries.find((e) => e.ref.revisionId === revision);
  const roots = state.concessions.instances;
  const species = roots.find((i) => i.id === 'species')?.entry,
    lineage = roots.find((i) => i.id === 'lineage')?.entry,
    bg = roots.find((i) => i.id === 'background')?.entry;
  sheet.identidade.especie = [species?.name, lineage?.name].filter(Boolean).join(' / ');
  sheet.identidade.antecedente = bg?.name ?? '';
  sheet.identidade.tamanho = draft.size ?? '';
  sheet.classes = draft.classes.map((c) => ({
    id: c.id,
    nome: entry(c.classRef.revisionId)?.name ?? '',
    subclasse: c.subclassRef ? (entry(c.subclassRef.revisionId)?.name ?? '') : '',
    nivel: c.level,
  }));
  for (const [ability, value] of Object.entries(state.totals))
    sheet.atributos[ability].valor = value!;
  sheet.combate.ca = defenses.armorClass;
  sheet.combate.escudo = !!draft.equippedRefs?.some((r) => {
    const e = entry(r.revisionId);
    return e?.kind === 'equipamento' && e.data.shield;
  });
  sheet.combate.pvMaximos = hp.total;
  sheet.combate.pvAtuais = hp.total;
  sheet.combate.dadosVida = hp.hitDice.map((d) => ({
    id: instanceUuid(`hit-die:${d.die}`),
    dado: `d${d.die}`,
    maximo: d.quantity,
    gastos: 0,
  }));
  sheet.combate.deslocamento = defenses.movements.find((m) => m.mode === 'terrestre')?.meters ?? 0;
  sheet.combate.deslocamentosAdicionais = defenses.movements
    .filter((m) => m.mode !== 'terrestre')
    .map((m) => ({ id: instanceUuid(`movement:${m.mode}`), nome: m.mode, valor: m.meters }));
  for (const instance of roots) {
    const e = instance.entry,
      key =
        e.kind === 'talento'
          ? 'talentos'
          : e.kind === 'caracteristica'
            ? instance.id.startsWith('species') || instance.id.startsWith('lineage')
              ? 'tracos'
              : 'caracteristicas'
            : null;
    if (key)
      sheet[key].push({ id: instanceUuid(instance.id), nome: e.name, descricao: e.description });
    if (e.kind === 'idioma' && !sheet.idiomas.some((i) => i.nome === e.name))
      sheet.idiomas.push({ id: instanceUuid(instance.id), nome: e.name });
  }
  const degrees: Record<string,number> = { meia: 1, proficiente: 2, especializacao: 3 };
  for (const grant of state.concessions.proficiencyGrants) {
    const p = catalog.proficiencies.find((p) => p.id === grant.proficiencyId);
    if (!p) continue;
    if (p.type === 'pericia' && p.skill && sheet.pericias[p.skill]) {
      const old = sheet.pericias[p.skill].grau;
      if ((degrees[old] ?? 0) < degrees[grant.degree]) sheet.pericias[p.skill].grau = grant.degree;
    }
    if (p.type === 'salvaguarda' && p.ability)
      sheet.atributos[p.ability].resistenciaProficiente = true;
    if (p.type === 'categoria' && p.category) {
      const training: Record<string,'leves'|'medias'|'pesadas'|'escudos'> = {
        'armadura-leve': 'leves',
        'armadura-media': 'medias',
        'armadura-pesada': 'pesadas',
        escudo: 'escudos',
      }; const key=training[p.category];
      if (key) sheet.treinamento[key] = true;
      else
        sheet.treinamento.armas = [sheet.treinamento.armas, p.category].filter(Boolean).join('; ');
    }
    if (p.type === 'equipamento' && p.equipment) {
      const e = entry(p.equipment.revisionId);
      sheet.treinamento.ferramentas = [sheet.treinamento.ferramentas, e?.name]
        .filter(Boolean)
        .join('; ');
    }
    if (p.type === 'idioma' && p.language) {
      const e = entry(p.language.revisionId);
      if (e && !sheet.idiomas.some((i) => i.nome === e.name))
        sheet.idiomas.push({ id: instanceUuid(`language:${e.ref.recordId}`), nome: e.name });
    }
  }
  for (const { instance, effect } of state.concessions.effects) {
    const value = evaluateFormula(effect.formula, {
      abilities: state.totals,
      level: state.level,
      classLevel: instance.level,
      proficiency: state.proficiency,
    });
    if (effect.type === 'iniciativa_bonus') sheet.combate.ajusteIniciativa += value;
    if (effect.type === 'percepcao_bonus') sheet.combate.ajustePercepcaoPassiva += value;
    const defenseKeys: Partial<Record<typeof effect.type,'resistencias'|'imunidades'|'vulnerabilidades'>> = {
      resistencia: 'resistencias',
      imunidade: 'imunidades',
      vulnerabilidade: 'vulnerabilidades',
    }; const key=defenseKeys[effect.type];
    if (key)
      sheet.combate[key] = [sheet.combate[key], ...effect.defenses.map((d) => d.damageType)]
        .filter(Boolean)
        .join('; ');
    for (const r of effect.resources)
      sheet.recursos.push({
        id: instanceUuid(`${instance.id}/resource:${effect.id}:${r.name}`),
        nome: r.name,
        maximo: value,
        gastos: 0,
        recuperacao: r.recovery,
      });
  }
  function item(revision: string, key: string, quantity: number) {
    const e = entry(revision);
    if (e?.kind !== 'equipamento') return;
    const d = e.data;
    const row: EquipmentItem = {
      ...novaEntrada('inventario.itens'),
      id: instanceUuid(key),
      nome: e.name,
      quantidade: quantity,
      peso: d.weight === null ? 0 : d.weightUnit === 'kg' ? d.weight : d.weight * 0.45359237,
      equipado: !!draft.equippedRefs?.some((r) => r.revisionId === revision),
      descricao: e.description,
      tipo: d.weapon ? 'arma' : d.armor ? 'armadura' : d.shield ? 'escudo' : 'basico',
    };
    if (d.armor)
      Object.assign(row, {
        categoriaArmadura: d.category.includes('pesad')
          ? 'pesada'
          : d.category.includes('media')
            ? 'media'
            : 'leve',
        caBase: d.armor.baseAc,
        adicionarDestreza: d.armor.addDexterity,
        limiteDestreza: d.armor.dexterityLimit,
        forcaMinima: d.armor.strengthMinimum ?? 0,
        desvantagemFurtividade: d.armor.stealthDisadvantage,
      });
    if (d.shield) row.bonusCa = d.shield.acBonus;
    if (d.weapon)
      Object.assign(row, {
        categoriaArma: d.category.includes('marcial') ? 'marcial' : 'simples',
        alcanceArma: d.weapon.rangeType,
        critico: d.weapon.criticalMinimum,
      });
    sheet.inventario.itens.push(row);
  }
  for (const instance of roots) {
    const e = instance.entry;
    if (e.kind === 'equipamento') item(e.ref.revisionId, instance.id, 1);
    if (e.kind === 'pacote')
      for (const row of e.data.items) {
        if (row.equipmentRef)
          item(row.equipmentRef.revisionId, `${instance.id}/item:${row.id}`, row.quantity);
        if (row.currencyRef) {
          const currency = entry(row.currencyRef.revisionId);
          if (currency?.kind === 'moeda') {
            const code = currency.data.code.toLowerCase() as keyof typeof sheet.inventario.moedas;
            if (Object.hasOwn(sheet.inventario.moedas, code))
              sheet.inventario.moedas[code] += row.quantity;
          }
        }
      }
  }
  for (const profile of casting.profiles) {
    const instance = roots.find((i) => profile.id.startsWith(`${i.id}/casting:`));
    const definition = catalog.castingProfiles.find(
      (p) => p.ownerRevisionId === profile.ownerRevisionId && profile.id.endsWith(`:${p.id}`),
    );
    const profileId = instanceUuid(profile.id);
    sheet.conjuracao.perfis.push({
      ...novaEntrada('conjuracao.perfis'),
      id: profileId,
      nome: instance?.entry.name ?? 'Conjuração',
      classeId: instance?.classEntryId ?? '',
      atributo: profile.ability ?? 'int',
    });
    const fixed = definition?.spells.filter((s) => s.level <= (instance?.level ?? 0)) ?? [];
    const selected = draft.spellSelections.filter((s) => s.profileId === profile.id);
    for (const spell of [
      ...fixed.map((s) => ({ spellRef: s.spellRef, prepared: s.alwaysPrepared })),
      ...selected,
    ]) {
      const e = entry(spell.spellRef.revisionId);
      if (
        e?.kind !== 'magia' ||
        sheet.magias.some(
          (s) => s.perfilId === profileId && s.compendioRef?.revisionId === e.ref.revisionId,
        )
      )
        continue;
      const row = spellToSheet(e, profileId);
      row.id = instanceUuid(`${profile.id}/spell:${e.ref.recordId}`);
      row.preparada = spell.prepared;
      sheet.magias.push(row);
    }
    for (const s of fixed.filter((s) => s.ownUses !== null))
      sheet.recursos.push({
        id: instanceUuid(`${profile.id}/uses:${s.spellRef.recordId}`),
        nome: `${entry(s.spellRef.revisionId)?.name ?? 'Magia'} (${instance?.entry.name})`,
        maximo: s.ownUses!,
        gastos: 0,
        recuperacao: s.recovery ?? 'manual',
      });
  }
  for (const slot of casting.slots)
    sheet.conjuracao.espacos[slot.circle - 1] = {
      circulo: slot.circle,
      total: slot.total,
      gastos: 0,
      ativo: true,
    };
  if (casting.pactSlots.length)
    sheet.conjuracao.pacto = {
      circulo: casting.pactSlots[0].circle,
      total: casting.pactSlots.reduce((n, s) => n + s.total, 0),
      gastos: 0,
    };
  return sheet;
}
