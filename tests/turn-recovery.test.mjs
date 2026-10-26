import assert from "node:assert/strict";
import test from "node:test";
import { MODULE_ID } from "../scripts/config.js";
import { LEGENDARY_LOCK_FLAG_KEY, reactionResetMode } from "../scripts/services/reaction-operations.js";
import { TurnRecovery, TURN_RECOVERY_FLAG, isForwardCombatTurn } from "../scripts/services/turn-recovery.js";

globalThis.game = { user: { id: "gm" }, users: { activeGM: { id: "gm" } } };

function fixture() {
  const flags = { [LEGENDARY_LOCK_FLAG_KEY]: { dragon: { command: true }, other: { command: true } } };
  const combat = { started: true, getFlag: (_scope, key) => flags[key],
    async setFlag(scope, key, value) { assert.equal(scope, MODULE_ID); flags[key] = structuredClone(value); },
    async unsetFlag(_scope, key) { const [root, child] = key.split("."); delete flags[root][child]; } };
  const dragon = { id: "dragon", type: "npc", items: [], system: { resources: { legact: { max: 4, spent: 3 }, legres: { spent: 2 } } },
    async update(data) { this.system.resources.legact.spent = data["system.resources.legact.spent"]; } };
  const reactive = { id: "reactive", items: [{ system: { description: { value: "The marilith can take one reaction on every turn in a combat." } } }] };
  const actors = new Map([["dragon", dragon], ["reactive", reactive]]);
  const resets = [];
  const recharges = [];
  dragon.items.push({ id: "breath", name: "Breath", system: { uses: { max: 1, spent: 1, recovery: [{ period: "recharge", formula: "5" }] } } });
  const create = () => new TurnRecovery({ getActor: (entry) => actors.get(entry.id),
    resetReaction: async (id, source) => resets.push({ id, source }),
    recharge: { roll: async (_actor, id) => recharges.push(id) } });
  const snapshot = (round, turn, activeType = "npc") => ({ combatId: "fight", started: true, round, turn,
    activeCombatantId: activeType === "npc" ? "dragon" : "player", activeType,
    combatants: [{ id: "dragon", type: "npc" }, { id: "reactive", type: "npc" }], context: { combat, actor: activeType === "npc" ? dragon : null } });
  return { flags, combat, dragon, reactive, resets, recharges, create, snapshot };
}

test("distinguishes actual forward turn changes from backtracking, redraws and viewing another encounter", () => {
  const { snapshot } = fixture();
  const previous = snapshot(2, 3);
  assert.equal(isForwardCombatTurn(previous, snapshot(2, 4, "player")), true);
  assert.equal(isForwardCombatTurn(previous, snapshot(3, 0)), true);
  assert.equal(isForwardCombatTurn(previous, snapshot(2, 2)), false);
  assert.equal(isForwardCombatTurn(previous, snapshot(1, 4)), false);
  assert.equal(isForwardCombatTurn(previous, previous), false);
  assert.equal(isForwardCombatTurn(null, previous), false);
  assert.equal(isForwardCombatTurn({ ...previous, combatId: "other" }, snapshot(3, 0)), false);
  assert.equal(isForwardCombatTurn({ ...previous, started: false }, previous), true);
});

test("normal and explicit per-turn reactions reset at their own intended boundaries", async () => {
  const f = fixture();
  const service = f.create();
  const previous = f.snapshot(2, 0);
  await service.initialize(previous);
  assert.deepEqual(f.resets, [], "opening an existing combat does not reset anything");
  await service.handle({ previousSnapshot: previous, snapshot: f.snapshot(2, 1, "player") });
  assert.deepEqual(f.resets, [{ id: "reactive", source: "per-turn" }]);
  assert.equal(f.dragon.system.resources.legact.spent, 3);
  await service.handle({ previousSnapshot: f.snapshot(2, 1, "player"), snapshot: f.snapshot(2, 2) });
  assert.deepEqual(f.resets.slice(1), [{ id: "dragon", source: "turn-start" }, { id: "reactive", source: "per-turn" }]);
  assert.equal(f.dragon.system.resources.legact.spent, 0);
  assert.equal(f.dragon.system.resources.legres.spent, 2);
  assert.deepEqual(f.flags[LEGENDARY_LOCK_FLAG_KEY], { other: { command: true } });
  assert.deepEqual(f.recharges, ["breath:item"]);
});

