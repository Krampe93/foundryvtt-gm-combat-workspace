import assert from "node:assert/strict";
import test from "node:test";
import { MODULE_ID } from "../scripts/config.js";
import { EncounterPreparation, parseInitiative, rollNpcInitiative, sceneEncounter } from "../scripts/services/encounter-preparation.js";
import { conditionParticipants, conditionSourceChoices } from "../scripts/services/condition-operations.js";

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
  assert.deepEqual(preview.players.map((row) => row.name), ["Orsik", "Nova Schaltkreis", "Ray", "Lichtwölkchen", "zane", "Pyro"]);
  assert.equal(preview.lairs.length, 1);
  assert.equal(f.rolls, 0, "preview and cancel are read-only");
  assert.equal(f.writes.length, 0);
  const result = await f.service.prepare(preview.id, f.submit(preview));
  const combat = f.game.combats.get(result.combatId);
  assert.notEqual(combat.id, foreign.id);
  assert.equal(f.rolls, 3);
  assert.deepEqual([...combat.combatants.values()].filter((entry) => entry.tokenId).map((entry) => entry.tokenId).sort(), ["dragon", "goblin1", "goblin2", "zane"]);
  assert.equal(combat.combatants.size, 9, "three map NPCs, one native player and five actorless party placeholders");
  assert.equal([...combat.combatants.values()].find((entry) => entry.name === "Pyro").actor, null);
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
  assert.deepEqual([...f.game.combat.combatants.values()].filter((entry) => entry.actor?.type === "npc").map((entry) => entry.initiative), [7, 8, 9]);
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
    const goblins = [...combat.combatants.values()].filter((entry) => entry.actor?.id === "Goblin");
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
    players: preview.players.map((row) => ({ ...row, initiative: row.combatantId === player.id ? 10 : 9 }))
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

test("Pyro is suggested without an actor or token, requires a manual initiative and becomes a reusable condition source", async () => {
  const f = fixture({ existing: true });
  let preview = f.service.preview();
  const row = preview.players.find((row) => row.name === "Pyro");
  assert.deepEqual(row, { key: "default:pyro", name: "Pyro", actorId: null, tokenId: null, initiative: null, enabled: true });
  assert.equal(f.game.combat.combatants.size, 0, "opening preparation does not add participants");
  assert.equal(f.writes.length, 0, "preview is read-only");
  await assert.rejects(f.service.prepare(preview.id, f.submit(preview, {
    players: preview.players.map((entry) => ({ ...entry, initiative: entry === row ? "" : 12 }))
  })), /Initiative für Pyro/);
  assert.equal(f.writes.length, 0);
  await f.service.prepare(preview.id, f.submit(preview));
  const pyro = [...f.game.combat.combatants.values()].find((entry) => entry.name === "Pyro");
  assert.equal(pyro.actor, null);
  assert.equal(pyro.actorId, null);
  assert.equal(pyro.tokenId, null);
  assert.equal(pyro.initiative, 12);
  assert.deepEqual(pyro.getFlag(MODULE_ID, "playerPlaceholder"), { actorId: null });
  assert.equal(conditionParticipants(f.game.combat).find((entry) => entry.key === pyro.id).placeholder, true);
  assert.equal(conditionSourceChoices(f.game.combat).find((entry) => entry.combatantId === pyro.id).inCombat, true);
  assert.ok(f.settings.get("encounterPlayers").some((entry) => entry.name === "Pyro" && entry.enabled));
  preview = f.service.preview();
  const repeated = preview.players.filter((entry) => entry.name.toLowerCase() === "pyro");
  assert.equal(repeated.length, 1);
  assert.equal(repeated[0].combatantId, pyro.id);
  assert.equal(repeated[0].initiative, 12);
  await f.service.prepare(preview.id, f.submit(preview));
  assert.equal([...f.game.combat.combatants.values()].filter((entry) => entry.name.toLowerCase() === "pyro").length, 1);
});

test("existing Monk Pyro is reused case-insensitively with initiative and flags intact", async () => {
  const f = fixture({ existing: true });
  const monk = flags({ id: "pyro-monk", name: " pYrO ", initiative: 17, actor: null,
    flags: { "monks-combat-details": { placeholder: true }, custom: { keep: true } } });
  f.game.combat.combatants.set(monk.id, monk);
  f.game.combat.setupTurns();
  f.settings.set("encounterPlayers", [{ name: "PYRO", enabled: true }]);
  const preview = f.service.preview();
  const rows = preview.players.filter((row) => row.name.trim().toLowerCase() === "pyro");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].combatantId, monk.id);
  assert.equal(rows[0].initiative, 17);
  await f.service.prepare(preview.id, f.submit(preview));
  assert.equal([...f.game.combat.combatants.values()].filter((entry) => entry.name.trim().toLowerCase() === "pyro").length, 1);
  assert.equal(monk.initiative, 17);
  assert.deepEqual(monk.flags, { "monks-combat-details": { placeholder: true }, custom: { keep: true } });
});

