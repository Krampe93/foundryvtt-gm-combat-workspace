import { MODULE_ID } from "../config.js";

const SOURCE_FLAG = "conditionSources";
const GERMAN_NAMES = {
  blinded: "Blind", charmed: "Bezaubert", deafened: "Taub", frightened: "Verängstigt",
  grappled: "Gepackt", incapacitated: "Kampfunfähig", invisible: "Unsichtbar", paralyzed: "Gelähmt",
  petrified: "Versteinert", poisoned: "Vergiftet", prone: "Liegend", restrained: "Festgesetzt",
  stunned: "Betäubt", unconscious: "Bewusstlos", exhaustion: "Erschöpft", dead: "Tot"
};

function values(collection) {
  return Array.from(collection?.values?.() ?? collection ?? []);
}

function sources(effect) {
  return effect?.getFlag?.(MODULE_ID, SOURCE_FLAG) ?? effect?.flags?.[MODULE_ID]?.[SOURCE_FLAG] ?? {};
}

function hasStatus(effect, id) {
  return !effect.disabled && !effect.isSuppressed && values(effect.statuses).includes(id);
}

/** The configured native effects include system/module additions, with their original IDs and icons. */
export function conditionOptions() {
  return values(globalThis.CONFIG?.statusEffects).filter(({ id, hud }) => id && hud !== false)
    .map(({ id, name, label, img, icon }) => ({ id, img: img ?? icon ?? "",
      label: GERMAN_NAMES[id] ?? globalThis.game?.i18n?.localize?.(name ?? label ?? id) ?? name ?? label ?? id }))
    .sort((a, b) => a.label.localeCompare(b.label, "de"));
}

/** Prefer the persistent character behind a token; include characters outside the encounter too. */
export function conditionPlayers(combat) {
  const players = new Map();
  const add = (actor, inCombat = false) => {
    if (actor?.type !== "character" || !actor.uuid) return;
    const previous = players.get(actor.uuid);
    players.set(actor.uuid, { uuid: actor.uuid, name: actor.name || "Unbenannter Spielercharakter",
      inCombat: inCombat || Boolean(previous?.inCombat) });
  };
  for (const combatant of values(combat?.combatants)) {
    add(combatant.token?.baseActor ?? globalThis.game?.actors?.get?.(combatant.actorId) ?? combatant.actor, true);
  }
  for (const actor of values(globalThis.game?.actors)) add(actor);
  return [...players.values()].sort((a, b) => Number(b.inCombat) - Number(a.inCombat) || a.name.localeCompare(b.name, "de"));
}

function liveSource(source) {
  if (!source?.uuid) return null;
  let actor;
  try { actor = globalThis.fromUuidSync?.(source.uuid); } catch (_error) { /* Retain the recorded name if deleted. */ }
  actor ??= values(globalThis.game?.actors).find(({ uuid }) => uuid === source.uuid);
  return { uuid: source.uuid, name: actor?.name || source.name || "Spielercharakter" };
}

/** Only applied effects supply links; disabling or removing an effect also hides its attribution. */
export function actorConditions(actor) {
  const effects = values(actor?.appliedEffects ?? actor?.effects).filter(effect => !effect.disabled && !effect.isSuppressed);
  const active = new Set([...values(actor?.statuses), ...effects.flatMap(effect => values(effect.statuses))]);
  return conditionOptions().filter(({ id }) => active.has(id)).map(option => {
    const effect = effects.find(effect => hasStatus(effect, option.id) && sources(effect)[option.id]?.uuid);
    const source = liveSource(sources(effect)[option.id]);
    return { ...option, source, text: `${option.label}${source ? ` durch ${source.name}` : ""}` };
  });
}

/** Apply the native condition, annotating its effect without replacing origin, changes, or duration. */
export async function setActorCondition(actor, { statusId, active, sourceUuid = "" }, players = []) {
  if (!globalThis.game?.user?.isGM) throw new Error("Nur ein GM kann Zustände ändern.");
  if (actor?.type !== "npc" || typeof actor.toggleStatusEffect !== "function") throw new Error("Gegner nicht mehr verfügbar.");
  if (!conditionOptions().some(({ id }) => id === statusId) || typeof active !== "boolean") throw new Error("Unbekannter Zustand.");
  const player = active && sourceUuid ? players.find(({ uuid }) => uuid === sourceUuid) : null;
  if (active && sourceUuid && !player) throw new Error("Spielercharakter nicht mehr verfügbar. Bitte neu auswählen.");
  if (!active) {
    await actor.toggleStatusEffect(statusId, { active: false });
    if (actorConditions(actor).some(({ id }) => id === statusId)) {
      throw new Error("Der Zustand wird noch von einem anderen Effekt verliehen. Bitte dessen Quelle im Sheet entfernen.");
    }
    return;
  }
  const result = await actor.toggleStatusEffect(statusId, { active: true });
  const effects = values(actor.effects).filter(effect => hasStatus(effect, statusId));
  const effect = (result && typeof result === "object" ? result : null) ??
    effects.find(effect => sources(effect)[statusId]) ?? effects[0];
  if (!effect?.setFlag) {
    if (!actorConditions(actor).some(({ id }) => id === statusId)) throw new Error("Foundry hat den Zustand nicht gesetzt.");
    if (!player) return;
    throw new Error("Für diesen Zustand ist kein direkt bearbeitbarer Effekt vorhanden. Bitte dessen Quelle im Sheet bearbeiten.");
  }
  try {
    await effect.setFlag(MODULE_ID, `${SOURCE_FLAG}.${statusId}`, player ? { uuid: player.uuid, name: player.name } : null);
    if ((sources(effect)[statusId]?.uuid ?? "") !== (player?.uuid ?? "")) {
      throw new Error("Die Spielerquelle konnte nicht gespeichert werden.");
    }
  } catch (error) {
    // A new condition and its chosen source must succeed together; never remove an existing condition on failure.
    if (result === effect) await effect.delete();
    throw error;
  }
}
