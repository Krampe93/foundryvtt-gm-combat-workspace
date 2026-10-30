import assert from "node:assert/strict";
import test from "node:test";
import { actorConditions, conditionOptions, conditionPlayers, setActorCondition } from "../scripts/services/condition-operations.js";
import { createCombatSnapshot, diffCombatSnapshots } from "../scripts/services/combat-state.js";

const MODULE = "gm-combat-workspace";
const zane = { id: "zane", uuid: "Actor.zane", name: "Zane", type: "character" };
const orsik = { id: "orsik", uuid: "Actor.orsik", name: "Orsik", type: "character" };
globalThis.game = { user: { id: "gm", isGM: true }, actors: new Map([[zane.id, zane], [orsik.id, orsik]]),
  i18n: { localize: value => value === "custom.label" ? "Eigener Zustand" : value } };
globalThis.CONFIG = { statusEffects: [
  { id: "frightened", name: "DND5E.ConFrightened", img: "frightened.svg" },
  { id: "poisoned", name: "DND5E.ConPoisoned", img: "poisoned.svg" },
  { id: "custom", name: "custom.label", img: "custom.svg" }, { id: "internal", name: "Hidden", hud: false }
] };

function npc() {
  const actor = { id: "npc", uuid: "Scene.arena.Token.goblin.Actor.npc", type: "npc", effects: new Map(),
    get appliedEffects() { return [...this.effects.values()].filter(effect => !effect.disabled && !effect.isSuppressed); },
    get statuses() { return new Set(this.appliedEffects.flatMap(effect => [...effect.statuses])); },
    calls: [], async toggleStatusEffect(id, { active }) {
      this.calls.push({ id, active });
      const existing = [...this.effects.values()].find(effect => effect.statuses.has(id));
      if (existing) { if (!active) { await existing.delete(); return false; } return true; }
      if (!active) return undefined;
      const effect = { id, statuses: new Set([id]), origin: "Item.native-origin", changes: [{ key: "native", value: 2 }],
        duration: { rounds: 3 }, flags: {}, disabled: false,
        async setFlag(scope, key, value) {
          const [root, status] = key.split(".");
          (this.flags[scope] ??= {})[root] ??= {};
          this.flags[scope][root][status] = value;
        },
        async delete() { actor.effects.delete(this.id); }
      };
      this.effects.set(id, effect);
      return effect;
    } };
  return actor;
}

test("uses native condition IDs/icons, German condition names and localized extension labels", () => {
  assert.equal(conditionOptions().find(({ id }) => id === "frightened").label, "Verängstigt");
  assert.equal(conditionOptions().find(({ id }) => id === "frightened").img, "frightened.svg");
  assert.equal(conditionOptions().find(({ id }) => id === "custom").label, "Eigener Zustand");
  assert.equal(conditionOptions().some(({ id }) => id === "internal"), false);
});

test("player choices prioritize the encounter, deduplicate base characters and exclude NPCs", () => {
  const combat = { combatants: new Map([["orsik", { actorId: orsik.id, actor: { ...orsik, uuid: "Scene.scene.Token.orsik.Actor.orsik" } }],
    ["orsik-copy", { actor: orsik }], ["npc", { actor: npc() }]]) };
  assert.deepEqual(conditionPlayers(combat), [{ uuid: orsik.uuid, name: "Orsik", inCombat: true },
    { uuid: zane.uuid, name: "Zane", inCombat: false }]);
});

test("a condition uses the native API and stores its chosen character without changing native mechanics", async () => {
  const actor = npc();
  await setActorCondition(actor, { statusId: "frightened", active: true, sourceUuid: zane.uuid }, [zane, orsik]);
  const effect = actor.effects.get("frightened");
  assert.deepEqual(actor.calls, [{ id: "frightened", active: true }]);
  assert.equal(effect.origin, "Item.native-origin");
  assert.deepEqual(effect.changes, [{ key: "native", value: 2 }]);
  assert.deepEqual(effect.duration, { rounds: 3 });
  assert.deepEqual(effect.flags[MODULE].conditionSources.frightened, { uuid: zane.uuid, name: "Zane" });
  assert.equal(actorConditions(actor)[0].text, "Verängstigt durch Zane");
});

test("updating and clearing a source reuses the effect, retaining unrelated conditions and sources", async () => {
  const actor = npc();
  await setActorCondition(actor, { statusId: "frightened", active: true, sourceUuid: zane.uuid }, [zane, orsik]);
  await setActorCondition(actor, { statusId: "poisoned", active: true, sourceUuid: orsik.uuid }, [zane, orsik]);
  const original = actor.effects.get("frightened");
  await setActorCondition(actor, { statusId: "frightened", active: true, sourceUuid: orsik.uuid }, [zane, orsik]);
  assert.equal(actor.effects.get("frightened"), original);
  assert.equal(actorConditions(actor).find(({ id }) => id === "frightened").text, "Verängstigt durch Orsik");
  await setActorCondition(actor, { statusId: "frightened", active: true }, [zane, orsik]);
  assert.equal(actor.effects.size, 2);
  assert.equal(actorConditions(actor).find(({ id }) => id === "frightened").source, null);
  assert.equal(actorConditions(actor).find(({ id }) => id === "poisoned").source.uuid, orsik.uuid);
});

