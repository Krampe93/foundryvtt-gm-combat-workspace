export function combatantInitiative(combatant) {
  return (combatant.group ? combatant.group.initiative : combatant.initiative) ?? null;
}

/** Read live initiative; the native turns cache supplies tie order, never stale initiative order. */
export function orderedCombatants(combat) {
  const collection = combat?.combatants;
  const entries = Array.from(collection?.values?.() ?? collection ?? []);
  const turns = Array.isArray(combat?.turns) ? combat.turns : [];
  const nativeOrder = new Map(turns.map((entry, index) => [entry.id, index]));
  const initiative = (entry) => {
    const value = combatantInitiative(entry);
    return value === null || value === "" || !Number.isFinite(Number(value)) ? -Infinity : Number(value);
  };
  return entries.sort((a, b) => {
    const left = initiative(a), right = initiative(b);
    if (left !== right) return left > right ? -1 : 1;
    const leftOrder = nativeOrder.get(a.id), rightOrder = nativeOrder.get(b.id);
    if (leftOrder !== undefined || rightOrder !== undefined) {
      return (leftOrder ?? turns.length) - (rightOrder ?? turns.length);
    }
    return 0;
  });
}
