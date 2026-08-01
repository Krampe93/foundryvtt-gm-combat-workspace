import assert from "node:assert/strict";
import test from "node:test";

import {
  combatantColor,
  isAutomaticActorDeltaStatus
} from "../scripts/services/workspace-bridge.js";

test("assigns 30 distinct encounter palette colors", () => {
  const colors = Array.from({ length: 30 }, (_, index) => combatantColor(index));

  assert.equal(new Set(colors).size, colors.length);
  assert.ok(colors.every((color) => /^#[0-9a-f]{6}$/i.test(color)));
});

test("targets only automatic Dead and Bloodied effect ids", () => {
  const actorDelta = { documentName: "ActorDelta" };
  const actor = { documentName: "Actor" };

  assert.equal(isAutomaticActorDeltaStatus({ id: "dnd5edead0000000", parent: actorDelta }), true);
  assert.equal(isAutomaticActorDeltaStatus({ id: "dnd5ebloodied000", parent: actorDelta }), true);
  assert.equal(isAutomaticActorDeltaStatus({ id: "poisoned", parent: actorDelta }), false);
  assert.equal(isAutomaticActorDeltaStatus({ id: "dnd5edead0000000", parent: actor }), true);
  assert.equal(isAutomaticActorDeltaStatus({ id: "temporary", parent: actorDelta }, { _id: "dnd5ebloodied000" }), true);
});
