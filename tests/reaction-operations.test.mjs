import assert from "node:assert/strict";
import test from "node:test";

import {
  actorMeleeAttacks,
  actorReactions,
  actorTurnStartEffects,
  isPlayerFacingTurn,
  mergeReactionStates,
  stripFoundryMarkup
} from "../scripts/services/reaction-operations.js";

function activity(id, type, activation, attackType = null) {
  return {
    id,
    name: id,
    type,
    activation: { type: activation, condition: "Wenn ein Angriff trifft" },
    attack: attackType ? { type: { value: attackType } } : undefined,
    use() {}
  };
}

function item(id, name, activities = [], description = "") {
  return {
    id,
    uuid: `Actor.enemy.Item.${id}`,
    name,
    system: {
      activities: new Map(activities.map((entry) => [entry.id, entry])),
      description: { value: description }
    }
  };
}

test("recognizes only explicit reaction activities", () => {
  const reaction = activity("deflect", "utility", "reaction");
  const reactionDamage = activity("shield", "utility", "reactiondamage");
  const action = activity("club", "attack", "action", "melee");
  const actor = { items: [item("feature", "Deflect Missile", [reaction, reactionDamage, action])] };

  assert.deepEqual(actorReactions(actor).map(({ activityId }) => activityId), ["deflect", "shield"]);
});

test("finds melee attacks but excludes ranged attacks", () => {
  const actor = {
    items: [
      item("club", "Stone Club", [activity("club-attack", "attack", "action", "melee")]),
      item("boulder", "Boulder", [activity("boulder-attack", "attack", "action", "ranged")])
    ]
  };

  assert.deepEqual(actorMeleeAttacks(actor).map(({ itemId }) => itemId), ["club"]);
});

test("recognizes start-of-turn area reminders", () => {
  const actor = {
    items: [
      item("aura", "Fear Aura", [], "A creature that starts its turn within 20 feet must save."),
      item("plain", "Regeneration", [], "At the start of its turn, the monster regains hit points.")
    ]
  };

  assert.deepEqual(actorTurnStartEffects(actor).map(({ name }) => name), ["Fear Aura"]);
});

test("recognizes a Bodak-style end-of-turn aura", () => {
  const actor = {
    items: [
      item("annihilation", "Aura of Annihilation", [], "Any creature that ends its turn within 30 feet takes necrotic damage.")
    ]
  };

  assert.deepEqual(actorTurnStartEffects(actor).map(({ name, timing }) => ({ name, timing })), [
    { name: "Aura of Annihilation", timing: "end" }
  ]);
});

test("recognizes Death Gaze but rejects Command and Detect Magic as turn auras", () => {
  const actor = {
    items: [
      item("death-gaze", "Death Gaze", [], "When a creature that can see the bodak's eyes starts its turn within 30 feet of the bodak, it must save."),
      item("command", "Command", [], "The target moves toward you, ending its turn if it moves within 5 feet of you."),
      item("detect-magic", "Detect Magic", [], "You sense the presence of magical effects within 30 feet and learn if an effect has a faint aura.")
    ]
  };

  assert.deepEqual(actorTurnStartEffects(actor).map(({ name, timing }) => ({ name, timing })), [
    { name: "Death Gaze", timing: "start" }
  ]);
});

test("turn reminder text converts Foundry save, damage, status, and reference markup", () => {
  const text = stripFoundryMarkup(
    "Make a [[/save ability=con dc=13]] saving throw unless &amp;Reference[condition=incapacitated]. " +
    "Take [[/damage 3d10 type=psychic]] damage unless @status[surprised]."
  );

  assert.equal(
    text,
    "Make a CON-Rettungswurf (SG 13) unless kampfunfähig. Take 3d10 psychic damage unless überrascht."
  );
});

test("turn reminder text resolves spell and variant-rule references without duplicate labels", () => {
  assert.equal(
    stripFoundryMarkup("@spell[Command|XPHB] and @variantrule[Cone|Area of Effect|XPHB]Cone"),
    "Command and Cone"
  );
});

test("treats actorless initiative placeholders as player-facing turns", () => {
  assert.equal(isPlayerFacingTurn("player"), true);
  assert.equal(isPlayerFacingTurn("placeholder"), true);
  assert.equal(isPlayerFacingTurn("npc"), false);
});

test("current reaction states override legacy reaction-tracker states", () => {
  assert.deepEqual(
    mergeReactionStates({ giant: { used: false } }, { giant: { used: true }, mage: { used: true } }),
    { giant: { used: false }, mage: { used: true } }
  );
});
