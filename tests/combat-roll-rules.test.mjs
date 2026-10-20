import assert from "node:assert/strict";
import test from "node:test";
import { AttackLedger, CombatRollRules, configureMaxCritical, keptD20 } from "../scripts/services/combat-roll-rules.js";
import { EventBus } from "../scripts/core/event-bus.js";

const MODULE = "gm-combat-workspace";
const npc = { id: "dragon", uuid: "Actor.dragon", type: "npc", name: "Dragon" };
const activity = { id: "rend", actor: npc, item: { id: "rend-item", uuid: "Actor.dragon.Item.rend", name: "Rend" } };
const attack = (face) => ({ total: face + 8, terms: [{ faces: 20, number: 1, results: [{ result: face, active: true }] }] });

async function runtime(run) {
  const hooks = new Map();
  const eventBus = new EventBus();
  const messages = new Map();
  const generated = [];
  const errors = [];
  let counter = 0;
  const fire = (name, ...args) => { for (const handler of hooks.get(name)?.values() ?? []) handler(...args); };
  class MockRoll {
    constructor(formula) { this.formula = formula; this.total = formula === "1d20" ? 20 : 7; this.terms = []; }
    async evaluate() { return this; }
    async toMessage(data) {
      const message = { ...data, id: `extra-${++counter}`, rolls: [this],
        async setFlag(namespace, key, value) { this.flags[namespace][key] = value; },
        getAssociatedActor: () => npc };
      generated.push(message);
      messages.set(message.id, message);
      fire("createChatMessage", message);
      return message;
    }
  }
  const globals = {
    Hooks: { on(name, callback) { if (!hooks.has(name)) hooks.set(name, new Map()); const id = ++counter; hooks.get(name).set(id, callback); return id; }, off(name, id) { hooks.get(name)?.delete(id); } },
    game: { messages, actors: new Map([[npc.id, npc]]) },
    foundry: { utils: { randomID: () => `random-${++counter}` } },
    Roll: MockRoll,
    ChatMessage: { getSpeaker: ({ actor }) => ({ actor: actor.id, alias: actor.name }) },
    ui: { notifications: { error: (error) => errors.push(error) } }
  };
  const originals = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const rules = new CombatRollRules({ eventBus, logger: { error: (...args) => errors.push(args) } });
  try {
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    rules.start();
    await run({ fire, rules, eventBus, generated, errors, hooks });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(errors, []);
  } finally {
    rules.stop();
    await new Promise((resolve) => setImmediate(resolve));
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
  for (const handlers of hooks.values()) assert.equal(handlers.size, 0, "all hooks removed on shutdown");
}

function message(id, face, groupId = id) {
  return { id, rolls: [attack(face)], flags: {
    [MODULE]: { rollGroupId: groupId },
    dnd5e: { roll: { type: "attack" }, item: { id: activity.item.id }, activity: { id: activity.id } }
  }, getAssociatedActor: () => npc, whisper: ["gm"], blind: false };
}

test("only the active d20 determines the natural result", () => {
  assert.equal(keptD20(attack(20)), 20);
  assert.equal(keptD20({ terms: [{ faces: 20, results: [{ result: 20, active: false }, { result: 13, active: true }] }] }), 13);
  assert.equal(keptD20({ terms: [{ faces: 6, results: [{ result: 1 }] }] }), null);
});

test("critical configuration maximizes the extra dice and leaves flat bonuses single", () => {
  const config = { rolls: [{ parts: ["1d6", "4"], options: { critical: { bonusDamage: "1d4" } } }], critical: { multiplyNumeric: true } };
  configureMaxCritical(config);
  configureMaxCritical(config);
  assert.deepEqual(config.rolls[0].parts, ["1d6", "4"]);
  assert.deepEqual(config.rolls[0].options.critical, { bonusDamage: "1d4", powerfulCritical: true, multiplier: 2, multiplyNumeric: false });
  assert.equal(config.isCritical, true);
});

test("damage components explicitly disallowing criticals remain noncritical", () => {
  const roll = { options: { isCritical: false, critical: { allow: false } } };
  configureMaxCritical({ rolls: [roll] });
  assert.equal(roll.options.isCritical, false);
  assert.equal(roll.options.critical.powerfulCritical, undefined);
});

test("attack ledger keeps separate rays and does not promote an updated old attack", () => {
  const ledger = new AttackLedger();
  const base = { actor: npc.uuid, itemId: activity.item.id, activityId: activity.id };
  ledger.remember({ ...base, id: "old", groupId: "ray20", face: 20 });
  ledger.remember({ ...base, id: "new", groupId: "ray13", face: 13 });
  ledger.remember({ ...base, id: "old", groupId: "ray20", face: 20 });
  assert.equal(ledger.find(base).face, 13);
  assert.equal(ledger.find({ ...base, groupId: "ray20" }).face, 20);
  assert.equal(ledger.find({ ...base, groupId: "missing" }), null);
  ledger.clear();
  ledger.remember({ ...base, id: "old", face: 20 });
  assert.equal(ledger.find(base), null);
});

test("NAT 1 and NAT 20 each cause one separate W20 despite hook aliases", async () => {
  await runtime(async ({ fire, generated }) => {
    for (const face of [1, 13, 20]) {
      const roll = attack(face);
      fire("dnd5e.rollAttack", [roll], { subject: activity });
      fire("dnd5e.rollAttackV2", [roll], { subject: activity });
      assert.equal(roll.total, face + 8, "original attack result is unchanged");
    }
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(generated.length, 2);
    assert.deepEqual(generated.map((entry) => entry.flags[MODULE].sourceNatural), [1, 20]);
    assert.ok(generated.every((entry) => entry.rolls[0].formula === "1d20"));
    assert.ok(generated.every((entry) => entry.flags[MODULE].kind === "attackExtra"));
  });
});

test("message reception on the other GM window records attacks without throwing extra dice", async () => {
  await runtime(async ({ fire, generated }) => {
    fire("createChatMessage", message("critical", 20));
    const config = { subject: activity, rolls: [{ parts: ["1d8", "5"] }] };
    fire("dnd5e.preRollDamage", config, {}, {});
    assert.equal(config.critical.powerfulCritical, true);
    assert.equal(generated.length, 0);
  });
});

test("explicit damage-group correlation handles critical and normal rays out of order", async () => {
  await runtime(async ({ fire }) => {
    fire("createChatMessage", message("critical", 20, "ray20"));
    fire("createChatMessage", message("normal", 13, "ray13"));
    for (const groupId of ["ray13", "ray20"]) {
      const config = { subject: activity, rolls: [{ parts: ["1d6", "4"] }] };
      fire("dnd5e.preRollDamageV2", config, {}, { data: { flags: { [MODULE]: { rollGroupId: groupId } } } });
      assert.equal(Boolean(config.isCritical), groupId === "ray20");
    }
  });
});

test("critical options also apply to roll configuration constructed by the dialog", async () => {
  await runtime(async ({ fire }) => {
    fire("createChatMessage", message("critical", 20));
    const config = { subject: activity, rolls: [] };
    fire("dnd5e.preRollDamage", config, {}, {});
    const dialogRoll = { parts: ["1d8", "4"], options: { isCritical: false, critical: { powerfulCritical: false } } };
    fire("dnd5e.postBuildDamageRollConfig", config, dialogRoll, 0);
    assert.equal(dialogRoll.options.isCritical, true);
    assert.equal(dialogRoll.options.critical.powerfulCritical, true);
  });
});

test("turn changes retire old criticals and later message updates cannot restore them", async () => {
  await runtime(async ({ fire, eventBus }) => {
    const old = message("critical", 20);
    fire("createChatMessage", old);
    eventBus.emit("combatStateChanged", { previousSnapshot: { combatId: "fight", turn: 0 }, snapshot: { combatId: "fight", turn: 1 } });
    fire("updateChatMessage", old, { rolls: old.rolls });
    const config = { subject: activity, rolls: [] };
    fire("dnd5e.preRollDamage", config, {}, {});
    assert.equal(config.isCritical, undefined);
  });
});

test("saving throws and player attacks do not trigger the house rules", async () => {
  await runtime(async ({ fire, generated }) => {
    fire("dnd5e.rollSavingThrow", [attack(1)], { subject: activity });
    const player = { ...activity, actor: { ...npc, type: "character" } };
    fire("dnd5e.rollAttack", [attack(20)], { subject: player });
    const config = { subject: player, rolls: [] };
    fire("dnd5e.preRollDamage", config, {}, {});
    assert.equal(config.isCritical, undefined);
    assert.equal(generated.length, 0);
  });
});

test("optional 2W6 roll is separate, voluntary and available only once per extra W20", async () => {
  await runtime(async ({ fire, generated, rules }) => {
    fire("dnd5e.rollAttack", [attack(20)], { subject: activity });
    await new Promise((resolve) => setImmediate(resolve));
    const extra = generated[0];
    assert.equal(generated.length, 1, "2W6 are not rolled automatically");
    await rules.rollExtraDice(extra.id);
    await rules.rollExtraDice(extra.id);
    assert.equal(generated.length, 2);
    assert.equal(generated[1].rolls[0].formula, "2d6");
    assert.equal(generated[1].flags[MODULE].kind, "extraDice");
    assert.equal(generated[1].flags[MODULE].rollGroupId, extra.flags[MODULE].rollGroupId);
    assert.equal(extra.flags[MODULE].extraDiceRolled, true);
  });
});
