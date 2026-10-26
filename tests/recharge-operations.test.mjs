import assert from "node:assert/strict";
import test from "node:test";
import { MODULE_ID } from "../scripts/config.js";
import { RechargeRolls, rechargeResources } from "../scripts/services/recharge-operations.js";

function fixture(roll = async () => undefined) {
  const uses = { max: 1, spent: 1, recovery: [{ period: "recharge", formula: "5" }], rollRecharge: roll };
  const item = { id: "breath", name: "Fire Breath", system: { uses, activities: [] } };
  const actor = { id: "dragon", uuid: "Scene.s.Token.a.Actor.dragon", type: "npc", items: [item] };
  return { actor, item, uses };
}

test("reads separate item and activity recharge profiles from structured data", () => {
  const { actor, item } = fixture();
  item.system.activities.push({ id: "deflect", name: "Deflect Missile", uses: {
    max: 2, spent: 2, value: 0, recovery: [{ period: "recharge", formula: "6" }]
  } });
  assert.deepEqual(rechargeResources(actor).map(({ id, maximum, remaining, threshold }) => ({ id, maximum, remaining, threshold })), [
    { id: "breath:item", maximum: 1, remaining: 0, threshold: 5 },
    { id: "breath:deflect", maximum: 2, remaining: 0, threshold: 6 }
  ]);
  item.system.uses.recovery[0].formula = "5–6";
  assert.equal(rechargeResources(actor)[0].threshold, 5);
  actor.items.push({ id: "description-only", name: "Recharge 6", system: { description: { value: "Recharge 6" } } });
  assert.equal(rechargeResources(actor).length, 2, "names and prose never create a resource");
});

test("native recharge owns success and failure, with private GM messages and no configuration dialog", async () => {
  const { actor, uses } = fixture();
  let calls = 0;
  const seen = [];
  uses.rollRecharge = async (config, dialog, message) => {
    calls++;
    assert.deepEqual(config, {});
    assert.deepEqual(dialog, { configure: false });
    assert.equal(message.rollMode, "gmroll");
    assert.equal(message.data.flags[MODULE_ID].kind, "recharge");
    if (calls === 2) uses.spent = 0;
    return { rolls: [{ total: calls === 1 ? 4 : 5 }] };
  };
  const rolls = new RechargeRolls({ changed: () => seen.push(rolls.isBusy(actor, "breath:item")) });
  await rolls.roll(actor, "breath:item");
  assert.equal(uses.spent, 1, "a failed native result is not overridden");
  await rolls.roll(actor, "breath:item");
  assert.equal(uses.spent, 0);
  await rolls.roll(actor, "breath:item");
  assert.equal(calls, 2, "ready resources are not rolled again");
  assert.deepEqual(seen, [true, false, true, false]);
});

test("double clicks share one native roll and release busy state after cancellation or errors", async () => {
  let release;
  let calls = 0;
  const { actor, uses } = fixture(() => { calls++; return new Promise((resolve) => { release = resolve; }); });
  const rolls = new RechargeRolls();
  const first = rolls.roll(actor, "breath:item");
  const second = rolls.roll(actor, "breath:item");
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(rolls.isBusy(actor, "breath:item"), true);
  release(undefined);
  await Promise.all([first, second]);
  assert.equal(uses.spent, 1);
  assert.equal(rolls.isBusy(actor, "breath:item"), false);
  uses.rollRecharge = async () => { throw new Error("native failure"); };
  await assert.rejects(rolls.roll(actor, "breath:item"), /native failure/);
  assert.equal(rolls.isBusy(actor, "breath:item"), false);
});

test("invalid thresholds, non-NPCs and missing native methods cannot restore a charge", async () => {
  const { actor, uses } = fixture();
  const rolls = new RechargeRolls();
  uses.recovery[0].formula = "1d6";
  await assert.rejects(rolls.roll(actor, "breath:item"), /ungültige Recharge-Schwelle/);
  uses.recovery[0].formula = "5";
  delete uses.rollRecharge;
  await assert.rejects(rolls.roll(actor, "breath:item"), /nativer D&D5e/);
  actor.type = "character";
  await assert.rejects(rolls.roll(actor, "breath:item"), /nicht gefunden/);
  assert.equal(uses.spent, 1);
});

test("partially spent resources can recharge even while one use remains", async () => {
  const { actor, uses } = fixture();
  uses.max = 2;
  let calls = 0;
  uses.rollRecharge = async () => { calls++; uses.spent = 0; };
  assert.equal(rechargeResources(actor)[0].remaining, 1);
  await new RechargeRolls().roll(actor, "breath:item");
  assert.equal(calls, 1);
  assert.equal(uses.spent, 0);
});
