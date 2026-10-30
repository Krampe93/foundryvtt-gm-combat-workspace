import assert from "node:assert/strict";
import test from "node:test";
import { MODULE_ID } from "../scripts/config.js";
import { EncounterPreparation, parseInitiative, rollNpcInitiative, sceneEncounter } from "../scripts/services/encounter-preparation.js";

let nextId = 0;
globalThis.foundry = { utils: { randomID: () => `random${++nextId}` } };
const collection = (entries = []) => new Map(entries.map((entry) => [entry.id, entry]));
const flags = (entry) => { entry.getFlag = (module, key) => entry.flags?.[module]?.[key]; return entry; };

function fixture({ existing = false, wall = false } = {}) {
  const writes = [];
  const makeActor = (id, type, lair = false, uuid = `Actor.${id}`) => flags({ id, uuid, type, name: id, img: `${id}.webp`,
    system: { attributes: { init: { total: 3 } }, resources: { lair: { value: lair, inside: false }, legact: { max: 3, spent: 2 } } },
    async update(data) { writes.push({ actor: uuid, data }); if ("system.resources.lair.inside" in data) this.system.resources.lair.inside = data["system.resources.lair.inside"]; return this; } });
  const goblin = makeActor("Goblin", "npc");
  const dragon = makeActor("Dragon", "npc", true, "Scene.map.Token.dragon.Actor.Dragon");
  const zane = makeActor("Zane", "character");
  const npc = (id, actor, hidden = true) => ({ id, actor, actorId: actor.id, actorLink: false, hidden, name: id, texture: { src: "token.webp" } });
  const scene = { id: "map", name: "Testarena", tokens: collection([
    npc("goblin1", goblin), npc("goblin2", goblin), npc("dragon", dragon),
    { ...npc("zane", zane, false), actorLink: true }
  ]) };
  const settings = new Map();
  const game = { user: { id: "gm", isGM: true }, modules: new Map(wall ? [["combat-wall", { active: true }]] : []),
    actors: collection([goblin, dragon, zane]), combats: collection(), users: collection([{ id: "player", isGM: false, character: zane }]),
    settings: { get: (_module, key) => settings.get(key), set: async (_module, key, value) => { settings.set(key, structuredClone(value)); } } };
  let currentScene = scene;
  let rolls = 0;
  const makeCombat = (data = {}) => {
    const combat = { id: `combat${++nextId}`, scene, active: true, round: 0, turn: null, combatants: collection(), groups: collection(), turns: [], ...data,
      get combatant() { return this.turns[this.turn] ?? null; },
      setupTurns() { this.turns = [...this.combatants.values()].sort((a, b) => (b.group?.initiative ?? b.initiative ?? -Infinity) - (a.group?.initiative ?? a.initiative ?? -Infinity)); return this.turns; },
      async update(data) { writes.push({ combat: this.id, data }); Object.assign(this, data); return this; },
      async activate() { writes.push({ activate: this.id }); if (game.combat) game.combat.active = false; this.active = true; game.combat = this; },
      async delete() { writes.push({ deleteCombat: this.id }); game.combats.delete(this.id); },
      async createEmbeddedDocuments(type, data) {
        writes.push({ create: type, data: structuredClone(data) });
        const result = data.map((entry) => flags({ id: `entry${++nextId}`, parent: this, initiative: null, ...entry,
          actor: entry.tokenId ? scene.tokens.get(entry.tokenId)?.actor : game.actors.get(entry.actorId) ?? null,
          token: scene.tokens.get(entry.tokenId) ?? null }));
        result.forEach((entry) => this.combatants.set(entry.id, entry));
        this.setupTurns(); return result;
      },
      async updateEmbeddedDocuments(type, data) {
        writes.push({ update: type, data: structuredClone(data) });
        const target = type === "CombatantGroup" ? this.groups : this.combatants;
        for (const entry of data) {
          const document = target.get(entry._id);
          Object.assign(document, entry);
          if (document.group) document.group.initiative = entry.initiative;
        }
        this.setupTurns(); return data;
      },
      async deleteEmbeddedDocuments(type, ids) { writes.push({ delete: type, ids }); ids.forEach((id) => this.combatants.delete(id)); this.setupTurns(); }
    };
    game.combats.set(combat.id, combat); return combat;
  };
  if (existing) game.combat = makeCombat();
  const service = new EncounterPreparation({ game, getScene: () => currentScene,
    roll: async () => { rolls++; return 3 + rolls; },
    createCombat: async (data) => { writes.push({ createCombat: data }); return makeCombat({ active: data.active }); } });
  const submit = (preview, changes = {}) => ({
    players: preview.players.map((row) => ({ ...row, initiative: row.initiative ?? "12" })),
    lairs: preview.lairs.map((lair) => ({ ...lair, inside: true })), ...changes
  });
  return { service, scene, game, settings, writes, goblin, dragon, zane, makeActor, makeCombat, submit,
    get rolls() { return rolls; }, setScene: (value) => { currentScene = value; } };
}

