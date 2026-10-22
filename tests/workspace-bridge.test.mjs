import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  WorkspaceBridge,
  combatantColor,
  isAutomaticActorDeltaStatus,
  savingThrowConfig,
  turnGuidancePhases
} from "../scripts/services/workspace-bridge.js";

test("starts the companion shell and registers right-click before the first render", async () => {
  class Element {
    children = [];
    selectors = new Map();
    listeners = new Map();
    classNames = new Set();
    classList = {
      add: (name) => this.classNames.add(name),
      remove: (name) => this.classNames.delete(name),
      toggle: (name, active) => active ? this.classNames.add(name) : this.classNames.delete(name)
    };
    addEventListener(type, handler) { this.listeners.set(type, handler); }
    querySelector(selector) {
      if (!this.selectors.has(selector)) this.selectors.set(selector, new Element());
      return this.selectors.get(selector);
    }
    querySelectorAll() { return []; }
    append(child) { child.parentElement = this; this.children.push(child); }
    remove() { this.parentElement.children = this.parentElement.children.filter((child) => child !== this); }
  }
  const body = new Element();
  const messages = [];
  const errors = [];
  const hooks = new Map();
  let combatChanged;
  let snapshot = null;
  const environment = {
    document: { body, createElement: () => new Element(), querySelector: () => null },
    window: {
      location: { href: "https://foundry.example/game?gmCombatWorkspace=1" },
      addEventListener() {}, removeEventListener() {}, dispatchEvent() {}
    },
    KeyboardEvent: class {},
    MutationObserver: class { observe() {} disconnect() {} },
    BroadcastChannel: class {
      addEventListener() {}
      postMessage(message) { messages.push(message); }
      close() {}
    },
    Hooks: { on: (name, callback) => { hooks.set(name, callback); return name; }, off: (name) => hooks.delete(name) },
    game: { modules: new Map(), keyboard: { downKeys: new Set() }, i18n: { localize: (value) => value } },
    CONFIG: { DND5E: { damageTypes: { fire: { label: "Feuer" } } } }
  };
  const originals = new Map(Object.keys(environment).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let bridge;
  try {
    for (const [key, value] of Object.entries(environment)) {
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    }
    bridge = new WorkspaceBridge({
      eventBus: { on: (_name, callback) => { combatChanged = callback; return () => {}; } },
      getSnapshot: () => snapshot,
      logger: { error: (...args) => errors.push(args), warn() {} }
    });
    assert.doesNotThrow(() => bridge.start());
    await new Promise((resolve) => setImmediate(resolve));
    const shell = body.children.find(({ id }) => id === "gm-combat-workspace-shell");
    assert.ok(shell, "companion shell is attached to the page");
    assert.equal(typeof shell.listeners.get("contextmenu"), "function");
    assert.ok(messages.some(({ type }) => type === "workspaceReady"));
    assert.match(shell.querySelector('[data-role="enemy-list"]').innerHTML, /Kein laufender Encounter/);
    assert.deepEqual(errors, [], "initial asynchronous rendering succeeds");
    let prevented = false;
    shell.listeners.get("contextmenu")({ target: { closest: () => null }, preventDefault() { prevented = true; } });
    assert.equal(prevented, false, "unrelated context menus remain available");
    const resultList = shell.querySelector('[data-role="roll-results"]');
    assert.match(resultList.innerHTML, /Noch keine Gegnerwürfe/);
    const message = {
      id: "from-either-window", speaker: { alias: "Drache" },
      getAssociatedActor: () => ({ type: "npc", name: "Drache" }),
      getAssociatedItem: () => ({ name: "Rend" }),
      flags: { dnd5e: { roll: { type: "attack" } } },
      rolls: [{ total: 20, terms: [{ faces: 20, number: 1, results: [{ result: 13, active: true }] }, { operator: "+" }, { number: 7 }] }]
    };
    hooks.get("createChatMessage")(message);
    hooks.get("updateChatMessage")(message);
    assert.equal((resultList.innerHTML.match(/<article/g) ?? []).length, 1, "a message seen twice only appears once");
    assert.match(resultList.innerHTML, /<strong>20<\/strong>/);
    assert.doesNotMatch(resultList.innerHTML, /is-previous-turn/);
    const previousSnapshot = { combatId: "fight", started: true, round: 1, turn: 0, activeType: "npc", combatants: [] };
    snapshot = { ...previousSnapshot, turn: 1 };
    combatChanged({ previousSnapshot, snapshot });
    assert.match(resultList.innerHTML, /is-previous-turn/, "turn changes repaint existing results immediately");
    hooks.get("createChatMessage")({ ...message, id: "new-turn" });
    assert.equal((resultList.innerHTML.match(/is-previous-turn/g) ?? []).length, 1);
    assert.equal((resultList.innerHTML.match(/<article/g) ?? []).length, 2);
    shell.querySelector('[data-action="clear-roll-history"]').listeners.get("click")();
    assert.match(resultList.innerHTML, /Noch keine Gegnerwürfe/);
    hooks.get("updateChatMessage")(message);
    assert.doesNotMatch(resultList.innerHTML, /<article/);
    assert.deepEqual(errors, [], "message hooks and turn changes succeed");
  } finally {
    bridge?.stop();
    await new Promise((resolve) => setImmediate(resolve));
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
  assert.equal(hooks.has("createChatMessage"), false, "message hooks are removed on shutdown");
});

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
  assert.match(source, /gm-workspace-utility-column/);
  assert.match(source, /gm-workspace-left-header/);
  assert.match(source, /gm-workspace-tools-menu/);
  assert.doesNotMatch(source, /<header class="gm-workspace-header">/);
  assert.doesNotMatch(source, /<details class="gm-workspace-diagnostics">/);
});

