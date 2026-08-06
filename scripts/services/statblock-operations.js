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
    .replace(/\[\[\/(?:r|roll)\s+([^\]]+)\]\]/gi, "$1");
}