test("all map NPCs, including hidden and unselected, are rolled; other maps are ignored and one encounter is created", async () => {
  const f = fixture();
  const foreign = f.makeCombat({ scene: { id: "elsewhere" }, active: true });
  f.game.combat = foreign;
  const preview = f.service.preview();
  assert.equal(preview.npcCount, 3);
  assert.equal(preview.players.length, 1);
  assert.equal(preview.lairs.length, 1);
  assert.equal(f.rolls, 0, "preview and cancel are read-only");
  assert.equal(f.writes.length, 0);
  const result = await f.service.prepare(preview.id, f.submit(preview));
  const combat = f.game.combats.get(result.combatId);
  assert.notEqual(combat.id, foreign.id);
  assert.equal(f.rolls, 3);
  assert.deepEqual([...combat.combatants.values()].map((entry) => entry.tokenId).sort(), ["dragon", "goblin1", "goblin2", "zane"]);
  assert.ok([...f.scene.tokens.values()].filter((token) => token.actor.type === "npc").every((token) => token.hidden));
  assert.equal(combat.round, 0);
  assert.equal(combat.turn, null, "preparation does not start the encounter");
  assert.equal(foreign.combatants.size, 0);
  assert.equal(f.dragon.system.resources.lair.inside, true);
  assert.deepEqual(f.dragon.system.resources.legact, { max: 3, spent: 2 }, "no manual bonus or recovery on lair change");
});

test("every repeat rerolls all NPCs, keeps player values, reuses participants, and completed requests are idempotent", async () => {
  const f = fixture({ existing: true });
  let preview = f.service.preview();
  const first = await f.service.prepare(preview.id, f.submit(preview));
  const ids = [...f.game.combat.combatants.keys()];
  assert.equal(await f.service.prepare(preview.id, f.submit(preview)), first);
  assert.equal(f.rolls, 3, "duplicate confirmation cannot roll twice");
  preview = f.service.preview();
  assert.equal(preview.players[0].initiative, 12);
  await f.service.prepare(preview.id, f.submit(preview));
  assert.equal(f.rolls, 6);
  assert.deepEqual([...f.game.combat.combatants.keys()], ids);
  assert.deepEqual([...f.game.combat.combatants.values()].filter((entry) => entry.actor.type === "npc").map((entry) => entry.initiative), [7, 8, 9]);
});

test("assigned world characters, scene players, Monk placeholders and saved custom players are not duplicated", async () => {
  const f = fixture({ existing: true });
  const orphan = f.makeActor("Orsik", "character");
  f.game.actors.set(orphan.id, orphan);
  f.game.users.set("orsik-user", { id: "orsik-user", character: orphan });
  f.settings.set("encounterPlayers", [{ name: "Papierheld", enabled: true }]);
  const monk = flags({ id: "monk", name: "Zane", initiative: 7, actor: null,
    flags: { "monks-combat-details": { placeholder: true } } });
  f.game.combat.combatants.set(monk.id, monk);
  f.game.combat.setupTurns();
  const preview = f.service.preview();
  assert.equal(preview.players.filter((row) => row.name === "Zane").length, 1);
  await f.service.prepare(preview.id, f.submit(preview));
  const participants = [...f.game.combat.combatants.values()];
  assert.equal(participants.filter((entry) => entry.name === "Zane").length, 1);
  assert.equal(monk.initiative, 7);
  assert.deepEqual(monk.flags, { "monks-combat-details": { placeholder: true } });
  assert.equal(participants.find((entry) => entry.name === "Orsik").actor, orphan);
  assert.equal(participants.find((entry) => entry.name === "Papierheld").actor, null);
});

