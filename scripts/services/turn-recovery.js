import { MODULE_ID } from "../config.js";
import { LEGENDARY_LOCK_FLAG_KEY, isForwardCombatTurn, legendaryResourceState, reactionResetMode } from "./reaction-operations.js";
import { rechargeResources } from "./recharge-operations.js";

export const TURN_RECOVERY_FLAG = "turnRecovery";

function later(a, b) {
  return Number(a?.round) > Number(b?.round) ||
    (Number(a?.round) === Number(b?.round) && Number(a?.turn) > Number(b?.turn));
}

export { isForwardCombatTurn } from "./reaction-operations.js";

/** Only the main GM window performs recovery. A persisted high-water mark survives reload/backtracking. */
export class TurnRecovery {
  #getActor;
  #resetReaction;
  #recharge;
  #queue = Promise.resolve();
  #active = true;

  constructor({ getActor, resetReaction, recharge }) {
    this.#getActor = getActor;
    this.#resetReaction = resetReaction;
    this.#recharge = recharge;
  }

  #enqueue(task) {
    const result = this.#queue.then(() => this.#active ? task() : undefined);
    this.#queue = result.catch(() => {});
    return result;
  }

  #eligible(combat, originUserId = null) {
    if (!combat?.started) return false;
    if (originUserId) return originUserId === game.user?.id && game.user?.isGM !== false;
    return !game.users?.activeGM || game.users.activeGM.id === game.user?.id;
  }

  initialize(snapshot) {
    return this.#enqueue(async () => {
      const combat = snapshot?.context?.combat;
      if (!snapshot?.started || !this.#eligible(combat)) return;
      const cursor = combat.getFlag(MODULE_ID, TURN_RECOVERY_FLAG);
      if (!cursor || later(snapshot, cursor)) await this.#mark(combat, snapshot);
    });
  }

  async #mark(combat, snapshot) {
    await combat.setFlag(MODULE_ID, TURN_RECOVERY_FLAG, { round: snapshot.round, turn: snapshot.turn });
  }

  handleNativeStart(snapshot, originUserId, { encounter = false } = {}) {
    // D&D5e's turnStart hook establishes the boundary even if the coordinator has already caught up.
    const previousSnapshot = { ...snapshot, started: !encounter, turn: snapshot.turn - 1, activeCombatantId: null };
    return this.handle({ previousSnapshot, snapshot, originUserId });
  }

  handle({ previousSnapshot, snapshot, originUserId = null }) {
    const reindexed = previousSnapshot?.started && snapshot?.started && snapshot.activeCombatantId && previousSnapshot.combatId === snapshot.combatId &&
      previousSnapshot.round === snapshot.round && previousSnapshot.activeCombatantId === snapshot.activeCombatantId &&
      previousSnapshot.turn !== snapshot.turn;
    if (reindexed) return this.#enqueue(async () => {
      const combat = snapshot.context?.combat;
      if (!this.#eligible(combat, originUserId)) return;
      const cursor = combat.getFlag(MODULE_ID, TURN_RECOVERY_FLAG);
      if (cursor?.round === previousSnapshot.round && cursor.turn === previousSnapshot.turn) await this.#mark(combat, snapshot);
    });
    if (!isForwardCombatTurn(previousSnapshot, snapshot)) return Promise.resolve();
    return this.#enqueue(async () => {
      const combat = snapshot.context?.combat;
      if (!this.#eligible(combat, originUserId)) return;
      const cursor = combat.getFlag(MODULE_ID, TURN_RECOVERY_FLAG);
      if (cursor && !later(snapshot, cursor) && (previousSnapshot.started ||
        (cursor.round === snapshot.round && cursor.turn === snapshot.turn))) return;
      await this.#mark(combat, snapshot);
      const errors = [];
      const attempt = async (task) => { try { await task(); } catch (error) { errors.push(error.message); } };
      for (const entry of snapshot.combatants ?? []) {
        if (entry.type !== "npc" || entry.defeated) continue;
        const ownTurn = entry.id === snapshot.activeCombatantId;
        const sceneEntry = { ...entry, sceneId: snapshot.sceneId };
        const actor = ownTurn ? snapshot.context?.actor ?? this.#getActor(sceneEntry) : this.#getActor(sceneEntry);
        if (ownTurn || reactionResetMode(actor) === "turn") {
          await attempt(() => this.#resetReaction(entry.id, ownTurn ? "turn-start" : "per-turn"));
        }
      }
      if (snapshot.activeType === "npc") {
        const actor = snapshot.context?.actor;
        const resource = legendaryResourceState(actor);
        if (actor && resource.maximum > 0) {
          if (resource.spent > 0) await attempt(() => actor.update({ [resource.spentPath]: 0 }));
          if (combat.getFlag(MODULE_ID, LEGENDARY_LOCK_FLAG_KEY)?.[snapshot.activeCombatantId]) {
            await attempt(() => combat.unsetFlag(MODULE_ID, `${LEGENDARY_LOCK_FLAG_KEY}.${snapshot.activeCombatantId}`));
          }
        }
        for (const recharge of rechargeResources(actor).filter((entry) => entry.spent > 0)) {
          await attempt(() => this.#recharge.roll(actor, recharge.id));
        }
      }
      if (errors.length) throw new Error(errors.join(" · "));
    });
  }

  stop() { this.#active = false; }
}
