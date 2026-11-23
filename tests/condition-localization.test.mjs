import assert from "node:assert/strict";
import test from "node:test";
import { germanConditionLabel } from "../scripts/services/condition-labels.js";
import { actorConditions, conditionOptions, conditionRelations } from "../scripts/services/condition-operations.js";

const screenshotConditions = [
  ["falling", "Falling", "Fallend"],
  ["coverHalf", "Half Cover", "Halbe Deckung"],
  ["hiding", "Hiding", "Versteckt"],
  ["hovering", "Hovering", "Schwebend"],
  ["malnutrition", "Malnutrition", "Mangelernährt"],
  ["marked", "Marked", "Markiert"],
  ["silenced", "Silenced", "Verstummt"],
  ["sleeping", "Sleeping", "Schlafend"],
  ["stable", "Stable", "Stabil"],
  ["suffocation", "Suffocation", "Erstickend"],
  ["surprised", "Surprised", "Überrascht"],
  ["coverThreeQuarters", "Three-Quarters Cover", "Dreivierteldeckung"],
  ["coverTotal", "Total Cover", "Volle Deckung"],
  ["transformed", "Transformed", "Verwandelt"]
];

test("every English condition from the screenshot has a German label without changing native IDs or icons", () => {
  const configured = screenshotConditions.map(([id, name]) => ({ id, name, img: `${id}.svg` }));
  const before = structuredClone(configured);
  globalThis.CONFIG = { statusEffects: configured };
  globalThis.game = { i18n: { localize: value => value } };
  const options = conditionOptions();
  for (const [id, , label] of screenshotConditions) {
    assert.deepEqual(options.find(option => option.id === id), { id, img: `${id}.svg`, label });
  }
  assert.deepEqual(configured, before);
  assert.deepEqual(options.map(option => option.label), options.map(option => option.label).sort((a, b) => a.localeCompare(b, "de")));
});

test("the complete D&D5e 5.3 native condition/status list has explicit German display labels", () => {
  // Native IDs from foundryvtt/dnd5e 5.3.x module/config.mjs conditionTypes/statusEffects.
  const expected = {
    bleeding: "Blutend", blinded: "Blind", burning: "Brennend", charmed: "Bezaubert", cursed: "Verflucht",
    dehydration: "Dehydriert", deafened: "Taub", diseased: "Krank", exhaustion: "Erschöpft", falling: "Fallend",
    frightened: "Verängstigt", grappled: "Gepackt", incapacitated: "Kampfunfähig", invisible: "Unsichtbar",
    malnutrition: "Mangelernährt", paralyzed: "Gelähmt", petrified: "Versteinert", poisoned: "Vergiftet", prone: "Liegend",
    restrained: "Festgesetzt", silenced: "Verstummt", stunned: "Betäubt", suffocation: "Erstickend", surprised: "Überrascht",
    transformed: "Verwandelt", unconscious: "Bewusstlos", burrowing: "Grabend", concentrating: "Konzentriert",
    coverHalf: "Halbe Deckung", coverThreeQuarters: "Dreivierteldeckung", coverTotal: "Volle Deckung", dead: "Tot",
    dodging: "Ausweichend", ethereal: "Ätherisch", flying: "Fliegend", hiding: "Versteckt", hovering: "Schwebend",
    marked: "Markiert", sleeping: "Schlafend", stable: "Stabil"
  };
  for (const [id, label] of Object.entries(expected)) assert.equal(germanConditionLabel({ id }), label, id);
});

test("camelCase, kebab IDs, English labels and native localization keys resolve consistently", () => {
  const i18n = { localize: value => value };
  for (const [id, english, expected] of screenshotConditions) {
    const kebab = id.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
    assert.equal(germanConditionLabel({ id: kebab }, i18n), expected);
    assert.equal(germanConditionLabel({ id: id.toUpperCase() }, i18n), expected);
    assert.equal(germanConditionLabel({ id: "extension", label: english }, i18n), expected);
    assert.equal(germanConditionLabel({ id: "extension", name: `EFFECT.DND5E.Status${english.replace(/[- ]/g, "")}` }, i18n), expected);
  }
  assert.equal(germanConditionLabel({ name: "DND5E.ConPoisoned" }, i18n), "Vergiftet");
  assert.equal(germanConditionLabel({ id: "three_quarters_cover" }, i18n), "Dreivierteldeckung");
  assert.equal(germanConditionLabel({ id: "half-cover" }, i18n), "Halbe Deckung");
});

test("localized/custom German extension labels survive while known English extension names translate", () => {
  const i18n = { localize: value => ({ "custom.ward": "Magischer Schutz", "custom.fall": "Falling" })[value] ?? value };
  assert.equal(germanConditionLabel({ id: "my-ward", name: "custom.ward" }, i18n), "Magischer Schutz");
  assert.equal(germanConditionLabel({ id: "my-fall", name: "custom.fall" }, i18n), "Fallend");
  assert.equal(germanConditionLabel({ id: "ward", name: "Besonders gut geschützt" }, i18n), "Besonders gut geschützt");
  assert.equal(germanConditionLabel({ id: "plot", name: "Marked for Death" }, i18n), "Marked for Death", "do not guess partial/custom translations");
  assert.equal(germanConditionLabel({ id: "extension", name: "DND5E.MissingKey", label: "Eigener Zustand" }, i18n), "Eigener Zustand");
  assert.equal(germanConditionLabel({ id: "extension", name: "Eigener Zustand" }, { localize() { throw new Error("not ready"); } }), "Eigener Zustand");
});

test("native effects and actorless placeholder relations use the same German condition labels", () => {
  globalThis.CONFIG = { statusEffects: [{ id: "falling", name: "EFFECT.DND5E.StatusFalling" },
    { id: "coverThreeQuarters", name: "Three-Quarters Cover" }] };
  const nativeActor = { type: "npc", uuid: "Actor.enemy", name: "Gegner", statuses: new Set(["coverThreeQuarters"]), effects: [] };
  const combat = { id: "fight", combatants: new Map() };
  const nova = { id: "nova", name: "Nova", actor: null, uuid: "Combat.fight.Combatant.nova", getFlag(scope, key) {
    if (scope === "gm-combat-workspace" && key === "placeholderConditions") return {
      falling: { source: { uuid: "Combat.fight.Combatant.zane", name: "Zane", combatantId: "zane", combatId: "fight" } }
    };
  } };
  const zane = { id: "zane", name: "Zane", actor: null, uuid: "Combat.fight.Combatant.zane" };
  const enemy = { id: "enemy", name: "Gegner", actor: nativeActor };
  combat.combatants = new Map([nova, zane, enemy].map(entry => [entry.id, entry]));
  combat.turns = [...combat.combatants.values()];
  globalThis.game = { combat, actors: new Map(), i18n: { localize: value => value } };
  assert.equal(actorConditions(nativeActor)[0].text, "Dreivierteldeckung");
  assert.equal(actorConditions(nova)[0].text, "Fallend durch Zane");
  const relation = conditionRelations(combat).find(relation => relation.target.combatantId === "nova");
  assert.equal(relation.label, "Fallend");
  assert.equal(relation.incomingText, "Fallend durch Zane");
  assert.equal(relation.outgoingText, "Fallend → Nova");
});