test("removing the native condition removes its link and preserves other states", async () => {
  const actor = npc();
  await setActorCondition(actor, { statusId: "frightened", active: true, sourceUuid: zane.uuid }, [zane]);
  await setActorCondition(actor, { statusId: "poisoned", active: true }, []);
  await setActorCondition(actor, { statusId: "frightened", active: false, sourceUuid: "already-deleted" }, []);
  assert.deepEqual(actorConditions(actor).map(({ id }) => id), ["poisoned"]);
});

test("an existing native condition gains a source without adding a second effect", async () => {
  const actor = npc();
  await actor.toggleStatusEffect("frightened", { active: true });
  await setActorCondition(actor, { statusId: "frightened", active: true, sourceUuid: zane.uuid }, [zane]);
  assert.equal(actor.effects.size, 1);
  const effect = actor.effects.get("frightened");
  effect.disabled = true;
  assert.deepEqual(actorConditions(actor), []);
  effect.disabled = false;
  effect.isSuppressed = true;
  assert.deepEqual(actorConditions(actor), []);
});

test("stored links survive rehydration and use live renamed characters when available", async () => {
  const actor = npc();
  await setActorCondition(actor, { statusId: "frightened", active: true, sourceUuid: zane.uuid }, [zane]);
  const saved = JSON.parse(JSON.stringify([...actor.effects.values()].map(effect => ({ ...effect, statuses: [...effect.statuses] }))));
  const reloaded = { ...actor, effects: saved, appliedEffects: saved, statuses: new Set(["frightened"]) };
  assert.equal(actorConditions(reloaded)[0].text, "Verängstigt durch Zane");
  const previous = game.actors.get("zane");
  try {
    game.actors.set("zane", { ...zane, name: "Zane Neu" });
    assert.equal(actorConditions(reloaded)[0].text, "Verängstigt durch Zane Neu");
    game.actors.delete("zane");
    assert.equal(actorConditions(reloaded)[0].text, "Verängstigt durch Zane");
  } finally { game.actors.set("zane", previous); }
});

test("unknown conditions/characters and non-GMs fail before changing the actor", async () => {
  const actor = npc();
  await assert.rejects(setActorCondition(actor, { statusId: "frightened", active: true, sourceUuid: "missing" }, [zane]), /nicht mehr verfügbar/);
  await assert.rejects(setActorCondition(actor, { statusId: "unknown", active: true }, []), /Unbekannter Zustand/);
  game.user.isGM = false;
  try { await assert.rejects(setActorCondition(actor, { statusId: "frightened", active: true }, []), /Nur ein GM/); }
  finally { game.user.isGM = true; }
  assert.equal(actor.calls.length, 0);
});

test("native hook veto is reported instead of pretending the condition was applied", async () => {
  const actor = npc();
  actor.toggleStatusEffect = async () => undefined;
  await assert.rejects(setActorCondition(actor, { statusId: "frightened", active: true }), /nicht gesetzt/);
});

test("failed attribution rolls back only a newly created condition", async () => {
  for (const existing of [false, true]) {
    const actor = npc();
    const toggle = actor.toggleStatusEffect.bind(actor);
    actor.toggleStatusEffect = async (...args) => {
      const result = await toggle(...args);
      actor.effects.get("frightened").setFlag = async () => { throw new Error("write failed"); };
      return result;
    };
    if (existing) await toggle("frightened", { active: true });
    await assert.rejects(setActorCondition(actor, { statusId: "frightened", active: true, sourceUuid: zane.uuid }, [zane]), /write failed/);
    assert.equal(actor.effects.has("frightened"), existing);
  }
});

test("effect/source changes invalidate the snapshot without changing the active turn", async () => {
  const actor = npc();
  const entry = { id: "enemy", actor, initiative: 12 };
  const combat = { id: "combat", started: true, turn: 0, round: 1, combatants: [entry], combatant: entry };
  const previous = createCombatSnapshot(combat);
  await setActorCondition(actor, { statusId: "frightened", active: true, sourceUuid: zane.uuid }, [zane]);
  const current = createCombatSnapshot(combat);
  assert.deepEqual(diffCombatSnapshots(previous, current).map(({ name }) => name), ["combatStateChanged"]);
  assert.equal(current.combatants[0].conditions[0].source.uuid, zane.uuid);
});

test("a vetoed attribution update is reported and a newly created condition is rolled back", async () => {
  const actor = npc();
  const toggle = actor.toggleStatusEffect.bind(actor);
  actor.toggleStatusEffect = async (...args) => {
    const result = await toggle(...args);
    actor.effects.get("frightened").setFlag = async () => undefined;
    return result;
  };
  await assert.rejects(setActorCondition(actor, { statusId: "frightened", active: true, sourceUuid: zane.uuid }, [zane]), /nicht gespeichert/);
  assert.equal(actor.effects.size, 0);
});
