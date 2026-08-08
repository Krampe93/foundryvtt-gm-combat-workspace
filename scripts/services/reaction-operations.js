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
  return stripFoundryMarkup(
    activity?.activation?.condition ??
    activity?.system?.activation?.condition ??
    item?.system?.activation?.condition ??
    ""
  );
}

function activityType(activity) {
  return String(activity?.type ?? activity?.system?.type ?? "").toLowerCase();
}

function activityDamageParts(activity) {
  return collectionValues(activity?.damage?.parts ?? activity?.system?.damage?.parts);
}

function hasRollableDamage(activity) {
  return typeof activity?.rollDamage === "function" && (
    activityType(activity) === "damage" || activityDamageParts(activity).length > 0
  );
}

function reductionFormula(description) {
  const text = stripFoundryMarkup(description);
  const patterns = [
    /reduces?\s+(?:the\s+)?damage[\s\S]{0,180}?\bby\s+\d+\s*\((\d+d\d+(?:\s*[+\-]\s*\d+)?)\)/i,
    /verringert[\s\S]{0,180}?schaden[\s\S]{0,80}?\bum\s+\d+\s*\((\d+d\d+(?:\s*[+\-]\s*\d+)?)\)/i,
    /reduces?\s+(?:the\s+)?damage[\s\S]{0,180}?\bby\s+(\d+d\d+(?:\s*[+\-]\s*\d+)?)/i,
    /verringert[\s\S]{0,180}?schaden[\s\S]{0,80}?\bum\s+(\d+d\d+(?:\s*[+\-]\s*\d+)?)/i
  ];
  return patterns.map((pattern) => text.match(pattern)?.[1]?.replace(/\s+/g, "") ?? null).find(Boolean) ?? null;
}

export function reactionExecutionPlan(item, reactionActivity = null) {
  const activities = collectionValues(item?.system?.activities);
  const damageActivities = activities.filter(hasRollableDamage);
  return {
    reactionActivity,
    damageActivities,
    reductionFormula: reductionFormula(itemDescription(item)),
    executable: damageActivities.length > 0 || Boolean(reductionFormula(itemDescription(item)))
  };
}

function recoveryType(recovery) {
  return String(
    recovery?.period ??
    recovery?.type ??
    recovery?.recovery?.period ??
    recovery?.recovery?.type ??
    ""
  ).toLowerCase();
}

export function reactionResourceState(activity) {
  const uses = activity?.uses ?? activity?.system?.uses ?? {};
  const recovery = collectionValues(uses?.recovery);
  const recharge = recovery.some((entry) => recoveryType(entry).includes("recharge"));
  if (!recharge) return { recharge: false, available: true, remaining: null };

  const value = Number(uses?.value);
  const max = Number(uses?.max);
  const spent = Number(uses?.spent ?? 0);
  const remaining = Number.isFinite(value)
    ? value
    : Number.isFinite(max)
      ? Math.max(0, max - spent)
      : 0;
  return { recharge: true, available: remaining > 0, remaining };
}

export function actorReactions(actor) {
  const reactions = [];

  for (const item of collectionValues(actor?.items)) {
    const activities = collectionValues(item?.system?.activities);
    const reactionActivities = activities.filter((activity) => isReactionActivation(activityActivationType(activity)));

    for (const activity of reactionActivities) {
      const activityName = String(activity?.name ?? "").trim();
      const execution = reactionExecutionPlan(item, activity);
      reactions.push({
        id: `${item?.id ?? "item"}:${activity?.id ?? "activity"}`,
        itemId: item?.id ?? null,
        activityId: activity?.id ?? null,
        name: item?.name ?? activityName ?? "Unbenannte Reaktion",
        condition: activityCondition(activity, item),
        description: stripFoundryMarkup(itemDescription(item)) || "Keine Beschreibung hinterlegt.",
        executable: execution.executable,
        activityType: activity?.type ?? activity?.system?.type ?? null
      });
    }

    if (!reactionActivities.length && isReactionActivation(item?.system?.activation?.type)) {
      reactions.push({
        id: `${item?.id ?? "item"}:legacy`,
        itemId: item?.id ?? null,
        activityId: null,
        name: item?.name ?? "Unbenannte Reaktion",
        condition: stripFoundryMarkup(item?.system?.activation?.condition ?? ""),
        description: stripFoundryMarkup(itemDescription(item)) || "Keine Beschreibung hinterlegt.",
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

      const rawActivityName = String(activity?.name ?? "").trim();
      const genericActivityName = ["", "attack", "angriff", String(item?.name ?? "").toLowerCase()]
        .includes(rawActivityName.toLowerCase());
      attacks.push({
        id: `${item?.id ?? "item"}:${activity?.id ?? "activity"}`,
        itemId: item?.id ?? null,
        activityId: activity?.id ?? null,
        name: genericActivityName
          ? item?.name ?? activity?.name ?? "Nahkampfangriff"
          : `${item?.name}: ${activity.name}`,
        itemName: item?.name ?? activity?.name ?? "Nahkampfangriff"
      });
    }
  }

  return attacks.sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));
}

