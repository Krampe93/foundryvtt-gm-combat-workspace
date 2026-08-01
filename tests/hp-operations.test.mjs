import assert from "node:assert/strict";
import test from "node:test";

import { calculateHpUpdate, halfDamage, parseHpInput, uniqueHpTargets } from "../scripts/services/hp-operations.js";

test("parses direct HP input semantics", () => {
  assert.deepEqual(parseHpInput("50"), { mode: "set", amount: 50 });
  assert.deepEqual(parseHpInput("-20"), { mode: "damage", amount: 20 });
  assert.deepEqual(parseHpInput("+10"), { mode: "heal", amount: 10 });
  assert.equal(parseHpInput("five"), null);
});

test("damage consumes temporary HP before regular HP", () => {
  assert.deepEqual(calculateHpUpdate({ value: 30, max: 40, temp: 8 }, "damage", 5), { value: 30, temp: 3 });
  assert.deepEqual(calculateHpUpdate({ value: 30, max: 40, temp: 8 }, "damage", 12), { value: 26, temp: 0 });
});

test("setting and healing clamp to the maximum and damage to zero", () => {
  assert.deepEqual(calculateHpUpdate({ value: 30, max: 40, temp: 4 }, "heal", 20), { value: 40, temp: 4 });
  assert.deepEqual(calculateHpUpdate({ value: 30, max: 40, temp: 4 }, "set", 99), { value: 40, temp: 4 });
  assert.deepEqual(calculateHpUpdate({ value: 3, max: 40, temp: 0 }, "damage", 20), { value: 0, temp: 0 });
  assert.equal(halfDamage(9), 4);
});

test("deduplicates linked actors but keeps synthetic tokens independent", () => {
  const targets = [
    { actorId: "wolf", linked: true, sceneId: "s", tokenId: "a" },
    { actorId: "wolf", linked: true, sceneId: "s", tokenId: "b" },
    { actorId: "wolf", linked: false, sceneId: "s", tokenId: "c" },
    { actorId: "wolf", linked: false, sceneId: "s", tokenId: "d" }
  ];
  assert.deepEqual(uniqueHpTargets(targets), [targets[0], targets[2], targets[3]]);
});
