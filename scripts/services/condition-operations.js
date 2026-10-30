import { MODULE_ID } from "../config.js";
import { orderedCombatants } from "./combat-order.js";

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

/** Real combat actors plus world characters; unlinked actors retain their token-specific identity. */
export function conditionParticipants(combat) {
  const participants = [];
  const characters = new Set();
  const represented = new Set();
  const sceneId = combat?.scene?.id ?? combat?.sceneId ?? null;
  for (const entry of orderedCombatants(combat)) {
    const actor = entry.actor;
    if (!["npc", "character"].includes(actor?.type) || !actor.uuid) continue;
    if (entry.getFlag?.("monks-combat-details", "placeholder") || entry.getFlag?.("monks-combat-details", "playerPlaceholder")) continue;
    if (actor.type === "character") {
      represented.add(entry.token?.baseActor?.uuid ?? globalThis.game?.actors?.get?.(entry.actorId)?.uuid ?? actor.uuid);
      if (characters.has(actor.uuid)) continue;
      characters.add(actor.uuid);
    }
    const tokenId = entry.token?.id ?? entry.tokenId ?? null;
    const tokenUuid = entry.token?.uuid ?? (sceneId && tokenId ? `Scene.${sceneId}.Token.${tokenId}` : null);
    const sourceUuid = actor.type === "npc"
      ? tokenUuid ?? entry.uuid ?? (combat?.id && entry.id ? `Combat.${combat.id}.Combatant.${entry.id}` : actor.uuid)
      : actor.uuid;
    participants.push({ key: entry.id, actor, actorUuid: actor.uuid, sourceUuid, combatantId: entry.id,
      combatId: combat?.id ?? null, tokenUuid, sceneId, type: actor.type, name: entry.name || actor.name,
      inCombat: true });
  }
  for (const actor of values(globalThis.game?.actors).sort((a, b) => String(a.name).localeCompare(String(b.name), "de"))) {
    if (actor.type !== "character" || !actor.uuid || represented.has(actor.uuid) || characters.has(actor.uuid)) continue;
    participants.push({ key: actor.uuid, actor, actorUuid: actor.uuid, sourceUuid: actor.uuid,
      combatantId: null, combatId: null, tokenUuid: null, sceneId: null, type: actor.type,
      name: actor.name, inCombat: false });
  }
  const totals = new Map();
  for (const entry of participants) totals.set(entry.name, (totals.get(entry.name) ?? 0) + 1);
  const occurrences = new Map();
  for (const entry of participants) {
    const number = (occurrences.get(entry.name) ?? 0) + 1;
    occurrences.set(entry.name, number);
    entry.name = `${entry.name || "Unbenannter Teilnehmer"}${totals.get(entry.name) > 1 ? ` ${number}` : ""}`;
  }
  return participants;
}

/** Sources may be either side of a relationship. UUIDs distinguish individual NPC tokens. */
export function conditionSourceChoices(combat) {
  return conditionParticipants(combat).map(({ actor, sourceUuid, key, ...entry }) => ({ ...entry, uuid: sourceUuid }));
}

function liveSource(source) {
  if (!source?.uuid) return null;
  const combat = globalThis.game?.combats?.get?.(source.combatId) ?? globalThis.game?.combat;
  const current = conditionSourceChoices(combat).find(entry => entry.uuid === source.uuid);
  let actor;
  try { actor = globalThis.fromUuidSync?.(source.uuid); } catch (_error) { /* Retain the recorded name if deleted. */ }
  actor ??= values(globalThis.game?.actors).find(({ uuid }) => uuid === source.uuid);
  return { ...source, ...current, uuid: source.uuid, name: current?.name || actor?.name || source.name || "Teilnehmer" };
}

function identity(entry) {
  return { actorUuid: entry.actorUuid, tokenUuid: entry.tokenUuid ?? null, combatantId: entry.combatantId ?? null,
    combatId: entry.combatId ?? null, sceneId: entry.sceneId ?? null, type: entry.type, name: entry.name };
}

export function conditionRelationshipText(statusId, label, sourceName, targetName) {
  return {
    incomingText: `${label}${statusId === "grappled" ? " von " : " durch "}${sourceName}`,
    outgoingText: statusId === "grappled" ? `Packt gerade ${targetName}` : statusId === "frightened"
      ? `Verängstigt ${targetName}` : `${label} → ${targetName}`
  };
}