test("native groups and Combat Wall groups get one shared W12 result", async () => {
  for (const wall of [false, true]) {
    const f = fixture({ existing: true, wall });
    const combat = f.game.combat;
    if (wall) f.scene.tokens.get("goblin2").hidden = false;
    const group = flags({ id: "goblins", initiative: 15, flags: wall ? { "combat-wall": { managed: true, groupId: "actor-Goblin" } } : {} });
    combat.groups.set(group.id, group);
    const [member] = await combat.createEmbeddedDocuments("Combatant", [{ tokenId: "goblin1", actorId: "Goblin", initiative: 15 }]);
    member.group = group;
    if (!wall) {
      const [second] = await combat.createEmbeddedDocuments("Combatant", [{ tokenId: "goblin2", actorId: "Goblin", initiative: 15 }]);
      second.group = group;
    }
    const preview = f.service.preview();
    assert.equal(preview.rollCount, 2);
    await f.service.prepare(preview.id, f.submit(preview));
    assert.equal(f.rolls, 2);
    const goblins = [...combat.combatants.values()].filter((entry) => entry.actor.id === "Goblin");
    assert.ok(goblins.every((entry) => entry.initiative === group.initiative));
  }
});

test("rerolling a running encounter preserves active combatant and round after sorting", async () => {
  const f = fixture({ existing: true });
  const preview = f.service.preview();
  await f.service.prepare(preview.id, f.submit(preview));
  const combat = f.game.combat;
  combat.round = 7;
  combat.turn = 1;
  const activeId = combat.combatant.id;
  const next = f.service.preview();
  await f.service.prepare(next.id, f.submit(next, { players: next.players.map((row) => ({ ...row, initiative: -5 })) }));
  assert.equal(combat.combatant.id, activeId);
  assert.equal(combat.round, 7);
});

test("invalid values, stale scene/roster, mixed groups, and non-GMs do not mutate documents", async () => {
  const f = fixture({ existing: true });
  let preview = f.service.preview();
  await assert.rejects(f.service.prepare(preview.id, f.submit(preview, { players: [{ ...preview.players[0], initiative: "" }] })), /Initiative/);
  assert.equal(f.rolls, 0);
  await assert.rejects(f.service.prepare(preview.id, f.submit(preview, { lairs: [] })), /Hort/);
  assert.equal(f.writes.length, 0);
  f.setScene({ id: "other", tokens: collection() });
  await assert.rejects(f.service.prepare(preview.id, f.submit(preview)), /inzwischen geändert/);
  assert.equal(f.writes.length, 0);
  f.setScene(f.scene);
  preview = f.service.preview();
  f.scene.tokens.delete("goblin2");
  await assert.rejects(f.service.prepare(preview.id, f.submit(preview)), /inzwischen geändert/);
  f.game.user.isGM = false;
  assert.throws(() => f.service.preview(), /Spielleiter/);
});

test("mixed NPC/player groups and conflicting manual player groups fail before rolls or writes", async () => {
  const f = fixture({ existing: true });
  const combat = f.game.combat;
  const group = flags({ id: "mixed", initiative: 10 });
  combat.groups.set(group.id, group);
  const [npc, player] = await combat.createEmbeddedDocuments("Combatant", [
    { tokenId: "goblin1", actorId: "Goblin", initiative: 10 }, { tokenId: "zane", actorId: "Zane", initiative: 10 }
  ]);
  npc.group = group; player.group = group;
  let preview = f.service.preview();
  f.writes.length = 0;
  await assert.rejects(f.service.prepare(preview.id, f.submit(preview)), /trennen/);
  assert.equal(f.rolls, 0);
  assert.equal(f.writes.length, 0);
  npc.group = null;
  const [other] = await combat.createEmbeddedDocuments("Combatant", [{ name: "Papierheld", initiative: 10 }]);
  other.group = group;
  preview = f.service.preview();
  f.writes.length = 0;
  await assert.rejects(f.service.prepare(preview.id, f.submit(preview, {
    players: preview.players.map((row, index) => ({ ...row, initiative: index ? 9 : 10 }))
  })), /denselben Initiativewert/);
  assert.equal(f.rolls, 0);
  assert.equal(f.writes.length, 0);
});

test("failed RNG and rejected lair writes leave no new encounter or participants", async () => {
  const f = fixture();
  const failed = new EncounterPreparation({ game: f.game, getScene: () => f.scene,
    roll: async () => { throw new Error("Würfel nicht verfügbar"); } });
  let preview = failed.preview();
  await assert.rejects(failed.prepare(preview.id, f.submit(preview)), /Würfel nicht verfügbar/);
  assert.equal(f.writes.length, 0);
  f.dragon.update = async () => null;
  preview = f.service.preview();
  await assert.rejects(f.service.prepare(preview.id, f.submit(preview)), /nicht gespeichert.*zurückgenommen/);
  assert.equal(f.game.combats.size, 0);
});

