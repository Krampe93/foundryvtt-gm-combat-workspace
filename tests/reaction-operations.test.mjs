import assert from "node:assert/strict";
import test from "node:test";

import {
  actorMeleeAttacks,
  actorOpportunityPlan,
  actorReactions,
  actorTurnStartEffects,
  isPlayerFacingTurn,
  mergeReactionStates,
  reactionExecutionPlan,
  reactionResourceState,
  shouldRestoreReaction,
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

test("builds three Rend attacks from an explicit Multiattack description", () => {
  const rend = activity("rend-attack", "attack", "action", "melee");
  const actor = {
    items: [
      item("multiattack", "Multiattack", [], "The dragon makes three Rend attacks."),
      item("rend", "Rend", [rend])
    ]
  };

  const plan = actorOpportunityPlan(actor);
  assert.equal(plan.mode, "sequence");
  assert.equal(plan.sequence.length, 3);
  assert.deepEqual(plan.sequence.map(({ itemName }) => itemName), ["Rend", "Rend", "Rend"]);
});

test("excludes ranged Multiattack options and repeats the remaining melee attack", () => {
  const actor = {
    items: [
      item("multiattack", "Multiattack", [], "The giant makes two attacks, using Stone Club or Boulder in any combination."),
      item("club", "Stone Club", [activity("club-attack", "attack", "action", "melee")]),
      item("boulder", "Boulder", [activity("boulder-attack", "attack", "action", "ranged")])
    ]
  };

  const plan = actorOpportunityPlan(actor);
  assert.equal(plan.mode, "sequence");
  assert.deepEqual(plan.sequence.map(({ itemName }) => itemName), ["Stone Club", "Stone Club"]);
});

test("requires a slot choice for an ambiguous melee Multiattack", () => {
  const actor = {
    items: [
      item("multiattack", "Multiattack", [], "The monster makes two attacks using Bite or Claw in any combination."),
      item("bite", "Bite", [activity("bite-attack", "attack", "action", "melee")]),
      item("claw", "Claw", [activity("claw-attack", "attack", "action", "melee")])
    ]
  };

  const plan = actorOpportunityPlan(actor);
  assert.equal(plan.mode, "choose");
  assert.equal(plan.slots, 2);
  assert.deepEqual(plan.options.map(({ itemName }) => itemName), ["Bite", "Claw"]);
});

test("keeps the written order and counts of distinct melee attacks", () => {
  const actor = {
    items: [
      item("multiattack", "Multiattack", [], "The monster makes one Bite and two Claw attacks."),
      item("bite", "Bite", [activity("bite-attack", "attack", "action", "melee")]),
      item("claw", "Claw", [activity("claw-attack", "attack", "action", "melee")])
    ]
  };

  assert.deepEqual(
    actorOpportunityPlan(actor).sequence.map(({ itemName }) => itemName),
    ["Bite", "Claw", "Claw"]
  );
});

test("reaction execution ignores saves and selects reduction plus damage", () => {
  const save = activity("save", "save", "reaction");
  const damage = {
    ...activity("damage", "damage", "", null),
    damage: { parts: [{ formula: "1d10 + 6" }] },
    rollDamage() {}
  };
  const deflect = item(
    "deflect",
    "Deflect Missile",
    [save, damage],
    "The giant reduces the damage it takes from the attack by 11 (1d10 + 6). Failure: 11 (1d10 + 6 Force) damage."
  );

  const plan = reactionExecutionPlan(deflect, save);
  assert.equal(plan.reductionFormula, "1d10+6");
  assert.deepEqual(plan.damageActivities.map(({ id }) => id), ["damage"]);
});

test("blocks depleted recharge reactions without treating ordinary reactions as resources", () => {
  const depletedActivity = {
    id: "save",
    uses: { value: 0, spent: 1, recovery: [{ period: "recharge", formula: "5-6" }] }
  };
  assert.deepEqual(reactionResourceState(item("deflect", "Deflect Missile", [depletedActivity]), depletedActivity), {
    recharge: true,
    available: false,
    remaining: 0,
    spent: 1,
    spentPath: "system.activities.save.uses.spent"
  });
  const damageResource = { id: "damage", uses: { spent: 0, recovery: [{ type: "recharge" }] } };
  assert.equal(reactionResourceState(item("deflect", "Deflect Missile", [activity("save", "save", "reaction"), damageResource])).available, true);
  assert.deepEqual(reactionResourceState(item("ordinary", "Parry", [activity("parry", "utility", "reaction")])), {
    recharge: false,
    available: true,
    remaining: null,
    spent: null,
    spentPath: null
  });
});

test("restores a reaction at every real NPC turn start", () => {
  const previous = { started: true, combatId: "combat", round: 2, turn: 3, activeCombatantId: "player" };
  const current = { started: true, combatId: "combat", round: 2, turn: 4, activeCombatantId: "giant", activeType: "npc" };

  assert.equal(shouldRestoreReaction(previous, current), true);
  assert.equal(shouldRestoreReaction(current, current), false);
  assert.equal(shouldRestoreReaction(current, { ...current, turn: 5, activeType: "player" }), false);
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
