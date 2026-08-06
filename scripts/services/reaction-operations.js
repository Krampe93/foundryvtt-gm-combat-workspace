export const REACTION_FLAG_KEY = "reactionStates";
export const LEGACY_REACTION_MODULE_ID = "reaction-tracker";
export const LEGACY_REACTION_FLAG_KEY = "states";

export function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (typeof collection.values === "function") return Array.from(collection.values());
  return Object.values(collection);
}

function textValue(value) {
  if (typeof value === "string") return value;
  if (typeof value?.value === "string") return value.value;
  return "";
}

export function readableFoundryMarkup(value) {
  return String(value ?? "")
    .replace(/&amp;Reference\[condition=([^\]]+)\]/gi, (_match, condition) => conditionLabel(condition))
    .replace(/&Reference\[condition=([^\]]+)\]/gi, (_match, condition) => conditionLabel(condition))
    .replace(/\[\[\/save\s+([^\]]+)\]\](?:\s+saving throw)?/gi, (_match, data) => formatSaveCommand(data))
    .replace(/\[\[\/check\s+([^\]]+)\]\]/gi, (_match, data) => formatCheckCommand(data))
    .replace(/\[\[\/damage\s+([^\]]+)\]\]/gi, (_match, data) => formatDamageCommand(data))
    .replace(/@(?:UUID|Compendium|Actor|Item)\[[^\]]*\](?:\{([^}]*)\})?/gi, "$1")
    .replace(/@status\[([^\]]*)\](?:\{([^}]*)\})?/gi, (_match, status, label) => label || conditionLabel(status))
    .replace(/@variantrule\[([^|\]]+)(?:\|[^\]]*)?\]\1/gi, "$1")
    .replace(/@\w+\[([^\]]*)\](?:\{([^}]*)\})?/gi, (_match, data, label) => label || referenceLabel(data));
}

export function stripFoundryMarkup(value) {
  return readableFoundryMarkup(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\[\[\/(?:r|roll)\s+([^\]]+)\]\]/gi, "$1")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function commandValue(data, key) {
  return String(data ?? "").match(new RegExp(`(?:^|\\s)${key}=([^\\s]+)`, "i"))?.[1] ?? null;
}

function abilityLabel(value) {
  return ({ str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" })[
    String(value ?? "").toLowerCase()
  ] ?? String(value ?? "").toUpperCase();
}

function conditionLabel(value) {
  const key = String(value ?? "").split(/[|;]/)[0].trim().toLowerCase();
  return ({
    incapacitated: "kampfunfähig",
    frightened: "verängstigt",
    surprised: "überrascht"
  })[key] ?? key.replace(/[-_]+/g, " ");
}

function referenceLabel(value) {
  const parts = String(value ?? "").split("|").map((part) => part.trim()).filter(Boolean);
  return parts[0] ?? "";
}

function formatSaveCommand(data) {
  const ability = abilityLabel(commandValue(data, "ability"));
  const dc = commandValue(data, "dc");
  return `${ability}-Rettungswurf${dc ? ` (SG ${dc})` : ""}`;
}

function formatCheckCommand(data) {
  const ability = abilityLabel(commandValue(data, "ability"));
  const dc = commandValue(data, "dc");
  return `${ability}-Probe${dc ? ` (SG ${dc})` : ""}`;
}

function formatDamageCommand(data) {
  const formula = String(data ?? "").trim().split(/\s+/)[0] ?? "";
  const type = commandValue(data, "type");
  return `${formula}${type ? ` ${type}` : ""}`.trim();
}

export function shortenReactionText(value, maximumLength = 360) {
  const text = stripFoundryMarkup(value);
  if (text.length <= maximumLength) return text;
  return `${text.slice(0, maximumLength).trim()}…`;
}

export function itemDescription(item) {
  const values = [
    item?.system?.description?.value,
    item?.system?.description?.chat
  ];

  for (const activity of collectionValues(item?.system?.activities)) {
    values.push(
      textValue(activity?.description),
      activity?.description?.chatFlavor,
      textValue(activity?.system?.description),
      activity?.system?.description?.chatFlavor
    );
  }

  return values.filter((value) => typeof value === "string" && value.trim()).join(" ");
}

export function isReactionActivation(type) {
  return String(type ?? "").toLowerCase().startsWith("reaction");
}

export function isPlayerFacingTurn(type) {
  return type === "player" || type === "placeholder";
}

function activityActivationType(activity) {
  return activity?.activation?.type ?? activity?.system?.activation?.type ?? null;
}

function activityCondition(activity, item) {
  return shortenReactionText(
    activity?.activation?.condition ??
    activity?.system?.activation?.condition ??
    item?.system?.activation?.condition ??
    "",
    180
  );
}

export function actorReactions(actor) {
  const reactions = [];

  for (const item of collectionValues(actor?.items)) {
    const activities = collectionValues(item?.system?.activities);
    const reactionActivities = activities.filter((activity) => isReactionActivation(activityActivationType(activity)));

    for (const activity of reactionActivities) {
      const activityName = String(activity?.name ?? "").trim();
      const normalized = activityName.toLowerCase();
      const genericName = ["", "use", "verwenden", "activate", "aktivieren"].includes(normalized);
      const duplicateName = normalized === String(item?.name ?? "").trim().toLowerCase();
      reactions.push({
        id: `${item?.id ?? "item"}:${activity?.id ?? "activity"}`,
        itemId: item?.id ?? null,
        activityId: activity?.id ?? null,
        name: genericName || duplicateName ? item?.name : `${item?.name}: ${activityName}`,
        condition: activityCondition(activity, item),
        description: shortenReactionText(itemDescription(item)) || "Keine Beschreibung hinterlegt.",
        executable: typeof activity?.use === "function",
        activityType: activity?.type ?? activity?.system?.type ?? null
      });
    }

    if (!reactionActivities.length && isReactionActivation(item?.system?.activation?.type)) {
      reactions.push({
        id: `${item?.id ?? "item"}:legacy`,
        itemId: item?.id ?? null,
        activityId: null,
        name: item?.name ?? "Unbenannte Reaktion",
        condition: shortenReactionText(item?.system?.activation?.condition ?? "", 180),
        description: shortenReactionText(itemDescription(item)) || "Keine Beschreibung hinterlegt.",
        executable: false,
        activityType: null
      });
    }
  }

  return reactions.sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));
}

