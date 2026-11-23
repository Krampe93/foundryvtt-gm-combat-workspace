import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("module-owned combat controls and compact save labels use German without changing ability identifiers", () => {
  const source = readFileSync(new URL("../scripts/services/workspace-bridge.js", import.meta.url), "utf8");
  assert.match(source, /<span>Zug beenden<\/span>/);
  for (const [ability, label] of [["str", "ST"], ["dex", "GE"], ["con", "KO"], ["wis", "WE"]]) {
    assert.ok(source.includes(`["${ability}", "${label}"]`));
  }
  assert.doesNotMatch(source, />End Turn</);
  assert.doesNotMatch(source, />Statblock</);
  assert.doesNotMatch(source, /Recharge jetzt|`Recharge \$\{threshold\}`| · Placeholder/);
});
