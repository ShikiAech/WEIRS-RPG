const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ABILITIES = ['for', 'des', 'con', 'int', 'sab', 'car'];
const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const list = (v, max, fn) => Array.isArray(v) && v.length <= max && v.every(fn);
const text = (v, max) => typeof v === 'string' && v.length <= max;
const ref = (v) =>
  object(v) && UUID.test(v.recordId) && UUID.test(v.revisionId) && Object.keys(v).length === 2;
const nullableRef = (v) => v === null || ref(v);
const scores = (v, min, max) =>
  object(v) &&
  Object.entries(v).every(([key, n]) => ABILITIES.includes(key) && integer(n, min, max));
/** @param {unknown} value @returns {value is import('../contracts/character-creation').CreationDraft} */
export function validCreationDraft(value) {
  const d = /** @type {any} */ (value);
  if (
    !object(d) ||
    !UUID.test(d.id) ||
    d.engineVersion !== 1 ||
    !text(d.ruleSetId, 80) ||
    !/^[a-z0-9-]+$/.test(d.ruleSetId)
  )
    return false;
  const a = d.abilities;
  if (
    !object(a) ||
    !['rolls', 'external'].includes(a.mode) ||
    !list(a.sets, 2, (s) => list(s, 6, (n) => integer(n, 3, 18))) ||
    !(a.selectedSet === null || integer(a.selectedSet, 0, 1)) ||
    !scores(a.assignment, 0, 5) ||
    !scores(a.external, 1, 30) ||
    !scores(a.backgroundBonuses, 0, 3)
  )
    return false;
  if (
    !nullableRef(d.speciesRef) ||
    !nullableRef(d.lineageRef) ||
    !nullableRef(d.backgroundRef) ||
    !(d.size === null || text(d.size, 80)) ||
    !text(d.form, 120)
  )
    return false;
  if (
    !list(
      d.classes,
      20,
      (c) =>
        object(c) &&
        UUID.test(c.id) &&
        ref(c.classRef) &&
        nullableRef(c.subclassRef) &&
        integer(c.level, 1, 20),
    ) ||
    !list(
      d.levels,
      20,
      (l) =>
        object(l) &&
        integer(l.totalLevel, 1, 20) &&
        UUID.test(l.classEntryId) &&
        ['fixed', 'roll', 'external'].includes(l.hitPointMethod) &&
        (l.hitPointRoll === null || integer(l.hitPointRoll, 1, 12)),
    )
  )
    return false;
  if (
    !list(
      d.choices,
      500,
      (c) =>
        object(c) &&
        UUID.test(c.groupId) &&
        text(c.sourceInstanceId, 4096) &&
        list(
          c.values,
          100,
          (v) =>
            object(v) &&
            (v.type === 'option'
              ? UUID.test(v.optionId)
              : v.type === 'record'
                ? ref(v.ref)
                : v.type === 'ability'
                  ? ABILITIES.includes(v.ability) && integer(v.amount, 1, 3)
                  : v.type === 'proficiency'
                    ? UUID.test(v.proficiencyId)
                    : v.type === 'text' && text(v.value, 1000)),
        ),
    )
  )
    return false;
  return (
    list(
      d.equipmentOptions,
      100,
      (e) => object(e) && UUID.test(e.ownerRevisionId) && UUID.test(e.optionId),
    ) &&
    (d.equippedRefs === undefined || list(d.equippedRefs, 100, ref)) &&
    list(
      d.spellSelections,
      1000,
      (s) =>
        object(s) && text(s.profileId, 4096) && ref(s.spellRef) && typeof s.prepared === 'boolean',
    ) &&
    list(
      d.castingAbilities,
      100,
      (s) => object(s) && text(s.profileId, 4096) && ABILITIES.includes(s.ability),
    )
  );
}
/** @param {unknown} value @returns {value is import('../contracts/character-creation').CreationSnapshot} */
export function validCreationSnapshot(value) {
  const s = /** @type {any} */ (value);
  return (
    object(s) &&
    s.schemaVersion === 1 &&
    validCreationDraft(s.draft) &&
    list(
      s.contributions,
      1000,
      (c) =>
        object(c) &&
        UUID.test(c.id) &&
        UUID.test(c.sourceRevisionId) &&
        (c.sourceRecordId === undefined || UUID.test(c.sourceRecordId)) &&
        text(c.sourceInstanceId, 4096) &&
        (c.grantId === null || UUID.test(c.grantId)) &&
        text(c.target, 80) &&
        text(c.name, 240) &&
        (c.amount === null ||
          (typeof c.amount === 'number' &&
            Number.isFinite(c.amount) &&
            Math.abs(c.amount) <= 1000000)),
    )
  );
}
