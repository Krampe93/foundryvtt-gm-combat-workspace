import { MODULE_ID } from "../config.js";
import { collectionValues } from "./reaction-operations.js";

export function rechargeResources(actor) {
  const resources = [];
  for (const item of collectionValues(actor?.items)) {
    const add = (uses, activity = null) => {
      const recovery = collectionValues(uses?.recovery).find((entry) => (entry.period ?? entry.type) === "recharge");
      if (!recovery) return;
      const match = String(recovery.formula ?? "").match(/^\s*([1-6])(?:\s*[-–]\s*6)?\s*$/);
      const maximum = Number(uses.max) || 1;
      const spent = Number(uses.spent) || 0;
      const remaining = uses.value === undefined ? Math.max(0, maximum - spent) : Number(uses.value);
      resources.push({ id: `${item.id}:${activity?.id ?? "item"}`, itemId: item.id, activityId: activity?.id ?? null,
        name: activity?.name && ![item.name, "Utility", "Save", "Damage", "Attack"].includes(activity.name)
          ? `${item.name} · ${activity.name}` : item.name,
        maximum, spent, remaining, available: remaining > 0,
        threshold: match ? Number(match[1]) : null,
        roll: uses.rollRecharge, uses });
    };
    add(item.system?.uses);
    for (const activity of collectionValues(item.system?.activities)) add(activity.uses ?? activity.system?.uses, activity);
  }
  return resources;
}

/** Native D&D5e owns the die, success threshold, hooks and resource update. */
export class RechargeRolls {
  #busy = new Map();
  #changed;

  constructor({ changed = () => {} } = {}) { this.#changed = changed; }

  isBusy(actor, id) { return this.#busy.has(`${actor?.uuid ?? actor?.id}:${id}`); }

  async roll(actor, id) {
    const key = `${actor?.uuid ?? actor?.id}:${id}`;
    if (this.#busy.has(key)) return this.#busy.get(key);
    const resource = rechargeResources(actor).find((entry) => entry.id === id);
    if (!resource || actor?.type !== "npc") throw new Error("Die Recharge-Fähigkeit wurde nicht gefunden.");
    if (resource.spent <= 0) return null;
    if (!resource.threshold) throw new Error(`${resource.name}: ungültige Recharge-Schwelle. Bitte im Sheet korrigieren.`);
    if (typeof resource.roll !== "function") throw new Error(`${resource.name}: nativer D&D5e-Recharge-Wurf nicht verfügbar.`);
    const task = Promise.resolve().then(() => resource.roll.call(resource.uses, {}, { configure: false }, {
      rollMode: "gmroll", data: { flags: { [MODULE_ID]: { kind: "recharge" } } }
    }));
    this.#busy.set(key, task);
    this.#changed();
    try { return await task; }
    finally { this.#busy.delete(key); this.#changed(); }
  }
}