test("linked lair actors have one checkbox, unlinked lair actors stay independent, and only inside is written", async () => {
  const f = fixture();
  f.scene.tokens.set("dragon-linked", { ...f.scene.tokens.get("dragon"), id: "dragon-linked" });
  const second = f.makeActor("Dragon", "npc", true, "Scene.map.Token.second.Actor.Dragon");
  f.scene.tokens.set("second", { id: "second", name: "zweiter Drache", actor: second, actorId: second.id, hidden: true });
  const preview = f.service.preview();
  assert.equal(preview.lairs.length, 2);
  assert.equal(preview.lairs[0].tokens.length, 2);
  await f.service.prepare(preview.id, f.submit(preview, { lairs: preview.lairs.map((lair, index) => ({ uuid: lair.uuid, inside: index === 0 })) }));
  assert.equal(f.dragon.system.resources.lair.inside, true);
  assert.equal(second.system.resources.lair.inside, false);
  assert.deepEqual(f.writes.filter((write) => write.actor).map((write) => write.data), [{ "system.resources.lair.inside": true }]);
});

test("write failure restores initiatives, created participants, lair flags, roster and active turn", async () => {
  const f = fixture({ existing: true });
  const combat = f.game.combat;
  const [existing] = await combat.createEmbeddedDocuments("Combatant", [{ tokenId: "goblin1", actorId: "Goblin", initiative: 30 }]);
  combat.round = 4; combat.turn = 0;
  f.dragon.update = async (data) => {
    const inside = data["system.resources.lair.inside"];
    if (inside) throw new Error("Hort-Schreibfehler");
    f.dragon.system.resources.lair.inside = inside;
  };
  const preview = f.service.preview();
  await assert.rejects(f.service.prepare(preview.id, f.submit(preview)), /Hort-Schreibfehler.*zurückgenommen/);
  assert.deepEqual([...combat.combatants.keys()], [existing.id]);
  assert.equal(existing.initiative, 30);
  assert.equal(combat.combatant.id, existing.id);
  assert.equal(combat.round, 4);
  assert.equal(f.dragon.system.resources.lair.inside, false);
});

test("duplicate submissions while rolling cannot create a second encounter; scene changes during RNG are rejected", async () => {
  const f = fixture();
  let finish;
  const service = new EncounterPreparation({ game: f.game, getScene: () => f.scene,
    roll: () => new Promise((resolve) => { finish = resolve; }) });
  const preview = service.preview();
  const pending = service.prepare(preview.id, f.submit(preview));
  await assert.rejects(service.prepare(preview.id, f.submit(preview)), /bereits/);
  f.scene.tokens.clear();
  // The entries were captured, so finish the three pending rolls before the final stale-plan check.
  finish(4); await new Promise((resolve) => setImmediate(resolve));
  finish(5); await new Promise((resolve) => setImmediate(resolve));
  finish(6);
  await assert.rejects(pending, /inzwischen geändert/);
  assert.equal(f.writes.length, 0);
});

test("native initiative bonuses use a W12 including advantage, without changing global formula or posting chat", async () => {
  const original = globalThis.Roll;
  const formulas = [];
  globalThis.Roll = class {
    constructor(formula, data) { formulas.push([formula, data]); }
    async evaluate() { return { total: 14 }; }
  };
  try {
    assert.equal(await rollNpcInitiative({ name: "Drache", getInitiativeRollConfig: () => ({ parts: ["@mod", "@bonus"], data: { mod: 6, bonus: 2 }, options: {} }) }), 14);
    await rollNpcInitiative({ getInitiativeRollConfig: () => ({ parts: ["3"], data: {}, options: { advantage: true } }) });
    await rollNpcInitiative({ getInitiativeRollConfig: () => ({ parts: [], data: {}, options: { disadvantage: true } }) });
    assert.deepEqual(formulas, [["1d12 + @mod + @bonus", { mod: 6, bonus: 2 }], ["2d12kh + 3", {}], ["2d12kl", {}]]);
    await assert.rejects(rollNpcInitiative({ name: "fehlend", system: {} }), /Modifikator/);
  } finally { globalThis.Roll = original; }
});

test("manual initiative accepts zero, negatives and decimal commas; scene encounter resolution prefers the current scene", () => {
  assert.equal(parseInitiative("0"), 0);
  assert.equal(parseInitiative("-2,5"), -2.5);
  assert.equal(parseInitiative(""), null);
  assert.equal(parseInitiative("NaN"), null);
  assert.equal(parseInitiative(Infinity), null);
  const f = fixture({ existing: true });
  assert.equal(sceneEncounter(f.scene, f.game), f.game.combat);
});
