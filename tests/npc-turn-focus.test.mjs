import assert from "node:assert/strict";
import test from "node:test";
import { NpcTurnFocus } from "../scripts/services/npc-turn-focus.js";

function fixture({ select = true, pan = false } = {}) {
  const calls = [];
  const settings = { selectActiveNpcToken: select, panToActiveNpc: pan };
  const game = { user: { isGM: true }, settings: { get: (_module, key) => settings[key] } };
  const token = { document: { parent: { id: "scene" }, hidden: true }, center: { x: 225, y: 350 },
    control(options) { calls.push({ control: options }); return true; } };
  const canvas = { ready: true, scene: { id: "scene" }, tokens: new Map([["token", token]]),
    async animatePan(position) { calls.push({ pan: position }); } };
  const focus = new NpcTurnFocus({ getGame: () => game, getCanvas: () => canvas });
  const previousSnapshot = { combatId: "combat", sceneId: "scene", started: true, round: 2, turn: 1,
    activeCombatantId: "player", activeType: "player", activeTokenId: "player-token" };
  const snapshot = { ...previousSnapshot, turn: 2, activeCombatantId: "npc", activeType: "npc", activeTokenId: "token" };
  focus.initialize(previousSnapshot);
  return { focus, game, canvas, token, calls, settings, previousSnapshot, snapshot };
}

test("selection and camera settings work independently in all four combinations, without altering token visibility or zoom", async () => {
  for (const select of [false, true]) for (const pan of [false, true]) {
    const f = fixture({ select, pan });
    assert.equal(await f.focus.handle(f), select || pan);
    assert.deepEqual(f.calls, [
      ...(select ? [{ control: { releaseOthers: true, pan: false } }] : []),
      ...(pan ? [{ pan: { x: 225, y: 350 } }] : [])
    ]);
    assert.equal(f.token.document.hidden, true);
  }
});

test("settings changes apply on the next NPC turn without reopening either window", async () => {
  const f = fixture({ select: false, pan: false });
  await f.focus.handle(f);
  f.settings.selectActiveNpcToken = true;
  f.settings.panToActiveNpc = true;
  await f.focus.handle({ previousSnapshot: f.snapshot, snapshot: { ...f.snapshot, round: 3 } });
  assert.equal(f.calls.length, 2);
});

test("start and navigation focus once; HP updates, duplicate events, and initiative index changes do not refocus", async () => {
  const f = fixture({ pan: true });
  await f.focus.handle({ previousSnapshot: { ...f.snapshot, started: false, round: 0 }, snapshot: f.snapshot });
  assert.equal(f.calls.length, 2);
  await f.focus.handle(f);
  await f.focus.handle({ previousSnapshot: f.snapshot, snapshot: { ...f.snapshot, hp: 4 } });
  await f.focus.handle({ previousSnapshot: f.snapshot, snapshot: { ...f.snapshot, turn: 7 } });
  assert.equal(f.calls.length, 2);
  const backward = { ...f.snapshot, round: 1, turn: 0 };
  await f.focus.handle({ previousSnapshot: f.snapshot, snapshot: backward });
  await f.focus.handle({ previousSnapshot: backward, snapshot: f.snapshot });
  assert.equal(f.calls.length, 6, "explicit backward/forward navigation follows the active turn");
});

test("opening/reopening, activating an existing combat, scene switches, and player/placeholder turns keep the map still", async () => {
  const f = fixture({ pan: true });
  f.focus.initialize(f.snapshot);
  await f.focus.handle(f);
  for (const activeType of ["player", "placeholder", "none"]) {
    await f.focus.handle({ previousSnapshot: f.snapshot, snapshot: { ...f.snapshot, activeType, activeCombatantId: activeType } });
  }
  await f.focus.handle({ previousSnapshot: { ...f.previousSnapshot, combatId: "other" }, snapshot: f.snapshot });
  await f.focus.handle({ previousSnapshot: { ...f.previousSnapshot, sceneId: "other" }, snapshot: { ...f.snapshot, round: 4 } });
  assert.deepEqual(f.calls, []);
});

test("non-GMs, missing tokens, wrong-scene tokens, and an unready canvas are skipped", async () => {
  for (const change of [
    f => { f.game.user.isGM = false; },
    f => { f.canvas.ready = false; },
    f => { f.canvas.scene.id = "other"; },
    f => { f.canvas.tokens.clear(); },
    f => { f.token.document.parent.id = "other"; }
  ]) {
    const f = fixture({ pan: true });
    change(f);
    assert.equal(await f.focus.handle(f), false);
    assert.deepEqual(f.calls, []);
  }
});

test("failure in one convenience does not block the other, and stopped services do not act", async () => {
  const f = fixture({ pan: true });
  f.token.control = () => { throw new Error("Auswahl gesperrt"); };
  await assert.rejects(f.focus.handle(f), /Tokenauswahl: Auswahl gesperrt/);
  assert.deepEqual(f.calls, [{ pan: { x: 225, y: 350 } }]);
  f.focus.stop();
  await f.focus.handle({ previousSnapshot: f.snapshot, snapshot: { ...f.snapshot, round: 4 } });
  assert.equal(f.calls.length, 1);
});
