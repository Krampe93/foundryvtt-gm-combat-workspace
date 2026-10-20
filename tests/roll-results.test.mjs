import assert from "node:assert/strict";
import test from "node:test";
import { RollHistory, renderRollHistory, rollMessageConfig, rollMessageEntry } from "../scripts/services/roll-results.js";

const actor = { type: "npc", name: "Adult Red Dragon" };
const die = (faces, ...results) => ({ number: results.length, faces, results: results.map((result) => typeof result === "number" ? { result, active: true } : result) });
const d20 = (face, bonus = 8) => ({ total: face + bonus, terms: [die(20, face), { operator: "+" }, { number: bonus }] });
function message(id, rolls, type = "attack", groupId = null) {
  return { id, speaker: { alias: "Drache" }, flags: { dnd5e: { roll: { type } }, ...rollMessageConfig(groupId).data.flags }, rolls };
}
function entry(id, rolls, type = "attack", groupId = null) {
  return rollMessageEntry(message(id, rolls, type, groupId), { actor, item: { name: "Rend" }, damageLabel: (type) => ({ slashing: "Hieb", fire: "Feuer" })[type] ?? type });
}
function html(piece) {
  const history = new RollHistory();
  history.add(piece);
  return renderRollHistory(history);
}

test("normal d20 results display their total and every individual term", () => {
  const piece = entry("normal", [d20(13, 7)]);
  assert.equal(piece.rows[0].total, 20);
  assert.equal(piece.rows[0].natural, null);
  const output = html(piece);
  assert.match(output, /<strong>20<\/strong>/);
  assert.match(output, /1W20 \[<b>13<\/b>\] \+ 7/);
  assert.doesNotMatch(output, /NAT|<details|hidden/);
  assert.match(output, /class="gm-workspace-roll-identity"><b>Drache<\/b> · Rend<\/span>/);
  assert.doesNotMatch(output, /<header|<p |<div class="gm-workspace-roll-result"/);
});

test("natural 1 and 20 have distinct markers and omit modifier and modified total", () => {
  for (const face of [1, 20]) {
    const roll = d20(face);
    const piece = entry(`nat${face}`, [roll]);
    const output = html(piece);
    assert.equal(piece.rows[0].total, face);
    assert.match(output, new RegExp(`is-natural-${face}`));
    assert.match(output, new RegExp(`NAT ${face}`));
    assert.doesNotMatch(output, /\+ 8|>28<|>9</);
    assert.equal(roll.total, face + 8, "native result remains unchanged");
  }
});

test("advantage and disadvantage use only the kept die for the natural marker", () => {
  const kept13 = { total: 20, terms: [die(20, { result: 20, active: false, discarded: true }, 13), { operator: "+" }, { number: 7 }] };
  const ordinary = html(entry("adv", [kept13]));
  assert.doesNotMatch(ordinary, /NAT/);
  assert.match(ordinary, /<s class="gm-workspace-roll-discarded">20<\/s>/);
  assert.match(ordinary, /<b>13<\/b>/);
  const kept1 = { total: 9, terms: [die(20, { result: 20, active: false }, 1), { operator: "+" }, { number: 8 }] };
  assert.match(html(entry("disadv", [kept1])), /NAT 1/);
});

test("damage types, individual dice and combined damage remain expanded", () => {
  const output = html(entry("damage", [
    { total: 14, options: { type: "slashing" }, terms: [die(6, 4, 5), { operator: "+" }, { number: 5 }] },
    { total: 3, options: { type: "fire" }, terms: [die(6, 3)] }
  ], "damage"));
  assert.match(output, /Hieb/);
  assert.match(output, /Feuer/);
  assert.match(output, /2W6 \[<b>4<\/b>, <b>5<\/b>\] \+ 5/);
  assert.match(output, /Gesamtschaden <strong>17<\/strong>/);
  assert.doesNotMatch(output, /details>|hidden/);
});

test("a d20 damage die never becomes NAT 1 or NAT 20", () => {
  const piece = entry("damage-d20", [d20(20)], "damage");
  assert.equal(piece.rows[0].total, 28);
  assert.equal(piece.rows[0].natural, null);
});

test("RSReforged mixed messages keep attack and damage classification separate", () => {
  const mixed = message("rsr", [
    d20(20), { ...d20(20), class: "DamageRoll", options: { type: "fire" } }
  ]);
  const piece = rollMessageEntry(mixed, { actor });
  assert.equal(piece.rows[0].natural, 20);
  assert.equal(piece.rows[1].kind, "damage");
  assert.equal(piece.rows[1].natural, null);
  assert.equal(piece.rows[1].total, 28);
  mixed.flags.rsreforged = { rolls: mixed.rolls };
  mixed.rolls = [];
  assert.deepEqual(rollMessageEntry(mixed, { actor }).rows, piece.rows, "serialized RSR rolls are a fallback for older cards");
});

