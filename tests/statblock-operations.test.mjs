import assert from "node:assert/strict";
import test from "node:test";

import {
  missingStatblockItems,
  prepareInlineActivityCommands,
  prepareStatblockDescription,
  prepareStatblockSource,
  statblockActivityAction,
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
