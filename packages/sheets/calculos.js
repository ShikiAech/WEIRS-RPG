export function modificador(valor, ajuste = 0) {
  return Math.floor((valor - 10) / 2) + ajuste;
}
export function nivelTotal(classes) {
  return classes.reduce((n, c) => n + c.nivel, 0);
}
export function proficiencia(nivel, ajuste = 0) {
  return 2 + Math.floor((nivel - 1) / 4) + ajuste;
}
export function calcularFicha(c) {
  const nivel = nivelTotal(c.classes),
    p = proficiencia(nivel, c.combate.ajusteProficiencia);
  const atributos = Object.fromEntries(
    Object.entries(c.atributos).map(([k, v]) => [k, modificador(v.valor, v.ajusteModificador)]),
  );
  const resistencias = Object.fromEntries(
    Object.entries(c.atributos).map(([k, v]) => [
      k,
      atributos[k] + (v.resistenciaProficiente ? p : 0) + v.ajusteResistencia,
    ]),
  );
  const graus = { nenhuma: 0, meia: Math.floor(p / 2), proficiente: p, especializacao: 2 * p };
  const pericias = Object.fromEntries(
    Object.entries(c.pericias).map(([k, v]) => [
      k,
      atributos[v.atributo] + graus[v.grau] + v.ajuste,
    ]),
  );
  const perfis = Object.fromEntries(
    c.conjuracao.perfis.map((x) => {
      const mod = atributos[x.atributo] + x.ajusteModificador;
      return [
        x.id,
        { modificador: mod, cd: 8 + p + mod + x.ajusteCd, ataque: p + mod + x.ajusteAtaque },
      ];
    }),
  );
  return {
    nivel,
    proficiencia: p,
    atributos,
    resistencias,
    pericias,
    perfis,
    iniciativa: atributos.des + c.combate.ajusteIniciativa,
    percepcaoPassiva: 10 + pericias.percepcao + c.combate.ajustePercepcaoPassiva,
  };
}
