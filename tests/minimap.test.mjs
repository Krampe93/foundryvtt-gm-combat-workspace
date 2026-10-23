import assert from "node:assert/strict";
import test from "node:test";
import { createMinimapState, minimapProjection, MinimapSource } from "../scripts/services/minimap.js";

function fixture() {
  const sceneRect = { x: 200, y: 100, width: 1000, height: 500 };
  const tokens = new Map([
    ["small", { id: "small", x: 300, y: 200, width: 1, height: 1, hidden: true, level: "ground" }],
    ["large", { id: "large", x: 600, y: 300, width: 3, height: 2, level: "ground" }],
    ["upstairs", { id: "upstairs", x: 300, y: 200, width: 1, height: 1, level: "upper" }]
  ]);
  const scene = { id: "map", name: "Dungeon", tokens, width: 1000, height: 500, grid: { size: 100 } };
  const canvas = { ready: true, scene, level: { id: "ground", background: { src: "maps/dungeon.webp" } },
    dimensions: { sceneRect, rect: { x: 0, y: 0, width: 1400, height: 700 }, size: 100 } };
  const snapshot = { sceneId: "map", started: true, activeCombatantId: "big" };
  const enemies = [{ id: "little", tokenId: "small", type: "npc", color: "#ff0000", name: "Skeleton" },
    { id: "big", tokenId: "large", type: "npc", color: "#00ff00", name: "Giant" }];
  return { canvas, snapshot, enemies, baseUrl: "https://foundry.example/prefix/game" };
}

test("minimap places hidden NPCs and different token sizes at their scene centers", () => {
  const input = fixture();
  const state = createMinimapState(input);
  assert.deepEqual(state.bounds, { x: 0, y: 0, width: 1400, height: 700 }, "playable padding remains in the overview");
  assert.deepEqual(state.points.map(({ x, y, active, color }) => ({ x, y, active, color })), [
    { x: 350, y: 250, active: false, color: "#ff0000" },
    { x: 750, y: 400, active: true, color: "#00ff00" }
  ]);
  assert.equal(state.background.src, "https://foundry.example/prefix/maps/dungeon.webp");
  assert.deepEqual(state.background.matrix, [1000, 0, 0, 500, 200, 100]);
  input.canvas.scene.tokens.get("large").getCenterPoint = () => ({ x: 811, y: 377 });
  assert.equal(createMinimapState(input).points[1].x, 811, "native token center supports non-square grids");
});

test("movement and turn changes update independently of an unchanged combat snapshot", () => {
  const input = fixture();
  input.canvas.scene.tokens.get("small").x += 200;
  assert.equal(createMinimapState(input).points[0].x, 550);
  input.snapshot.activeCombatantId = "little";
  assert.deepEqual(createMinimapState(input).points.map(({ active }) => active), [true, false]);
  input.snapshot.activeCombatantId = "player";
  assert.ok(createMinimapState(input).points.every(({ active }) => !active));
});

test("rendered movement and drag previews are visible before the token document is saved", () => {
  const input = fixture();
  const token = input.canvas.scene.tokens.get("small");
  token.object = { center: { x: 480, y: 320 } };
  assert.equal(createMinimapState(input).points[0].x, 480);
  assert.equal(token.x, 300, "the stored document position remains unchanged");
  const preview = { center: { x: 550, y: 350 } };
  const previews = new Map([["map:small", preview]]);
  assert.equal(createMinimapState({ ...input, previews }).points[0].x, 550);
  previews.clear();
  assert.equal(createMinimapState({ ...input, previews }).points[0].x, 480, "cancelled drag returns to the rendered token");
});

test("deleted, defeated, player and other-level tokens do not leave enemy markers", () => {
  const input = fixture();
  input.enemies.push({ id: "other", tokenId: "upstairs", type: "npc" },
    { id: "missing", tokenId: "gone", type: "npc" },
    { id: "player", tokenId: "small", type: "player" });
  input.enemies[1].defeated = true;
  assert.deepEqual(createMinimapState(input).points.map(({ id }) => id), ["little"]);
  input.canvas.scene.tokens.delete("small");
  assert.deepEqual(createMinimapState(input).points, []);
});

test("an absent or different encounter keeps the current map and clears old markers", () => {
  const input = fixture();
  for (const snapshot of [null, { ...input.snapshot, started: false }, { ...input.snapshot, sceneId: "old-map" }]) {
    const state = createMinimapState({ ...input, snapshot });
    assert.equal(state.sceneId, "map");
    assert.deepEqual(state.points, []);
  }
  input.canvas.ready = false;
  assert.equal(createMinimapState(input), null);
});

