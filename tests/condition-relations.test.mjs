import assert from "node:assert/strict";
import test from "node:test";
import { actorConditions, conditionParticipants, conditionRelations, conditionSourceChoices, participantConditionTexts, setActorCondition } from "../scripts/services/condition-operations.js";

globalThis.CONFIG = { statusEffects: [{ id: "grappled", name: "Grappled" }, { id: "frightened", name: "Frightened" }] };

function actor(id, type = "npc") {
  const result = { id, uuid: `Actor.${id}`, type, name: id, effects: new Map(),
    get statuses() { return new Set([...this.effects.values()].filter(effect => !effect.disabled).flatMap(effect => [...effect.statuses])); },
    async toggleStatusEffect(statusId, { active }) {
      const existing = this.effects.get(statusId);
      if (existing) { if (!active) { this.effects.delete(statusId); return false; } return true; }
      if (!active) return;
      const effect = { statuses: new Set([statusId]), flags: {},
        async setFlag(scope, key, value) {
          const [flag, status] = key.split(".");
          ((this.flags[scope] ??= {})[flag] ??= {})[status] = value;
        },
        async delete() { result.effects.delete(statusId); }
      };
      this.effects.set(statusId, effect);
      return effect;
    } };
  return result;
}

function arena() {
  const zane = actor("Zane", "character"), orsik = actor("Orsik", "character"), nova = actor("Nova", "character");
  const goblinA = actor("GoblinA"), goblinB = actor("GoblinB");
  const doc = (id, actor, initiative, name = actor.name) => ({ id, actor, actorId: actor.id, initiative, name,
    token: { id, uuid: `Scene.arena.Token.${id}`, actorLink: actor.type === "character" } });
  const entries = [doc("goblin-a", goblinA, 18, "Goblin"), doc("zane", zane, 16),
    doc("goblin-b", goblinB, 12, "Goblin"), doc("orsik", orsik, 10)];
  const combat = { id: "fight", started: true, scene: { id: "arena" }, combatants: new Map(entries.map(entry => [entry.id, entry])), turns: entries };
  globalThis.game = { user: { isGM: true }, combat, combats: new Map([[combat.id, combat]]),
    actors: new Map([zane, orsik, nova].map(actor => [actor.id, actor])), i18n: { localize: value => value } };
  return { combat, zane, orsik, nova, goblinA, goblinB };
}

test("players follow initiative, world characters are included once and NPC tokens remain distinct", () => {
  const { combat } = arena();
  const participants = conditionParticipants(combat);
  assert.deepEqual(participants.filter(entry => entry.type === "character").map(({ name }) => name), ["Zane", "Orsik", "Nova"]);
  const npcs = conditionSourceChoices(combat).filter(entry => entry.type === "npc");
  assert.deepEqual(npcs.map(({ name }) => name), ["Goblin 1", "Goblin 2"]);
  assert.deepEqual(npcs.map(({ uuid }) => uuid), ["Scene.arena.Token.goblin-a", "Scene.arena.Token.goblin-b"]);
});

test("an unlinked player targets the actual token actor without showing its world base twice", () => {
  const { combat, zane } = arena();
  const tokenActor = actor("ZaneToken", "character");
  tokenActor.uuid = "Scene.arena.Token.zane.Actor.ZaneToken";
  const entry = combat.combatants.get("zane");
  entry.actor = tokenActor;
  entry.token.baseActor = zane;
  entry.token.actorLink = false;
  const players = conditionParticipants(combat).filter(entry => entry.type === "character");
  assert.equal(players.length, 3);
  assert.equal(players[0].actor, tokenActor);
  assert.equal(players.some(entry => entry.key === zane.uuid), false);
});

test("NPC sources use token UUIDs even when linked tokens share an actor", () => {
  const { combat } = arena();
  combat.combatants.get("goblin-b").actor = combat.combatants.get("goblin-a").actor;
  const sources = conditionSourceChoices(combat).filter(entry => entry.type === "npc");
  assert.equal(sources[0].actorUuid, sources[1].actorUuid);
  assert.notEqual(sources[0].uuid, sources[1].uuid);
});

test("both grapple directions are separate native effects and exported source-to-target relations", async () => {
  const { combat, zane, goblinA, goblinB } = arena();
  const sources = conditionSourceChoices(combat);
  await setActorCondition(zane, { statusId: "grappled", active: true, sourceUuid: "Scene.arena.Token.goblin-b" }, sources);
  assert.equal(goblinB.effects.size, 0, "a grapple does not apply the reverse condition to its source");
  await setActorCondition(goblinA, { statusId: "grappled", active: true, sourceUuid: zane.uuid }, sources);
  const relations = conditionRelations(combat);
  assert.equal(relations.length, 2);
  assert.ok(relations.some(relation => relation.text === "Zane packt Goblin 1"));
  assert.ok(relations.some(relation => relation.text === "Goblin 2 packt Zane"));
  const incoming = relations.find(relation => relation.target.actorUuid === zane.uuid);
  assert.equal(incoming.source.tokenUuid, "Scene.arena.Token.goblin-b");
  assert.equal(incoming.source.actorUuid, goblinB.uuid);
  assert.equal(incoming.source.type, "npc");
  assert.equal(incoming.target.type, "character");
  assert.doesNotThrow(() => JSON.stringify(relations), "relations contain no native document references");
  await setActorCondition(zane, { statusId: "grappled", active: false }, sources);
  assert.equal(conditionRelations(combat).length, 1);
  assert.equal(goblinA.effects.size, 1, "removing one direction leaves the other intact");
});

