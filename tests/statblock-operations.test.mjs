import assert from "node:assert/strict";
import test from "node:test";

import {
  executeStatblockActivity,
  missingStatblockItems,
  prepareInlineActivityCommands,
  prepareStatblockDescription,
  prepareStatblockSource,
  statblockActivityAction,
  statblockClickRoute,
  statblockCategoryForItem
} from "../scripts/services/statblock-operations.js";

function item(id, type, activation = "", identifier = id) {
  return {
    id,
    identifier,
    name: id,
    type,
    sort: 0,
    system: {
      properties: new Set(),
      activities: new Map([["primary", { activation: { type: activation } }]])
    }
  };
}

test("classifies a feat with an empty primary activation as a passive trait", () => {
  assert.equal(statblockCategoryForItem(item("death-gaze", "feat", "")), "trait");
});

function clickFixture(activities, { type = null, activityId = null, activityUuid = null, name = false } = {}) {
  const club = { id: "club", system: { activities: new Map(activities.map((activity) => [activity.id, activity])) } };
  const actor = { items: new Map([["club", club]]) };
  const link = {
    dataset: { ...(activityId ? { activityId } : {}) },
    closest(selector) {
      if (selector === "[data-item-id]") return name ? { dataset: { itemId: "club" } } : null;
      if (selector === ".statblock-action[data-id]") return { dataset: { id: "club" } };
      if (selector === ".roll-link-group[data-type]") return type ? { dataset: { type } } : null;
      if (selector === "[data-activity-uuid]") return activityUuid ? { dataset: { activityUuid } } : null;
      return null;
    }
  };
  return { actor, link, club };
}

test("native Club name selects its attack activity instead of the general item-use path", () => {
  const attack = { id: "attack", type: "attack", rollAttack() {}, rollDamage() {} };
  const damage = { id: "damage", type: "damage", rollDamage() {} };
  const { actor, link, club } = clickFixture([damage, attack], { name: true });
  assert.deepEqual(statblockClickRoute(actor, link), { item: club, activity: attack, action: "attack" });
});

test("native damage formula finds the owning item through its statblock action", () => {
  const attack = { id: "attack", type: "attack", rollAttack() {}, rollDamage() {} };
  const { actor, link, club } = clickFixture([attack], { type: "damage" });
  assert.deepEqual(statblockClickRoute(actor, link), { item: club, activity: attack, action: "damage" });
});

test("dedicated damage activities take precedence over an attack's damage method", () => {
  const attack = { id: "attack", type: "attack", rollAttack() {}, rollDamage() {} };
  const damage = { id: "damage", type: "damage", rollDamage() {} };
  const { actor, link } = clickFixture([attack, damage], { type: "damage" });
  assert.equal(statblockClickRoute(actor, link).activity, damage);
});

test("enriched activity UUIDs choose exactly the referenced attack for a damage click", () => {
  const first = { id: "first", type: "attack", rollAttack() {}, rollDamage() {} };
  const second = { id: "second", type: "attack", rollAttack() {}, rollDamage() {} };
  const { actor, link } = clickFixture([first, second], { type: "damage", activityUuid: "Actor.goblin.Item.club.Activity.second" });
  const route = statblockClickRoute(actor, link);
  assert.equal(route.activity, second);
  assert.equal(route.action, "damage");
});

test("ambiguous names retain native choice and ambiguous damage links are not guessed", () => {
  const activities = ["first", "second"].map((id) => ({ id, type: "attack", rollAttack() {}, rollDamage() {} }));
  const named = clickFixture(activities, { name: true });
  assert.equal(statblockClickRoute(named.actor, named.link).activity, null);
  const damage = clickFixture(activities, { type: "damage" });
  assert.equal(statblockClickRoute(damage.actor, damage.link), null);
});

test("explicit inline save routes remain native uses and missing activities are ignored", () => {
  const save = { id: "save", type: "save", use() {} };
  const fixture = clickFixture([save], { name: true, activityId: "save" });
  fixture.link.dataset.activityAction = "use";
  assert.equal(statblockClickRoute(fixture.actor, fixture.link).action, "use");
  fixture.link.dataset.activityId = "missing";
  assert.equal(statblockClickRoute(fixture.actor, fixture.link), null);
});

test("supplements missing statblock feats without duplicating displayed or descriptor items", () => {
  const actor = {
    items: [
      item("death-gaze", "feat", ""),
      item("rend", "weapon", "action"),
      item("legendary", "feat", "legendary", "legendary-actions"),
      item("command", "spell", "action")
    ]
  };

  assert.deepEqual(
    missingStatblockItems(actor, ["rend"]).map(({ item: entry, category }) => [entry.id, category]),
    [["death-gaze", "trait"]]
  );
});

test("prepares unsupported references before enrichment and residual commands after enrichment", () => {
  assert.equal(
    prepareStatblockSource("if not &amp;Reference[condition=incapacitated]"),
    "if not kampfunfähig"
  );
  assert.equal(
    prepareStatblockDescription("[[/save ability=wis dc=15]] saving throw"),
    "WIS-Rettungswurf (SG 15)"
  );
  assert.equal(
    prepareStatblockDescription("Cone [Area of Effect|XPHB]Cone"),
    "Cone"
  );
});

test("routes supplemental statblock activities through their native execution method", () => {
  const damage = { type: "damage", rollDamage() {} };
  const attack = { type: "attack", rollAttack() {} };
  const save = { type: "save", use() {} };

  assert.equal(statblockActivityAction(damage), "damage");
  assert.equal(statblockActivityAction(attack), "attack");
  assert.equal(statblockActivityAction(save), "use");
});

test("turns inline save and damage commands into compact native activity links", () => {
  const result = prepareInlineActivityCommands(
    "make a [[/save ability=con dc=13]] saving throw and take [[/damage 3d10 type=psychic]] damage",
    {
      save: { itemId: "death-gaze", activityId: "save", action: "use" },
      damage: { itemId: "death-gaze", activityId: "damage", action: "damage" }
    }
  );

  assert.match(result, /data-activity-id="save"[^>]*>CON-Rettungswurf \(SG 13\)<\/span>/);
  assert.match(result, /data-activity-id="damage"[^>]*>3d10 psychic<\/span>/);
  assert.doesNotMatch(result, /\[\[\/(?:save|damage)/);
});

test("executes direct statblock activities without a synthetic mouse event", async () => {
  const calls = [];
  const damage = {
    rollDamage(...args) {
      calls.push(args);
      return Promise.resolve(["roll"]);
    }
  };

  await executeStatblockActivity(damage, "damage");
  assert.deepEqual(calls, [[{}, { configure: false }]]);
  assert.equal("event" in calls[0][0], false);
});