const NUMBER_WORDS = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  eins: 1, zwei: 2, drei: 3, vier: 4, fuenf: 5, fünf: 5, sechs: 6
});

function parsedCount(value) {
  const normalized = String(value ?? "").toLowerCase();
  if (NUMBER_WORDS[normalized]) return NUMBER_WORDS[normalized];
  const numeric = Number.parseInt(normalized, 10);
  return Number.isFinite(numeric) ? numeric : 0;
}

function escapedPattern(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function namedAttackCount(description, attackName) {
  const name = escapedPattern(attackName).replace(/\s+/g, "\\s+");
  const count = "(one|two|three|four|five|six|eins|zwei|drei|vier|fuenf|fünf|sechs|\\d+)";
  const patterns = [
    new RegExp(`\\b${count}\\s+(?:attacks?\\s+)?(?:with\\s+(?:its|the)\\s+)?${name}s?(?:\\s+attacks?)?`, "i"),
    new RegExp(`\\b${count}\\s+${name}s?\\s+angriffe?`, "i")
  ];
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) return { count: parsedCount(match[1]), index: match.index ?? 0 };
  }
  return null;
}

function totalMultiattackCount(description) {
  const count = "(one|two|three|four|five|six|eins|zwei|drei|vier|fuenf|fünf|sechs|\\d+)";
  return parsedCount(
    description.match(new RegExp(`\\bmakes?\\s+${count}\\s+(?:[^.]{0,35}\\s+)?attacks?\\b`, "i"))?.[1] ??
    description.match(new RegExp(`\\bführt\\s+${count}\\s+angriffe?\\b`, "i"))?.[1]
  );
}

function attackMentioned(description, attack) {
  return new RegExp(`\\b${escapedPattern(attack.itemName)}s?\\b`, "i").test(description);
}

export function actorOpportunityPlan(actor) {
  const attacks = actorMeleeAttacks(actor);
  if (!attacks.length) return { mode: "none", sequence: [], slots: 0, options: [], multiattack: false };

  const multiattack = collectionValues(actor?.items).find((item) => {
    const identifier = String(item?.identifier ?? item?.system?.identifier ?? "").toLowerCase();
    const name = String(item?.name ?? "").toLowerCase();
    return identifier === "multiattack" || name === "multiattack" || name === "mehrfachangriff";
  }) ?? null;

  if (!multiattack) {
    return attacks.length === 1
      ? { mode: "sequence", sequence: [attacks[0]], slots: 1, options: attacks, multiattack: false }
      : { mode: "choose", sequence: [], slots: 1, options: attacks, multiattack: false };
  }

  const description = stripFoundryMarkup(itemDescription(multiattack));
  const explicit = attacks.map((attack) => ({ attack, match: namedAttackCount(description, attack.itemName) }))
    .filter(({ match }) => match?.count > 0)
    .sort((left, right) => left.match.index - right.match.index);
  if (explicit.length) {
    return {
      mode: "sequence",
      sequence: explicit.flatMap(({ attack, match }) => Array.from({ length: match.count }, () => attack)),
      slots: explicit.reduce((total, { match }) => total + match.count, 0),
      options: attacks,
      multiattack: true
    };
  }

  const total = totalMultiattackCount(description);
  const mentioned = attacks.filter((attack) => attackMentioned(description, attack));
  if (total > 0 && mentioned.length === 1) {
    return {
      mode: "sequence",
      sequence: Array.from({ length: total }, () => mentioned[0]),
      slots: total,
      options: mentioned,
      multiattack: true
    };
  }
  if (total > 0 && mentioned.length > 1) {
    return { mode: "choose", sequence: [], slots: total, options: mentioned, multiattack: true };
  }

  return attacks.length === 1
    ? { mode: "sequence", sequence: [attacks[0]], slots: 1, options: attacks, multiattack: true }
    : { mode: "choose", sequence: [], slots: 1, options: attacks, multiattack: true };
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