test("switching same-name NPC sources keeps the selected token and updates only that condition", async () => {
  const { combat, zane } = arena();
  for (const id of ["goblin-a", "goblin-b"]) {
    await setActorCondition(zane, { statusId: "grappled", active: true, sourceUuid: `Scene.arena.Token.${id}` }, conditionSourceChoices(combat));
    assert.equal(conditionRelations(combat)[0].source.combatantId, id);
  }
  assert.equal(zane.effects.size, 1);
  assert.equal(actorConditions(zane)[0].text, "Gepackt von Goblin 2");
});

test("world players can have native conditions and directed relations outside a running encounter", async () => {
  const { zane, orsik } = arena();
  game.combat = null;
  const sources = conditionSourceChoices(null);
  await setActorCondition(zane, { statusId: "frightened", active: true, sourceUuid: orsik.uuid }, sources);
  const relations = conditionRelations(null);
  assert.equal(relations.length, 1);
  assert.equal(relations[0].target.combatantId, null);
  assert.equal(relations[0].target.actorUuid, zane.uuid);
  assert.equal(relations[0].source.uuid, orsik.uuid);
});

test("legacy player sources remain readable and a departed NPC keeps its recorded identity", async () => {
  const { combat, zane } = arena();
  await setActorCondition(zane, { statusId: "grappled", active: true, sourceUuid: "Scene.arena.Token.goblin-a" }, conditionSourceChoices(combat));
  combat.combatants.delete("goblin-a");
  const relation = conditionRelations(combat)[0];
  assert.equal(relation.source.tokenUuid, "Scene.arena.Token.goblin-a");
  assert.equal(relation.source.name, "Goblin 1");
  const effect = zane.effects.get("grappled");
  await effect.setFlag("gm-combat-workspace", "conditionSources.grappled", { uuid: "Actor.Orsik", name: "Orsik" });
  assert.equal(conditionRelations(combat)[0].source.actorUuid, "Actor.Orsik");
});

test("one native condition creates both linked displays and both disappear together", async () => {
  const { combat, zane } = arena();
  await setActorCondition(zane, { statusId: "grappled", active: true, sourceUuid: "Scene.arena.Token.goblin-a" }, conditionSourceChoices(combat));
  const entries = conditionParticipants(combat);
  const player = entries.find(entry => entry.actor === zane);
  const first = entries.find(entry => entry.combatantId === "goblin-a");
  const second = entries.find(entry => entry.combatantId === "goblin-b");
  let relations = conditionRelations(combat);
  assert.deepEqual(participantConditionTexts(player, relations), ["Gepackt von Goblin 1"]);
  assert.deepEqual(participantConditionTexts(first, relations), ["Packt gerade Zane"]);
  assert.deepEqual(participantConditionTexts(second, relations), []);
  await setActorCondition(zane, { statusId: "grappled", active: true, sourceUuid: "Scene.arena.Token.goblin-b" }, conditionSourceChoices(combat));
  relations = conditionRelations(combat);
  assert.deepEqual(participantConditionTexts(first, relations), []);
  assert.deepEqual(participantConditionTexts(second, relations), ["Packt gerade Zane"]);
  await setActorCondition(zane, { statusId: "grappled", active: false }, conditionSourceChoices(combat));
  relations = conditionRelations(combat);
  assert.deepEqual(participantConditionTexts(player, relations), []);
  assert.deepEqual(participantConditionTexts(second, relations), []);
});

test("native nested flag merging cannot retain an old NPC token after switching to a legacy player source", async () => {
  const { combat, zane, orsik } = arena();
  await setActorCondition(zane, { statusId: "grappled", active: true, sourceUuid: "Scene.arena.Token.goblin-a" }, conditionSourceChoices(combat));
  const effect = zane.effects.get("grappled");
  effect.setFlag = async (_scope, _path, value) => {
    Object.assign(effect.flags["gm-combat-workspace"].conditionSources.grappled, value);
  };
  await setActorCondition(zane, { statusId: "grappled", active: true, sourceUuid: orsik.uuid }, [orsik]);
  const source = effect.flags["gm-combat-workspace"].conditionSources.grappled;
  assert.equal(source.uuid, orsik.uuid);
  assert.equal(source.tokenUuid, null);
  assert.equal(source.combatantId, null);
  assert.equal(source.actorUuid, orsik.uuid);
});
