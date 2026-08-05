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

export function stripFoundryMarkup(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/@(?:UUID|Compendium|Actor|Item)\[[^\]]*\](?:\{([^}]*)\})?/gi, "$1")
    .replace(/@\w+\[([^\]]*)\](?:\{([^}]*)\})?/gi, (_match, data, label) => label || data)
    .replace(/\[\[\/(?:r|roll)\s+([^\]]+)\]\]/gi, "$1")
    .replace(/&(?:nbsp|amp|quot|lt|gt);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function hasAreaPhrase(item, text) {
  const name = String(item?.name ?? "").toLowerCase();
  const normalized = stripFoundryMarkup(text).toLowerCase();
  return name.includes("aura") || normalized.includes(" aura") ||
    /\bwithin\s+\d+\s*(?:feet|foot|ft\.?)/i.test(normalized) ||
    ["affected area", "within the area", "inside the area", "in the aura", "within the aura",
      "im betroffenen bereich", "innerhalb der aura", "im umkreis"].some((phrase) => normalized.includes(phrase));
}

export function actorTurnStartEffects(actor) {
  const effects = [];
  const seen = new Set();

  for (const item of collectionValues(actor?.items)) {
    const description = itemDescription(item);
    if (!description) continue;
    const timing = turnTiming(description);
    const auraNamed = String(item?.name ?? "").toLowerCase().includes("aura") ||
      stripFoundryMarkup(description).toLowerCase().includes(" aura");
    if (!auraNamed && !(timing && hasAreaPhrase(item, description))) continue;
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
