import { createLogger } from "../core/logger.js";
import {
  createCombatSnapshot,
  diffCombatSnapshots
} from "./combat-state.js";

const OBSERVED_HOOKS = Object.freeze([
  "createCombat",
  "updateCombat",
  "deleteCombat",
  "createCombatant",
  "updateCombatant",
  "deleteCombatant",
  "updateToken",
  "canvasReady"
]);

function getSceneCombat() {
  const sceneId = canvas?.scene?.id ?? null;
  if (!sceneId) return null;

  const combats = Array.from(game.combats ?? [])
    .filter((combat) => {
      const combatSceneId =
        combat.scene?.id ??
        combat.sceneId ??
        combat.scene ??
        null;

      return combatSceneId === sceneId;
    });

  const current = game.combat;
  if (current && combats.some((combat) => combat.id === current.id)) {
    return current;
  }

  return (
    combats.find((combat) => combat.active) ??
    combats.find((combat) => combat.started) ??
    combats[0] ??
    null
  );
}

function eventSummary(event, reason) {
  const snapshot = event.snapshot;

  return {
    reason,
    combatId: snapshot.combatId,
    sceneId: snapshot.sceneId,
    round: snapshot.round,
    turn: snapshot.turn,
    combatantId: snapshot.activeCombatantId,
    combatantType: snapshot.activeType,
    actorId: snapshot.activeActorId,
    tokenId: snapshot.activeTokenId,
    hidden: snapshot.activeHidden,
    previousValue: event.previousValue,
    value: event.value
  };
}

export class CombatCoordinator {
  #eventBus;
  #logger;
  #hookIds = new Map();
  #snapshot = createCombatSnapshot(null);
  #syncPending = false;
  #pendingReasons = new Set();
  #active = false;

  constructor({ eventBus, logger = createLogger("CombatCoordinator") }) {
    if (!eventBus) {
      throw new TypeError("CombatCoordinator requires an EventBus.");
    }

    this.#eventBus = eventBus;
    this.#logger = logger;
  }

  get snapshot() {
    return this.#snapshot;
  }

  start() {
    if (this.#active) return;
    this.#active = true;

    for (const hookName of OBSERVED_HOOKS) {
      const hookId = Hooks.on(hookName, () => this.requestSync(hookName));
      this.#hookIds.set(hookName, hookId);
    }

    this.sync("start");
  }

  stop() {
    if (!this.#active) return;

    for (const [hookName, hookId] of this.#hookIds) {
      Hooks.off(hookName, hookId);
    }

    this.#hookIds.clear();
    this.#pendingReasons.clear();
    this.#syncPending = false;
    this.#active = false;
    this.#snapshot = createCombatSnapshot(null);
  }

  requestSync(reason = "unknown") {
    if (!this.#active) return;

    this.#pendingReasons.add(reason);
    if (this.#syncPending) return;

    this.#syncPending = true;
    queueMicrotask(() => {
      this.#syncPending = false;
      const reasons = [...this.#pendingReasons];
      this.#pendingReasons.clear();
      this.sync(reasons.join(", "));
    });
  }

  sync(reason = "manual") {
    if (!this.#active) return;

    const current = createCombatSnapshot(getSceneCombat());
    const events = diffCombatSnapshots(this.#snapshot, current);
    this.#snapshot = current;

    for (const event of events) {
      this.#eventBus.emit(event.name, {
        ...event,
        reason
      });

      if (event.name !== "combatStateChanged") {
        this.#logger.debug(event.name, eventSummary(event, reason));
      }
    }
  }
}
