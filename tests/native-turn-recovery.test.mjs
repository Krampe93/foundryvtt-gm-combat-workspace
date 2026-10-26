import assert from "node:assert/strict";
import test from "node:test";
import { applyLegendaryRecoveryTiming } from "../scripts/services/native-turn-recovery.js";

const combatant = () => ({ parent: { started: true }, actor: { type: "npc", system: { resources: {
  legact: { max: 4, spent: 2 }, legres: { max: 4, spent: 1 }
} } } });

test("turn end suppresses only the native legendary-action refill, preserving other recovery", () => {
  const results = { actor: { "system.resources.legact.spent": 0, "system.resources.legres.spent": 0,
    "system.attributes.hp.value": 50 }, item: [{ _id: "item", "system.uses.spent": 0 }], rolls: [{ total: 6 }] };
  applyLegendaryRecoveryTiming(combatant(), ["turnEnd"], results);
  assert.deepEqual(results.actor, { "system.resources.legres.spent": 0, "system.attributes.hp.value": 50 });
  assert.equal(results.item.length, 1);
  assert.equal(results.rolls[0].total, 6);
});

test("own turn start restores the derived legendary budget without touching resistances", () => {
  const entry = combatant();
  const results = { actor: {} };
  applyLegendaryRecoveryTiming(entry, ["turn", "turnStart"], results);
  assert.deepEqual(results.actor, { "system.resources.legact.spent": 0 });
  assert.equal(entry.actor.system.resources.legres.spent, 1);
});

test("encounter recovery, stopped fights, player actors and actors without legendary resources stay native", () => {
  const path = "system.resources.legact.spent";
  const results = () => ({ actor: { [path]: 0 } });
  const fresh = results();
  applyLegendaryRecoveryTiming(combatant(), ["encounter", "turnEnd"], fresh);
  assert.equal(fresh.actor[path], 0);
  for (const modify of [entry => { entry.parent.started = false; }, entry => { entry.actor.type = "character"; },
    entry => { entry.actor.system.resources.legact.max = 0; }]) {
    const entry = combatant(); modify(entry);
    const untouched = results();
    applyLegendaryRecoveryTiming(entry, ["turnEnd"], untouched);
    assert.equal(untouched.actor[path], 0);
  }
});