export function isConditionSource(entry, source) {
  if (source.tokenUuid) return entry.tokenUuid === source.tokenUuid;
  if (source.combatantId && source.combatId) return entry.combatantId === source.combatantId && entry.combatId === source.combatId;
  return entry.actorUuid === (source.actorUuid ?? source.uuid);
}

/** The counterpart is derived from the one native effect, so changing/removing it updates both ends. */
export function participantConditionTexts(entry, relations) {
  return [...actorConditions(entry.actor).map(condition => condition.text),
    ...relations.filter(relation => isConditionSource(entry, relation.source)).map(relation => relation.outgoingText)];
}

/** Directed, serializable relations for a GM-side consumer such as Combat Wall. Does not mirror effects. */
export function conditionRelations(combat) {
  return conditionParticipants(combat).flatMap(target => actorConditions(target.actor)
    .filter(condition => condition.source).map(condition => ({
      statusId: condition.id, label: condition.label, source: { ...condition.source,
        actorUuid: condition.source.actorUuid ?? (condition.source.uuid.startsWith("Actor.") ? condition.source.uuid : null) },
      target: identity(target),
      ...conditionRelationshipText(condition.id, condition.label, condition.source.name, target.name),
      text: condition.id === "grappled" ? `${condition.source.name} packt ${target.name}` :
        `${target.name}: ${condition.label} durch ${condition.source.name}`
    })));
}

/** Only applied effects supply links; disabling or removing an effect also hides its attribution. */
export function actorConditions(actor) {
  const effects = values(actor?.appliedEffects ?? actor?.effects).filter(effect => !effect.disabled && !effect.isSuppressed);
  const active = new Set([...values(actor?.statuses), ...effects.flatMap(effect => values(effect.statuses))]);
  return conditionOptions().filter(({ id }) => active.has(id)).map(option => {
    const effect = effects.find(effect => hasStatus(effect, option.id) && sources(effect)[option.id]?.uuid);
    const source = liveSource(sources(effect)[option.id]);
    return { ...option, source, text: source ? conditionRelationshipText(option.id, option.label, source.name, "").incomingText : option.label };
  });
}

/** Apply the native condition, annotating its effect without replacing origin, changes, or duration. */
export async function setActorCondition(actor, { statusId, active, sourceUuid = "" }, candidates = []) {
  if (!globalThis.game?.user?.isGM) throw new Error("Nur ein GM kann Zustände ändern.");
  if (!["npc", "character"].includes(actor?.type) || typeof actor.toggleStatusEffect !== "function") throw new Error("Teilnehmer nicht mehr verfügbar.");
  if (!conditionOptions().some(({ id }) => id === statusId) || typeof active !== "boolean") throw new Error("Unbekannter Zustand.");
  const source = active && sourceUuid ? candidates.find(({ uuid }) => uuid === sourceUuid) : null;
  if (active && sourceUuid && !source) throw new Error("Verursacher nicht mehr verfügbar. Bitte neu auswählen.");
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
    if (!source) return;
    throw new Error("Für diesen Zustand ist kein direkt bearbeitbarer Effekt vorhanden. Bitte dessen Quelle im Sheet bearbeiten.");
  }
  try {
    const saved = source ? { uuid: source.uuid, name: source.name } : null;
    if (saved && (source.actorUuid || sources(effect)[statusId]?.actorUuid)) for (const key of ["actorUuid", "combatantId", "combatId", "tokenUuid", "sceneId", "type"]) {
      saved[key] = source[key] ?? (key === "actorUuid" && source.uuid.startsWith("Actor.") ? source.uuid : null);
    }
    await effect.setFlag(MODULE_ID, `${SOURCE_FLAG}.${statusId}`, saved);
    if ((sources(effect)[statusId]?.uuid ?? "") !== (source?.uuid ?? "")) {
      throw new Error("Die Zustandsquelle konnte nicht gespeichert werden.");
    }
  } catch (error) {
    // A new condition and its chosen source must succeed together; never remove an existing condition on failure.
    if (result === effect) await effect.delete();
    throw error;
  }
}