test("native map transforms preserve offsets, rotation and scale independently of camera position", () => {
  const input = fixture();
  const mesh = { sourceElement: { src: "https://foundry.example/prefix/maps/dungeon.webp" },
    texture: { orig: { width: 800, height: 400 } }, anchor: { x: 0.5, y: 0.5 } };
  input.canvas.primary = { levelTextures: [mesh] };
  input.canvas.stage = { toLocal: ({ x, y }, from) => {
    assert.equal(from, mesh);
    return { x: 700 - y * 2, y: 350 + x * 2 };
  } };
  assert.deepEqual(createMinimapState(input).background.matrix, [0, 1600, -800, 0, 1100, -450]);
});

test("level background takes precedence, legacy background remains available and invalid media is ignored", () => {
  const input = fixture();
  input.canvas.scene.background = { src: "maps/legacy.png" };
  assert.match(createMinimapState(input).background.src, /dungeon.webp$/);
  input.canvas.level.background.src = "";
  assert.equal(createMinimapState(input).background, null, "do not show a different floor's legacy image");
  input.canvas.level = null;
  assert.match(createMinimapState(input).background.src, /legacy.png$/);
  input.canvas.scene.background.src = "javascript:alert(1)";
  assert.equal(createMinimapState(input).background, null);
  input.canvas.scene.background.src = "maps/dungeon.webm";
  assert.equal(createMinimapState(input).background.video, true);
});

test("overview fits wide and portrait maps with uniform scaling and ring clearance", () => {
  for (const bounds of [{ x: 200, y: 100, width: 1000, height: 500 }, { x: 0, y: 0, width: 500, height: 1000 }]) {
    const { scale, x, y } = minimapProjection(bounds, 560, 280);
    assert.ok(x + bounds.x * scale >= 12);
    assert.ok(y + bounds.y * scale >= 12);
    assert.ok(x + (bounds.x + bounds.width) * scale <= 548);
    assert.ok(y + (bounds.y + bounds.height) * scale <= 268);
  }
  assert.equal(minimapProjection(null, 560, 280), null);
});

test("source coalesces token hooks, clears during scene teardown and removes listeners on stop", async () => {
  const previous = globalThis.Hooks;
  const hooks = new Map();
  const published = [];
  let state = { sceneId: "one" };
  globalThis.Hooks = { on: (name, callback) => { hooks.set(name, callback); return name; }, off: (name) => hooks.delete(name) };
  const source = new MinimapSource({ getState: () => state, publish: (value) => published.push(value) });
  try {
    source.start();
    await Promise.resolve();
    state = { ...state, moved: true };
    hooks.get("updateToken")();
    hooks.get("updateToken")();
    hooks.get("deleteToken")();
    await Promise.resolve();
    assert.equal(published.length, 2);
    hooks.get("refreshToken")();
    await Promise.resolve();
    assert.equal(published.length, 2, "unrelated visual refreshes do not resend identical data");
    source.refresh({ force: true });
    await Promise.resolve();
    assert.equal(published.length, 3, "a newly opened companion receives the current state even when unchanged");
    hooks.get("updateToken")();
    hooks.get("canvasTearDown")();
    await Promise.resolve();
    assert.equal(published.at(-1), null, "queued updates cannot restore the old scene");
    state = { sceneId: "two" };
    hooks.get("canvasReady")();
    await Promise.resolve();
    assert.equal(published.at(-1).sceneId, "two");
    source.refresh();
    const count = published.length;
    source.stop();
    await Promise.resolve();
    assert.equal(published.length, count, "queued updates stop with the service");
    assert.equal(hooks.size, 0);
  } finally {
    source.stop();
    if (previous === undefined) delete globalThis.Hooks;
    else globalThis.Hooks = previous;
  }
});

test("preview refresh and cancellation publish their positions and clear on scene teardown", async () => {
  const previous = globalThis.Hooks;
  const hooks = new Map();
  const published = [];
  const input = fixture();
  globalThis.Hooks = { on: (name, callback) => { hooks.set(name, callback); return name; }, off: (name) => hooks.delete(name) };
  const source = new MinimapSource({ getState: ({ previews }) => createMinimapState({ ...input, previews }), publish: (state) => published.push(state) });
  try {
    source.start();
    await Promise.resolve();
    const preview = { id: "small", isPreview: true, scene: { id: "map" }, center: { x: 490, y: 300 } };
    hooks.get("refreshToken")(preview);
    await Promise.resolve();
    assert.equal(published.at(-1).points[0].x, 490);
    hooks.get("destroyToken")(preview);
    await Promise.resolve();
    assert.equal(published.at(-1).points[0].x, 350);
    hooks.get("refreshToken")(preview);
    hooks.get("canvasTearDown")();
    await Promise.resolve();
    hooks.get("canvasReady")();
    await Promise.resolve();
    assert.equal(published.at(-1).points[0].x, 350, "a previous scene's drag must not persist");
  } finally {
    source.stop();
    if (previous === undefined) delete globalThis.Hooks;
    else globalThis.Hooks = previous;
  }
});
