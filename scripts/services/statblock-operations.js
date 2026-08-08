import { collectionValues, readableFoundryMarkup } from "./reaction-operations.js";

const STATBLOCK_ITEM_TYPES = new Set(["feat", "weapon"]);
const STATBLOCK_CATEGORIES = new Set(["trait", "action", "bonus", "reaction", "legendary", "mythic"]);

function activationType(activity) {
  return String(activity?.activation?.type ?? activity?.system?.activation?.type ?? "").toLowerCase();
}

export function statblockCategoryForItem(item) {
  if (!STATBLOCK_ITEM_TYPES.has(String(item?.type ?? "").toLowerCase())) return null;
  if (item?.system?.properties?.has?.("trait")) return "trait";

  const primaryActivity = collectionValues(item?.system?.activities)[0] ?? null;
  const category = activationType(primaryActivity);
  if (!category) return "trait";
  return STATBLOCK_CATEGORIES.has(category) ? category : "trait";
}

export function missingStatblockItems(actor, displayedItemIds = []) {
  const displayed = new Set(displayedItemIds);
  return collectionValues(actor?.items)
    .filter((item) => item?.id && !displayed.has(item.id))
    .filter((item) => !["legendary-actions", "mythic-actions"].includes(item.identifier))
    .map((item) => ({ item, category: statblockCategoryForItem(item) }))
    .filter(({ category }) => category)
    .sort((left, right) => Number(left.item?.sort ?? 0) - Number(right.item?.sort ?? 0));
}

export function prepareStatblockSource(value) {
  const labels = {
    incapacitated: "kampfunfähig",
    frightened: "verängstigt",
    surprised: "überrascht"
  };
  return String(value ?? "").replace(/&(?:amp;)?Reference\[condition=([^\]]+)\]/gi, (_match, condition) => {
    const key = String(condition).split(/[|;]/)[0].trim().toLowerCase();
    return labels[key] ?? key.replace(/[-_]+/g, " ");
  });
}

export function prepareStatblockDescription(value) {
  return readableFoundryMarkup(value)
    .replace(/\b([A-Za-z]+)\s*\[[^\]]+\|(?:XPHB|PHB)\]\s*\1\b/gi, "$1")
    .replace(/\[([^\]|]+)\|(?:XPHB|PHB)\]/gi, "$1")
    .replace(/\[\[\/(?:r|roll)\s+([^\]]+)\]\]/gi, "$1");
}

function commandValue(data, key) {
  return String(data ?? "").match(new RegExp(`(?:^|\\s)${key}=([^\\s]+)`, "i"))?.[1] ?? null;
}

function abilityLabel(value) {
  return ({ str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" })[
    String(value ?? "").toLowerCase()
  ] ?? String(value ?? "").toUpperCase();
}

function inlineActivityLink(label, route) {
  if (!route?.itemId || !route?.activityId || !route?.action) return null;
  return `<span class="roll-link gm-workspace-inline-activity" data-action="use" ` +
    `data-item-id="${route.itemId}" data-activity-id="${route.activityId}" ` +
    `data-activity-action="${route.action}">${label}</span>`;
}

export function prepareInlineActivityCommands(value, routes = {}) {
  return String(value ?? "")
    .replace(/\[\[\/save\s+([^\]]+)\]\](?:\s+saving throw)?/gi, (match, data) => {
      const ability = abilityLabel(commandValue(data, "ability"));
      const dc = commandValue(data, "dc");
      return inlineActivityLink(`${ability}-Rettungswurf${dc ? ` (SG ${dc})` : ""}`, routes.save) ?? match;
    })
    .replace(/\[\[\/damage\s+([^\]]+)\]\]/gi, (match, data) => {
      const formula = String(data ?? "").trim().split(/\s+/)[0] ?? "";
      const type = commandValue(data, "type");
      return inlineActivityLink(`${formula}${type ? ` ${type}` : ""}`, routes.damage) ?? match;
    });
}

export function statblockActivityAction(activity) {
  const type = String(activity?.type ?? activity?.system?.type ?? "").toLowerCase();
  if (type === "damage" && typeof activity?.rollDamage === "function") return "damage";
  if (type === "attack" && typeof activity?.rollAttack === "function") return "attack";
  return typeof activity?.use === "function" ? "use" : null;
}