test("saving throws show their ability and use the same natural display", () => {
  const save = message("save", [d20(12, 6)], "save");
  save.flags.dnd5e.roll.abilityId = "dex";
  const piece = rollMessageEntry(save, { actor });
  assert.equal(piece.rows[0].label, "Rettungswurf · Geschicklichkeit");
  assert.equal(piece.rows[0].total, 18);
  save.rolls = [d20(1, 6)];
  assert.equal(rollMessageEntry(save, { actor }).rows[0].natural, 1);
});

test("nested dice and bonus dice retain their separate results", () => {
  const output = html(entry("nested", [{ total: 20, terms: [
    die(20, 13), { operator: "+" }, { terms: [die(4, 3), { operator: "+" }, { number: 4 }] }
  ] }]));
  assert.match(output, /1W4 \[<b>3<\/b>\]/);
  assert.match(output, /\( 1W4/);
  assert.match(output, /\+ 4 \)/);
});

test("message updates replace results without duplicating a card", () => {
  const history = new RollHistory();
  history.add(entry("same", [d20(13)]));
  history.add(entry("same", [d20(14)]));
  assert.equal(history.entries.length, 1);
  assert.equal(history.entries[0].pieces.size, 1);
  assert.equal(history.entries[0].pieces.get("same").rows[0].total, 22);
});

test("out-of-order damage buttons stay attached to the correct individual attack", () => {
  const history = new RollHistory();
  history.add(entry("attack1", [d20(13)], "attack", "ray1"));
  history.add(entry("attack2", [d20(14)], "attack", "ray2"));
  history.add(entry("damage2", [{ total: 6, terms: [die(6, 6)] }], "damage", "ray2"));
  history.markMiss("ray1");
  const first = history.entries.find(({ id }) => id === "ray1");
  const second = history.entries.find(({ id }) => id === "ray2");
  assert.equal(first.missed, true);
  assert.equal(first.pieces.size, 1);
  assert.equal(second.missed, false);
  assert.equal(second.pieces.size, 2);
});

test("native messages group by their explicit originating card", () => {
  const native = message("native", [d20(13)]);
  native.flags.dnd5e.originatingMessage = "native-use";
  assert.equal(rollMessageEntry(native, { actor }).groupId, "native-use");
});

test("turn transitions grey existing cards, while new rolls remain current", () => {
  const history = new RollHistory();
  const previous = { combatId: "fight", started: true, round: 1, turn: 0, activeCombatantId: "a" };
  history.add(entry("old", [d20(13)]));
  assert.equal(history.advance(previous, { ...previous, hpValue: 5 }), false);
  assert.equal(history.entries[0].stale, false);
  history.advance(previous, { ...previous, turn: 1, activeCombatantId: "b" });
  history.add(entry("new", [d20(14)]));
  assert.equal(history.entries[0].stale, false);
  assert.equal(history.entries[1].stale, true);
  history.add(entry("old", [d20(15)]));
  assert.equal(history.entries[1].stale, true, "updates never reactivate an old card");
  assert.match(renderRollHistory(history), /is-previous-turn/);
});

test("backwards, round, combat and encounter-end changes also grey existing cards", () => {
  const previous = { combatId: "fight", started: true, round: 2, turn: 1, activeCombatantId: "a" };
  for (const current of [{ ...previous, turn: 0 }, { ...previous, round: 3 }, { ...previous, combatId: "other" }, { ...previous, started: false }]) {
    const history = new RollHistory();
    history.add(entry("old", [d20(13)]));
    history.advance(previous, current);
    assert.equal(history.entries[0].stale, true);
  }
});

test("trash clears all history and later updates do not resurrect cleared messages", () => {
  const history = new RollHistory();
  history.add(entry("a", [d20(13)]));
  history.add(entry("b", [d20(14)]));
  history.clear();
  assert.equal(history.entries.length, 0);
  assert.equal(history.add(entry("a", [d20(15)])), false);
  history.add(entry("new", [d20(16)]));
  assert.equal(history.entries.length, 1);
  assert.equal(history.entries[0].id, "new");
});

test("deleted chat messages remove only their own results", () => {
  const history = new RollHistory();
  history.add(entry("attack", [d20(13)], "attack", "shared"));
  history.add(entry("damage", [{ total: 4, terms: [die(6, 4)] }], "damage", "shared"));
  history.remove("damage");
  assert.equal(history.entries[0].pieces.size, 1);
  history.remove("attack");
  assert.equal(history.entries.length, 0);
});

test("ignores unevaluated rolls, player characters and inaccessible content", () => {
  const normal = message("filtered", [d20(13)]);
  assert.equal(rollMessageEntry(normal, { actor: { type: "character" } }), null);
  assert.equal(rollMessageEntry({ ...normal, isContentVisible: false }, { actor }), null);
  assert.equal(rollMessageEntry({ ...normal, visible: false }, { actor }), null);
  assert.equal(rollMessageEntry(message("pending", [{ total: null }]), { actor }), null);
});

test("names and roll labels cannot inject markup into the results panel", () => {
  const piece = entry("escape", [d20(13)]);
  piece.actorName = '<img src=x onerror="alert(1)">';
  piece.title = "<script>bad()</script>";
  const output = html(piece);
  assert.doesNotMatch(output, /<img|<script/);
  assert.match(output, /&lt;img/);
});
