//#region packages/sheets/calculos.js
function modificador(valor, ajuste = 0) {
	return Math.floor((valor - 10) / 2) + ajuste;
}
function nivelTotal(classes) {
	return classes.reduce((n, c) => n + c.nivel, 0);
}
function proficiencia(nivel, ajuste = 0) {
	return 2 + Math.floor((nivel - 1) / 4) + ajuste;
}
function calcularFicha(c) {
	const nivel = nivelTotal(c.classes), p = proficiencia(nivel, c.combate.ajusteProficiencia);
	const atributos = Object.fromEntries(Object.entries(c.atributos).map(([k, v]) => [k, modificador(v.valor, v.ajusteModificador)]));
	const resistencias = Object.fromEntries(Object.entries(c.atributos).map(([k, v]) => [k, atributos[k] + (v.resistenciaProficiente ? p : 0) + v.ajusteResistencia]));
	const graus = {
		nenhuma: 0,
		meia: Math.floor(p / 2),
		proficiente: p,
		especializacao: 2 * p
	};
	const pericias = Object.fromEntries(Object.entries(c.pericias).map(([k, v]) => [k, atributos[v.atributo] + graus[v.grau] + v.ajuste]));
	return {
		nivel,
		proficiencia: p,
		atributos,
		resistencias,
		pericias,
		perfis: Object.fromEntries(c.conjuracao.perfis.map((x) => {
			const mod = atributos[x.atributo] + x.ajusteModificador;
			return [x.id, {
				modificador: mod,
				cd: 8 + p + mod + x.ajusteCd,
				ataque: p + mod + x.ajusteAtaque
			}];
		})),
		iniciativa: atributos.des + c.combate.ajusteIniciativa,
		percepcaoPassiva: 10 + pericias.percepcao + c.combate.ajustePercepcaoPassiva
	};
}
//#endregion
//#region packages/sheets/equipamentos.js
var TIPOS_EQUIPAMENTO = {
	basico: "Básico",
	arma: "Arma",
	armadura: "Armadura",
	escudo: "Escudo"
};
function formulaDano(dano, atributos) {
	const formula = dano.dado.trim();
	if (!formula) return "";
	const mod = dano.atributo ? atributos[dano.atributo] : 0;
	return formula + (mod ? (mod > 0 ? "+" : "") + mod : "");
}
function validarFormulaDano(expression) {
	if (!expression) return "";
	const expr = expression.toLowerCase().replace(/\s/g, "");
	if (expression.length > 120) return "A fórmula total deve ter até 120 caracteres. Simplifique ou divida os danos em ataques separados.";
	if (!/^[+-]?([0-9]{1,3}d[0-9]{1,4}(k[hl][0-9]{1,3})?|[0-9]{1,4})([+-]([0-9]{1,3}d[0-9]{1,4}(k[hl][0-9]{1,3})?|[0-9]{1,4}))*$/.test(expr)) return "Use uma soma ou subtração de dados e números, como 1d8+4+1d6.";
	let total = 0;
	for (const match of expr.matchAll(/(\d+)d(\d+)(?:k([hl])(\d+))?/g)) {
		const n = Number(match[1]), faces = Number(match[2]), keep = Number(match[4] || n);
		total += n;
		if (n < 1 || faces < 2 || faces > 1e3 || keep < 1 || keep > n || total > 100) return "Use até 100 dados no total, com 2 a 1.000 faces e uma seleção válida.";
	}
	return "";
}
/** @param {import('../contracts/sheets').SheetContent} content */
function sincronizarEquipamentos(content) {
	const c = structuredClone(content), calc = calcularFicha(c);
	for (const attack of c.ataques) {
		if (!attack.itemId || !attack.atributo) continue;
		const item = c.inventario.itens.find((x) => x.id === attack.itemId);
		if (!item) continue;
		attack.valor = calc.atributos[attack.atributo] + (attack.bonus ?? 0) + (attack.proficiente ? calc.proficiencia : 0);
		attack.critico = item.critico ?? 20;
		const damages = (attack.danos || []).filter((x) => x.dado.trim());
		attack.dano = damages.map((x) => formulaDano(x, calc.atributos).trim().replace(/^\+\s*/, "")).join("+").replace(/\+\-/g, "-").replace(/\s/g, "");
		attack.tipoDano = [...new Set(damages.map((x) => x.tipo.trim()).filter(Boolean))].join(" / ");
	}
	return c;
}
function validarEquipamentos(c) {
	const errors = [], ids = new Set(c.inventario.itens.map((x) => x.id));
	const damageIds = /* @__PURE__ */ new Set();
	for (const list of [
		c.classes,
		c.ataques,
		c.recursos,
		c.magias,
		c.inventario.itens,
		c.conjuracao.perfis,
		c.inventario.sintonizados,
		c.caracteristicas,
		c.tracos,
		c.talentos,
		c.idiomas,
		c.combate.dadosVida,
		c.combate.deslocamentosAdicionais,
		c.combate.condicoes
	]) for (const x of list) damageIds.add(x.id);
	const error = (campo, mensagem) => errors.push({
		campo,
		mensagem
	});
	function number(value, path, min, max) {
		if (value !== void 0 && (!Number.isInteger(value) || value < min || value > max)) error(path, `Informe um número inteiro entre ${min} e ${max}.`);
	}
	function choice(value, path, options) {
		if (value !== void 0 && !options.includes(value)) error(path, "Escolha uma opção válida.");
	}
	function flag(value, path) {
		if (value !== void 0 && typeof value !== "boolean") error(path, "Informe uma opção válida.");
	}
	function text(value, path, max = 120) {
		if (value !== void 0 && (typeof value !== "string" || value.length > max)) error(path, "Texto inválido ou acima do limite.");
	}
	c.inventario.itens.forEach((item, i) => {
		const path = `inventario.itens.${i}.`;
		choice(item.tipo, path + "tipo", Object.keys(TIPOS_EQUIPAMENTO));
		text(item.descricao, path + "descricao", 1e4);
		choice(item.categoriaArma, path + "categoriaArma", ["simples", "marcial"]);
		choice(item.alcanceArma, path + "alcanceArma", ["corpo-a-corpo", "distancia"]);
		choice(item.categoriaArmadura, path + "categoriaArmadura", [
			"leve",
			"media",
			"pesada"
		]);
		number(item.critico, path + "critico", 1, 20);
		number(item.forcaMinima, path + "forcaMinima", 0, 99);
		number(item.caBase, path + "caBase", 0, 99);
		if (item.limiteDestreza !== null) number(item.limiteDestreza, path + "limiteDestreza", 0, 99);
		number(item.bonusCa, path + "bonusCa", -99, 99);
		number(item.outrosBonus, path + "outrosBonus", -99, 99);
		flag(item.adicionarDestreza, path + "adicionarDestreza");
		flag(item.desvantagemFurtividade, path + "desvantagemFurtividade");
	});
	for (const [path, list] of [["ataques", c.ataques], ["recursos", c.recursos]]) list.forEach((entry, i) => {
		if (entry.itemId !== void 0 && (typeof entry.itemId !== "string" || !ids.has(entry.itemId))) error(`${path}.${i}.itemId`, "O equipamento vinculado não existe.");
		if (path !== "ataques") return;
		const p = `${path}.${i}.`;
		choice(entry.atributo, p + "atributo", Object.keys(ATRIBUTOS));
		number(entry.bonus, p + "bonus", -99, 99);
		number(entry.critico, p + "critico", 1, 20);
		flag(entry.proficiente, p + "proficiente");
		if (entry.danos === void 0) return;
		const formulaError = validarFormulaDano(entry.dano);
		if (formulaError) error(p + "danos", formulaError);
		if (!Array.isArray(entry.danos) || entry.danos.length > 20) {
			error(p + "danos", "Informe até 20 danos por ataque.");
			return;
		}
		entry.danos.forEach((d, j) => {
			const dp = p + `danos.${j}.`;
			if (!d || typeof d !== "object") {
				error(dp, "Dano inválido.");
				return;
			}
			if (!UUID$1.test(d.id) || damageIds.has(d.id)) error(dp + "id", "Identificador inválido ou duplicado.");
			damageIds.add(d.id);
			text(d.dado ?? null, dp + "dado");
			text(d.tipo ?? null, dp + "tipo");
			choice(d.atributo ?? null, dp + "atributo", ["", ...Object.keys(ATRIBUTOS)]);
		});
	});
	const linked = /* @__PURE__ */ new Set();
	c.inventario.sintonizados.forEach((x, i) => {
		if (x.itemId && linked.has(x.itemId)) error(`inventario.sintonizados.${i}.itemId`, "Este item já está sintonizado.");
		if (x.itemId) linked.add(x.itemId);
	});
	if (c.inventario.sintonizados.length > c.inventario.limiteSintonizacao) error("inventario.sintonizados", "O limite de sintonia foi excedido.");
	c.magias.forEach((x, i) => text(x.compendioId, `magias.${i}.compendioId`));
	c.conjuracao.espacos.forEach((x, i) => flag(x.ativo, `conjuracao.espacos.${i}.ativo`));
	return errors;
}
//#endregion
//#region packages/sheets/magias.js
/** @param {import('../contracts/sheets').SheetSpell} spell
* @returns {import('../contracts/sheets').AttackDamage[]} */
function danosMagia(spell) {
	if (Array.isArray(spell.danos)) return spell.danos;
	return typeof spell.dano === "string" && spell.dano.trim() ? [{
		id: spell.id,
		dado: spell.dano,
		atributo: "",
		tipo: spell.tipoDano || ""
	}] : [];
}
/** @param {import('../contracts/sheets').SheetSpell} spell
* @param {Record<string, number>} attributes */
function formulasMagia(spell, attributes) {
	return danosMagia(spell).filter((d) => d.dado.trim()).map((d) => ({
		...d,
		formula: formulaDano(d, attributes).toLowerCase().replace(/\s/g, "").replace(/^\+/, "")
	}));
}
/** @param {import('../contracts/sheets').SheetContent} c */
function validarMagias(c) {
	const errors = [], ids = /* @__PURE__ */ new Set();
	const error = (campo, mensagem) => errors.push({
		campo,
		mensagem
	});
	for (const list of [
		c.classes,
		c.ataques,
		c.recursos,
		c.magias,
		c.inventario.itens,
		c.conjuracao.perfis,
		c.inventario.sintonizados,
		c.caracteristicas,
		c.tracos,
		c.talentos,
		c.idiomas,
		c.combate.dadosVida,
		c.combate.deslocamentosAdicionais,
		c.combate.condicoes
	]) for (const e of list) ids.add(e.id);
	for (const a of c.ataques) if (Array.isArray(a.danos)) {
		for (const d of a.danos) if (d?.id) ids.add(d.id);
	}
	const attrs = calcularFicha(c).atributos;
	c.magias.forEach((s, i) => {
		const p = "magias." + i;
		if (s.tipoDano !== void 0 && (typeof s.tipoDano !== "string" || s.tipoDano.length > 1e4)) error(p + ".tipoDano", "Informe um tipo de dano válido.");
		if (s.dano !== void 0 && (typeof s.dano !== "string" || s.dano.length > 120)) error(p + ".dano", "A fórmula total deve ter até 120 caracteres.");
		if (s.danos === void 0) {
			if (typeof s.dano === "string" && s.dano.trim()) {
				const e = validarFormulaDano(s.dano);
				if (e) error(p + ".dano", e);
			}
			return;
		}
		if (!Array.isArray(s.danos) || s.danos.length > 20) {
			error(p + ".danos", "Informe até 20 parcelas de dano por magia.");
			return;
		}
		let correct = true;
		s.danos.forEach((d, j) => {
			const path = p + ".danos." + j;
			if (!d || typeof d !== "object" || Array.isArray(d)) {
				error(path, "Dano inválido.");
				correct = false;
				return;
			}
			if (typeof d.id !== "string" || !UUID$1.test(d.id) || ids.has(d.id)) {
				error(path + ".id", "Identificador inválido ou duplicado.");
				correct = false;
			}
			ids.add(d.id);
			if (typeof d.dado !== "string" || d.dado.length > 120) {
				error(path + ".dado", "Informe uma fórmula de até 120 caracteres.");
				correct = false;
			} else if (d.dado.trim()) {
				const e = validarFormulaDano(d.dado);
				if (e) {
					error(path + ".dado", e);
					correct = false;
				}
			}
			if (typeof d.tipo !== "string" || d.tipo.length > 120) {
				error(path + ".tipo", "Informe um tipo de dano de até 120 caracteres.");
				correct = false;
			}
			if (!["", ...Object.keys(ATRIBUTOS)].includes(d.atributo)) {
				error(path + ".atributo", "Escolha um atributo válido.");
				correct = false;
			}
		});
		if (correct) {
			const expr = formulasMagia(s, attrs).map((d) => d.formula).join("+").replace(/\+-/g, "-");
			if (expr) {
				const e = validarFormulaDano(expr);
				if (e) error(p + ".danos", e.replace("em ataques separados", "em ações separadas"));
			}
		}
	});
	return errors;
}
//#endregion
//#region packages/character-creation/validation.js
var UUID$2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var ABILITIES = [
	"for",
	"des",
	"con",
	"int",
	"sab",
	"car"
];
var object = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var integer = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
var list = (v, max, fn) => Array.isArray(v) && v.length <= max && v.every(fn);
var text = (v, max) => typeof v === "string" && v.length <= max;
var ref = (v) => object(v) && UUID$2.test(v.recordId) && UUID$2.test(v.revisionId) && Object.keys(v).length === 2;
var nullableRef = (v) => v === null || ref(v);
var scores = (v, min, max) => object(v) && Object.entries(v).every(([key, n]) => ABILITIES.includes(key) && integer(n, min, max));
/** @param {unknown} value @returns {value is import('../contracts/character-creation').CreationDraft} */
function validCreationDraft(value) {
	const d = value;
	if (!object(d) || !UUID$2.test(d.id) || d.engineVersion !== 1 || !text(d.ruleSetId, 80) || !/^[a-z0-9-]+$/.test(d.ruleSetId)) return false;
	const a = d.abilities;
	if (!object(a) || !["rolls", "external"].includes(a.mode) || !list(a.sets, 2, (s) => list(s, 6, (n) => integer(n, 3, 18))) || !(a.selectedSet === null || integer(a.selectedSet, 0, 1)) || !scores(a.assignment, 0, 5) || !scores(a.external, 1, 30) || !scores(a.backgroundBonuses, 0, 3)) return false;
	if (!nullableRef(d.speciesRef) || !nullableRef(d.lineageRef) || !nullableRef(d.backgroundRef) || !(d.size === null || text(d.size, 80)) || !text(d.form, 120)) return false;
	if (!list(d.classes, 20, (c) => object(c) && UUID$2.test(c.id) && ref(c.classRef) && nullableRef(c.subclassRef) && integer(c.level, 1, 20)) || !list(d.levels, 20, (l) => object(l) && integer(l.totalLevel, 1, 20) && UUID$2.test(l.classEntryId) && [
		"fixed",
		"roll",
		"external"
	].includes(l.hitPointMethod) && (l.hitPointRoll === null || integer(l.hitPointRoll, 1, 12)))) return false;
	if (!list(d.choices, 500, (c) => object(c) && UUID$2.test(c.groupId) && text(c.sourceInstanceId, 4096) && list(c.values, 100, (v) => object(v) && (v.type === "option" ? UUID$2.test(v.optionId) : v.type === "record" ? ref(v.ref) : v.type === "ability" ? ABILITIES.includes(v.ability) && integer(v.amount, 1, 3) : v.type === "proficiency" ? UUID$2.test(v.proficiencyId) : v.type === "text" && text(v.value, 1e3))))) return false;
	return list(d.equipmentOptions, 100, (e) => object(e) && UUID$2.test(e.ownerRevisionId) && UUID$2.test(e.optionId)) && (d.equippedRefs === void 0 || list(d.equippedRefs, 100, ref)) && list(d.spellSelections, 1e3, (s) => object(s) && text(s.profileId, 4096) && ref(s.spellRef) && typeof s.prepared === "boolean") && list(d.castingAbilities, 100, (s) => object(s) && text(s.profileId, 4096) && ABILITIES.includes(s.ability));
}
/** @param {unknown} value @returns {value is import('../contracts/character-creation').CreationSnapshot} */
function validCreationSnapshot(value) {
	const s = value;
	return object(s) && s.schemaVersion === 1 && validCreationDraft(s.draft) && list(s.contributions, 1e3, (c) => object(c) && UUID$2.test(c.id) && UUID$2.test(c.sourceRevisionId) && (c.sourceRecordId === void 0 || UUID$2.test(c.sourceRecordId)) && text(c.sourceInstanceId, 4096) && (c.grantId === null || UUID$2.test(c.grantId)) && text(c.target, 80) && text(c.name, 240) && (c.amount === null || typeof c.amount === "number" && Number.isFinite(c.amount) && Math.abs(c.amount) <= 1e6));
}
//#endregion
//#region packages/sheets/modelo.js
var ATRIBUTOS = {
	for: "Força",
	des: "Destreza",
	con: "Constituição",
	int: "Inteligência",
	sab: "Sabedoria",
	car: "Carisma"
};
var PERICIAS = {
	acrobacia: ["Acrobacia", "des"],
	adestrarAnimais: ["Adestrar Animais", "sab"],
	arcanismo: ["Arcanismo", "int"],
	atletismo: ["Atletismo", "for"],
	atuacao: ["Atuação", "car"],
	enganacao: ["Enganação", "car"],
	furtividade: ["Furtividade", "des"],
	historia: ["História", "int"],
	intimidacao: ["Intimidação", "car"],
	intuicao: ["Intuição", "sab"],
	investigacao: ["Investigação", "int"],
	medicina: ["Medicina", "sab"],
	natureza: ["Natureza", "int"],
	percepcao: ["Percepção", "sab"],
	persuasao: ["Persuasão", "car"],
	prestidigitacao: ["Prestidigitação", "des"],
	religiao: ["Religião", "int"],
	sobrevivencia: ["Sobrevivência", "sab"]
};
var ENTRADAS = {
	classes: {
		nome: "",
		subclasse: "",
		nivel: 1
	},
	"combate.dadosVida": {
		dado: "d8",
		maximo: 1,
		gastos: 0
	},
	"combate.deslocamentosAdicionais": {
		nome: "",
		valor: 0
	},
	"combate.condicoes": { nome: "" },
	ataques: {
		nome: "",
		tipo: "bonus",
		valor: 0,
		dano: "",
		tipoDano: "",
		observacoes: ""
	},
	caracteristicas: {
		nome: "",
		descricao: ""
	},
	tracos: {
		nome: "",
		descricao: ""
	},
	talentos: {
		nome: "",
		descricao: ""
	},
	idiomas: { nome: "" },
	recursos: {
		nome: "",
		maximo: 0,
		gastos: 0,
		recuperacao: "manual"
	},
	"conjuracao.perfis": {
		nome: "",
		classeId: "",
		atributo: "int",
		ajusteModificador: 0,
		ajusteCd: 0,
		ajusteAtaque: 0
	},
	magias: {
		perfilId: "",
		circulo: 0,
		nome: "",
		preparada: false,
		tempo: "",
		alcance: "",
		concentracao: false,
		ritual: false,
		verbal: false,
		somatico: false,
		material: "",
		duracao: "",
		descricao: "",
		observacoes: ""
	},
	"inventario.itens": {
		nome: "",
		quantidade: 1,
		peso: 0,
		equipado: false,
		cargasMaximas: 0,
		cargasGastas: 0,
		observacoes: ""
	},
	"inventario.sintonizados": {
		nome: "",
		itemId: ""
	}
};
var UUID$1 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function novaEntrada(caminho) {
	return {
		id: crypto.randomUUID(),
		...structuredClone(ENTRADAS[caminho])
	};
}
function criarConteudo() {
	return {
		identidade: {
			jogador: "",
			campanha: "",
			especie: "",
			antecedente: "",
			tamanho: "Médio",
			experiencia: 0
		},
		classes: [novaEntrada("classes")],
		atributos: Object.fromEntries(Object.keys(ATRIBUTOS).map((k) => [k, {
			valor: 10,
			ajusteModificador: 0,
			resistenciaProficiente: false,
			ajusteResistencia: 0
		}])),
		pericias: Object.fromEntries(Object.entries(PERICIAS).map(([k, [, a]]) => [k, {
			atributo: a,
			grau: "nenhuma",
			ajuste: 0
		}])),
		combate: {
			ca: 10,
			escudo: false,
			ajusteProficiencia: 0,
			ajusteIniciativa: 0,
			deslocamento: 9,
			unidade: "metros",
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
			concentracaoAtiva: "",
			resistencias: "",
			imunidades: "",
			vulnerabilidades: "",
			sentidos: ""
		},
		ataques: [],
		caracteristicas: [],
		tracos: [],
		talentos: [],
		idiomas: [],
		treinamento: {
			leves: false,
			medias: false,
			pesadas: false,
			escudos: false,
			armas: "",
			ferramentas: ""
		},
		conjuracao: {
			perfis: [],
			espacos: Array.from({ length: 9 }, (_, i) => ({
				circulo: i + 1,
				total: 0,
				gastos: 0
			})),
			pacto: {
				circulo: 1,
				total: 0,
				gastos: 0
			}
		},
		magias: [],
		inventario: {
			itens: [],
			moedas: {
				pc: 0,
				pp: 0,
				pe: 0,
				po: 0,
				pl: 0
			},
			limiteSintonizacao: 3,
			sintonizados: []
		},
		recursos: [],
		historia: {
			aparencia: "",
			alinhamento: "",
			historia: "",
			personalidade: "",
			tracosPersonalidade: "",
			ideais: "",
			vinculos: "",
			defeitos: "",
			anotacoes: ""
		}
	};
}
function validarFicha(f) {
	const erros = [];
	const erro = (campo, mensagem) => erros.push({
		campo,
		mensagem
	});
	if (f?.conteudo?.criacao !== void 0 && !validCreationSnapshot(f.conteudo.criacao)) erro("conteudo.criacao", "O histórico de criação está inválido.");
	if (Array.isArray(f?.conteudo?.magias)) {
		for (const [i, s] of f.conteudo.magias.entries()) if (s?.compendioRef !== void 0 && (!s.compendioRef || !UUID$1.test(s.compendioRef.recordId) || !UUID$1.test(s.compendioRef.revisionId))) erro(`magias.${i}.compendioRef`, "A referência do compêndio está inválida.");
	}
	if (typeof f.nome !== "string" || !f.nome.trim() || f.nome.trim().length > 120) erro("nome", "Informe um nome de 1 a 120 caracteres.");
	if (f.versao_esquema !== 1) erro("versao_esquema", "Versão da ficha não suportada.");
	const padrao = criarConteudo(), ids = /* @__PURE__ */ new Set();
	function validar(v, p, caminho) {
		if (Array.isArray(p)) {
			if (!Array.isArray(v)) {
				erro(caminho, "Informe uma lista válida.");
				return;
			}
			if (v.length > 1e3) erro(caminho, "Há entradas demais nesta lista.");
			const template = caminho === "conjuracao.espacos" ? {
				circulo: 1,
				total: 0,
				gastos: 0
			} : ENTRADAS[caminho];
			if (caminho === "conjuracao.espacos" && (v.length !== 9 || v.some((x, i) => x?.circulo !== i + 1))) erro(caminho, "Informe os nove círculos de magia em ordem.");
			v.forEach((x, i) => validar(x, template ? {
				...caminho === "conjuracao.espacos" ? {} : { id: "" },
				...template
			} : p[0], caminho + "." + i));
			return;
		}
		if (p && typeof p === "object") {
			if (!v || typeof v !== "object" || Array.isArray(v)) {
				erro(caminho, "Preencha esta seção da ficha.");
				return;
			}
			for (const k of Object.keys(p)) validar(v[k], p[k], caminho ? caminho + "." + k : k);
			const total = v.maximo ?? v.total ?? v.cargasMaximas;
			const gasto = v.gastos ?? v.cargasGastas;
			if (typeof total === "number" && typeof gasto === "number" && gasto > total) erro(caminho, "O gasto não pode superar o total.");
			return;
		}
		if (typeof v !== typeof p) {
			erro(caminho, "Valor inválido.");
			return;
		}
		const key = caminho.split(".").pop();
		if (typeof p === "number") {
			let min = 0, max = 9999, inteiro = true;
			if (key.startsWith("ajuste")) {
				min = -99;
				max = 99;
			} else if (key === "pvAtuais") min = -9999;
			else if (key === "pvMaximos") min = 1;
			else if (key === "nivel") {
				min = 1;
				max = 20;
			} else if (caminho.startsWith("atributos.") && key === "valor") {
				min = 1;
				max = 99;
			} else if (key === "valor" && caminho.startsWith("ataques.")) {
				const linked = f.conteudo?.ataques?.[Number(caminho.split(".")[1])]?.itemId;
				min = linked ? -9999 : -99;
				max = linked ? 9999 : 99;
			} else if (key === "circulo") max = 9;
			else if (key === "sucessosMorte" || key === "falhasMorte") max = 3;
			else if (key === "exaustao") max = 6;
			else if (caminho.startsWith("inventario.moedas.")) max = 999999999;
			else if (key === "experiencia") max = 999999999;
			if (key === "peso" || key === "deslocamento" || caminho.startsWith("combate.deslocamentosAdicionais.")) inteiro = false;
			if (!Number.isFinite(v) || v < min || v > max || inteiro && !Number.isInteger(v)) erro(caminho, "Informe um número " + (inteiro ? "inteiro " : "") + "entre " + min + " e " + max + ".");
		}
		if (typeof p === "string") {
			const longo = /^ataques\.\d+\.(dano|tipoDano)$/.test(caminho) && Array.isArray(f.conteudo?.ataques?.[Number(caminho.split(".")[1])]?.danos) || /descricao|observacoes|historia|aparencia|personalidade|Personalidade|ideais|vinculos|defeitos|anotacoes|resistencias|imunidades|vulnerabilidades|sentidos|ferramentas|armas|material/.test(caminho);
			if (v.length > (longo ? 1e4 : 120)) erro(caminho, "Texto acima do limite permitido.");
			if (key === "id") {
				if (!UUID$1.test(v) || ids.has(v)) erro(caminho, "Identificador inválido ou duplicado.");
				ids.add(v);
			}
			if (key === "atributo" && !Object.hasOwn(ATRIBUTOS, v)) erro(caminho, "Escolha um atributo válido.");
			if (key === "grau" && ![
				"nenhuma",
				"meia",
				"proficiente",
				"especializacao"
			].includes(v)) erro(caminho, "Escolha a proficiência.");
			if (key === "tipo" && !["bonus", "cd"].includes(v)) erro(caminho, "Escolha bônus ou CD.");
			if (key === "recuperacao" && ![
				"curto",
				"longo",
				"manual"
			].includes(v)) erro(caminho, "Escolha a recuperação.");
			if (key === "dado" && ![
				"d6",
				"d8",
				"d10",
				"d12"
			].includes(v)) erro(caminho, "Escolha o dado de vida.");
		}
	}
	validar(f.conteudo, padrao, "");
	if (erros.length === 0) {
		erros.push(...validarEquipamentos(f.conteudo));
		erros.push(...validarMagias(f.conteudo));
		if (f.conteudo.classes.length === 0 || f.conteudo.classes.reduce((s, x) => s + x.nivel, 0) > 20) erro("classes", "O nível total deve ser de 1 a 20.");
		const refs = [
			[
				"conjuracao.perfis",
				"classeId",
				new Set(f.conteudo.classes.map((x) => x.id))
			],
			[
				"magias",
				"perfilId",
				new Set(f.conteudo.conjuracao.perfis.map((x) => x.id))
			],
			[
				"inventario.sintonizados",
				"itemId",
				new Set(f.conteudo.inventario.itens.map((x) => x.id))
			]
		];
		for (const [path, key, validos] of refs) if (path.split(".").reduce((o, k) => o[k], f.conteudo).some((x) => x[key] && !validos.has(x[key]))) erro(path, "A origem selecionada não existe mais.");
	}
	try {
		if (new TextEncoder().encode(JSON.stringify(f.conteudo)).length > 245760) erro("conteudo", "A ficha excede o tamanho permitido.");
	} catch {
		erro("conteudo", "Conteúdo inválido.");
	}
	return erros;
}
//#endregion
//#region packages/character-creation/abilities.ts
var abilities = [
	"for",
	"des",
	"con",
	"int",
	"sab",
	"car"
];
var modifier = (score) => Math.floor((score - 10) / 2);
function orderedAbilityBonuses(bonuses) {
	return [...bonuses].sort((a, b) => a.instance.acquiredAt - b.instance.acquiredAt || a.limit - b.limit || a.instance.id.localeCompare(b.instance.id));
}
function resolveAbilities(catalog, draft) {
	const base = {}, totals = {}, problems = [];
	const problem = (code, field, message) => problems.push({
		code,
		field,
		message
	});
	const a = draft.abilities;
	if (a.mode === "rolls") {
		if (a.sets.length !== 2 || a.sets.some((set) => set.length !== 6 || set.some((n) => !Number.isInteger(n) || n < 3 || n > 18))) problem("INVALID_SETS", "abilities.sets", "Gere os dois conjuntos de seis resultados de 4d6.");
		if (a.selectedSet !== 0 && a.selectedSet !== 1) problem("SET_REQUIRED", "abilities.selectedSet", "Escolha um dos dois conjuntos.");
		const used = /* @__PURE__ */ new Set();
		for (const ability of abilities) {
			const index = a.assignment[ability];
			if (index === void 0 || !Number.isInteger(index) || index < 0 || index > 5) problem("ASSIGNMENT_REQUIRED", `abilities.${ability}`, "Distribua um resultado para cada atributo.");
			else if (used.has(index)) problem("DUPLICATE_ROLL", `abilities.${ability}`, "Um resultado só pode ser usado em um atributo.");
			else {
				used.add(index);
				const value = a.selectedSet === null ? void 0 : a.sets[a.selectedSet]?.[index];
				if (value !== void 0) base[ability] = value;
			}
		}
	} else if (a.mode === "external") for (const ability of abilities) {
		const value = a.external[ability];
		if (value === void 0 || !Number.isInteger(value) || value < 1 || value > 30) problem("ABILITY_REQUIRED", `abilities.${ability}`, "Preencha um valor inteiro entre 1 e 30.");
		else base[ability] = value;
	}
	else problem("INVALID_MODE", "abilities.mode", "Escolha um método de atributos.");
	const bg = catalog.entries.find((e) => e.ref.revisionId === draft.backgroundRef?.revisionId && e.kind === "antecedente");
	const values = Object.values(a.backgroundBonuses).filter((v) => v !== 0).sort();
	if (bg?.kind === "antecedente") {
		if (!(bg.data.distribution === "nenhuma" ? values.length === 0 : bg.data.distribution === "personalizada" ? values.every((v) => Number.isInteger(v) && v >= 0 && v <= 2) && values.reduce((s, n) => s + n, 0) === 3 : JSON.stringify(values) === "[1,2]" || JSON.stringify(values) === "[1,1,1]") || Object.entries(a.backgroundBonuses).some(([k, v]) => !bg.data.abilities.includes(k) && v !== 0)) problem("BACKGROUND_BONUS", "abilities.backgroundBonuses", "Distribua +2 e +1, ou três bônus de +1, entre os atributos permitidos pelo antecedente.");
	} else if (values.length) problem("BACKGROUND_REQUIRED", "backgroundRef", "Escolha o antecedente antes de distribuir seus bônus.");
	for (const ability of abilities) {
		const value = base[ability];
		if (value === void 0) continue;
		const bonus = a.backgroundBonuses[ability] ?? 0;
		totals[ability] = value + (Number.isInteger(bonus) ? bonus : 0);
		if (bg?.kind === "antecedente" && bonus > 0 && totals[ability] > bg.data.abilityLimit) problem("ABILITY_LIMIT", `abilities.${ability}`, `O bônus do antecedente não pode ultrapassar ${bg.data.abilityLimit}.`);
	}
	return {
		base,
		totals,
		problems
	};
}
//#endregion
//#region packages/character-creation/requirements.ts
function proficiencyKey(catalog, id) {
	const p = catalog.proficiencies.find((p) => p.id === id);
	return p ? JSON.stringify([
		p.type,
		p.skill ?? "",
		p.ability ?? "",
		p.category ?? "",
		p.equipment?.recordId ?? "",
		p.language?.recordId ?? ""
	]) : id;
}
function requirementMet(catalog, id, context, seen = /* @__PURE__ */ new Set()) {
	if (!id) return true;
	if (seen.has(id) || seen.size > 100) return false;
	const r = catalog.requirements.find((r) => r.id === id);
	if (!r) return false;
	const next = new Set(seen).add(id), children = catalog.requirements.filter((c) => c.parentId === id);
	const target = r.targetRef?.revisionId ?? "";
	switch (r.operator) {
		case "todos": return children.every((c) => requirementMet(catalog, c.id, context, next));
		case "qualquer": return children.length > 0 && children.some((c) => requirementMet(catalog, c.id, context, next));
		case "nivel": return context.level >= (r.minimum ?? Infinity);
		case "nivel-classe": return (context.classLevels.get(target) ?? 0) >= (r.minimum ?? Infinity);
		case "atributo": return !!r.ability && (context.abilities[r.ability] ?? 0) >= (r.minimum ?? Infinity);
		case "proficiencia": return !!r.proficiencyId && (context.proficiencies.has(r.proficiencyId) || context.proficiencies.has(proficiencyKey(catalog, r.proficiencyId)));
		case "especie":
		case "linhagem":
		case "caracteristica":
		case "talento": return context.records.has(target);
		case "repeticoes": return (context.repetitions.get(target) ?? 0) >= (r.minimum ?? Infinity);
		case "escolha": return context.choices.some((c) => c.groupId === r.choiceKey && c.values.length > 0);
		default: return false;
	}
}
//#endregion
//#region packages/character-creation/order.ts
var compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
var byId = (rows) => [...rows].sort((a, b) => compare(a.id, b.id));
function orderedCatalog(c) {
	return {
		...c,
		entries: [...c.entries].sort((a, b) => compare(a.ref.revisionId, b.ref.revisionId)).map((e) => e.kind === "pacote" ? {
			...e,
			data: {
				...e.data,
				items: byId(e.data.items)
			}
		} : e.kind === "classe" ? {
			...e,
			data: {
				...e.data,
				proficiencies: [...e.data.proficiencies].sort((a, b) => compare(a.proficiencyId, b.proficiencyId))
			}
		} : e),
		choices: byId(c.choices).map((g) => ({
			...g,
			options: byId(g.options)
		})),
		grants: byId(c.grants).sort((a, b) => a.level - b.level || compare(a.id, b.id)),
		requirements: byId(c.requirements),
		effects: byId(c.effects),
		proficiencies: byId(c.proficiencies),
		equipmentOptions: byId(c.equipmentOptions),
		castingProfiles: byId(c.castingProfiles).map((p) => ({
			...p,
			spells: [...p.spells].sort((a, b) => a.level - b.level || compare(a.spellRef.revisionId, b.spellRef.revisionId))
		})),
		multiclassSlots: [...c.multiclassSlots].sort((a, b) => a.level - b.level || a.circle - b.circle)
	};
}
//#endregion
//#region packages/character-creation/concessions.ts
function instanceUuid(key) {
	const words = [
		2166136261,
		2246822519,
		3266489917,
		668265263
	].map((seed) => {
		let value = seed;
		for (let i = 0; i < key.length; i++) value = Math.imul(value ^ key.charCodeAt(i), 16777619);
		return (value >>> 0).toString(16).padStart(8, "0");
	}).join("");
	return `${words.slice(0, 8)}-${words.slice(8, 12)}-4${words.slice(13, 16)}-8${words.slice(17, 20)}-${words.slice(20, 32)}`;
}
function resolveConcessions(catalog, draft) {
	catalog = orderedCatalog(catalog);
	const result = {
		masteries: [],
		instances: [],
		choices: [],
		effects: [],
		proficiencyGrants: [],
		abilityBonuses: [],
		contributions: [],
		problems: []
	};
	const problem = (code, field, message, sourceRevisionId) => result.problems.push({
		code,
		field,
		message,
		sourceRevisionId
	});
	const find = (ref) => ref && catalog.entries.find((e) => e.ref.recordId === ref.recordId && e.ref.revisionId === ref.revisionId);
	const totalLevel = draft.classes.reduce((n, c) => n + c.level, 0);
	const roots = [];
	const root = (ref, id, kind, level = 1, acquisition = "inicial", classEntryId = null, acquiredAt = 1) => {
		const entry = find(ref);
		if (!entry || entry.kind !== kind || entry.ruleSetId !== draft.ruleSetId) {
			problem("MISSING_REFERENCE", id, `Selecione um registro publicado de ${kind}.`);
			return;
		}
		roots.push({
			id,
			entry,
			level,
			acquisition,
			classEntryId,
			acquiredAt,
			grantId: null,
			ancestors: []
		});
	};
	root(draft.speciesRef, "species", "especie", Math.max(1, totalLevel));
	root(draft.backgroundRef, "background", "antecedente", Math.max(1, totalLevel));
	if (draft.lineageRef) {
		root(draft.lineageRef, "lineage", "linhagem", Math.max(1, totalLevel));
		const lineage = find(draft.lineageRef);
		if (lineage?.kind === "linhagem" && lineage.data.speciesRef.revisionId !== draft.speciesRef?.revisionId) problem("INVALID_LINEAGE", "lineageRef", "A linhagem não pertence à espécie selecionada.");
	}
	if (!draft.classes.length || totalLevel < 1 || totalLevel > 20 || !Number.isInteger(totalLevel)) problem("INVALID_LEVEL", "classes", "O nível total deve estar entre 1 e 20.");
	if (new Set(draft.classes.map((c) => c.id)).size !== draft.classes.length || new Set(draft.classes.map((c) => c.classRef.recordId)).size !== draft.classes.length) problem("DUPLICATE_CLASS", "classes", "Cada classe deve aparecer uma única vez.");
	const initialClass = draft.levels[0]?.classEntryId;
	for (const cls of draft.classes) {
		const acquiredAt = draft.levels.find((l) => l.classEntryId === cls.id)?.totalLevel ?? 1;
		root(cls.classRef, `class:${cls.id}`, "classe", cls.level, cls.id === initialClass ? "inicial" : "multiclasse", cls.id, acquiredAt);
		const sub = find(cls.subclassRef);
		if (sub?.kind === "subclasse") {
			if (sub.data.classRef.revisionId !== cls.classRef.revisionId || cls.level < sub.data.acquisitionLevel) problem("INVALID_SUBCLASS", `classes.${cls.id}`, "A subclasse não está disponível para esta classe e nível.");
			else root(cls.subclassRef, `subclass:${cls.id}`, "subclasse", cls.level, cls.id === initialClass ? "inicial" : "multiclasse", cls.id, draft.levels.filter((l) => l.classEntryId === cls.id)[sub.data.acquisitionLevel - 1]?.totalLevel ?? acquiredAt);
		} else if (cls.subclassRef) problem("MISSING_REFERENCE", `classes.${cls.id}.subclassRef`, "A revisão da subclasse não está disponível.");
		const classEntry = find(cls.classRef);
		if (!cls.subclassRef && (classEntry?.kind === "classe" && classEntry.data.subclassLevel !== void 0 && cls.level >= classEntry.data.subclassLevel || catalog.entries.some((e) => e.kind === "subclasse" && e.data.classRef.revisionId === classEntry?.ref.revisionId && cls.level >= e.data.acquisitionLevel))) problem("SUBCLASS_REQUIRED", `classes.${cls.id}.subclassRef`, "Escolha a subclasse.");
	}
	const base = resolveAbilities(catalog, draft).totals;
	function context(at) {
		const counts = /* @__PURE__ */ new Map();
		for (const level of draft.levels.filter((l) => l.totalLevel <= at)) {
			const cls = draft.classes.find((c) => c.id === level.classEntryId);
			if (cls) counts.set(cls.classRef.revisionId, (counts.get(cls.classRef.revisionId) ?? 0) + 1);
		}
		const owned = result.instances.filter((i) => i.acquiredAt <= at);
		const repetitions = /* @__PURE__ */ new Map();
		for (const i of owned) repetitions.set(i.entry.ref.revisionId, (repetitions.get(i.entry.ref.revisionId) ?? 0) + 1);
		const scores = { ...base };
		for (const b of orderedAbilityBonuses(result.abilityBonuses).filter((b) => b.instance.acquiredAt < at)) if (scores[b.ability] !== void 0) scores[b.ability] = Math.min(b.limit, scores[b.ability] + b.amount);
		return {
			level: at,
			classLevels: counts,
			abilities: scores,
			records: new Set(owned.map((i) => i.entry.ref.revisionId)),
			proficiencies: new Set(result.proficiencyGrants.filter((p) => p.instance.acquiredAt <= at).flatMap((p) => [p.proficiencyId, proficiencyKey(catalog, p.proficiencyId)])),
			choices: draft.choices,
			repetitions
		};
	}
	const matchesAcquisition = (acquisition, node) => acquisition === "ambas" || acquisition === node.acquisition;
	const atLevel = (node, level) => node.classEntryId ? Math.max(node.acquiredAt, draft.levels.filter((l) => l.classEntryId === node.classEntryId)[Math.max(0, level - 1)]?.totalLevel ?? node.acquiredAt) : Math.max(node.acquiredAt, level);
	const pending = [];
	const processed = /* @__PURE__ */ new Set();
	function process(node) {
		if (processed.has(node.id)) return;
		processed.add(node.id);
		result.instances.push(node);
		if (node.entry.kind === "classe") for (const p of node.entry.data.proficiencies.filter((p) => matchesAcquisition(p.acquisition, node))) result.proficiencyGrants.push({
			instance: node,
			proficiencyId: p.proficiencyId,
			degree: "proficiente"
		});
		if (node.id === "species" && find(draft.lineageRef)?.kind === "linhagem" && find(draft.lineageRef).data.inheritTraits === false) return;
		for (const group of catalog.choices.filter((g) => g.ownerRevisionId === node.entry.ref.revisionId && g.level <= node.level && matchesAcquisition(g.acquisition, node))) {
			if (!requirementMet(catalog, group.requirementId, context(atLevel(node, group.level)))) continue;
			let selected = draft.choices.filter((c) => c.groupId === group.id && c.sourceInstanceId === node.id);
			const ancestorChoice = result.choices.filter((c) => c.group.key === group.key && node.id.startsWith(c.instance.id + "/")).reverse().map((c) => ({
				group: c.group,
				choice: draft.choices.find((s) => s.groupId === c.group.id && s.sourceInstanceId === c.instance.id)
			})).find((c) => c.choice?.values.length);
			if (!selected.length && ancestorChoice?.choice) selected = [{
				groupId: group.id,
				sourceInstanceId: node.id,
				values: ancestorChoice.choice.values.flatMap((v) => {
					const old = v.type === "option" ? ancestorChoice.group.options.find((o) => o.id === v.optionId) : null;
					const option = old?.targetRef ? group.options.find((o) => o.targetRef?.revisionId === old.targetRef?.revisionId) : null;
					return option ? [{
						type: "option",
						optionId: option.id
					}] : [];
				})
			}];
			else result.choices.push({
				instance: node,
				group
			});
			const values = selected[0]?.values ?? [];
			if (selected.length > 1 || values.length < group.minimum || values.length > group.maximum) {
				problem("CHOICE_REQUIRED", `choices.${node.id}.${group.id}`, `Escolha de ${group.minimum} a ${group.maximum} opção(ões): ${group.name}.`, node.entry.ref.revisionId);
				continue;
			}
			if (new Set(values.map((v) => JSON.stringify(v))).size !== values.length) {
				problem("INVALID_CHOICE", `choices.${group.id}`, "Não repita uma opção no mesmo grupo.");
				continue;
			}
			let budget = 0;
			for (const value of values) {
				const option = value.type === "option" ? group.options.find((o) => o.id === value.optionId) : value.type === "ability" ? group.options.find((o) => o.ability === value.ability) : value.type === "proficiency" ? group.options.find((o) => o.proficiencyId === value.proficiencyId) : value.type === "record" ? group.options.find((o) => o.targetRef?.revisionId === value.ref.revisionId) : void 0;
				if (value.type === "record" && !option && group.optionKind) {
					const e = find(value.ref);
					if (!e || e.kind !== group.optionKind || group.featCategory && (e.kind !== "talento" || e.data.category !== group.featCategory)) {
						problem("INVALID_CHOICE", `choices.${group.id}`, "O registro não pertence a este grupo.");
						continue;
					}
				} else if (!option) {
					problem("INVALID_CHOICE", `choices.${group.id}`, "A opção selecionada não pertence ao grupo.");
					continue;
				}
				const ref = value.type === "record" ? value.ref : option?.targetRef;
				if (ref && option?.type === "maestria-arma") {
					if (result.masteries.some((m) => m.instance.id === node.id && m.ref.recordId === ref.recordId)) problem("DUPLICATE_MASTERY", `choices.${group.id}`, "Escolha uma arma diferente para cada maestria da classe.");
					else result.masteries.push({
						instance: node,
						ref,
						id: `${node.id}/mastery:${group.id}:${option.id}`
					});
				}
				if (ref && !["lista-magia", "maestria-arma"].includes(option?.type ?? "")) pending.push({
					parent: node,
					grant: null,
					ref,
					id: `${node.id}/choice:${group.id}:${option?.id ?? ref.recordId}`,
					level: 1,
					at: atLevel(node, group.level)
				});
				if (option?.proficiencyId) result.proficiencyGrants.push({
					instance: node,
					proficiencyId: option.proficiencyId,
					degree: "proficiente"
				});
				if (option?.ability) {
					const amount = value.type === "ability" ? value.amount : option.quantity;
					if (!Number.isInteger(amount) || amount < 1 || amount > (group.abilityPoints ?? option.quantity)) problem("INVALID_CHOICE", `choices.${group.id}`, "Bônus de atributo inválido.");
					else {
						budget += amount;
						result.abilityBonuses.push({
							instance: {
								...node,
								acquiredAt: atLevel(node, group.level)
							},
							ability: option.ability,
							amount,
							limit: group.abilityLimit ?? 20
						});
					}
				}
			}
			if (group.abilityPoints !== null && budget !== group.abilityPoints) problem("ABILITY_BUDGET", `choices.${group.id}`, `Distribua exatamente ${group.abilityPoints} ponto(s).`);
		}
		for (const effect of catalog.effects.filter((e) => e.ownerRevisionId === node.entry.ref.revisionId && e.level <= node.level)) {
			if (!requirementMet(catalog, effect.requirementId, context(atLevel(node, effect.level)))) continue;
			result.effects.push({
				instance: node,
				effect
			});
			for (const b of effect.abilities) result.abilityBonuses.push({
				instance: {
					...node,
					acquiredAt: atLevel(node, effect.level)
				},
				ability: b.ability,
				amount: b.increase,
				limit: b.limit
			});
			for (const p of effect.proficiencies) result.proficiencyGrants.push({
				instance: node,
				proficiencyId: p.proficiencyId,
				degree: p.degree
			});
		}
		for (const g of catalog.grants.filter((g) => g.ownerRevisionId === node.entry.ref.revisionId && g.level <= node.level && matchesAcquisition(g.acquisition, node))) {
			if (!requirementMet(catalog, g.requirementId, context(atLevel(node, g.level)))) continue;
			if (g.targetRef) pending.push({
				parent: node,
				grant: g,
				ref: g.targetRef,
				id: `${node.id}/grant:${g.id}`,
				level: Math.max(1, node.level - g.level + 1),
				at: atLevel(node, g.level)
			});
			else if (!g.groupId) problem("MISSING_REFERENCE", node.id, "Uma concessão obrigatória está sem referência.", node.entry.ref.revisionId);
		}
		for (const option of catalog.equipmentOptions.filter((o) => o.ownerRevisionId === node.entry.ref.revisionId && matchesAcquisition(o.acquisition, node))) if (draft.equipmentOptions.filter((o) => o.ownerRevisionId === option.ownerRevisionId).some((s) => s.optionId === option.id)) pending.push({
			parent: node,
			grant: null,
			ref: option.packageRef,
			id: `${node.id}/equipment:${option.id}`,
			level: 1,
			at: node.acquiredAt
		});
		const equipmentOptions = catalog.equipmentOptions.filter((o) => o.ownerRevisionId === node.entry.ref.revisionId && matchesAcquisition(o.acquisition, node));
		if (equipmentOptions.length && draft.equipmentOptions.filter((s) => equipmentOptions.some((o) => o.id === s.optionId && o.ownerRevisionId === s.ownerRevisionId)).length !== 1) problem("EQUIPMENT_REQUIRED", `equipmentOptions.${node.entry.ref.revisionId}`, "Escolha um kit de equipamento ou moedas.", node.entry.ref.revisionId);
	}
	roots.forEach(process);
	const errors = /* @__PURE__ */ new Map();
	for (let round = 0; round < 64 && pending.length; round++) {
		pending.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
		let progressed = false;
		for (let index = 0; index < pending.length;) {
			const p = pending[index], entry = find(p.ref);
			if (!entry) {
				errors.set(p.id, "MISSING_REFERENCE");
				index++;
				continue;
			}
			if (p.parent.ancestors.includes(entry.ref.revisionId) || p.parent.entry.ref.revisionId === entry.ref.revisionId || result.instances.length > 1e3) {
				errors.set(p.id, "CYCLIC_GRANT");
				index++;
				continue;
			}
			const ctx = context(p.at);
			if (entry.kind === "talento") {
				if (!entry.data.requirementsComplete) {
					errors.set(p.id, "INCOMPLETE_REQUIREMENTS");
					index++;
					continue;
				}
				if (!catalog.requirements.filter((r) => r.ownerRevisionId === entry.ref.revisionId && !r.parentId).every((r) => requirementMet(catalog, r.id, ctx))) {
					errors.set(p.id, "REQUIREMENT_NOT_MET");
					index++;
					continue;
				}
				if (!entry.data.repeatable && result.instances.some((i) => i.entry.ref.recordId === entry.ref.recordId)) {
					errors.set(p.id, "DUPLICATE_FEAT");
					index++;
					continue;
				}
			}
			pending.splice(index, 1);
			progressed = true;
			errors.delete(p.id);
			process({
				id: p.id,
				entry,
				level: p.level,
				acquiredAt: p.at,
				acquisition: p.parent.acquisition,
				classEntryId: p.parent.classEntryId,
				grantId: p.grant?.id ?? null,
				ancestors: [...p.parent.ancestors, p.parent.entry.ref.revisionId]
			});
		}
		if (!progressed) break;
	}
	for (const p of pending) problem(errors.get(p.id) ?? "UNRESOLVED_GRANT", p.id, "A concessão depende de referência ou requisito ainda não resolvido.", p.ref.revisionId);
	for (const node of result.instances) result.contributions.push({
		id: instanceUuid(node.id),
		sourceRevisionId: node.entry.ref.revisionId,
		sourceRecordId: node.entry.ref.recordId,
		sourceInstanceId: node.id,
		grantId: node.grantId,
		target: node.entry.kind,
		name: node.entry.name,
		amount: null
	});
	for (const mastery of result.masteries) {
		const e = find(mastery.ref);
		if (e) result.contributions.push({
			id: instanceUuid(mastery.id),
			sourceRevisionId: e.ref.revisionId,
			sourceRecordId: e.ref.recordId,
			sourceInstanceId: mastery.id,
			grantId: null,
			target: "maestria-arma",
			name: `Maestria: ${e.name}`,
			amount: null
		});
	}
	return result;
}
//#endregion
//#region packages/character-creation/state.ts
function resolveState(catalog, draft) {
	const scores = resolveAbilities(catalog, draft), concessions = resolveConcessions(catalog, draft);
	const totals = { ...scores.totals };
	const problems = [...scores.problems, ...concessions.problems];
	for (const b of orderedAbilityBonuses(concessions.abilityBonuses)) if (totals[b.ability] !== void 0) {
		const next = totals[b.ability] + b.amount;
		if (next > b.limit) problems.push({
			code: "ABILITY_LIMIT",
			field: `abilities.${b.ability}`,
			message: `O aumento de atributo não pode ultrapassar ${b.limit}.`,
			sourceRevisionId: b.instance.entry.ref.revisionId
		});
		else totals[b.ability] = next;
	}
	const level = draft.classes.reduce((s, c) => s + c.level, 0), proficiency = 2 + Math.floor((Math.max(1, level) - 1) / 4);
	return {
		base: scores.base,
		totals,
		concessions,
		problems,
		level,
		proficiency
	};
}
//#endregion
//#region packages/character-creation/formula.ts
function evaluateFormula(formula, c, depth = 0) {
	if (!formula || depth > 16) return 0;
	if (formula.op === "constant") return formula.value;
	if (formula.op === "ability_score") return c.abilities[formula.ability] ?? 0;
	if (formula.op === "ability_modifier") return modifier(c.abilities[formula.ability] ?? 10);
	if (formula.op === "level") return c.level;
	if (formula.op === "class_level") return c.classLevel;
	if (formula.op === "proficiency") return c.proficiency;
	if (!("args" in formula)) return 0;
	const args = formula.args.map((f) => evaluateFormula(f, c, depth + 1));
	let result = 0;
	switch (formula.op) {
		case "add":
			result = args.reduce((s, n) => s + n, 0);
			break;
		case "subtract":
			result = args.slice(1).reduce((s, n) => s - n, args[0] ?? 0);
			break;
		case "multiply":
			result = args.reduce((s, n) => s * n, 1);
			break;
		case "floor":
			result = Math.floor(args[0] ?? 0);
			break;
		case "ceil":
			result = Math.ceil(args[0] ?? 0);
			break;
		case "minimum":
			result = Math.min(...args);
			break;
		case "maximum": result = Math.max(...args);
	}
	if (!Number.isFinite(result) || Math.abs(result) > 1e6) throw new Error("Fórmula fora dos limites.");
	return result;
}
//#endregion
//#region packages/character-creation/hit-points.ts
function resolveHitPoints(catalog, draft, state = resolveState(catalog, draft)) {
	const result = {
		total: 0,
		levels: [],
		hitDice: [],
		problems: []
	};
	const bad = (message) => result.problems.push({
		code: "HIT_POINTS",
		field: "levels",
		message
	});
	const con = modifier(state.totals.con ?? 10), counts = /* @__PURE__ */ new Map();
	if (draft.levels.length !== state.level) bad("Registre um resultado de vida para cada nível total.");
	for (const [index, level] of draft.levels.entries()) {
		const cls = draft.classes.find((c) => c.id === level.classEntryId), entry = catalog.entries.find((e) => e.ref.revisionId === cls?.classRef.revisionId);
		if (level.totalLevel !== index + 1 || !cls || entry?.kind !== "classe") {
			bad("A ordem dos níveis ou a classe está inválida.");
			continue;
		}
		counts.set(cls.id, (counts.get(cls.id) ?? 0) + 1);
		const die = entry.data.hitDie;
		let roll = index === 0 ? die : level.hitPointMethod === "fixed" ? entry.data.fixedHitPoints : level.hitPointRoll;
		if (![
			"fixed",
			"roll",
			"external"
		].includes(level.hitPointMethod) || roll === null || !Number.isInteger(roll) || roll < 1 || roll > die || index === 0 && level.hitPointRoll !== null && level.hitPointRoll !== die) {
			bad(`O resultado de PV do nível ${index + 1} deve estar entre 1 e ${die}.`);
			roll = 0;
		}
		let bonus = 0;
		for (const { effect, instance } of state.concessions.effects.filter((e) => e.effect.type === "pv_por_nivel")) bonus += evaluateFormula(effect.formula, {
			abilities: state.totals,
			level: state.level,
			classLevel: instance.level,
			proficiency: state.proficiency
		});
		const gain = Math.max(1, roll + con + bonus);
		result.levels.push({
			totalLevel: index + 1,
			classEntryId: cls.id,
			die,
			roll,
			constitution: con,
			bonus,
			gain
		});
		result.total += gain;
		const dice = result.hitDice.find((d) => d.die === die);
		if (dice) dice.quantity++;
		else result.hitDice.push({
			die,
			quantity: 1
		});
	}
	for (const cls of draft.classes) if (counts.get(cls.id) !== cls.level) bad("A quantidade de níveis não corresponde à progressão das classes.");
	for (const { effect, instance } of state.concessions.effects.filter((e) => e.effect.type === "pv_bonus")) result.total += evaluateFormula(effect.formula, {
		abilities: state.totals,
		level: state.level,
		classLevel: instance.level,
		proficiency: state.proficiency
	});
	result.total = Math.max(1, result.total);
	return result;
}
//#endregion
//#region packages/character-creation/defenses.ts
function resolveDefenses(catalog, draft, state = resolveState(catalog, draft)) {
	const result = {
		armorClass: 10,
		formula: "10 + DES",
		movements: [],
		problems: []
	};
	const equipped = (draft.equippedRefs ?? []).map((r) => catalog.entries.find((e) => e.ref.recordId === r.recordId && e.ref.revisionId === r.revisionId)).filter((e) => e?.kind === "equipamento");
	const armors = equipped.filter((e) => e.data.armor), shields = equipped.filter((e) => e.data.shield);
	if (armors.length > 1 || shields.length > 1) result.problems.push({
		code: "EQUIPPED_CONFLICT",
		field: "equippedRefs",
		message: "Equipe no máximo uma armadura e um escudo."
	});
	const dex = modifier(state.totals.des ?? 10), shield = shields[0]?.data.shield?.acBonus ?? 0, armor = armors[0]?.data.armor;
	const alternatives = [{
		value: armor ? armor.baseAc + (armor.addDexterity ? Math.min(dex, armor.dexterityLimit ?? Infinity) : 0) + shield : 10 + dex + shield,
		name: armor ? `${armors[0].name}${shield ? " + escudo" : ""}` : `10 + DES${shield ? " + escudo" : ""}`
	}];
	let bonus = 0;
	for (const { effect, instance } of state.concessions.effects) {
		const value = evaluateFormula(effect.formula, {
			abilities: state.totals,
			level: state.level,
			classLevel: instance.level,
			proficiency: state.proficiency
		});
		if (effect.type === "ca_formula" && (!effect.defenses.length || effect.defenses.some((d) => (!d.unarmored || !armor) && (d.permitsShield || !shield)))) alternatives.push({
			value: value + shield,
			name: instance.entry.name + (shield ? " + escudo" : "")
		});
		if (effect.type === "ca_bonus") bonus += value;
	}
	const chosen = alternatives.reduce((a, b) => b.value > a.value ? b : a);
	result.armorClass = chosen.value + bonus;
	result.formula = chosen.name + (bonus ? ` + ${bonus}` : "");
	const species = state.concessions.instances.find((i) => i.entry.kind === "especie")?.entry, lineage = state.concessions.instances.find((i) => i.entry.kind === "linhagem")?.entry;
	const movements = [];
	if (species?.kind === "especie") movements.push(...species.data.movements);
	if (lineage?.kind === "linhagem") movements.push(...lineage.data.movements);
	for (const movement of movements.filter((m) => !m.form || m.form === draft.form)) {
		if (movement.condition) continue;
		const feet = movement.unit === "pes" ? movement.distance : movement.distance * 10 / 3;
		const old = result.movements.find((m) => m.mode === movement.mode);
		if (!old) result.movements.push({
			mode: movement.mode,
			feet,
			meters: feet * .3
		});
		else if (feet > old.feet) {
			old.feet = feet;
			old.meters = feet * .3;
		}
	}
	return result;
}
//#endregion
//#region packages/character-creation/spellcasting.ts
function resolveSpellcasting(catalog, draft, state = resolveState(catalog, draft)) {
	const result = {
		profiles: [],
		effectiveCasterLevel: 0,
		slots: [],
		pactSlots: [],
		problems: []
	};
	const active = state.concessions.instances.flatMap((instance) => catalog.castingProfiles.filter((p) => p.ownerRevisionId === instance.entry.ref.revisionId && instance.level >= p.firstLevel).map((definition) => ({
		instance,
		definition
	})));
	const normal = active.filter((p) => p.definition.type === "conjuracao");
	for (const { instance, definition: p } of active) {
		const key = `${instance.id}/casting:${p.id}`, chosen = draft.castingAbilities.filter((a) => a.profileId === key);
		const ability = chosen[0]?.ability ?? (p.abilities.length === 1 ? p.abilities[0] : null);
		if (chosen.length > 1 || (p.abilities.length > 0 ? !ability || !p.abilities.includes(ability) : chosen.length > 0)) result.problems.push({
			code: "CASTING_ABILITY",
			field: `castingAbilities.${key}`,
			message: "Escolha um atributo de conjuração permitido.",
			sourceRevisionId: p.ownerRevisionId
		});
		const progress = p.progression.find((l) => l.level === instance.level);
		if (!progress && p.type !== "concedida") result.problems.push({
			code: "CASTING_PROGRESSION",
			field: key,
			message: "A progressão de conjuração deste nível ainda precisa de revisão.",
			sourceRevisionId: p.ownerRevisionId
		});
		const maximumCircle = progress?.maximumCircle ?? Math.max(0, ...p.slots.filter((s) => s.level === instance.level).map((s) => s.circle), ...p.spells.filter((s) => s.level <= instance.level).map((s) => {
			const e = catalog.entries.find((e) => e.ref.revisionId === s.spellRef.revisionId);
			return e?.kind === "magia" ? e.data.circle : 0;
		}));
		const row = {
			id: key,
			ownerRevisionId: p.ownerRevisionId,
			ability,
			maximumCircle,
			prepared: progress?.prepared ?? 0,
			known: progress?.known ?? 0,
			cantrips: progress?.cantrips ?? 0,
			type: p.type,
			listClassRevisionIds: [],
			selectable: p.type !== "concedida" || !!p.listClassRefs?.length
		};
		const ownClass = instance.entry.kind === "subclasse" ? instance.entry.data.classRef : instance.entry.kind === "classe" ? instance.entry.ref : null;
		if (ownClass) row.listClassRevisionIds = [ownClass.revisionId];
		if (p.listClassRefs?.length) {
			const group = state.concessions.choices.filter((c) => c.group.key === p.listChoiceKey && (c.instance.id === instance.id || instance.id.startsWith(c.instance.id + "/"))).sort((a, b) => b.instance.id.length - a.instance.id.length)[0];
			const choice = group && draft.choices.find((c) => c.groupId === group.group.id && c.sourceInstanceId === group.instance.id);
			row.listClassRevisionIds = p.listClassRefs.length === 1 ? p.listClassRefs.map((r) => r.revisionId) : choice?.values.flatMap((v) => {
				const o = v.type === "option" ? group.group.options.find((o) => o.id === v.optionId) : null;
				return o?.targetRef && p.listClassRefs.some((r) => r.revisionId === o.targetRef.revisionId) ? [o.targetRef.revisionId] : [];
			}) ?? [];
			if (row.listClassRevisionIds.length !== 1) result.problems.push({
				code: "SPELL_LIST_REQUIRED",
				field: key,
				message: "Escolha uma lista de magias para esta origem."
			});
			if (result.profiles.some((previous) => previous.ownerRevisionId === p.ownerRevisionId && previous.listClassRevisionIds?.some((id) => row.listClassRevisionIds.includes(id)))) result.problems.push({
				code: "REPEATED_SPELL_LIST",
				field: key,
				message: "Ao repetir este talento, escolha uma lista de magias diferente."
			});
		}
		result.profiles.push(row);
		if (p.type === "conjuracao") {
			const contribution = instance.level * p.contributionNumerator / p.contributionDenominator;
			result.effectiveCasterLevel += p.rounding === "cima" ? Math.ceil(contribution) : Math.floor(contribution);
			if (normal.length === 1) result.slots = p.slots.filter((s) => s.level === instance.level).map(({ circle, total }) => ({
				circle,
				total
			}));
		} else if (p.type === "pacto") for (const slot of p.slots.filter((s) => s.level === instance.level)) {
			const old = result.pactSlots.find((s) => s.circle === slot.circle);
			if (old) old.total += slot.total;
			else result.pactSlots.push({
				circle: slot.circle,
				total: slot.total
			});
		}
		const selected = draft.spellSelections.filter((s) => s.profileId === key), seen = /* @__PURE__ */ new Set();
		let cantrips = 0, prepared = 0, known = 0;
		for (const selection of selected) {
			const e = catalog.entries.find((e) => e.ref.revisionId === selection.spellRef.revisionId && e.ref.recordId === selection.spellRef.recordId);
			const fixed = p.spells.some((s) => s.spellRef.revisionId === e?.ref.revisionId && s.level <= instance.level);
			if (!e || e.kind !== "magia" || seen.has(e.ref.recordId) || !fixed && (e.data.circle > maximumCircle || !e.data.classRefs.some((c) => row.listClassRevisionIds.includes(c.revisionId)))) {
				result.problems.push({
					code: "SPELL_NOT_AVAILABLE",
					field: key,
					message: "A magia não está disponível para esta origem e nível."
				});
				continue;
			}
			seen.add(e.ref.recordId);
			if (fixed) continue;
			if (e.data.circle === 0) cantrips++;
			else {
				known++;
				if (selection.prepared) prepared++;
			}
		}
		if (cantrips > row.cantrips || progress?.prepared !== null && prepared > row.prepared || progress?.known !== null && known > row.known) result.problems.push({
			code: "SPELL_LIMIT",
			field: key,
			message: "A seleção excede a quantidade de truques, magias conhecidas ou preparadas desta origem."
		});
		if (progress && (cantrips !== row.cantrips || p.method === "conhecidas" && known !== row.known || p.method === "grimorio" && progress.known !== null && known !== row.known || [
			"preparadas",
			"fixas",
			"grimorio"
		].includes(p.method) && progress.prepared !== null && prepared !== row.prepared)) result.problems.push({
			code: "SPELL_SELECTION_REQUIRED",
			field: key,
			message: "Complete a seleção de truques e magias desta origem."
		});
	}
	if (normal.length > 1) {
		result.slots = catalog.multiclassSlots.filter((s) => s.level === result.effectiveCasterLevel).map(({ circle, total }) => ({
			circle,
			total
		}));
		if (!result.slots.length && result.effectiveCasterLevel > 0) result.problems.push({
			code: "MULTICLASS_SLOTS",
			field: "spellSelections",
			message: "A tabela de espaços de multiclasse não está disponível."
		});
	}
	if (draft.spellSelections.some((s) => !result.profiles.some((p) => p.id === s.profileId)) || draft.castingAbilities.some((s) => !result.profiles.some((p) => p.id === s.profileId))) result.problems.push({
		code: "UNKNOWN_CASTING_PROFILE",
		field: "spellSelections",
		message: "Uma seleção pertence a uma origem de conjuração removida."
	});
	return result;
}
//#endregion
//#region packages/compendium/sheet-adapter.ts
function spellToSheet(entry, profileId) {
	const d = entry.data;
	if ([
		d.castingTime,
		d.range,
		d.duration
	].some((s) => s.length > 120) || [
		entry.description,
		d.components.material,
		entry.source.title
	].some((s) => s.length > 1e4)) throw new Error("O registro excede os limites de uma magia na ficha. Revise o conteúdo no compêndio.");
	return {
		...novaEntrada("magias"),
		nome: entry.name,
		compendioId: entry.legacyIds?.[0] ?? entry.ref.recordId,
		compendioRef: { ...entry.ref },
		circulo: d.circle,
		perfilId: profileId,
		tempo: d.castingTime,
		alcance: d.range,
		duracao: d.duration,
		concentracao: d.concentration,
		ritual: d.ritual,
		verbal: d.components.verbal,
		somatico: d.components.somatic,
		material: d.components.material,
		descricao: entry.description,
		observacoes: entry.source.title
	};
}
//#endregion
//#region packages/character-creation/project.ts
function projectSheet(catalog, draft, state, hp, defenses, casting) {
	const sheet = criarConteudo();
	const entry = (revision) => catalog.entries.find((e) => e.ref.revisionId === revision);
	const roots = state.concessions.instances;
	const species = roots.find((i) => i.id === "species")?.entry, lineage = roots.find((i) => i.id === "lineage")?.entry, bg = roots.find((i) => i.id === "background")?.entry;
	sheet.identidade.especie = [species?.name, lineage?.name].filter(Boolean).join(" / ");
	if (species?.kind === "especie") sheet.combate.sentidos = species.data.senses.map((s) => `${s.type}${s.distanceFeet === null ? "" : `: ${s.distanceFeet * .3} m`}${s.condition ? ` (${s.condition})` : ""}`).join("; ");
	sheet.identidade.antecedente = bg?.name ?? "";
	sheet.identidade.tamanho = draft.size ?? "";
	sheet.classes = draft.classes.map((c) => ({
		id: c.id,
		nome: entry(c.classRef.revisionId)?.name ?? "",
		subclasse: c.subclassRef ? entry(c.subclassRef.revisionId)?.name ?? "" : "",
		nivel: c.level
	}));
	for (const [ability, value] of Object.entries(state.totals)) sheet.atributos[ability].valor = value;
	sheet.combate.ca = defenses.armorClass;
	sheet.combate.escudo = !!draft.equippedRefs?.some((r) => {
		const e = entry(r.revisionId);
		return e?.kind === "equipamento" && e.data.shield;
	});
	sheet.combate.pvMaximos = hp.total;
	sheet.combate.pvAtuais = hp.total;
	sheet.combate.dadosVida = hp.hitDice.map((d) => ({
		id: instanceUuid(`hit-die:${d.die}`),
		dado: `d${d.die}`,
		maximo: d.quantity,
		gastos: 0
	}));
	sheet.combate.deslocamento = defenses.movements.find((m) => m.mode === "terrestre")?.meters ?? 0;
	sheet.combate.deslocamentosAdicionais = defenses.movements.filter((m) => m.mode !== "terrestre").map((m) => ({
		id: instanceUuid(`movement:${m.mode}`),
		nome: m.mode,
		valor: m.meters
	}));
	for (const instance of roots) {
		const e = instance.entry, key = e.kind === "talento" ? "talentos" : e.kind === "caracteristica" ? instance.id.startsWith("species") || instance.id.startsWith("lineage") ? "tracos" : "caracteristicas" : null;
		if (key) sheet[key].push({
			id: instanceUuid(instance.id),
			nome: e.name,
			descricao: e.description
		});
		if (e.kind === "idioma" && !sheet.idiomas.some((i) => i.nome === e.name)) sheet.idiomas.push({
			id: instanceUuid(instance.id),
			nome: e.name
		});
	}
	const degrees = {
		meia: 1,
		proficiente: 2,
		especializacao: 3
	};
	for (const mastery of state.concessions.masteries) {
		const weapon = entry(mastery.ref.revisionId);
		const definition = weapon?.kind === "equipamento" && weapon.data.weapon?.masteryRef ? entry(weapon.data.weapon.masteryRef.revisionId) : null;
		sheet.caracteristicas.push({
			id: instanceUuid(mastery.id),
			nome: `Maestria: ${weapon?.name}`,
			descricao: definition ? `${definition.name}\n${definition.description}` : "Consulte a propriedade de maestria da arma."
		});
	}
	for (const grant of state.concessions.proficiencyGrants) {
		const p = catalog.proficiencies.find((p) => p.id === grant.proficiencyId);
		if (!p) continue;
		if (p.type === "pericia" && p.skill && sheet.pericias[p.skill]) {
			if ((degrees[sheet.pericias[p.skill].grau] ?? 0) < degrees[grant.degree]) sheet.pericias[p.skill].grau = grant.degree;
		}
		if (p.type === "salvaguarda" && p.ability) sheet.atributos[p.ability].resistenciaProficiente = true;
		if (p.type === "categoria" && p.category) {
			const key = {
				"armadura-leve": "leves",
				"armadura-media": "medias",
				"armadura-pesada": "pesadas",
				escudo: "escudos"
			}[p.category];
			if (key) sheet.treinamento[key] = true;
			else sheet.treinamento.armas = [sheet.treinamento.armas, p.category].filter(Boolean).join("; ");
		}
		if (p.type === "equipamento" && p.equipment) {
			const e = entry(p.equipment.revisionId);
			const key = e?.kind === "equipamento" && e.data.weapon ? "armas" : "ferramentas";
			sheet.treinamento[key] = [sheet.treinamento[key], e?.name].filter(Boolean).join("; ");
		}
		if (p.type === "idioma" && p.language) {
			const e = entry(p.language.revisionId);
			if (e && !sheet.idiomas.some((i) => i.nome === e.name)) sheet.idiomas.push({
				id: instanceUuid(`language:${e.ref.recordId}`),
				nome: e.name
			});
		}
	}
	for (const { instance, effect } of state.concessions.effects) {
		const value = evaluateFormula(effect.formula, {
			abilities: state.totals,
			level: state.level,
			classLevel: instance.level,
			proficiency: state.proficiency
		});
		if (effect.type === "iniciativa_bonus") sheet.combate.ajusteIniciativa += value;
		if (effect.type === "percepcao_bonus") sheet.combate.ajustePercepcaoPassiva += value;
		const key = {
			resistencia: "resistencias",
			imunidade: "imunidades",
			vulnerabilidade: "vulnerabilidades"
		}[effect.type];
		if (key) sheet.combate[key] = [sheet.combate[key], ...effect.defenses.map((d) => d.damageType)].filter(Boolean).join("; ");
		for (const r of effect.resources) sheet.recursos.push({
			id: instanceUuid(`${instance.id}/resource:${effect.id}:${r.name}`),
			nome: r.name,
			maximo: value,
			gastos: 0,
			recuperacao: r.recovery
		});
	}
	function item(revision, key, quantity) {
		const e = entry(revision);
		if (e?.kind !== "equipamento") return;
		const d = e.data;
		const row = {
			...novaEntrada("inventario.itens"),
			id: instanceUuid(key),
			nome: e.name,
			quantidade: quantity,
			peso: d.weight === null ? 0 : d.weightUnit === "kg" ? d.weight : d.weight * .45359237,
			equipado: !!draft.equippedRefs?.some((r) => r.revisionId === revision),
			descricao: e.description,
			tipo: d.weapon ? "arma" : d.armor ? "armadura" : d.shield ? "escudo" : "basico"
		};
		if (d.armor) Object.assign(row, {
			categoriaArmadura: d.category.includes("pesad") ? "pesada" : d.category.includes("media") ? "media" : "leve",
			caBase: d.armor.baseAc,
			adicionarDestreza: d.armor.addDexterity,
			limiteDestreza: d.armor.dexterityLimit,
			forcaMinima: d.armor.strengthMinimum ?? 0,
			desvantagemFurtividade: d.armor.stealthDisadvantage
		});
		if (d.shield) row.bonusCa = d.shield.acBonus;
		if (d.weapon) Object.assign(row, {
			categoriaArma: d.category.includes("marcial") ? "marcial" : "simples",
			alcanceArma: d.weapon.rangeType,
			critico: d.weapon.criticalMinimum
		});
		sheet.inventario.itens.push(row);
		if (d.weapon) {
			const finesse = d.weapon.propertyRefs.some((r) => {
				const property = entry(r.revisionId);
				return property?.kind === "propriedade_arma" && property.data.key === "acuidade";
			});
			const attribute = d.weapon.rangeType === "distancia" || finesse && (state.totals.des ?? 10) > (state.totals.for ?? 10) ? "des" : "for";
			const proficient = state.concessions.proficiencyGrants.some((g) => {
				const p = catalog.proficiencies.find((p) => p.id === g.proficiencyId);
				return p?.type === "equipamento" && p.equipment?.recordId === e.ref.recordId || p?.type === "categoria" && (p.category === "arma-simples" && !d.category.includes("marcial") || p.category === "arma-marcial" && d.category.includes("marcial"));
			});
			const damages = d.weapon.damages.map((damage, i) => ({
				id: instanceUuid(`${key}/damage:${i}`),
				dado: damage.dice,
				atributo: damage.ability ?? (i === 0 ? attribute : ""),
				tipo: damage.damageType
			}));
			sheet.ataques.push({
				...novaEntrada("ataques"),
				id: instanceUuid(`${key}/attack`),
				nome: e.name,
				tipo: "bonus",
				valor: modifier(state.totals[attribute] ?? 10) + (proficient ? state.proficiency : 0),
				dano: "",
				tipoDano: "",
				observacoes: d.weapon.masteryRef ? entry(d.weapon.masteryRef.revisionId)?.name ?? "" : "",
				itemId: row.id,
				atributo: attribute,
				bonus: 0,
				proficiente: proficient,
				critico: d.weapon.criticalMinimum,
				danos: damages
			});
		}
	}
	for (const instance of roots) {
		const e = instance.entry;
		if (e.kind === "equipamento") item(e.ref.revisionId, instance.id, 1);
		if (e.kind === "pacote") for (const row of e.data.items) {
			if (row.equipmentRef) item(row.equipmentRef.revisionId, `${instance.id}/item:${row.id}`, row.quantity);
			if (row.currencyRef) {
				const currency = entry(row.currencyRef.revisionId);
				if (currency?.kind === "moeda") {
					const code = currency.data.code.toLowerCase();
					if (Object.hasOwn(sheet.inventario.moedas, code)) sheet.inventario.moedas[code] += row.quantity;
				}
			}
		}
	}
	for (const profile of casting.profiles) {
		const instance = roots.find((i) => profile.id.startsWith(`${i.id}/casting:`));
		const definition = catalog.castingProfiles.find((p) => p.ownerRevisionId === profile.ownerRevisionId && profile.id.endsWith(`:${p.id}`));
		const profileId = profile.ability ? instanceUuid(profile.id) : "";
		if (profile.ability) sheet.conjuracao.perfis.push({
			...novaEntrada("conjuracao.perfis"),
			id: profileId,
			nome: instance?.entry.name ?? "Conjuração",
			classeId: instance?.classEntryId ?? "",
			atributo: profile.ability ?? "int"
		});
		const fixed = definition?.spells.filter((s) => s.level <= (instance?.level ?? 0)) ?? [];
		const selected = draft.spellSelections.filter((s) => s.profileId === profile.id);
		for (const spell of [...fixed.map((s) => ({
			spellRef: s.spellRef,
			prepared: s.alwaysPrepared
		})), ...selected]) {
			const e = entry(spell.spellRef.revisionId);
			if (e?.kind !== "magia" || sheet.magias.some((s) => s.id === instanceUuid(`${profile.id}/spell:${e.ref.recordId}`))) continue;
			const row = spellToSheet(e, profileId);
			row.id = instanceUuid(`${profile.id}/spell:${e.ref.recordId}`);
			row.origemCriacao = profile.id;
			row.preparada = spell.prepared;
			sheet.magias.push(row);
			if (definition?.selectionUses !== null && definition?.selectionUses !== void 0 && e.data.circle > 0 && !fixed.some((s) => s.spellRef.revisionId === e.ref.revisionId)) sheet.recursos.push({
				id: instanceUuid(`${profile.id}/uses:${e.ref.recordId}`),
				nome: `${e.name} (${instance?.entry.name})`,
				maximo: definition.selectionUses,
				gastos: 0,
				recuperacao: definition.selectionRecovery ?? "manual"
			});
		}
		for (const s of fixed.filter((s) => s.ownUses !== null)) sheet.recursos.push({
			id: instanceUuid(`${profile.id}/uses:${s.spellRef.recordId}`),
			nome: `${entry(s.spellRef.revisionId)?.name ?? "Magia"} (${instance?.entry.name})`,
			maximo: s.ownUses,
			gastos: 0,
			recuperacao: s.recovery ?? "manual"
		});
	}
	for (const slot of casting.slots) sheet.conjuracao.espacos[slot.circle - 1] = {
		circulo: slot.circle,
		total: slot.total,
		gastos: 0,
		ativo: true
	};
	if (casting.pactSlots.length) sheet.conjuracao.pacto = {
		circulo: casting.pactSlots[0].circle,
		total: casting.pactSlots.reduce((n, s) => n + s.total, 0),
		gastos: 0
	};
	return sincronizarEquipamentos(sheet);
}
//#endregion
//#region packages/character-creation/resolve.ts
function resolveCreation(catalog, draft) {
	catalog = orderedCatalog(catalog);
	const state = resolveState(catalog, draft), hp = resolveHitPoints(catalog, draft, state), defenses = resolveDefenses(catalog, draft, state), spellcasting = resolveSpellcasting(catalog, draft, state);
	const problems = [
		...state.problems,
		...hp.problems,
		...defenses.problems,
		...spellcasting.problems
	];
	const supportedEffects = /* @__PURE__ */ new Set([
		"atributo",
		"ca_formula",
		"ca_bonus",
		"pv_bonus",
		"pv_por_nivel",
		"resistencia",
		"imunidade",
		"vulnerabilidade",
		"recurso",
		"proficiencia",
		"iniciativa_bonus",
		"percepcao_bonus"
	]);
	for (const { effect, instance } of state.concessions.effects) if (!supportedEffects.has(effect.type) || effect.type !== "ca_formula" && effect.type !== "proficiencia" && effect.stacking !== "somar" || effect.condition && effect.type !== "ca_formula") problems.push({
		code: "UNSUPPORTED_EFFECT",
		field: instance.id,
		message: "Um efeito desta origem precisa de uma regra tipada suportada antes da aplicação automática.",
		sourceRevisionId: effect.ownerRevisionId
	});
	if (catalog.ruleSetId !== draft.ruleSetId || draft.engineVersion !== 1) problems.push({
		code: "RULESET",
		field: "ruleSetId",
		message: "A versão das regras de criação não é compatível."
	});
	const species = state.concessions.instances.find((i) => i.entry.kind === "especie")?.entry;
	const lineage = state.concessions.instances.find((i) => i.entry.kind === "linhagem")?.entry;
	if (species?.kind === "especie" && species.data.lineageRequired && !draft.lineageRef) problems.push({
		code: "LINEAGE_REQUIRED",
		field: "lineageRef",
		message: "Escolha uma linhagem para esta espécie."
	});
	const ownedEquipment = new Set(state.concessions.instances.flatMap((i) => i.entry.kind === "equipamento" ? [i.entry.ref.revisionId] : i.entry.kind === "pacote" ? i.entry.data.items.flatMap((item) => item.equipmentRef ? [item.equipmentRef.revisionId] : []) : []));
	if (draft.equippedRefs?.some((r) => !ownedEquipment.has(r.revisionId))) problems.push({
		code: "EQUIPMENT_NOT_OWNED",
		field: "equippedRefs",
		message: "Só é possível equipar os itens recebidos nesta criação."
	});
	if (![...species?.kind === "especie" ? species.data.sizes : [], ...lineage?.kind === "linhagem" ? lineage.data.sizes : []].filter((s) => !s.form || s.form === draft.form).some((s) => s.code === draft.size)) problems.push({
		code: "SIZE_REQUIRED",
		field: "size",
		message: "Escolha um tamanho disponível para a espécie e forma."
	});
	if (draft.classes.length > 1) for (const cls of draft.classes) {
		const e = catalog.entries.find((e) => e.ref.revisionId === cls.classRef.revisionId);
		if (e?.kind !== "classe") continue;
		const initial = draft.levels[0]?.classEntryId;
		const acquiredAt = (cls.id === initial ? draft.levels.find((l) => l.classEntryId !== initial) : draft.levels.find((l) => l.classEntryId === cls.id))?.totalLevel ?? 1;
		const acquisitionScores = { ...resolveAbilities(catalog, draft).totals };
		for (const bonus of orderedAbilityBonuses(state.concessions.abilityBonuses).filter((b) => b.instance.acquiredAt < acquiredAt)) if (acquisitionScores[bonus.ability] !== void 0) acquisitionScores[bonus.ability] = Math.min(bonus.limit, acquisitionScores[bonus.ability] + bonus.amount);
		const required = e.data.multiclassAbilities, groups = new Set(required.filter((r) => r.alternativeGroup > 0).map((r) => r.alternativeGroup));
		if (required.some((r) => r.alternativeGroup === 0 && (acquisitionScores[r.ability] ?? 0) < r.minimum) || [...groups].some((g) => !required.filter((r) => r.alternativeGroup === g).some((r) => (acquisitionScores[r.ability] ?? 0) >= r.minimum))) problems.push({
			code: "MULTICLASS_REQUIREMENT",
			field: `classes.${cls.id}`,
			message: `Os atributos não atendem aos requisitos de multiclasse de ${e.name}.`
		});
	}
	let sheet = null;
	try {
		const candidate = projectSheet(catalog, draft, state, hp, defenses, spellcasting);
		const errors = validarFicha({
			nome: "Prévia",
			versao_esquema: 1,
			conteudo: candidate
		});
		for (const error of errors) problems.push({
			code: "SHEET_LIMIT",
			field: error.campo,
			message: error.mensagem
		});
		if (!problems.length) sheet = candidate;
	} catch {
		problems.push({
			code: "SHEET_LIMIT",
			field: "sheet",
			message: "Uma descrição ou valor do compêndio excede os limites da ficha. Revise o registro antes de criar."
		});
	}
	return {
		problems,
		baseAbilities: state.base,
		abilities: state.totals,
		proficiencyBonus: state.proficiency,
		hitPoints: hp,
		defenses,
		spellcasting,
		contributions: state.concessions.contributions,
		sheet
	};
}
//#endregion
//#region packages/character-creation/server.ts
var CreationError = class extends Error {
	code;
	problems;
	constructor(code, message, problems = []) {
		super(message);
		this.code = code;
		this.problems = problems;
	}
};
function canonicalJson(value) {
	if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
	if (value && typeof value === "object") return "{" + Object.entries(value).filter(([, v]) => v !== void 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => JSON.stringify(k) + ":" + canonicalJson(v)).join(",") + "}";
	return JSON.stringify(value);
}
function validCreationRequest(request) {
	const r = request;
	return !!r && typeof r === "object" && UUID$1.test(r.campaignId) && UUID$1.test(r.requestId) && typeof r.name === "string" && r.name.trim().length > 0 && r.name.trim().length <= 120 && validCreationDraft(r.draft) && !!r.expectedSheet;
}
function validateCreationRequest(catalog, request) {
	if (!validCreationRequest(request)) throw new CreationError("INVALID", "Revise os dados de criação.");
	const preview = resolveCreation(catalog, request.draft);
	if (preview.problems.length || !preview.sheet) throw new CreationError("INVALID", "Resolva as pendências antes de criar.", preview.problems);
	if (canonicalJson(preview.sheet) !== canonicalJson(request.expectedSheet)) throw new CreationError("DIVERGED", "A prévia mudou. Atualize o compêndio e revise os valores.");
	const snapshot = {
		schemaVersion: 1,
		draft: structuredClone(request.draft),
		contributions: preview.contributions
	};
	const content = {
		...preview.sheet,
		criacao: snapshot
	};
	const errors = validarFicha({
		nome: request.name,
		versao_esquema: 1,
		conteudo: content
	});
	if (errors.length) throw new CreationError("INVALID", "A ficha excede seus limites ou possui valores inválidos.", errors.map((e) => ({
		field: e.campo,
		message: e.mensagem
	})));
	return {
		content,
		snapshot,
		preview
	};
}
//#endregion
//#region packages/character-creation/http.ts
var headers = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Content-Type": "application/json; charset=utf-8",
	"Cache-Control": "no-store"
};
function createCreationHandler(deps) {
	const reply = (status, value) => new Response(JSON.stringify(value), {
		status,
		headers
	});
	return async (request) => {
		if (request.method === "OPTIONS") return new Response(null, {
			status: 204,
			headers
		});
		if (request.method !== "POST") return reply(405, { message: "Método indisponível." });
		const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") ?? "")?.[1];
		if (!token) return reply(401, { message: "Entre novamente para criar o personagem." });
		try {
			const userId = await deps.authenticate(token);
			if (!userId) return reply(401, { message: "Entre novamente para criar o personagem." });
			const reader = request.body?.getReader();
			if (!reader) return reply(400, { message: "Envie os dados de criação." });
			let total = 0;
			const chunks = [];
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				total += value.length;
				if (total > 524288) {
					await reader.cancel();
					return reply(413, { message: "Os dados de criação excedem o limite permitido." });
				}
				chunks.push(value);
			}
			const bytes = new Uint8Array(total);
			let offset = 0;
			for (const part of chunks) {
				bytes.set(part, offset);
				offset += part.length;
			}
			let body;
			try {
				body = JSON.parse(new TextDecoder().decode(bytes));
			} catch {
				return reply(400, { message: "Envie dados de criação válidos." });
			}
			if (!validCreationRequest(body)) return reply(400, {
				code: "INVALID",
				message: "Revise os dados de criação."
			});
			const recovered = await deps.recover?.(userId, body, token);
			if (recovered) return reply(200, { record: recovered });
			const canonical = validateCreationRequest(await deps.compendium(token).getCreationCatalog(body.draft), body);
			const record = await deps.persist(userId, body, canonical);
			return reply(200, { record });
		} catch (error) {
			if (error instanceof CreationError) return reply(error.code === "ACCESS" ? 403 : error.code === "DIVERGED" ? 409 : error.code === "INVALID" ? 400 : 503, {
				code: error.code,
				message: error.message,
				problems: error.problems
			});
			return reply(503, {
				code: "UNAVAILABLE",
				message: "Não foi possível concluir a criação. Seus dados foram preservados; tente novamente."
			});
		}
	};
}
//#endregion
//#region packages/contracts/compendium.ts
var COMPENDIUM_KINDS = [
	"classe",
	"subclasse",
	"especie",
	"linhagem",
	"antecedente",
	"talento",
	"caracteristica",
	"magia",
	"equipamento",
	"idioma",
	"criatura",
	"pacote",
	"maestria",
	"propriedade_arma",
	"servico",
	"moeda"
];
//#endregion
//#region packages/compendium/decode.ts
var s = (r, k, f = "") => typeof r[k] === "string" ? r[k] : f;
var n = (r, k, f = 0) => r[k] === null || r[k] === void 0 ? f : Number(r[k]);
var nullable = (r, k) => r[k] === null || r[k] === void 0 ? null : Number(r[k]);
var b = (r, k) => r[k] === true;
function summaryFromRow(r) {
	return {
		ref: {
			recordId: s(r, "registro_id"),
			revisionId: s(r, "revisao_id", s(r, "id"))
		},
		kind: r.tipo,
		slug: s(r, "slug"),
		name: s(r, "nome_pt"),
		originalName: s(r, "nome_original"),
		sourceId: s(r, "fonte_id"),
		sourceTitle: s(r, "fonte_titulo", r.fonte?.titulo ?? ""),
		ruleSetId: s(r, "conjunto_regras_codigo"),
		revision: n(r, "numero", 1),
		reviewed2024: b(r, "revisado_2024"),
		automation: r.automacao,
		origin: r.origem ?? r.fonte?.origem ?? "nao-revisada",
		...r.circulo !== null && r.circulo !== void 0 ? {
			circle: n(r, "circulo"),
			school: s(r, "escola"),
			ritual: b(r, "ritual"),
			concentration: b(r, "concentracao")
		} : {},
		legacyIds: Array.isArray(r.legados) ? r.legados : []
	};
}
function decodeCatalog(raw, ruleSetId = "dnd-5e-2024") {
	if (!raw || !Array.isArray(raw.records) || !raw.tables || typeof raw.tables !== "object") throw Error("Resposta de compêndio inválida.");
	const heads = new Map(raw.records.map((r) => [s(r, "id"), r]));
	const indexed = /* @__PURE__ */ new Map();
	for (const [name, rows] of Object.entries(raw.tables)) {
		const owners = /* @__PURE__ */ new Map();
		if (!Array.isArray(rows)) throw Error("Tabela de compêndio inválida.");
		for (const row of rows) {
			const id = s(row, "revisao_id"), list = owners.get(id) ?? [];
			list.push(row);
			owners.set(id, list);
		}
		indexed.set(name, owners);
	}
	const rows = (table, id) => indexed.get("compendio_" + table)?.get(id) ?? [];
	const one = (table, id) => rows(table, id)[0] ?? {};
	const ref = (id) => {
		if (id === null || id === void 0) return null;
		const head = heads.get(String(id));
		if (!head) throw Error("Dependência do compêndio indisponível.");
		return {
			recordId: s(head, "registro_id"),
			revisionId: s(head, "id")
		};
	};
	const movements = (id) => rows("deslocamentos", id).map((r) => ({
		id: s(r, "id"),
		mode: r.modo,
		distance: n(r, "distancia"),
		unit: r.unidade,
		form: s(r, "forma_codigo"),
		condition: s(r, "condicao_pt"),
		hover: b(r, "pairar")
	}));
	const sizes = (id) => rows("especie_tamanhos", id).map((r) => ({
		code: s(r, "tamanho_codigo"),
		form: s(r, "forma_codigo"),
		default: b(r, "padrao")
	}));
	const entries = raw.records.map((r) => {
		const id = s(r, "id"), kind = r.tipo;
		let data;
		switch (kind) {
			case "classe": {
				const d = one("classes", id), attrs = rows("classe_atributos", id);
				data = {
					hitDie: n(d, "dado_vida"),
					subclassLevel: nullable(d, "nivel_subclasse") ?? void 0,
					fixedHitPoints: n(d, "pv_fixo"),
					primaryAbilities: attrs.filter((a) => a.papel === "primario").map((a) => a.atributo_codigo),
					multiclassAbilities: attrs.filter((a) => a.papel === "multiclasse").map((a) => ({
						ability: a.atributo_codigo,
						minimum: n(a, "valor_minimo"),
						alternativeGroup: n(a, "grupo_alternativo")
					})),
					levels: rows("classe_niveis", id).map((l) => ({ level: n(l, "nivel") })),
					proficiencies: rows("classe_proficiencias", id).map((p) => ({
						proficiencyId: s(p, "proficiencia_id"),
						acquisition: p.aquisicao
					}))
				};
				break;
			}
			case "subclasse": {
				const d = one("subclasses", id);
				data = {
					classRef: ref(d.classe_revisao_id),
					acquisitionLevel: n(d, "nivel_aquisicao"),
					levels: rows("subclasse_niveis", id).map((l) => ({ level: n(l, "nivel") }))
				};
				break;
			}
			case "especie": {
				const d = one("especies", id);
				data = {
					creatureType: s(d, "tipo_criatura_codigo"),
					lineageRequired: b(d, "linhagem_obrigatoria"),
					defaultSize: s(d, "tamanho_codigo"),
					age: s(d, "idade_pt"),
					sizes: sizes(id),
					movements: movements(id),
					senses: rows("sentidos", id).map((a) => ({
						type: s(a, "tipo"),
						distanceFeet: nullable(a, "distancia_pes"),
						condition: s(a, "condicao_pt")
					}))
				};
				break;
			}
			case "linhagem": {
				const d = one("linhagens", id);
				data = {
					speciesRef: ref(d.especie_revisao_id),
					inheritTraits: b(d, "herdar_tracos"),
					sizes: sizes(id),
					movements: movements(id)
				};
				break;
			}
			case "antecedente": {
				const d = one("antecedentes", id);
				data = {
					abilities: rows("antecedente_atributos", id).map((a) => a.atributo_codigo),
					distribution: d.distribuicao_atributos,
					abilityLimit: n(d, "limite_atributo")
				};
				break;
			}
			case "talento": {
				const d = one("talentos", id);
				data = {
					category: s(d, "categoria_codigo"),
					repeatable: b(d, "repetivel"),
					prerequisiteText: s(d, "pre_requisito_pt"),
					requirementsComplete: b(d, "requisitos_completos")
				};
				break;
			}
			case "caracteristica": {
				const d = one("caracteristicas", id);
				data = {
					category: s(d, "categoria"),
					manualDecision: b(d, "decisao_manual"),
					parentRef: ref(d.origem_revisao_id) ?? void 0,
					level: nullable(d, "nivel"),
					optional: b(d, "opcional")
				};
				break;
			}
			case "magia": {
				const d = one("magias", id), c = one("magia_componentes", id);
				data = {
					circle: n(d, "circulo"),
					school: s(d, "escola"),
					castingTime: s(d, "tempo_pt"),
					range: s(d, "alcance_pt"),
					rangeFeet: nullable(d, "alcance_pes"),
					duration: s(d, "duracao_pt"),
					durationSeconds: nullable(d, "duracao_segundos"),
					concentration: b(d, "concentracao"),
					ritual: b(d, "ritual"),
					components: {
						verbal: b(c, "verbal"),
						somatic: b(c, "somatico"),
						material: s(c, "material_pt"),
						costCopper: nullable(c, "custo_cobre"),
						consumed: b(c, "consumido")
					},
					classRefs: rows("magia_classes", id).map((x) => ref(x.classe_revisao_id)),
					damages: rows("magia_danos", id).map((x) => ({
						id: s(x, "id"),
						order: n(x, "ordem"),
						dice: s(x, "formula_dados"),
						damageType: x.tipo_dano_codigo
					})),
					scales: rows("magia_escalas", id).map((x) => ({
						level: n(x, "nivel"),
						basis: x.base,
						dice: s(x, "formula_dados")
					}))
				};
				break;
			}
			case "equipamento": {
				const d = one("equipamentos", id), w = rows("armas", id)[0], a = rows("armaduras", id)[0], shield = rows("escudos", id)[0], tool = rows("ferramentas", id)[0], magic = rows("itens_magicos", id)[0], vehicle = rows("veiculos", id)[0];
				data = {
					category: s(d, "categoria_codigo"),
					variantOf: ref(d.variante_de_revisao_id) ?? void 0,
					weight: nullable(d, "peso"),
					weightUnit: s(d, "unidade_peso"),
					cost: nullable(d, "custo"),
					currencyRef: ref(d.moeda_revisao_id),
					requiresAttunement: b(d, "requer_sintonia"),
					...w ? { weapon: {
						rangeType: w.alcance_tipo,
						normalRangeFeet: nullable(w, "alcance_normal_pes"),
						longRangeFeet: nullable(w, "alcance_longo_pes"),
						masteryRef: ref(w.maestria_revisao_id),
						criticalMinimum: n(w, "critico_minimo"),
						propertyRefs: rows("arma_propriedades", id).map((p) => ref(p.propriedade_revisao_id)),
						damages: rows("equipamento_danos", id).map((v) => ({
							dice: s(v, "formula_dados"),
							damageType: s(v, "tipo_dano_codigo"),
							ability: v.atributo_codigo
						}))
					} } : {},
					...a ? { armor: {
						baseAc: n(a, "ca_base"),
						addDexterity: b(a, "adicionar_destreza"),
						dexterityLimit: nullable(a, "limite_destreza"),
						strengthMinimum: nullable(a, "forca_minima"),
						stealthDisadvantage: b(a, "desvantagem_furtividade")
					} } : {},
					...shield ? { shield: { acBonus: n(shield, "bonus_ca") } } : {},
					...tool ? { tool: {
						ability: tool.atributo_codigo,
						usage: s(tool, "utilizacao_pt")
					} } : {},
					...magic ? { magicItem: {
						rarity: s(magic, "raridade"),
						maximumCharges: nullable(magic, "limite_cargas")
					} } : {},
					...vehicle ? { vehicle: {
						capacityKg: nullable(vehicle, "capacidade_kg"),
						speedFeet: nullable(vehicle, "velocidade_pes"),
						minimumCrew: nullable(vehicle, "tripulacao_minima")
					} } : {}
				};
				break;
			}
			case "pacote":
				data = {
					notes: s(one("pacotes", id), "observacoes_pt"),
					items: rows("pacote_itens", id).map((i) => ({
						id: s(i, "id"),
						equipmentRef: ref(i.equipamento_revisao_id),
						currencyRef: ref(i.moeda_revisao_id),
						quantity: n(i, "quantidade")
					}))
				};
				break;
			case "moeda": {
				const d = one("moedas", id);
				data = {
					code: s(d, "codigo"),
					symbol: s(d, "simbolo"),
					copperValue: nullable(d, "valor_cobre")
				};
				break;
			}
			case "idioma": {
				const d = one("idiomas", id);
				data = {
					category: s(d, "categoria"),
					origin: s(d, "origem_pt")
				};
				break;
			}
			case "maestria":
				data = { key: s(one("maestrias", id), "chave") };
				break;
			case "propriedade_arma":
				data = { key: s(one("propriedades_arma", id), "chave") };
				break;
			case "servico": {
				const d = one("servicos", id);
				data = {
					cost: n(d, "custo"),
					currencyRef: ref(d.moeda_revisao_id),
					unit: s(d, "unidade_cobranca")
				};
				break;
			}
			case "criatura": {
				const d = one("criaturas", id);
				data = {
					creatureType: s(d, "tipo_criatura_codigo"),
					size: s(d, "tamanho_codigo"),
					armorClass: nullable(d, "ca"),
					armorClassText: s(d, "ca_formula_pt"),
					hitPointFormula: d.pv_formula,
					challenge: d.desafio,
					abilities: Object.fromEntries(Object.entries({
						for: "forca",
						des: "destreza",
						con: "constituicao",
						int: "inteligencia",
						sab: "sabedoria",
						car: "carisma"
					}).filter(([, key]) => d[key] !== null).map(([ability, key]) => [ability, n(d, key)])),
					actions: rows("criatura_acoes", id).map((x) => ({
						id: s(x, "id"),
						name: s(x, "nome_pt"),
						type: s(x, "tipo"),
						description: s(x, "descricao_pt"),
						attackBonus: nullable(x, "bonus_ataque"),
						saveDc: nullable(x, "cd")
					}))
				};
				break;
			}
			default: throw Error("Domínio de compêndio desconhecido.");
		}
		const f = r.fonte ?? {};
		const source = {
			id: s(f, "id"),
			title: s(f, "titulo"),
			edition: s(f, "edicao"),
			language: s(f, "idioma"),
			origin: f.origem,
			author: s(f, "autoria"),
			referenceUrl: s(f, "referencia_url"),
			attribution: s(f, "atribuicao"),
			path: s(f, "caminho"),
			commit: s(f, "commit_fonte"),
			hash: s(f, "hash_fonte")
		};
		return {
			...summaryFromRow(r),
			kind,
			description: s(r, "descricao_pt"),
			descriptionHtml: s(r, "descricao_html"),
			aliases: r.aliases ?? [],
			source,
			data
		};
	});
	const all = (table) => raw.tables["compendio_" + table] ?? [];
	const requirements = all("requisitos").map((r) => ({
		id: s(r, "id"),
		ownerRevisionId: s(r, "revisao_id"),
		parentId: r.pai_id,
		operator: r.operador,
		ability: r.atributo_codigo,
		targetRef: ref(r.alvo_revisao_id),
		minimum: nullable(r, "minimo"),
		choiceKey: r.escolha_chave,
		proficiencyId: r.proficiencia_id
	}));
	const choices = all("grupos_escolha").map((g) => ({
		id: s(g, "id"),
		ownerRevisionId: s(g, "revisao_id"),
		key: s(g, "chave"),
		name: s(g, "nome_pt"),
		minimum: n(g, "minimo"),
		maximum: n(g, "maximo"),
		acquisition: g.aquisicao,
		abilityPoints: nullable(g, "pontos_atributo"),
		abilityLimit: nullable(g, "limite_atributo"),
		optionKind: g.tipo_opcao,
		featCategory: g.categoria_talento_codigo,
		requirementId: g.requisito_id,
		level: n(g, "nivel"),
		options: all("opcoes_escolha").filter((o) => o.grupo_id === g.id).map((o) => ({
			id: s(o, "id"),
			groupId: s(o, "grupo_id"),
			name: s(o, "nome_pt"),
			type: s(o, "tipo"),
			targetRef: ref(o.alvo_revisao_id),
			ability: o.atributo_codigo,
			proficiencyId: o.proficiencia_id,
			value: o.valor,
			quantity: n(o, "quantidade")
		}))
	}));
	const grants = all("concessoes").map((g) => ({
		id: s(g, "id"),
		ownerRevisionId: s(g, "revisao_id"),
		key: s(g, "chave"),
		kind: g.tipo,
		targetRef: ref(g.alvo_revisao_id),
		groupId: g.grupo_id,
		requirementId: g.requisito_id,
		level: n(g, "nivel"),
		acquisition: g.aquisicao,
		quantity: n(g, "quantidade")
	}));
	const effects = all("efeitos").map((e) => ({
		id: s(e, "id"),
		ownerRevisionId: s(e, "revisao_id"),
		key: s(e, "chave"),
		type: e.tipo,
		formula: e.formula,
		requirementId: e.requisito_id,
		level: n(e, "nivel"),
		stacking: e.acumulacao,
		condition: s(e, "condicao_pt"),
		abilities: all("efeito_atributos").filter((a) => a.efeito_id === e.id).map((a) => ({
			ability: a.atributo_codigo,
			increase: n(a, "aumento"),
			limit: n(a, "limite")
		})),
		defenses: all("efeito_defesas").filter((a) => a.efeito_id === e.id).map((a) => ({
			damageType: a.tipo_dano_codigo,
			unarmored: b(a, "sem_armadura"),
			permitsShield: b(a, "permite_escudo")
		})),
		resources: all("efeito_recursos").filter((a) => a.efeito_id === e.id).map((a) => ({
			name: s(a, "nome_pt"),
			recovery: a.recuperacao
		})),
		proficiencies: all("efeito_proficiencias").filter((a) => a.efeito_id === e.id).map((a) => ({
			proficiencyId: s(a, "proficiencia_id"),
			degree: a.grau
		}))
	}));
	const proficiencies = all("proficiencias").map((p) => ({
		id: s(p, "id"),
		ownerRevisionId: s(p, "revisao_id"),
		type: p.tipo,
		skill: p.pericia_codigo ?? void 0,
		ability: p.atributo_codigo ?? void 0,
		equipment: ref(p.equipamento_revisao_id) ?? void 0,
		category: p.categoria_codigo ?? void 0,
		language: ref(p.idioma_revisao_id) ?? void 0
	}));
	const castingProfiles = all("perfis_conjuracao").map((p) => ({
		listClassRefs: all("perfil_listas").filter((l) => l.perfil_id === p.id).map((l) => ref(l.classe_revisao_id)),
		listChoiceKey: p.chave_escolha_lista ?? null,
		selectionUses: nullable(p, "usos_selecao"),
		selectionRecovery: p.recuperacao_selecao ?? null,
		id: s(p, "id"),
		ownerRevisionId: s(p, "revisao_id"),
		key: s(p, "chave"),
		type: p.tipo,
		method: p.metodo,
		contributionNumerator: n(p, "contribuicao_numerador"),
		contributionDenominator: n(p, "contribuicao_denominador"),
		rounding: p.arredondamento,
		firstLevel: n(p, "nivel_inicial"),
		abilities: all("perfil_atributos").filter((a) => a.perfil_id === p.id).map((a) => a.atributo_codigo),
		progression: all("conjuracao_progressao").filter((l) => l.perfil_id === p.id).map((l) => ({
			level: n(l, "nivel"),
			cantrips: n(l, "truques"),
			prepared: nullable(l, "magias_preparadas"),
			known: nullable(l, "magias_conhecidas"),
			maximumCircle: nullable(l, "circulo_maximo")
		})),
		slots: all("espacos_magia").filter((l) => l.perfil_id === p.id).map((l) => ({
			level: n(l, "nivel"),
			circle: n(l, "circulo"),
			total: n(l, "total")
		})),
		spells: all("magias_concedidas").filter((l) => l.perfil_id === p.id).map((l) => ({
			spellRef: ref(l.magia_revisao_id),
			level: n(l, "nivel"),
			alwaysPrepared: b(l, "sempre_preparada"),
			usesSlots: b(l, "usa_espacos"),
			ownUses: nullable(l, "usos_proprios"),
			recovery: l.recuperacao
		}))
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
		equipmentOptions: all("opcoes_equipamento").map((o) => ({
			id: s(o, "id"),
			ownerRevisionId: s(o, "revisao_id"),
			key: s(o, "chave"),
			name: s(o, "nome_pt"),
			packageRef: ref(o.pacote_revisao_id),
			acquisition: o.aquisicao
		})),
		multiclassSlots: castingProfiles.find((p) => p.key === "multiclasse")?.slots ?? []
	};
}
//#endregion
//#region packages/compendium/errors.ts
var CompendiumError = class extends Error {
	code;
	constructor(code) {
		super(code === "NOT_FOUND" ? "A revisão do compêndio não está disponível." : code === "INVALID_QUERY" ? "Os parâmetros da consulta do compêndio são inválidos." : "Não foi possível consultar o compêndio. Tente novamente.");
		this.code = code;
		this.name = "CompendiumError";
	}
};
//#endregion
//#region apps/web/lib/compendium.ts
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function cancelled(signal) {
	if (signal?.aborted) throw new DOMException("Consulta cancelada.", "AbortError");
}
function uuid(value) {
	if (!UUID.test(value)) throw new CompendiumError("INVALID_QUERY");
	return value;
}
async function request(client, name, args, signal) {
	cancelled(signal);
	try {
		let call = client.rpc(name, args);
		if (signal) call = call.abortSignal(signal);
		const { data, error } = await call;
		cancelled(signal);
		if (error) throw error;
		return data;
	} catch (error) {
		cancelled(signal);
		if (error instanceof CompendiumError) throw error;
		throw new CompendiumError("UNAVAILABLE");
	}
}
function createCompendiumRepository(client) {
	async function catalog(refs, rules, signal) {
		refs.forEach((r) => {
			uuid(r.recordId);
			uuid(r.revisionId);
		});
		const raw = await request(client, "obter_compendio", {
			p_revisoes: [...new Set(refs.map((r) => r.revisionId))],
			p_conjunto: rules
		}, signal);
		let result;
		try {
			result = decodeCatalog(raw, rules ?? raw.records[0]?.conjunto_regras_codigo ?? "dnd-5e-2024");
		} catch {
			throw new CompendiumError("UNAVAILABLE");
		}
		if (refs.some((ref) => !result.entries.some((e) => e.ref.revisionId === ref.revisionId && e.ref.recordId === ref.recordId))) throw new CompendiumError("NOT_FOUND");
		return result;
	}
	return {
		async list(query, signal) {
			cancelled(signal);
			if (!/^[a-z0-9-]{1,80}$/.test(query.ruleSetId) || query.kind && !COMPENDIUM_KINDS.includes(query.kind) || query.query && query.query.length > 200) throw new CompendiumError("INVALID_QUERY");
			const limit = query.limit ?? 24;
			if (!Number.isInteger(limit) || limit < 1 || limit > 100 || query.circle !== void 0 && (!Number.isInteger(query.circle) || query.circle < 0 || query.circle > 9)) throw new CompendiumError("INVALID_QUERY");
			let cursor = null;
			if (query.cursor) try {
				cursor = JSON.parse(decodeURIComponent(query.cursor));
				if (!cursor || typeof cursor.name !== "string" || cursor.name.length > 240 || !UUID.test(cursor.id)) throw Error();
			} catch {
				throw new CompendiumError("INVALID_QUERY");
			}
			const rows = await request(client, "buscar_compendio", {
				p_conjunto: query.ruleSetId,
				p_tipo: query.kind ?? null,
				p_busca: query.query?.trim() ?? null,
				p_fonte: query.sourceId ? uuid(query.sourceId) : null,
				p_classe: query.classRevisionId ? uuid(query.classRevisionId) : null,
				p_pai: query.parentRevisionId ? uuid(query.parentRevisionId) : null,
				p_circulo: query.circle ?? null,
				p_apos_nome: cursor?.name ?? null,
				p_apos_registro: cursor?.id ?? null,
				p_limite: limit + 1
			}, signal);
			if (!Array.isArray(rows)) throw new CompendiumError("UNAVAILABLE");
			const entries = rows.slice(0, limit).map(summaryFromRow), last = entries.at(-1);
			return {
				entries,
				nextCursor: rows.length > limit && last ? encodeURIComponent(JSON.stringify({
					name: last.name,
					id: last.ref.recordId
				})) : null
			};
		},
		async get(ref, signal) {
			return (await catalog([ref], null, signal)).entries.find((e) => e.ref.revisionId === ref.revisionId);
		},
		async getContext(ref, signal) {
			return catalog([ref], null, signal);
		},
		async getCreationCatalog(draft, signal) {
			if (!/^[a-z0-9-]{1,80}$/.test(draft.ruleSetId)) throw new CompendiumError("INVALID_QUERY");
			return catalog([
				draft.speciesRef,
				draft.lineageRef,
				draft.backgroundRef,
				...draft.classes.flatMap((c) => [c.classRef, c.subclassRef]),
				...draft.spellSelections.map((s) => s.spellRef),
				...draft.choices.flatMap((c) => c.values.flatMap((v) => v.type === "record" ? [v.ref] : []))
			].filter((r) => !!r), draft.ruleSetId, signal);
		}
	};
}
//#endregion
export { CreationError, createCompendiumRepository, createCreationHandler };
