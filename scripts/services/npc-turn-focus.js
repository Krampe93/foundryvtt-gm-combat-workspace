import { MODULE_ID, SETTING_KEYS } from "../config.js";

function turnKey(snapshot) {
  return snapshot?.started && snapshot.activeCombatantId
    ? JSON.stringify([snapshot.sceneId, snapshot.combatId, snapshot.round, snapshot.activeCombatantId]) : null;
}

/** Local GM map conveniences. Opening a window or refreshing actor data is not a new turn. */
export class NpcTurnFocus {
  #getCanvas;
  #getGame;
  #lastTurn = null;
  #active = true;

  constructor({ getCanvas = () => globalThis.canvas, getGame = () => globalThis.game } = {}) {
    this.#getCanvas = getCanvas;
    this.#getGame = getGame;
  }

  initialize(snapshot) { this.#lastTurn = turnKey(snapshot); }

  async handle({ previousSnapshot: previous, snapshot } = {}) {
    if (!this.#active) return false;
    const key = turnKey(snapshot);
    const duplicate = key === this.#lastTurn;
    this.#lastTurn = key;
    const game = this.#getGame();
    const canvas = this.#getCanvas();
    if (duplicate || !key || !game?.user?.isGM || snapshot.activeType !== "npc" ||
      !previous || previous.combatId !== snapshot.combatId || previous.sceneId !== snapshot.sceneId ||
      (previous.started && turnKey(previous) === key) || !canvas?.ready || canvas.scene?.id !== snapshot.sceneId) return false;

    const token = canvas.tokens?.get(snapshot.activeTokenId);
    if (!token || token.document?.parent?.id !== snapshot.sceneId) return false;
    const select = game.settings.get(MODULE_ID, SETTING_KEYS.selectActiveNpcToken) === true;
    const pan = game.settings.get(MODULE_ID, SETTING_KEYS.panToActiveNpc) === true;
    const errors = [];
    let changed = false;
    if (select) {
      try { changed = token.control({ releaseOthers: true, pan: false }) !== false; }
      catch (error) { errors.push(`Tokenauswahl: ${error.message}`); }
    }
    if (pan) {
      try {
        const { x, y } = token.center;
        if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Tokenposition ist nicht verfügbar.");
        await canvas.animatePan({ x, y });
        changed = true;
      } catch (error) { errors.push(`Kamerabewegung: ${error.message}`); }
    }
    if (errors.length) throw new Error(errors.join(" · "));
    return changed;
  }

  stop() { this.#active = false; }
}
