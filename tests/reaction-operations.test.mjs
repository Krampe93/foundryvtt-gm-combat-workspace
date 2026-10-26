import assert from "node:assert/strict";
import test from "node:test";

import {
  actorMeleeAttacks,
  actorLegendaryActions,
  actorOpportunityPlan,
  actorReactions,
  actorTurnStartEffects,
  isPlayerFacingTurn,
  legendaryExecutionPlan,
  legendaryResourceState,
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

test("finds structured legendary actions with their costs", () => {
  const command = activity("command", "utility", "legendary");
  command.activation.value = 2;
  const actor = { items: [item("presence", "Commanding Presence", [command], "The dragon issues a command.")] };

  assert.deepEqual(actorLegendaryActions(actor).map(({ name, itemId, activityId, cost }) => ({
    name, itemId, activityId, cost
  })), [{
    name: "Commanding Presence",
    itemId: "presence",
    activityId: "command",
    cost: 2
  }]);
});

test("reads legendary actions without confusing legendary resistances", () => {
  const actor = {
    system: {
      resources: {
        legact: { max: 3, spent: 2, value: 1 },
        legres: { max: 3, spent: 0, value: 3 }
      }
    }
  };

  assert.deepEqual(legendaryResourceState(actor), {
    available: true,
    maximum: 3,
    remaining: 1,
    spent: 2,
    spentPath: "system.resources.legact.spent"
  });
});

test("locks repeat-restricted actions until the actor's next turn", () => {
  const use = activity("use", "utility", "legendary");
  const actor = {
    items: [item("rays", "Fiery Rays", [use], "The dragon can't take this action again until the start of its next turn.")]
  };

  assert.equal(actorLegendaryActions(actor)[0].locksUntilNextTurn, true);
});

test("requires an explicit choice between duplicate Scorching Rays before planning attacks", () => {
  const use = activity("use", "utility", "legendary");
  const attack = { ...activity("attack", "attack", "action", "ranged"), rollAttack() {}, rollDamage() {} };
  const fiery = item("fiery", "Fiery Rays", [use], "The dragon casts @spell[Scorching Ray|XPHB].");
  const rayA = item("ray-a", "Scorching Ray", [attack], "You create three rays of fire.");
  rayA.identifier = "scorching-ray";
  const rayB = item("ray-b", "Scorching Ray", [attack], "You create three rays of fire.");
  rayB.identifier = "scorching-ray";
  const actor = { items: [fiery, rayA, rayB] };

  const ambiguous = legendaryExecutionPlan(actor, fiery);
  assert.equal(ambiguous.ambiguous, true);
  assert.equal(ambiguous.attackCount, 0);
  assert.deepEqual(ambiguous.options.map(({ id }) => id), ["ray-a:attack", "ray-b:attack"]);
  assert.deepEqual(legendaryExecutionPlan(actor, fiery, "ray-b:attack"), {
    linkedItemId: "ray-b",
    linkedIdentifier: "scorching-ray",
    linkedName: "Scorching Ray",
    attackActivityId: "attack",
    attackCount: 3,
    save: null,
    ambiguous: false, options: ambiguous.options, selected: "ray-b:attack"
  });
});

test("resolves Command as a Wisdom DC 20 player save without rolling it", () => {
  const use = activity("use", "utility", "legendary");
  const save = { ...activity("save", "save", "action"), save: { ability: {}, dc: { value: 20 } } };
  const presence = item("presence", "Commanding Presence", [use], "The dragon casts @spell[Command|XPHB].");
  const command = item("command", "Command", [save], "The target must make a Wisdom saving throw.");
  command.identifier = "command";
  const actor = { items: [presence, command] };

  assert.deepEqual(legendaryExecutionPlan(actor, presence).save, { ability: "wis", dc: 20 });
});

test("resolves Pounce to one naturally mentioned Rend attack", () => {
  const use = activity("use", "utility", "legendary");
  const attack = { ...activity("attack", "attack", "action", "melee"), rollAttack() {}, rollDamage() {} };
  const pounce = item("pounce", "Pounce", [use], "The dragon moves and makes one Rend attack.");
  const rend = item("rend", "Rend", [attack], "Melee attack.");
  rend.identifier = "rend";
  const actor = { items: [pounce, rend] };

  assert.equal(legendaryExecutionPlan(actor, pounce).linkedItemId, "rend");
  assert.equal(legendaryExecutionPlan(actor, pounce).attackCount, 1);
});

test("a precise item UUID selects only that embedded item despite duplicate names", () => {
  const attack = activity("hit", "attack", "action");
  const rendA = item("a", "Rend", [attack]);
  const rendB = item("b", "Rend", [attack]);
  rendA.uuid = "Actor.dragon.Item.a";
  rendB.uuid = "Actor.dragon.Item.b";
  const pounce = item("pounce", "Pounce", [], "Makes one @UUID[Actor.dragon.Item.b]{Rend} attack.");
  assert.equal(legendaryExecutionPlan({ items: [pounce, rendA, rendB] }, pounce).linkedItemId, "b");
});

test("multiple activities require selection and invalid selections never guess an attack", () => {
  const multi = item("rend", "Rend", [activity("one", "attack", "action"), activity("two", "attack", "action")]);
  const pounce = item("pounce", "Pounce", [], "The dragon makes one Rend attack.");
  const actor = { items: [pounce, multi] };
  assert.equal(legendaryExecutionPlan(actor, pounce).ambiguous, true);
  assert.equal(legendaryExecutionPlan(actor, pounce, "gone:old").attackCount, 0);
  assert.equal(legendaryExecutionPlan(actor, pounce, "rend:two").attackActivityId, "two");
  pounce.system.description.value = "The dragon moves without attacking.";
  assert.equal(legendaryExecutionPlan(actor, pounce).attackCount, 0);
  pounce.system.description.value = "The dragon casts @spell[Missing Spell|XPHB] and makes a Rend attack.";
  assert.equal(legendaryExecutionPlan(actor, pounce).attackCount, 0, "an unresolved explicit reference is not replaced with a guess");
});

test("compendium UUIDs resolve embedded sources or their explicit labels without choosing a duplicate silently", () => {
  const reference = "Compendium.dnd5e.monsters.Item.rend";
  const rendA = item("a", "Rend", [activity("hit", "attack", "action")]);
  const rendB = item("b", "Rend", [activity("hit", "attack", "action")]);
  rendA._stats = { compendiumSource: reference };
  const pounce = item("pounce", "Pounce", [], `Makes one @UUID[${reference}]{Rend} attack.`);
  const actor = { items: [pounce, rendA, rendB] };
  assert.equal(legendaryExecutionPlan(actor, pounce).linkedItemId, "a");
  delete rendA._stats;
  assert.equal(legendaryExecutionPlan(actor, pounce).ambiguous, true);
  assert.equal(legendaryExecutionPlan(actor, pounce, "b:hit").linkedItemId, "b");
});

test("legendary budgets use D&D5e's derived In-Lair maximum exactly once", () => {
  const actor = { _source: { system: { resources: { legact: { max: 3 } } } }, system: { resources: {
    legact: { max: 4, spent: 1, value: 3 }, legres: { max: 4, spent: 2, value: 2 }, lair: { value: true, inside: true }
  } } };
  assert.equal(legendaryResourceState(actor).maximum, 4);
  assert.equal(legendaryResourceState(actor).remaining, 3);
  actor.system.resources.lair.inside = false;
  actor.system.resources.legact = { max: 3, spent: 1, value: 2 };
  assert.equal(legendaryResourceState(actor).maximum, 3);
  assert.equal(actor.system.resources.legres.spent, 2);
});

test("turn reminders retain the originating item id and full text", () => {
  const description = `Any creature that ends its turn within 30 feet takes damage. ${"More details. ".repeat(40)}`;
  const actor = { items: [item("aura", "Long Aura", [], description)] };
  const [effect] = actorTurnStartEffects(actor);

  assert.equal(effect.itemId, "aura");
  assert.equal(effect.description.endsWith("More details."), true);
  assert.equal(effect.description.includes("…"), false);
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
