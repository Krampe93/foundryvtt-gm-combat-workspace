import assert from "node:assert/strict";
import test from "node:test";

import {
  missingStatblockItems,
  prepareStatblockDescription,
  prepareStatblockSource,
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
});