test("keeps the original size limits as the adaptive layout fallback", () => {
  const css = readFileSync(new URL("../styles/gm-combat-workspace.css", import.meta.url), "utf8");

  assert.match(css, /grid-template-rows: var\(--gm-workspace-context-rows, minmax\(0, 47fr\) minmax\(0, 53fr\)\)/);
  assert.match(css, /\.gm-workspace-lower-deck\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(css, /grid-template-rows: var\(--gm-workspace-utility-rows, minmax\(0, 30fr\) minmax\(0, 70fr\)\)/);
  assert.match(css, /\.gm-workspace-minimap-view canvas\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%/);
  assert.match(css.slice(css.lastIndexOf("Design correction 0.8.7")), /\.gm-workspace-save-mode,[\s\S]*?\{[^}]*display:\s*block/);
});

test("renders compact reaction actions and removes redundant dashboard metadata", () => {
  const source = readFileSync(new URL("../scripts/services/workspace-bridge.js", import.meta.url), "utf8");

  assert.match(source, /class="gm-workspace-reaction-action"/);
  assert.match(source, /data-tooltip="\$\{opportunityTooltip\}" title="\$\{opportunityTooltip\}"[^>]*>Gelegenheitsangriff<\/button>/);
  assert.match(source, /gm-workspace-hidden-badge/);
  assert.doesNotMatch(source, /data-field="reaction-turn"/);
  assert.doesNotMatch(source, /class="gm-workspace-enemy-meta"/);
  assert.doesNotMatch(source, /const hiddenText/);
});

test("keeps reactions in a fixed raster and defers aura reminders", () => {
  const source = readFileSync(new URL("../scripts/services/workspace-bridge.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../styles/gm-combat-workspace.css", import.meta.url), "utf8");

  assert.match(source, /> Reaktionen<\/h2>/);
  assert.doesNotMatch(source, /data-role="turn-warnings"/);
  assert.match(source, /actorTurnStartEffects/);
  assert.match(source, /#restoreReactionAtTurnStart\(event\)/);
  assert.match(source, /reactionResourceState\(item, activity\)/);
  assert.match(source, /item\.update\(\{ \[resource\.spentPath\]: resource\.spent \+ 1 \}\)/);
  assert.match(source, /aria-disabled="\$\{entry\.used\}"/);
  assert.doesNotMatch(source, /title="\$\{tooltip\}" \$\{entry\.used \? "disabled"/);
  assert.match(css, /grid-auto-rows:\s*minmax\(42px, max-content\)/);
  assert.match(css, /align-content:\s*start/);
  assert.match(css, /is-used:not\(\.is-busy\)[\s\S]*?pointer-events:\s*auto/);
});

test("creates chronological player-turn guidance without duplicate same-turn views", () => {
  const npc = { started: true, combatId: "combat", round: 1, turn: 0, activeCombatantId: "npc", activeType: "npc" };
  const playerA = { ...npc, turn: 1, activeCombatantId: "player-a", activeType: "player" };
  const playerB = { ...playerA, turn: 2, activeCombatantId: "player-b", activeType: "placeholder" };

  assert.deepEqual(turnGuidancePhases(npc, playerA).map(({ timing }) => timing), ["start"]);
  assert.deepEqual(turnGuidancePhases(playerA, playerB).map(({ timing }) => timing), ["end", "start"]);
  assert.deepEqual(turnGuidancePhases(playerB, { ...npc, turn: 3 }).map(({ timing }) => timing), ["end"]);
  assert.deepEqual(turnGuidancePhases(playerA, playerA), []);
});

test("keeps five combat controls below the dynamic statblock host", () => {
  const source = readFileSync(new URL("../scripts/services/workspace-bridge.js", import.meta.url), "utf8");
  const host = source.indexOf('data-role="sheet-host"');
  const controls = source.indexOf('data-role="combat-controls"');

  assert.ok(host >= 0 && controls > host);
  for (const action of ["previous-round", "previous-turn", "end-turn", "next-turn", "next-round"]) {
    assert.match(source, new RegExp(`data-combat-action="${action}"`));
  }
  assert.match(source, /#turnGuidance\?\.visible/);
  assert.match(source, /Hinweise \(\$\{this\.#turnGuidance\.count\}\)/);
});

test("routes reactions to damage and exposes Multiattack damage controls", () => {
  const source = readFileSync(new URL("../scripts/services/workspace-bridge.js", import.meta.url), "utf8");

  assert.match(source, /#executeReactionDamage/);
  assert.match(source, /reactionExecutionPlan\(item, activity\)/);
  assert.match(source, /data-action="execute-opportunity-plan"/);
  assert.match(source, /data-opportunity-slot/);
  assert.match(source, /data-action="roll-pending-damage"/);
  assert.match(source, /damageActivity\.rollDamage\(\{\}, \{ configure: false \}\)/);
  assert.doesNotMatch(source, /activity\.use\(\{\}, \{ configure: false \}\)/);
});

test("guards legendary resources, lockouts, linked attacks, saves, and damage", () => {
  const source = readFileSync(new URL("../scripts/services/workspace-bridge.js", import.meta.url), "utf8");

  assert.match(source, /legendaryResourceState\(actor\)/);
  assert.match(source, /LEGENDARY_LOCK_FLAG_KEY/);
  assert.match(source, /#restoreLegendaryAtTurnStart\(event\)/);
  assert.match(source, /resource\.remaining < legendary\.cost/);
  assert.match(source, /attack\.rollAttack\(\{\}, \{ configure: false \}, rollMessageConfig\(rollGroupId\)\)/);
  assert.match(source, /data-guidance-action="roll-legendary-damage"/);
  assert.match(source, /Rettungswurf – SG/);
  assert.match(source, /gm-workspace-legendary-resource/);
});

test("right-click dismisses only the chosen damage and respects in-flight rolls", () => {
  const source = readFileSync(new URL("../scripts/services/workspace-bridge.js", import.meta.url), "utf8");
  const body = source.split("  #onPendingDamageMiss(event) {")[1].split("\n  async #rollPendingReactionDamage")[0].replace(/\n  }\s*$/, "").replaceAll("this.#", "this.");
  const handle = new Function("event", body);
  for (const legendary of [false, true]) {
    const pending = new Map([["enemy", [{ id: "miss" }, { id: "hit" }]]]);
    const busy = new Set();
    let rendered = 0;
    let prevented = 0;
    const context = { pendingLegendaryDamage: pending, pendingReactionDamage: pending, legendaryBusy: busy, reactionBusy: busy, render() { rendered++; }, renderReactionOverview() { rendered++; } };
    const button = { dataset: { guidanceAction: legendary ? "roll-legendary-damage" : undefined, combatantId: "enemy", legendaryKey: "enemy", pendingId: "miss" }, closest: () => ({ dataset: { combatantId: "enemy" } }) };
    const event = { target: { closest: () => button }, preventDefault() { prevented++; } };
    busy.add("enemy");
    handle.call(context, event);
    assert.equal(pending.get("enemy").length, 2);
    assert.equal(rendered, 0);
    busy.clear();
    handle.call(context, event);
    assert.deepEqual(pending.get("enemy"), [{ id: "hit" }]);
    button.dataset.pendingId = "hit";
    handle.call(context, event);
    assert.equal(pending.has("enemy"), false);
    assert.equal(rendered, 2);
    assert.equal(prevented, 3);
  }
  handle.call({}, { target: { closest: () => null }, preventDefault() { assert.fail("unrelated context menu suppressed"); } });
});
