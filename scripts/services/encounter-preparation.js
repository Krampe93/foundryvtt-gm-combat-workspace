import { MODULE_ID, SETTING_KEYS } from "../config.js";
import { classifyCombatant } from "./combat-state.js";
import { combatantInitiative } from "./combat-order.js";

const values = (collection) => Array.from(collection?.values?.() ?? collection ?? []);
const flag = (document, module, key) => document?.getFlag?.(module, key) ?? document?.flags?.[module]?.[key];
const normalized = (name) => String(name ?? "").trim().toLocaleLowerCase();
const actorId = (actor) => actor?.id ?? null;
const sceneId = (combat) => combat?.scene?.id ?? combat?.sceneId ?? combat?.scene ?? null;
const groupId = (combatant) => combatant?.group?.id ?? combatant?.group ?? null;
const groupDocument = (combat, combatant) => typeof combatant?.group === "object"
  ? combatant.group : combat?.groups?.get?.(groupId(combatant));

export function parseInitiative(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

export function sceneEncounter(scene, game = globalThis.game) {
  const combats = values(game.combats).filter((combat) => sceneId(combat) === scene?.id);
  return combats.find((combat) => combat.id === game.combat?.id) ?? combats.find((combat) => combat.active) ??
    combats.find((combat) => combat.started) ?? combats[0] ?? null;
}

/** Use D&D5e's prepared initiative bonuses without changing the world's D20 formula or opening a roll dialog. */
export async function rollNpcInitiative(actor) {
  const config = actor.getInitiativeRollConfig?.();
  if (actor.getInitiativeRollConfig && !config) throw new Error(`Initiative für ${actor.name} wurde abgebrochen.`);
  const fallback = parseInitiative(actor.system?.attributes?.init?.total);
  if (!config && fallback === null) throw new Error(`Initiative-Modifikator für ${actor.name} fehlt.`);
  const advantage = config?.options?.advantage && !config?.options?.disadvantage;
  const disadvantage = config?.options?.disadvantage && !config?.options?.advantage;
  const die = advantage ? "2d12kh" : disadvantage ? "2d12kl" : "1d12";
  const formula = [die, ...(config?.parts ?? [String(fallback)])].join(" + ");
  const result = await new Roll(formula, config?.data ?? actor.getRollData?.() ?? {}).evaluate();
  if (!Number.isFinite(result.total)) throw new Error(`Ungültiger Initiativewurf für ${actor.name}.`);
  return result.total;
}

function wallKey(token, combatant) {
  const explicit = flag(combatant, "combat-wall", "groupId") || flag(token.actor, "combat-wall", "groupId");
  const slug = (value) => String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "gruppe";
  return explicit ? slug(explicit) : `actor-${token.actorId ?? token.actor.id}`;
}

function npcEntries(scene, combat, game) {
  const combatants = values(combat?.combatants);
  const wall = game.modules?.get?.("combat-wall")?.active === true;
  return values(scene.tokens).filter((token) => token.actor?.type === "npc").map((token) => {
    const matches = combatants.filter((entry) => entry.tokenId === token.id);
    const representative = matches[0];
    const group = groupDocument(combat, representative);
    const managed = flag(group, "combat-wall", "managed");
    const key = group && !managed ? `group:${group.id}` : wall && !(representative ? representative.hidden : token.hidden)
      ? `wall:${wallKey(token, representative)}` : group ? `group:${group.id}` : `token:${token.id}`;
    return { token, matches, group, key };
  });
}

function playerRoster(scene, combat, game, saved) {
  const rows = [];
  const characters = values(game.actors).filter((actor) => actor.type === "character");
  const tokens = values(scene.tokens).filter((token) => token.actor?.type === "character");
  const assigned = new Set(values(game.users).filter((user) => !user.isGM).map((user) => user.character?.id).filter(Boolean));
  const add = (row) => { rows.push(row); return row; };
  for (const combatant of values(combat?.combatants)) {
    if (!["player", "placeholder"].includes(classifyCombatant(combatant))) continue;
    const own = flag(combatant, MODULE_ID, "playerPlaceholder");
    const character = combatant.actor?.type === "character" ? combatant.actor : characters.find((actor) =>
      actor.id === own?.actorId || normalized(actor.name) === normalized(combatant.name));
    add({ key: `combatant:${combatant.id}`, combatantId: combatant.id, actorId: actorId(character),
      tokenId: combatant.tokenId ?? null, name: combatant.name ?? character?.name ?? "Spieler",
      initiative: combatantInitiative(combatant), enabled: true });
  }
  for (const token of tokens) {
    if (rows.some((row) => row.tokenId === token.id || (token.actorLink !== false && row.actorId === token.actorId))) continue;
    add({ key: `token:${token.id}`, tokenId: token.id, actorId: token.actorId ?? token.actor.id,
      name: token.name ?? token.actor.name, initiative: null, enabled: true });
  }
  for (const actor of characters) {
    if (rows.some((row) => row.actorId === actor.id)) continue;
    const previous = saved.find((row) => row.actorId === actor.id);
    add({ key: `actor:${actor.id}`, actorId: actor.id, name: actor.name, initiative: null,
      enabled: previous ? previous.enabled : assigned.has(actor.id) });
  }
  for (const previous of saved.filter((row) => !row.actorId && row.name)) {
    if (rows.some((row) => normalized(row.name) === normalized(previous.name))) continue;
    add({ key: `custom:${rows.length}`, name: previous.name, actorId: null, initiative: null, enabled: previous.enabled });
  }
  // Worlds without assigned users still get their characters as the initial party suggestion.
  if (!rows.some((row) => row.enabled) && !saved.length && !assigned.size) rows.forEach((row) => { row.enabled = true; });
  return rows.sort((left, right) => Number(right.enabled) - Number(left.enabled));
}

function lairActors(entries) {
  return [...new Map(entries.filter(({ token }) => token.actor.system?.resources?.lair?.value === true)
    .map(({ token }) => [token.actor.uuid, token.actor])).values()];
}

function signature(scene, combat, entries) {
  return JSON.stringify({ scene: scene.id, combat: combat?.id ?? null, round: combat?.round ?? 0,
    active: combat?.combatant?.id ?? null,
    npcs: entries.map(({ token, key }) => [token.id, token.actor.uuid, key]),
    players: values(scene.tokens).filter((token) => token.actor?.type === "character")
      .map((token) => [token.id, token.actor.uuid]),
    combatants: values(combat?.combatants).map((entry) => [entry.id, entry.tokenId, entry.actorId, entry.name,
      groupId(entry), combatantInitiative(entry)]),
    lairs: lairActors(entries).map((actor) => [actor.uuid, Boolean(actor.system.resources.lair.inside)]) });
}

/** Plans stay in the authoritative main window; the companion only receives serializable form data. */
export class EncounterPreparation {
  #getScene;
  #game;
  #roll;
  #createCombat;
  #plans = new Map();
  #busy = false;

  constructor({ getScene = () => globalThis.canvas?.scene, game = globalThis.game,
    roll = rollNpcInitiative, createCombat = (data) => globalThis.CONFIG.Combat.documentClass.create(data) } = {}) {
    this.#getScene = getScene;
    this.#game = game;
    this.#roll = roll;
    this.#createCombat = createCombat;
  }

  #context() {
    if (!this.#game.user?.isGM) throw new Error("Nur der Spielleiter kann einen Encounter vorbereiten.");
    const scene = this.#getScene();
    if (!scene) throw new Error("Bitte zuerst im Foundry-Hauptfenster eine Map öffnen.");
    const combat = sceneEncounter(scene, this.#game);
    return { scene, combat, entries: npcEntries(scene, combat, this.#game) };
  }

  preview() {
    const context = this.#context();
    const { scene, combat, entries } = context;
    const saved = this.#game.settings.get(MODULE_ID, SETTING_KEYS.encounterPlayers) ?? [];
    const players = playerRoster(scene, combat, this.#game, saved);
    const id = foundry.utils.randomID();
    const plan = { ...context, players, signature: signature(scene, combat, entries), created: Date.now() };
    this.#plans.set(id, plan);
    while (this.#plans.size > 20) this.#plans.delete(this.#plans.keys().next().value);
    return { id, sceneId: scene.id, sceneName: scene.name, npcCount: entries.length,
      rollCount: new Set(entries.map((entry) => entry.key)).size, players,
      lairs: lairActors(entries).map((actor) => ({ uuid: actor.uuid, name: actor.name,
        tokens: entries.filter(({ token }) => token.actor.uuid === actor.uuid).map(({ token }) => token.name),
        inside: Boolean(actor.system.resources.lair.inside) })) };
  }

  async prepare(id, submission = {}) {
    if (!this.#game.user?.isGM) throw new Error("Nur der Spielleiter kann einen Encounter vorbereiten.");
    if (this.#busy) throw new Error("Die Encounter-Vorbereitung läuft bereits.");
    const plan = this.#plans.get(id);
    if (!plan || Date.now() - plan.created > 600000) throw new Error("Bitte die Encounter-Vorbereitung erneut öffnen.");
    if (plan.result) return plan.result;
    this.#busy = true;
    try { return await this.#prepare(plan, submission); }
    finally { this.#busy = false; }
  }

  async #prepare(plan, submission) {
    const check = () => {
      const current = this.#context();
      if (signature(current.scene, current.combat, current.entries) !== plan.signature) {
        throw new Error("Map oder Encounter wurden inzwischen geändert. Bitte die Vorbereitung neu öffnen.");
      }
    };
    check();
    if (!Array.isArray(submission.players) || submission.players.length > 100) throw new Error("Ungültige Spielerliste.");
    const usedKeys = new Set();
    const usedNames = new Set();
    const players = submission.players.map((input) => {
      const original = plan.players.find((row) => row.key === input.key);
      if (!original && !String(input.key).startsWith("new:")) throw new Error("Spieler ist nicht mehr verfügbar.");
      if (usedKeys.has(input.key)) throw new Error("Ein Spieler wurde doppelt angegeben.");
      usedKeys.add(input.key);
      const row = { ...original, key: input.key, name: original?.actorId || original?.combatantId
        ? original.name : String(input.name ?? "").trim(), enabled: Boolean(input.enabled), initiative: parseInitiative(input.initiative) };
      if (!row.enabled) return row;
      if (row.actorId && this.#game.actors.get(row.actorId)?.type !== "character") {
        throw new Error(`Spielercharakter ${row.name} ist nicht mehr verfügbar. Bitte die Vorbereitung neu öffnen.`);
      }
      if (!row.name || row.name.length > 100) throw new Error("Bitte für jeden aktiven Spieler einen Namen angeben.");
      if (row.initiative === null) throw new Error(`Bitte eine Initiative für ${row.name} eingeben.`);
      if (usedNames.has(normalized(row.name))) throw new Error(`Spielername ${row.name} ist doppelt vorhanden.`);
      usedNames.add(normalized(row.name));
      return row;
    });
    const { entries, scene } = plan;
    const lairs = lairActors(entries);
    if (!Array.isArray(submission.lairs) || submission.lairs.some((row) => !lairs.some((actor) => actor.uuid === row.uuid)) ||
      new Set(submission.lairs.map((row) => row.uuid)).size !== lairs.length || submission.lairs.length !== lairs.length) {
      throw new Error("Bitte die Hort-Auswahl vollständig prüfen.");
    }
    // A mixed group cannot simultaneously have an independent manual player value and an NPC roll.
    for (const entry of entries.filter((entry) => entry.group)) {
      if (values(plan.combat?.combatants).some((member) => groupId(member) === entry.group.id && member.actor?.type !== "npc")) {
        throw new Error("Bitte Spieler und Gegner im Kampftracker aus der gemeinsamen Initiativgruppe trennen.");
      }
    }
    const playerGroups = new Map();
    for (const player of players.filter((row) => row.enabled && row.combatantId)) {
      const group = groupDocument(plan.combat, plan.combat?.combatants.get(player.combatantId));
      if (!group) continue;
      if (playerGroups.has(group.id) && playerGroups.get(group.id) !== player.initiative) {
        throw new Error("Spieler in derselben Initiativgruppe benötigen denselben Initiativewert.");
      }
      playerGroups.set(group.id, player.initiative);
    }
    const rolls = new Map();
    for (const entry of entries) {
      if (!rolls.has(entry.key)) rolls.set(entry.key, await this.#roll(entry.token.actor));
      if (!Number.isFinite(rolls.get(entry.key))) throw new Error(`Ungültiger Initiativewurf für ${entry.token.name}.`);
    }
    check(); // No writes before all form fields and rolls have succeeded.
    let combat = plan.combat;
    const undo = [];
    const oldCurrent = this.#game.combat;
    const restore = async () => {
      const errors = [];
      for (const action of undo.reverse()) { try { await action(); } catch (error) { errors.push(error.message); } }
      return errors;
    };
    try {
      if (!combat) {
        combat = await this.#createCombat({ scene: scene.id, active: false });
        if (!combat) throw new Error("Encounter konnte nicht angelegt werden.");
        undo.push(() => {
          if (values(combat.combatants).length) throw new Error("Der neue Encounter enthält inzwischen weitere Teilnehmer und wurde beibehalten");
          return combat.delete();
        });
      }
      const activeId = combat.combatant?.id;
      const turn = combat.turn;
      const restoreTurn = async () => {
        combat.setupTurns();
        const index = activeId ? combat.turns.findIndex((entry) => entry.id === activeId) : turn;
        if (index !== undefined && index !== null && index >= 0 && combat.turn !== index) await combat.update({ turn: index });
      };
      undo.push(restoreTurn);
      const creates = [];
      const updates = [];
      const previous = [];
      const groups = new Map();
      const previousGroups = new Map();
      for (const entry of entries) {
        const initiative = rolls.get(entry.key);
        if (entry.group) {
          groups.set(entry.group.id, { _id: entry.group.id, initiative });
          previousGroups.set(entry.group.id, { _id: entry.group.id, initiative: entry.group.initiative ?? null });
        }
        if (entry.matches.length) for (const member of entry.matches) {
          previous.push({ _id: member.id, initiative: member.initiative ?? null });
          updates.push({ _id: member.id, initiative });
        } else creates.push({ tokenId: entry.token.id, actorId: entry.token.actorId ?? entry.token.actor.id,
          name: entry.token.name, img: entry.token.texture?.src ?? entry.token.actor.img,
          hidden: Boolean(entry.token.hidden), initiative });
      }
      for (const player of players.filter((row) => row.enabled)) {
        const existing = player.combatantId ? combat.combatants.get(player.combatantId) : null;
        if (existing) {
          previous.push({ _id: existing.id, initiative: existing.initiative ?? null });
          updates.push({ _id: existing.id, initiative: player.initiative });
          const group = groupDocument(combat, existing);
          if (group) {
            if (groups.has(group.id) && groups.get(group.id).initiative !== player.initiative) {
              throw new Error("Spieler in derselben Initiativgruppe benötigen denselben Initiativewert.");
            }
            groups.set(group.id, { _id: group.id, initiative: player.initiative });
            previousGroups.set(group.id, { _id: group.id, initiative: group.initiative ?? null });
          }
        } else {
          const actor = player.actorId ? this.#game.actors.get(player.actorId) : null;
          creates.push({ name: player.name, actorId: player.actorId ?? null, tokenId: player.tokenId ?? null,
            img: actor?.img ?? "icons/svg/mystery-man.svg", initiative: player.initiative, hidden: false,
            flags: { [MODULE_ID]: { playerPlaceholder: { actorId: player.actorId ?? null } } } });
        }
      }
      // Register inverses before writes: a rejected batch may already have partially applied.
      if (groups.size) {
        undo.push(() => combat.updateEmbeddedDocuments("CombatantGroup", [...previousGroups.values()]));
        await combat.updateEmbeddedDocuments("CombatantGroup", [...groups.values()]);
      }
      if (updates.length) {
        undo.push(() => combat.updateEmbeddedDocuments("Combatant", previous));
        await combat.updateEmbeddedDocuments("Combatant", updates);
        if (updates.some((update) => combat.combatants.get(update._id)?.initiative !== update.initiative)) {
          throw new Error("Nicht alle Initiativewerte wurden gespeichert.");
        }
      }
      if ([...groups.values()].some((update) => combat.groups.get(update._id)?.initiative !== update.initiative)) {
        throw new Error("Nicht alle Gruppen-Initiativen wurden gespeichert.");
      }
      if (creates.length) {
        const run = foundry.utils.randomID();
        creates.forEach((data) => { data.flags ??= {}; data.flags[MODULE_ID] ??= {}; data.flags[MODULE_ID].preparationRun = run; });
        undo.push(async () => {
          const ids = values(combat.combatants).filter((entry) => flag(entry, MODULE_ID, "preparationRun") === run).map((entry) => entry.id);
          if (ids.length) await combat.deleteEmbeddedDocuments("Combatant", ids);
        });
        const created = await combat.createEmbeddedDocuments("Combatant", creates);
        if (created.length !== creates.length) throw new Error("Nicht alle Kampfteilnehmer konnten angelegt werden.");
      }
      for (const actor of lairs) {
        const inside = Boolean(submission.lairs.find((row) => row.uuid === actor.uuid).inside);
        const previousInside = Boolean(actor.system.resources.lair.inside);
        if (inside === previousInside) continue;
        undo.push(() => actor.update({ "system.resources.lair.inside": previousInside }));
        await actor.update({ "system.resources.lair.inside": inside });
        if (Boolean(actor.system.resources.lair.inside) !== inside) throw new Error(`Hort-Status für ${actor.name} wurde nicht gespeichert.`);
      }
      const oldRoster = this.#game.settings.get(MODULE_ID, SETTING_KEYS.encounterPlayers) ?? [];
      undo.push(() => this.#game.settings.set(MODULE_ID, SETTING_KEYS.encounterPlayers, oldRoster));
      await this.#game.settings.set(MODULE_ID, SETTING_KEYS.encounterPlayers,
        players.map(({ actorId, name, enabled }) => ({ actorId: actorId ?? null, name, enabled })));
      await restoreTurn();
      if (!combat.active) {
        undo.push(async () => { if (oldCurrent) await oldCurrent.activate(); else await combat.update({ active: false }); });
        await combat.activate();
      }
      plan.result = { combatId: combat.id, npcCount: entries.length, rollCount: rolls.size,
        playerCount: players.filter((row) => row.enabled).length };
      return plan.result;
    } catch (error) {
      const failures = await restore();
      // A rollback may recreate group/order data. Require a fresh preview before another mutation.
      plan.created = 0;
      throw new Error(failures.length ? `${error.message} Rücknahme unvollständig: ${failures.join(" · ")}. Bitte den Kampftracker prüfen.`
        : `${error.message} Änderungen wurden zurückgenommen; bitte die Vorbereitung neu öffnen.`);
    }
  }
}
