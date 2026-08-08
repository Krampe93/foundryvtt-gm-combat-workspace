import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  combatantColor,
  isAutomaticActorDeltaStatus,
  savingThrowConfig
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

test("builds dialog-free normal, advantage, and disadvantage saves", () => {
  assert.deepEqual(savingThrowConfig("dex", "normal"), {
    config: { ability: "dex", advantage: false, disadvantage: false },
    dialog: { configure: false }
  });
  assert.equal(savingThrowConfig("wis", "advantage").config.advantage, true);
  assert.equal(savingThrowConfig("cha", "disadvantage").config.disadvantage, true);
});

test("keeps the approved lower workspace areas in the permanent shell", () => {
  const source = readFileSync(new URL("../scripts/services/workspace-bridge.js", import.meta.url), "utf8");

  assert.match(source, /gm-workspace-lower-deck/);
  assert.match(source, /gm-workspace-roll-results/);
  assert.match(source, /gm-workspace-minimap/);
  assert.match(source, /gm-workspace-tools-menu/);
  assert.doesNotMatch(source, /<details class="gm-workspace-diagnostics">/);
});

test("locks the right column to equal dashboard and lower-deck halves", () => {
  const css = readFileSync(new URL("../styles/gm-combat-workspace.css", import.meta.url), "utf8");

  assert.match(css, /\.gm-workspace-context-panel\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(css, /\.gm-workspace-lower-deck\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 2fr\) minmax\(170px, 1fr\) minmax\(170px, 1fr\)/);
});