test("saved Pyro membership including explicit deselection is preserved without duplicate defaults", async () => {
  for (const enabled of [true, false]) {
    const f = fixture({ existing: true });
    f.settings.set("encounterPlayers", [{ name: "pyro", actorId: null, enabled }]);
    let preview = f.service.preview();
    const rows = preview.players.filter((row) => row.name.toLowerCase() === "pyro");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].enabled, enabled);
    await f.service.prepare(preview.id, f.submit(preview));
    assert.equal([...f.game.combat.combatants.values()].filter((entry) => entry.name.toLowerCase() === "pyro").length, Number(enabled));
    preview = f.service.preview();
    assert.equal(preview.players.find((row) => row.name.toLowerCase() === "pyro").enabled, enabled);
  }
  const f = fixture();
  f.settings.set("encounterPlayers", [{ name: "Pyro", actorId: "deleted-actor", enabled: false }]);
  const pyro = f.service.preview().players.find((row) => row.name === "Pyro");
  assert.equal(pyro.actorId, null);
  assert.equal(pyro.enabled, false, "a removed old actor does not discard the saved deselection");
});

test("native Pyro character and token appear once and are selected by default", async () => {
  for (const onScene of [false, true]) {
    const f = fixture({ existing: true });
    const pyro = f.makeActor("PYRO", "character");
    f.game.actors.set(pyro.id, pyro);
    if (onScene) f.scene.tokens.set("pyro-token", { id: "pyro-token", actor: pyro, actorId: pyro.id, actorLink: true, name: "Pyro" });
    const preview = f.service.preview();
    const rows = preview.players.filter((row) => row.name.toLowerCase() === "pyro");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].actorId, pyro.id);
    assert.equal(rows[0].enabled, true);
    await f.service.prepare(preview.id, f.submit(preview));
    const entries = [...f.game.combat.combatants.values()].filter((entry) => entry.name.toLowerCase() === "pyro");
    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0].getFlag(MODULE_ID, "playerPlaceholder"), { actorId: pyro.id });
  }
});

const partyNames = ["Orsik", "Nova Schaltkreis", "Ray", "Lichtwölkchen", "Zane", "Pyro"];

test("an empty world offers the entire party without actors, guessed initiatives or preview writes", async () => {
  const f = fixture({ existing: true });
  f.scene.tokens.clear(); f.game.actors.clear(); f.game.users.clear();
  const preview = f.service.preview();
  assert.deepEqual(preview.players.map(({ name }) => name), partyNames);
  assert.ok(preview.players.every((row) => row.enabled && row.actorId === null && row.tokenId === null && row.initiative === null));
  assert.equal(f.game.combat.combatants.size, 0);
  assert.equal(f.writes.length, 0);
  await assert.rejects(f.service.prepare(preview.id, f.submit(preview, {
    players: preview.players.map((row) => ({ ...row, initiative: row.name === "Ray" ? "" : 12 }))
  })), /Initiative für Ray/);
  assert.equal(f.writes.length, 0);
  await f.service.prepare(preview.id, f.submit(preview));
  const combat = f.game.combat;
  const initialIds = [...combat.combatants.keys()];
  assert.equal(initialIds.length, 6);
  assert.ok([...combat.combatants.values()].every((entry) => entry.actor === null && entry.tokenId === null &&
    entry.getFlag(MODULE_ID, "playerPlaceholder")?.actorId === null && entry.initiative === 12));
  assert.deepEqual(conditionSourceChoices(combat).map(({ name }) => name), partyNames);
  const again = f.service.preview();
  assert.equal(again.players.length, 6);
  assert.ok(again.players.every((row) => row.initiative === 12));
  await f.service.prepare(again.id, f.submit(again));
  assert.deepEqual([...combat.combatants.keys()], initialIds, "confirmation reuses all six placeholders");
});

