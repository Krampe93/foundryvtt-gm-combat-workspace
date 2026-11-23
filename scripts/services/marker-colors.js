/** Combat Wall owns marker assignments. Read one batch for the whole enemy list. */
export function readCombatWallMarkerColors(game = globalThis.game, window = globalThis.window) {
  const module = game?.modules?.get?.("combat-wall");
  if (module?.active === false) return null;
  const api = module?.api?.getMarkerColors ? module.api : window?.CombatWall;
  try {
    const state = api?.getMarkerColors?.();
    return state && Array.isArray(state.markers) ? state : null;
  } catch { return null; }
}

/** IDs are scoped to the encounter and scene; unrelated or stale colors never win. */
export function combatWallMarkerColor(state, snapshot, combatant) {
  if (!snapshot?.combatId || !snapshot?.sceneId || state?.combatId !== snapshot.combatId ||
    state?.sceneId !== snapshot.sceneId || !Array.isArray(state?.markers)) return null;
  const marker = state.markers.find((entry) => entry.combatantId === combatant.id &&
    (!entry.tokenId || !combatant.tokenId || entry.tokenId === combatant.tokenId)) ??
    state.markers.find((entry) => !entry.combatantId && combatant.tokenId && entry.tokenId === combatant.tokenId);
  return /^#[0-9a-f]{6}$/i.test(marker?.color ?? "") ? marker.color : null;
}

/** Companion fallbacks also carry an encounter ID so a delayed message cannot recolor a new fight. */
export function scopedEnemyColors(message, snapshot) {
  if (!snapshot?.started || message?.combatId !== snapshot.combatId) return [];
  return (Array.isArray(message.entries) ? message.entries : []).filter((entry) =>
    entry.sceneId === snapshot.sceneId && entry.tokenId && /^#[0-9a-f]{6}$/i.test(entry.color ?? ""));
}
