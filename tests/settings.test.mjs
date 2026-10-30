import assert from "node:assert/strict";
import test from "node:test";
import { registerSettings } from "../scripts/settings.js";

test("only working client switches are visible; old saved options and the world player roster remain registered", () => {
  const original = globalThis.game;
  const registered = new Map();
  const saved = new Map([["openNpcSheetOnTurn", false], ["closePreviousNpcSheet", false],
    ["hiddenMovementTracker", true], ["selectActiveNpcToken", false], ["panToActiveNpc", true]]);
  globalThis.game = { settings: { register(module, key, config) {
    assert.equal(module, "gm-combat-workspace");
    registered.set(key, config);
    if (!saved.has(key)) saved.set(key, config.default);
  } } };
  try {
    registerSettings();
    assert.deepEqual([...registered].filter(([, config]) => config.config).map(([key]) => key),
      ["debugMode", "selectActiveNpcToken", "panToActiveNpc"]);
    for (const key of ["openNpcSheetOnTurn", "closePreviousNpcSheet", "hiddenMovementTracker"]) {
      assert.equal(registered.get(key).config, false);
      assert.equal(registered.get(key).scope, "client");
    }
    assert.equal(registered.get("selectActiveNpcToken").default, true);
    assert.equal(registered.get("panToActiveNpc").default, false);
    assert.equal(registered.get("encounterPlayers").scope, "world");
    assert.equal(registered.get("encounterPlayers").config, false);
    assert.equal(saved.get("selectActiveNpcToken"), false);
    assert.equal(saved.get("panToActiveNpc"), true);
    assert.equal(saved.get("openNpcSheetOnTurn"), false, "registration retains prior preferences");
  } finally { globalThis.game = original; }
});
