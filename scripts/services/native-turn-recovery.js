import { legendaryResourceState } from "./reaction-operations.js";

/** Move only D&D5e's legendary-action recovery; leave all other actor/item recovery intact. */
export function applyLegendaryRecoveryTiming(combatant, periods, results) {
  if (!combatant?.parent?.started || combatant.actor?.type !== "npc" || !results?.actor) return;
  if (legendaryResourceState(combatant.actor).maximum <= 0) return;
  const path = "system.resources.legact.spent";
  if (periods?.includes("turnStart")) results.actor[path] = 0;
  else if (periods?.includes("turnEnd") && !periods.includes("encounter")) delete results.actor[path];
}
