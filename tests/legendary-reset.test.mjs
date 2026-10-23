import assert from "node:assert/strict";
import test from "node:test";
import { EventBus } from "../scripts/core/event-bus.js";
import { WorkspaceBridge } from "../scripts/services/workspace-bridge.js";
import { LEGENDARY_LOCK_FLAG_KEY } from "../scripts/services/reaction-operations.js";
import { MODULE_ID } from "../scripts/config.js";

// Document updates merge objects recursively; omitting a key does not delete it.
function merge(target, changes) {
  for (const [key, value] of Object.entries(changes)) {
    if (value && typeof value === "object") merge(target[key] ??= {}, value);
    else target[key] = value;
  }
}

function flagDocument(initial) {
  const flags = structuredClone(initial);
  const parent = (scope, key) => {
    const parts = key.split(".");
    const leaf = parts.pop();
    const value = parts.reduce((object, part) => object[part] ??= {}, flags[scope] ??= {});
    return [value, leaf];
  };
  return {
    getFlag(scope, key) { return key.split(".").reduce((value, part) => value?.[part], flags[scope]); },
    async setFlag(scope, key, value) {
      const [object, leaf] = parent(scope, key);
      if (value && typeof value === "object") merge(object[leaf] ??= {}, value);
      else object[leaf] = value;
    },
    async unsetFlag(scope, key) {
      const [object, leaf] = parent(scope, key);
      delete object[leaf];
    }
  };
}

test("turn-start removes persisted legendary locks only for the active NPC, including after reopening", async () => {
  const initialLocks = {
    dragon: { "command:use": true, "fiery:use": true },
    other: { "command:use": true }
  };
  const combat = {
    ...flagDocument({ [MODULE_ID]: { [LEGENDARY_LOCK_FLAG_KEY]: initialLocks } }),
    started: true, round: 2, turn: 1, combatants: new Map([["dragon", {}], ["other", {}]])
  };
  const resource = { max: 3, spent: 2 };
  const resistance = { max: 3, spent: 1 };
  let actorUpdates = 0;
  const actor = {
    id: "dragon", name: "Dragon", type: "npc", items: new Map(),
    system: { resources: { legact: resource, legres: resistance } },
    async update(data) { resource.spent = data["system.resources.legact.spent"]; actorUpdates++; }
  };
  let snapshot = {
    started: true, combatId: "encounter", sceneId: "scene", round: 2, turn: 0,
    activeType: "player", activeCombatantId: "player", combatants: [], context: { combat, actor: null }
  };
  const errors = [];
  const environment = {
    document: { body: { append() {}, classList: { remove() {} } }, createElement: () => ({ addEventListener() {}, remove() {}, querySelector: () => null }) },
    window: { location: { href: "https://foundry.example/game" } },
    BroadcastChannel: class { addEventListener() {} postMessage() {} close() {} },
    Hooks: { on: () => 1, off() {} },
    canvas: { ready: false },
    game: { combat, modules: new Map() },
    foundry: { utils: { deepClone: structuredClone } },
    ui: { notifications: { error: (error) => errors.push(error) } }
  };
  const originals = new Map(Object.keys(environment).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const events = new EventBus();
  let bridge;
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const transition = (changes) => {
    const previousSnapshot = snapshot;
    snapshot = { ...snapshot, ...changes };
    events.emit("combatStateChanged", { previousSnapshot, snapshot });
  };
  try {
    for (const [key, value] of Object.entries(environment)) {
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    }
    const open = () => {
      bridge = new WorkspaceBridge({ eventBus: events, getSnapshot: () => snapshot,
        logger: { error: (...args) => errors.push(args), warn() {} } });
      bridge.start();
    };
    open();
    transition({ turn: 1, activeCombatantId: "player-b" });
    await flush();
    assert.deepEqual(combat.getFlag(MODULE_ID, LEGENDARY_LOCK_FLAG_KEY), initialLocks, "player turns preserve all locks");
    bridge.stop();
    open();
    assert.equal(resource.spent, 2, "reopening between turns does not refill the budget");
    transition({ turn: 2, activeType: "npc", activeCombatantId: "dragon", context: { combat, actor } });
    await flush();
    assert.equal(resource.spent, 0);
    assert.deepEqual(combat.getFlag(MODULE_ID, LEGENDARY_LOCK_FLAG_KEY), { other: initialLocks.other }, "old stored keys must actually be deleted");
    assert.deepEqual(resistance, { max: 3, spent: 1 }, "legendary resistances are independent");

    resource.spent = 1;
    await combat.setFlag(MODULE_ID, `${LEGENDARY_LOCK_FLAG_KEY}.dragon.command:use`, true);
    transition({});
    await flush();
    assert.equal(resource.spent, 1, "same-turn document refresh does not reset resources");
    assert.equal(combat.getFlag(MODULE_ID, LEGENDARY_LOCK_FLAG_KEY).dragon["command:use"], true);
    assert.equal(actorUpdates, 1);

    transition({ turn: 3, activeType: "player", activeCombatantId: "player", context: { combat, actor: null } });
    await flush();
    resource.spent = 0;
    transition({ round: 3, turn: 0, activeType: "npc", activeCombatantId: "dragon", context: { combat, actor } });
    await flush();
    assert.deepEqual(combat.getFlag(MODULE_ID, LEGENDARY_LOCK_FLAG_KEY), { other: initialLocks.other }, "locks clear even when the budget is already full");
    assert.equal(actorUpdates, 1);
    assert.deepEqual(errors, []);
  } finally {
    bridge?.stop();
    await flush();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
