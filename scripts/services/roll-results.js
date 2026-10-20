import { MODULE_ID } from "../config.js";

const KIND_LABELS = { attack: "Angriff", damage: "Schaden", save: "Rettungswurf", check: "Probe", roll: "Wurf" };
const ABILITIES = { str: "Stärke", dex: "Geschicklichkeit", con: "Konstitution", int: "Intelligenz", wis: "Weisheit", cha: "Charisma" };

function escape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function values(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (typeof collection.values === "function") return Array.from(collection.values());
  return Object.values(collection);
}

function number(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function diceIn(term) {
  if (term?.faces && Array.isArray(term.results)) return [term];
  return [
    ...values(term?.terms).flatMap(diceIn),
    ...values(term?.rolls).flatMap((roll) => values(roll?.terms).flatMap(diceIn)),
    ...values(term?.roll?.terms).flatMap(diceIn)
  ];
}

function dieDetail(die) {
  return {
    text: `${die.number ?? 1}W${die.faces}`,
    results: die.results.map((result) => ({
      value: result.result,
      discarded: result.active === false || result.discarded === true
    }))
  };
}

function termDetails(term) {
  if (term?.faces && Array.isArray(term.results)) return [dieDetail(term)];
  if (term?.operator) return [{ text: term.operator }];
  if (number(term?.number) !== null) return [{ text: String(term.number) }];
  if (term?.terms?.length) return [{ text: "(" }, ...term.terms.flatMap(termDetails), { text: ")" }];
  if (term?.roll?.terms) return [{ text: "(" }, ...term.roll.terms.flatMap(termDetails), { text: ")" }];
  if (term?.rolls?.length) return term.rolls.flatMap((roll, index) => [
    ...(index ? [{ text: ";" }] : []), ...values(roll.terms).flatMap(termDetails)
  ]);
  return term?.expression ? [{ text: String(term.expression) }] : [];
}

function rollKind(message, roll) {
  // RSReforged combines attack and damage rolls on one attack-flagged message.
  if (roll?.constructor?.name === "DamageRoll" || roll?.class === "DamageRoll") return "damage";
  const type = String(message.flags?.dnd5e?.roll?.type ?? "").toLowerCase();
  if (type === "attack") return "attack";
  if (type === "damage" || type === "healing") return "damage";
  if (["save", "savingthrow", "death"].includes(type)) return "save";
  if (["ability", "check", "skill", "tool"].includes(type)) return "check";
  return values(roll?.terms).flatMap(diceIn).some((die) => Number(die.faces) === 20) ? "check" : "roll";
}

/** Read evaluated rolls only. Never evaluate or modify Foundry's roll objects. */
export function rollMessageEntry(message, { actor, item, damageLabel = (type) => type } = {}) {
  if (!message?.id || actor?.type !== "npc" || message.visible === false || message.isContentVisible === false) return null;
  const sourceRolls = values(message.rolls);
  const rows = (sourceRolls.length ? sourceRolls : values(message.flags?.rsreforged?.rolls)).flatMap((roll, index) => {
    if (number(roll?.total) === null) return [];
    const kind = rollKind(message, roll);
    const dice = values(roll.terms).flatMap(diceIn);
    const d20 = dice.find((die) => Number(die.faces) === 20);
    const active = d20?.results.filter((result) => result.active !== false && result.discarded !== true) ?? [];
    const face = active.length === 1 ? number(active[0].result) : null;
    const natural = kind !== "damage" && [1, 20].includes(face) ? face : null;
    const details = natural ? dice.map(dieDetail) : values(roll.terms).flatMap(termDetails);
    if (!details.length && !natural) details.push({ text: String(roll.formula ?? roll.total) });
    const type = roll.options?.type ?? roll.options?.damageType ?? null;
    const ability = message.flags?.dnd5e?.roll?.abilityId ?? message.flags?.dnd5e?.roll?.ability;
    return [{
      id: `${message.id}:${index}`, kind, natural,
      total: natural ?? roll.total,
      label: kind === "damage" && type ? String(damageLabel(type)) :
        kind === "save" && ABILITIES[ability] ? `${KIND_LABELS[kind]} · ${ABILITIES[ability]}` : KIND_LABELS[kind],
      details
    }];
  });
  if (!rows.length) return null;
  const flags = message.flags ?? {};
  return {
    messageId: message.id,
    groupId: flags[MODULE_ID]?.rollGroupId ?? flags.dnd5e?.originatingMessage ?? message.id,
    actorName: message.speaker?.alias || actor.name || "Gegner",
    title: item?.name || String(message.flavor ?? "Würfelergebnis").replace(/<[^>]*>/g, "").trim(),
    rows
  };
}

export function rollMessageConfig(rollGroupId) {
  return { data: { flags: { [MODULE_ID]: { rollGroupId } } } };
}

function turnKey(snapshot) {
  return JSON.stringify([snapshot?.combatId, snapshot?.started, snapshot?.round, snapshot?.turn, snapshot?.activeCombatantId]);
}

export class RollHistory {
  entries = [];
  #messages = new Map();
  #cleared = new Set();

  add(piece) {
    if (!piece || this.#cleared.has(piece.messageId)) return false;
    const previous = this.#messages.get(piece.messageId);
    let entry = previous ?? this.entries.find(({ id }) => id === piece.groupId);
    if (!entry) {
      entry = { id: piece.groupId, actorName: piece.actorName, title: piece.title, stale: false, missed: false, pieces: new Map() };
      this.entries.unshift(entry);
    }
    entry.pieces.set(piece.messageId, piece);
    this.#messages.set(piece.messageId, entry);
    return true;
  }

  advance(previous, current) {
    if (turnKey(previous) === turnKey(current)) return false;
    for (const entry of this.entries) entry.stale = true;
    return true;
  }

  markMiss(groupId) {
    const entry = this.entries.find(({ id }) => id === groupId);
    if (entry) entry.missed = true;
  }

  remove(messageId) {
    const entry = this.#messages.get(messageId);
    if (!entry) return;
    entry.pieces.delete(messageId);
    this.#messages.delete(messageId);
    if (!entry.pieces.size) this.entries = this.entries.filter((candidate) => candidate !== entry);
  }

  clear() {
    for (const id of this.#messages.keys()) this.#cleared.add(id);
    this.entries = [];
    this.#messages.clear();
  }
}

function renderDetails(details) {
  return details.map(({ text, results }) => `${escape(text)}${results ? ` [${results.map(({ value, discarded }) =>
    discarded ? `<s class="gm-workspace-roll-discarded">${escape(value)}</s>` : `<b>${escape(value)}</b>`
  ).join(", ")}]` : ""}`).join(" ");
}

export function renderRollHistory(history) {
  if (!history.entries.length) return '<p class="gm-workspace-roll-empty">Noch keine Gegnerwürfe. Neue Ergebnisse erscheinen hier.</p>';
  return history.entries.map((entry) => {
    const rows = Array.from(entry.pieces.values()).flatMap((piece) => piece.rows);
    const damages = rows.filter(({ kind }) => kind === "damage");
    return `<article class="gm-workspace-roll-card${entry.stale ? " is-previous-turn" : ""}">
      <header><strong>${escape(entry.actorName)}</strong><span>${escape(entry.title)}</span>${entry.stale ? '<small>Vorheriger Zug</small>' : ""}</header>
      ${rows.map((row) => `<div class="gm-workspace-roll-row${row.natural ? ` is-natural-${row.natural}` : ""}">
        <div class="gm-workspace-roll-result"><span>${escape(row.label)}</span><strong>${row.natural ? `NAT ${row.natural}` : escape(row.total)}</strong></div>
        <p class="gm-workspace-roll-details">${renderDetails(row.details)}</p>
      </div>`).join("")}
      ${damages.length > 1 ? `<div class="gm-workspace-roll-sum">Gesamtschaden <strong>${damages.reduce((sum, row) => sum + row.total, 0)}</strong></div>` : ""}
      ${entry.missed ? '<p class="gm-workspace-roll-miss">Verfehlt</p>' : ""}
    </article>`;
  }).join("");
}
