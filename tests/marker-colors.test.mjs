import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { combatWallMarkerColor, readCombatWallMarkerColors, scopedEnemyColors } from "../scripts/services/marker-colors.js";
import { createMinimapState } from "../scripts/services/minimap.js";

const snapshot = { combatId: "fight", sceneId: "map", started: true };
const state = { combatId: "fight", sceneId: "map", markers: [
  { combatantId: "dragon-1", tokenId: "red-1", color: "#37d5ff" },
  { combatantId: "dragon-2", tokenId: "red-2", color: "#ff4fd8" },
  { combatantId: "bodak", tokenId: "undead", color: "#37d5ff" }
] };

test("uses the exact per-group Combat Wall colors, including intentional repeats across groups", () => {
  assert.equal(combatWallMarkerColor(state, snapshot, { id: "dragon-1", tokenId: "red-1" }), "#37d5ff");
  assert.equal(combatWallMarkerColor(state, snapshot, { id: "dragon-2", tokenId: "red-2" }), "#ff4fd8");
  assert.equal(combatWallMarkerColor(state, snapshot, { id: "bodak", tokenId: "undead" }), "#37d5ff");
});

test("does not transfer colors between encounters, scenes, replaced tokens or duplicate-token combatants", () => {
  const entry = { id: "dragon-1", tokenId: "red-1" };
  assert.equal(combatWallMarkerColor(state, { ...snapshot, combatId: "next" }, entry), null);
  assert.equal(combatWallMarkerColor(state, { ...snapshot, sceneId: "elsewhere" }, entry), null);
  assert.equal(combatWallMarkerColor(state, snapshot, { ...entry, tokenId: "replaced" }), null);
  assert.equal(combatWallMarkerColor(state, snapshot, { ...entry, id: "different" }), null);
  assert.equal(combatWallMarkerColor(null, snapshot, entry), null);
  assert.equal(combatWallMarkerColor(state, snapshot, { id: "hidden-not-on-wall" }), null);
});

test("changed assignments are read fresh and removed or malformed markers use the ordinary workspace fallback", () => {
  const entry = { id: "dragon-1", tokenId: "red-1" };
  const changed = { ...state, markers: [{ ...state.markers[0], color: "#ffd447" }] };
  assert.equal(combatWallMarkerColor(changed, snapshot, entry), "#ffd447");
  assert.equal(combatWallMarkerColor({ ...state, markers: [] }, snapshot, entry), null);
  assert.equal(combatWallMarkerColor({ ...state, markers: [{ ...state.markers[0], color: "bad" }] }, snapshot, entry), null);
});

test("reads the module batch API once and tolerates an absent, disabled or failing optional module", () => {
  let calls = 0;
  const module = { active: true, api: { getMarkerColors() { calls++; return state; } } };
  const game = { modules: new Map([["combat-wall", module]]) };
  assert.equal(readCombatWallMarkerColors(game, {}), state);
  assert.equal(calls, 1);
  assert.equal(readCombatWallMarkerColors({ modules: new Map() }, {}), null);
  module.active = false;
  assert.equal(readCombatWallMarkerColors(game, { CombatWall: { getMarkerColors: () => state } }), null);
  module.active = true; module.api.getMarkerColors = () => { throw new Error("Unavailable"); };
  assert.equal(readCombatWallMarkerColors(game, {}), null);
  assert.equal(readCombatWallMarkerColors({ modules: new Map() }, { CombatWall: { getMarkerColors: () => state } }), state);
});

test("companion palette messages are encounter-scoped and do not leave stale colors on the next scene", () => {
  const entries = [{ tokenId: "red-1", sceneId: "map", color: "#37d5ff" },
    { tokenId: "other", sceneId: "elsewhere", color: "#ff4fd8" }];
  assert.deepEqual(scopedEnemyColors({ combatId: "fight", entries }, snapshot), [entries[0]]);
  assert.deepEqual(scopedEnemyColors({ combatId: "old", entries }, snapshot), []);
  assert.deepEqual(scopedEnemyColors({ combatId: "fight", entries }, { ...snapshot, started: false }), []);
  assert.deepEqual(scopedEnemyColors({ combatId: "fight", entries: [{ ...entries[0], color: "invalid" }] }, snapshot), []);
});

test("minimap points retain the selected Wall colors for every token", () => {
  const tokens = new Map(state.markers.map((entry, index) => [entry.tokenId, {
    id: entry.tokenId, x: index * 100, y: 100, width: 1, height: 1
  }]));
  const scene = { id: "map", name: "Testkarte", tokens, dimensions: { sceneRect: { x: 0, y: 0, width: 1000, height: 500 }, size: 100 } };
  const enemies = state.markers.map((entry) => ({ id: entry.combatantId, tokenId: entry.tokenId, type: "npc",
    color: combatWallMarkerColor(state, snapshot, { id: entry.combatantId, tokenId: entry.tokenId }) }));
  const minimap = createMinimapState({ canvas: { ready: true, scene }, snapshot, enemies, baseUrl: "https://example.invalid/game" });
  assert.deepEqual(minimap.points.map(({ id, color }) => ({ id, color })), state.markers.map(({ combatantId, color }) => ({ id: combatantId, color })));
});

test("workspace connects Wall updates, companion transport and palette consumers, and cleans the hook", () => {
  const source = readFileSync(new URL("../scripts/services/workspace-bridge.js", import.meta.url), "utf8");
  assert.match(source, /Hooks\.on\("combatWallMarkersUpdated"/);
  assert.match(source, /Hooks\.off\("combatWallMarkersUpdated"/);
  assert.match(source, /const wallMarkers = this\.#workspaceMode \? this\.#wallMarkerState : readCombatWallMarkerColors\(\)/);
  assert.match(source, /combatWallMarkerColor\(wallMarkers, snapshot, combatant\)/);
  assert.match(source, /message\.type === "combatWallMarkerColors"/);
  assert.match(source, /enemy\.colorSource === "combat-wall" \? enemy\.color/);
  assert.match(source, /scopedEnemyColors\(message, this\.#getSnapshot\?\.\(\)\)/);
});
