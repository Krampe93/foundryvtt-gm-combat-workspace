// D&D5e 5.3 conditionTypes/statusEffects plus Foundry's common status aliases.
// Keep the native IDs intact: only the labels shown by this workspace change.
const DEFINITIONS = [
  ["blinded", "Blind", "blind"],
  ["charmed", "Bezaubert"],
  ["deafened", "Taub", "deaf"],
  ["frightened", "Verängstigt"],
  ["grappled", "Gepackt"],
  ["incapacitated", "Kampfunfähig"],
  ["invisible", "Unsichtbar"],
  ["paralyzed", "Gelähmt", "paralysed"],
  ["petrified", "Versteinert", "petrification"],
  ["poisoned", "Vergiftet"],
  ["prone", "Liegend"],
  ["restrained", "Festgesetzt"],
  ["stunned", "Betäubt"],
  ["unconscious", "Bewusstlos"],
  ["exhaustion", "Erschöpft", "exhausted"],
  ["dead", "Tot"],
  ["bleeding", "Blutend"],
  ["burning", "Brennend"],
  ["cursed", "Verflucht"],
  ["dehydration", "Dehydriert", "dehydrated"],
  ["diseased", "Krank"],
  ["falling", "Fallend"],
  ["malnutrition", "Mangelernährt", "malnourished"],
  ["silenced", "Verstummt"],
  ["suffocation", "Erstickend", "suffocating"],
  ["surprised", "Überrascht"],
  ["transformed", "Verwandelt"],
  ["burrowing", "Grabend", "burrow"],
  ["concentrating", "Konzentriert", "concentration"],
  ["coverHalf", "Halbe Deckung", "half cover"],
  ["coverThreeQuarters", "Dreivierteldeckung", "three-quarters cover", "three quarter cover"],
  ["coverTotal", "Volle Deckung", "total cover", "full cover"],
  ["dodging", "Ausweichend", "dodge"],
  ["ethereal", "Ätherisch"],
  ["flying", "Fliegend", "fly"],
  ["hiding", "Versteckt", "hidden"],
  ["hovering", "Schwebend", "hover"],
  ["marked", "Markiert"],
  ["sleeping", "Schlafend", "asleep"],
  ["stable", "Stabil", "stabilized", "stabilised"],
  ["bloodied", "Angeschlagen"],
  ["defeated", "Besiegt"],
  ["encumbered", "Belastet"],
  ["heavilyEncumbered", "Stark belastet"],
  ["exceedingCarryingCapacity", "Traglast überschritten", "overburdened"],
  ["slowed", "Verlangsamt"],
  ["weakened", "Geschwächt"]
];

function normalized(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");
}

export const GERMAN_CONDITION_LABELS = Object.freeze(Object.fromEntries(DEFINITIONS.flatMap(
  ([id, text, ...aliases]) => [id, ...aliases].map(key => [normalized(key), text])
)));

function knownLabel(value) {
  const raw = String(value ?? "").trim();
  // Handles CONFIG values such as EFFECT.DND5E.StatusHalfCover and DND5E.ConPoisoned.
  const key = raw.replace(/^(?:EFFECT\.)?DND5E\.(?:Status|Con)?/i, "");
  return GERMAN_CONDITION_LABELS[normalized(raw)] ?? GERMAN_CONDITION_LABELS[normalized(key)];
}

/** Translate known statuses; extension names still use their registered localization. */
export function germanConditionLabel({ id, name, label } = {}, i18n = globalThis.game?.i18n) {
  for (const value of [id, name, label]) {
    const translated = knownLabel(value);
    if (translated) return translated;
  }
  const candidates = [name, label].filter(value => typeof value === "string" && value.trim());
  for (const value of candidates) {
    let localized;
    try { localized = i18n?.localize?.(value); } catch { /* Keep extension labels usable without i18n. */ }
    const translated = knownLabel(localized);
    if (translated) return translated;
    if (localized && localized !== value) return localized;
  }
  // Never replace an already localized or custom German label with a guessed translation.
  return candidates.find(value => !/^(?:EFFECT\.)?DND5E\./i.test(value)) ?? String(id || "Unbekannter Zustand");
}