test("persisted turn markers prevent duplicate recharge/reset after redraw, backtracking and reload", async () => {
  const f = fixture();
  let service = f.create();
  await service.initialize(f.snapshot(2, 0));
  const event = { previousSnapshot: f.snapshot(2, 0, "player"), snapshot: f.snapshot(2, 1) };
  await Promise.all([service.handle(event), service.handle(event)]);
  assert.equal(f.recharges.length, 1);
  f.dragon.system.resources.legact.spent = 2;
  await service.handle({ previousSnapshot: event.snapshot, snapshot: f.snapshot(2, 0, "player") });
  await service.handle(event);
  assert.equal(f.recharges.length, 1);
  assert.equal(f.dragon.system.resources.legact.spent, 2);
  service.stop();
  service = f.create();
  await service.initialize(f.snapshot(2, 0));
  await service.handle(event);
  assert.equal(f.recharges.length, 1);
  assert.equal(f.dragon.system.resources.legact.spent, 2);
  await service.handle({ previousSnapshot: event.snapshot, snapshot: f.snapshot(4, 0) });
  assert.equal(f.recharges.length, 2, "a forward round jump handles the current turn once");
  assert.deepEqual(f.flags[TURN_RECOVERY_FLAG], { round: 4, turn: 0 });
});

test("an inactive GM or stopped service never performs automatic recovery", async () => {
  const f = fixture();
  game.users.activeGM.id = "someone-else";
  try {
    const service = f.create();
    await service.handle({ previousSnapshot: f.snapshot(2, 0, "player"), snapshot: f.snapshot(2, 1) });
    assert.deepEqual(f.recharges, []);
    assert.equal(f.flags[TURN_RECOVERY_FLAG], undefined);
  } finally { game.users.activeGM.id = "gm"; }
  const service = f.create();
  const pending = service.handle({ previousSnapshot: f.snapshot(2, 0, "player"), snapshot: f.snapshot(2, 1) });
  service.stop();
  await pending;
  assert.deepEqual(f.resets, []);
});

test("per-turn wording is explicit, including German, and unrelated once-per-turn damage stays ordinary", () => {
  const actor = (value) => ({ items: [{ system: { description: { value } } }] });
  assert.equal(reactionResetMode(actor("Reactive. The marilith can take one reaction on every turn in a combat.")), "turn");
  assert.equal(reactionResetMode(actor("Die Kreatur kann eine Reaktion in jedem Zug verwenden.")), "turn");
  assert.equal(reactionResetMode(actor("Once per turn, the attack deals extra damage.")), "own-turn");
  assert.equal(reactionResetMode(actor("The monster can take three reactions per round.")), "own-turn");
});

test("reindexing the active combatant is not a new turn and does not block the following turns", async () => {
  const f = fixture();
  const service = f.create();
  await service.initialize(f.snapshot(2, 4));
  await service.handle({ previousSnapshot: f.snapshot(2, 4), snapshot: f.snapshot(2, 2) });
  assert.deepEqual(f.resets, []);
  assert.deepEqual(f.recharges, []);
  await service.handle({ previousSnapshot: f.snapshot(2, 2), snapshot: f.snapshot(2, 3, "player") });
  await service.handle({ previousSnapshot: f.snapshot(2, 3, "player"), snapshot: f.snapshot(2, 4) });
  assert.equal(f.recharges.length, 1);
});

test("starting a fresh encounter in the same document does not retain an old round marker", async () => {
  const f = fixture();
  const service = f.create();
  await service.initialize(f.snapshot(8, 4));
  const previousSnapshot = { ...f.snapshot(0, 0), started: false };
  await service.handle({ previousSnapshot, snapshot: f.snapshot(1, 0) });
  assert.deepEqual(f.recharges, ["breath:item"]);
  assert.equal(f.dragon.system.resources.legact.spent, 0);
  assert.deepEqual(f.flags[TURN_RECOVERY_FLAG], { round: 1, turn: 0 });
});

test("per-turn rules resolve unlinked NPC actors with their encounter scene", async () => {
  const f = fixture();
  const sceneIds = [];
  const service = new TurnRecovery({ getActor: (entry) => {
    sceneIds.push(entry.sceneId);
    return entry.sceneId === "token-scene" ? f.reactive : null;
  }, resetReaction: async (id) => f.resets.push(id), recharge: { roll() {} } });
  const previousSnapshot = { ...f.snapshot(2, 0), sceneId: "token-scene" };
  const snapshot = { ...f.snapshot(2, 1, "player"), sceneId: "token-scene" };
  await service.handle({ previousSnapshot, snapshot });
  assert.ok(sceneIds.every((id) => id === "token-scene"));
  assert.ok(f.resets.includes("reactive"));
});