test("a world with only native Orsik still prefills all six party members", () => {
  const f = fixture();
  f.scene.tokens.clear(); f.game.actors.clear(); f.game.users.clear();
  const orsik = f.makeActor("Orsik", "character"); f.game.actors.set(orsik.id, orsik);
  const preview = f.service.preview();
  assert.deepEqual(preview.players.map(({ name }) => name), partyNames);
  assert.equal(preview.players[0].actorId, orsik.id);
  assert.ok(preview.players.every(({ enabled }) => enabled));
  assert.ok(preview.players.slice(1).every(({ actorId }) => actorId === null));
  assert.equal(f.writes.length, 0);
});

test("saved manual screenshot names and explicit party deselection are reused without alias defaults", async () => {
  const f = fixture({ existing: true });
  f.settings.set("encounterPlayers", [
    { name: "Orsik", enabled: true }, { name: "Pyro", enabled: true }, { name: "Lichtwölkchen", enabled: true },
    { name: "Nova", enabled: true }, { name: "Zane", enabled: true }, { name: "Ray", enabled: false },
    { name: "Papierheld", enabled: true }
  ]);
  const preview = f.service.preview();
  assert.equal(preview.players.length, 7);
  assert.equal(preview.players.filter((row) => row.name === "Nova").length, 1);
  assert.equal(preview.players.some((row) => row.name === "Nova Schaltkreis"), false);
  assert.equal(preview.players.filter((row) => row.name.toLowerCase() === "zane").length, 1);
  assert.equal(preview.players.find((row) => row.name === "Ray").enabled, false);
  await f.service.prepare(preview.id, f.submit(preview));
  assert.equal([...f.game.combat.combatants.values()].some((entry) => entry.name === "Ray"), false);
  assert.equal(f.service.preview().players.find((row) => row.name === "Ray").enabled, false);
});

test("legacy party aliases reuse encounter IDs and initiatives without overbroad prefix matching", async () => {
  const f = fixture({ existing: true });
  f.scene.tokens.clear(); f.game.actors.clear(); f.game.users.clear();
  const aliases = ["Flab", "Nova", "Ziggs", "Lichtwoelkchen", "Zane", "Pyro"];
  const entries = aliases.map((name, index) => flags({ id: `party-${index}`, name, actor: null, initiative: 20 - index,
    flags: { "monks-combat-details": { placeholder: true }, custom: { keep: index } } }));
  for (const entry of entries) f.game.combat.combatants.set(entry.id, entry);
  f.game.combat.setupTurns();
  f.settings.set("encounterPlayers", [...partyNames.map((name) => ({ name, enabled: true })), { name: "Novak", enabled: true }]);
  const preview = f.service.preview();
  assert.deepEqual(preview.players.slice(0, 6).map(({ name }) => name), aliases);
  assert.equal(preview.players.length, 7, "Novak remains an independent custom player");
  for (const [index, row] of preview.players.slice(0, 6).entries()) {
    assert.equal(row.combatantId, entries[index].id);
    assert.equal(row.initiative, 20 - index);
  }
  await f.service.prepare(preview.id, f.submit(preview));
  assert.equal(f.game.combat.combatants.size, 7);
  for (const [index, entry] of entries.entries()) {
    assert.deepEqual(entry.flags, { "monks-combat-details": { placeholder: true }, custom: { keep: index } });
    assert.equal(entry.initiative, 20 - index);
  }
});

test("native party actors and differently named legacy placeholders share one preparation row", async () => {
  const f = fixture({ existing: true });
  f.scene.tokens.clear(); f.game.actors.clear(); f.game.users.clear();
  const pairs = [["Orsik", "Flab"], ["Nova Schaltkreis", "Nova"], ["Ray", "Ziggs"]];
  for (const [index, [nativeName, legacyName]] of pairs.entries()) {
    const actor = f.makeActor(nativeName, "character"); f.game.actors.set(actor.id, actor);
    f.game.combat.combatants.set(`legacy-${index}`, flags({ id: `legacy-${index}`, name: legacyName, actor: null,
      initiative: 19 - index, flags: { "monks-combat-details": { placeholder: true } } }));
  }
  f.settings.set("encounterPlayers", pairs.map(([name]) => ({ name, enabled: true })));
  f.game.combat.setupTurns();
  const preview = f.service.preview();
  assert.equal(preview.players.length, 6);
  for (const [index, [nativeName, legacyName]] of pairs.entries()) {
    const row = preview.players[index];
    assert.equal(row.name, legacyName);
    assert.equal(row.actorId, nativeName);
    assert.equal(row.combatantId, `legacy-${index}`);
    assert.equal(row.initiative, 19 - index);
  }
  await f.service.prepare(preview.id, f.submit(preview));
  assert.equal(f.game.combat.combatants.size, 6);
  assert.equal(f.service.preview().players.length, 6);
});