function attackRangeType(activity, item) {
  return String(
    activity?.attack?.type?.value ??
    activity?.system?.attack?.type?.value ??
    item?.system?.actionType ??
    ""
  ).toLowerCase();
}

export function actorMeleeAttacks(actor) {
  const attacks = [];

  for (const item of collectionValues(actor?.items)) {
    for (const activity of collectionValues(item?.system?.activities)) {
      const activityType = String(activity?.type ?? activity?.system?.type ?? "").toLowerCase();
      if (activityType !== "attack") continue;

      const rangeType = attackRangeType(activity, item);
      if (!(rangeType === "melee" || rangeType === "mwak" || rangeType === "msak" || rangeType.startsWith("melee"))) continue;

      attacks.push({
        id: `${item?.id ?? "item"}:${activity?.id ?? "activity"}`,
        itemId: item?.id ?? null,
        activityId: activity?.id ?? null,
        name: activity?.name && activity.name !== item?.name
          ? `${item?.name}: ${activity.name}`
          : item?.name ?? activity?.name ?? "Nahkampfangriff"
      });
    }
  }

  return attacks.sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));
}

function turnTiming(text) {
  const normalized = stripFoundryMarkup(text).toLowerCase();
  const starts = [
    "starts its turn", "starts their turn", "starts the turn",
    "at the start of its turn", "at the start of their turn",
    "at the start of the creature's turn", "at the start of a creature's turn",
    "zu beginn seines zuges", "zu beginn ihres zuges",
    "beginnt seinen zug", "beginnt ihren zug"
  ].some((phrase) => normalized.includes(phrase));
  if (starts) return "start";

  const ends = [
    "ends its turn", "ends their turn", "ends the turn",
    "at the end of its turn", "at the end of their turn",
    "at the end of the creature's turn", "at the end of a creature's turn",
    "am ende seines zuges", "am ende ihres zuges",
    "beendet seinen zug", "beendet ihren zug"
  ].some((phrase) => normalized.includes(phrase));
  return ends ? "end" : null;
}

function hasActorCenteredTurnArea(text) {
  const normalized = stripFoundryMarkup(text).toLowerCase();
  const englishSubject = /\b(?:a|any|each|every|the)\s+(?:creature|enemy|target)\b[\s\S]{0,220}?\b(?:starts?|ends?)\s+(?:its|their|the)\s+turn\b[\s\S]{0,100}?\bwithin\s+\d+\s*(?:feet|foot|ft\.?)\b/i;
  const englishTimingFirst = /\b(?:at\s+the\s+(?:start|end)|when\s+[^.]{0,80}?\b(?:starts?|ends?))\b[\s\S]{0,180}?\bwithin\s+\d+\s*(?:feet|foot|ft\.?)\b/i;
  const german = /\b(?:kreatur|gegner|ziel)\b[\s\S]{0,220}?\b(?:beginnt|beendet|anfang|beginn|ende)\b[\s\S]{0,100}?\b(?:innerhalb|im\s+umkreis)\b/i;
  return englishSubject.test(normalized) || englishTimingFirst.test(normalized) || german.test(normalized);
}

export function actorTurnStartEffects(actor) {
  const effects = [];
  const seen = new Set();

  for (const item of collectionValues(actor?.items)) {
    const description = itemDescription(item);
    if (!description) continue;
    const timing = turnTiming(description);
    const auraNamed = String(item?.name ?? "").toLowerCase().includes("aura");
    const actorCenteredTurnArea = timing && hasActorCenteredTurnArea(description);
    if (!auraNamed && !actorCenteredTurnArea) continue;
    const id = item?.uuid ?? item?.id ?? item?.name;
    if (seen.has(id)) continue;
    seen.add(id);
    effects.push({
      id,
      name: item?.name ?? "Unbenannter Effekt",
      timing: timing ?? "aura",
      description: shortenReactionText(description)
    });
  }

  return effects.sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));
}

export function mergeReactionStates(currentStates = {}, legacyStates = {}) {
  return { ...(legacyStates ?? {}), ...(currentStates ?? {}) };
}
