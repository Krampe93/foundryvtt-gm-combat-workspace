import { MODULE_ID } from "../config.js";
import { createLogger } from "../core/logger.js";

function values(collection) {
  return Array.from(collection?.values?.() ?? collection ?? []);
}

export function keptD20(roll) {
  const die = roll?.d20 ?? values(roll?.dice).find((term) => Number(term.faces) === 20) ??
    values(roll?.terms).find((term) => Number(term.faces) === 20);
  const active = die?.results?.filter((result) => result.active !== false && result.discarded !== true) ?? [];
  return active.length === 1 ? Number(active[0].result) : null;
}

function actorKey(actor) {
  return actor?.uuid ?? actor?.id;
}

function flag(data, key) {
  return data?.flags?.[MODULE_ID]?.[key] ?? data?.[`flags.${MODULE_ID}.${key}`];
}

function inheritedRollMode(source) {
  if (source?.blind) return "blindroll";
  if (!source?.whisper) return undefined;
  if (!source.whisper.length) return "publicroll";
  return source.whisper.length === 1 && source.whisper[0] === game.user?.id ? "selfroll" : "gmroll";
}

export class AttackLedger {
  #records = new Map();
  #sequence = 0;
  #retired = new Set();
  #consumed = new Set();

  remember(record) {
    if (this.#retired.has(record.id)) return;
    const previous = this.#records.get(record.id);
    this.#records.set(record.id, { ...record, groupId: record.groupId ?? previous?.groupId,
      sequence: previous?.sequence ?? ++this.#sequence });
  }

  find({ actor, itemId, activityId, groupId }) {
    const candidates = [...this.#records.values()].filter((record) => record.actor === actor);
    return candidates.filter((record) => groupId ? record.groupId === groupId :
      record.itemId === itemId && (!activityId || !record.activityId || record.activityId === activityId)
    ).sort((a, b) => b.sequence - a.sequence)[0] ?? null;
  }

  consume(id) {
    this.#consumed.add(id);
  }

  isConsumed(id) {
    return this.#consumed.has(id);
  }

  clear() {
    for (const id of this.#records.keys()) this.#retired.add(id);
    this.#records.clear();
  }
}

/** Use D&D5e's native powerful critical: ordinary dice + their maximum; flat bonuses once. */
export function configureMaxCritical(config, rollConfig = null) {
  const critical = { powerfulCritical: true, multiplyNumeric: false, multiplier: 2 };
  config.isCritical = true;
  config.critical = { ...config.critical, ...critical };
  for (const roll of rollConfig ? [rollConfig] : config.rolls ?? []) {
    roll.options ??= {};
    if (roll.options.critical?.allow === false) continue;
    roll.options.isCritical = true;
    roll.options.critical = { ...roll.options.critical, ...critical };
  }
}

function configureNormalDamage(config, rollConfig = null) {
  config.isCritical = false;
  for (const roll of rollConfig ? [rollConfig] : config.rolls ?? []) {
    roll.options ??= {};
    roll.options.isCritical = false;
  }
}

function snapshotKey(snapshot) {
  return JSON.stringify([snapshot?.combatId, snapshot?.started, snapshot?.round, snapshot?.turn, snapshot?.activeCombatantId]);
}

export class CombatRollRules {
  #eventBus;
  #logger;
  #hooks = [];
  #unsubscribe = null;
  #ledger = new AttackLedger();
  #seenRolls = new WeakSet();
  #criticalProcesses = new WeakMap();
  #bonusBusy = new Set();

  constructor({ eventBus, logger = createLogger("CombatRollRules") }) {
    this.#eventBus = eventBus;
    this.#logger = logger;
  }

  #on(name, callback) {
    this.#hooks.push([name, Hooks.on(name, callback)]);
  }

  start() {
    const remember = (message) => {
      try {
        this.#consumeDamage(message.rolls);
        this.#rememberMessage(message);
      }
      catch (error) { this.#logger.error("Attack context could not be read", error); }
    };
    this.#on("createChatMessage", remember);
    this.#on("updateChatMessage", (message, changes) => {
      if (changes?.rolls || changes?.flags?.rsreforged?.rolls || changes?.["flags.rsreforged.rolls"]) remember(message);
    });
    for (const name of ["dnd5e.rollAttack", "dnd5e.rollAttackV2"]) {
      this.#on(name, (rolls, data) => this.#afterAttack(rolls, data));
    }
    this.#on("dnd5e.postAttackRollConfiguration", (rolls, config) => {
      if (config.subject?.actor?.type !== "npc") return;
      // Persist identity through ChatMessage serialization and both attack hook aliases.
      for (const roll of values(rolls)) this.#attackId(roll);
    });
    for (const name of ["dnd5e.rollDamage", "dnd5e.rollDamageV2"]) {
      this.#on(name, (rolls) => this.#consumeDamage(rolls));
    }
    for (const name of ["dnd5e.preRollDamage", "dnd5e.preRollDamageV2"]) {
      this.#on(name, (config, _dialog, message) => {
        const subject = config.subject;
        if (subject?.actor?.type !== "npc") return;
        const groupId = flag(message?.data, "rollGroupId") ?? message?.data?.flags?.dnd5e?.originatingMessage ??
          message?.data?.["flags.dnd5e.originatingMessage"];
        const source = this.#ledger.find({ actor: actorKey(subject.actor), itemId: subject.item?.id, activityId: subject.id, groupId });
        if (source?.face !== 20) return;
        this.#criticalProcesses.set(config, source);
        this.#configureCritical(config, source);
      });
    }
    this.#on("dnd5e.postBuildDamageRollConfig", (config, rollConfig) => {
      const source = this.#criticalProcesses.get(config);
      if (source) this.#configureCritical(config, source, rollConfig);
    });
    this.#on("dnd5e.postDamageRollConfiguration", (rolls, config) => {
      const source = this.#criticalProcesses.get(config);
      if (!source || config.evaluate === false) return;
      // A cancelled dialog never reaches a successful evaluated roll/message.
      // Recheck here as another damage roll may have finished while this dialog was open.
      const consumed = this.#ledger.isConsumed(source.id);
      for (const roll of values(rolls)) {
        roll.options ??= {};
        if (consumed) {
          roll.options.isCritical = false;
          roll.configureDamage?.();
        } else {
          roll.options[MODULE_ID] = { ...roll.options[MODULE_ID], criticalAttackId: source.id };
        }
      }
    });
    this.#unsubscribe = this.#eventBus.on("combatStateChanged", ({ previousSnapshot, snapshot }) => {
      if (snapshotKey(previousSnapshot) !== snapshotKey(snapshot)) this.#ledger.clear();
    });
  }

  stop() {
    for (const [name, id] of this.#hooks) Hooks.off(name, id);
    this.#hooks = [];
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#ledger.clear();
  }

  #attackId(roll, fallback) {
    roll.options ??= {};
    roll.options[MODULE_ID] ??= {};
    return roll.options[MODULE_ID].attackId ??= fallback ?? foundry.utils.randomID();
  }

  #configureCritical(config, source, rollConfig = null) {
    if (this.#ledger.isConsumed(source.id)) configureNormalDamage(config, rollConfig);
    else configureMaxCritical(config, rollConfig);
  }

  #consumeDamage(rolls) {
    for (const roll of values(rolls)) {
      const id = roll?.options?.[MODULE_ID]?.criticalAttackId;
      if (id && roll.evaluated !== false && roll._evaluated !== false) this.#ledger.consume(id);
    }
  }

  #rememberMessage(message) {
    if (message.flags?.dnd5e?.roll?.type !== "attack" || message.flags?.[MODULE_ID]?.kind) return;
    const actor = message.getAssociatedActor?.() ?? game.scenes?.get(message.speaker?.scene)?.tokens?.get(message.speaker?.token)?.actor ?? game.actors?.get(message.speaker?.actor);
    if (actor?.type !== "npc") return;
    const rolls = values(message.rolls);
    const groupId = flag(message, "rollGroupId") ?? message.flags?.dnd5e?.originatingMessage ?? message.id;
    for (const [index, roll] of rolls.entries()) {
      if (roll.constructor?.name === "DamageRoll" || roll.class === "DamageRoll") continue;
      const face = keptD20(roll);
      if (face === null) continue;
      this.#ledger.remember({ id: this.#attackId(roll, `${message.id}:${index}`), actor: actorKey(actor),
        itemId: message.flags?.dnd5e?.item?.id, activityId: message.flags?.dnd5e?.activity?.id,
        groupId, face, whisper: message.whisper, blind: message.blind });
    }
  }

  #afterAttack(rolls, data) {
    const activity = data?.subject;
    if (activity?.actor?.type !== "npc") return;
    for (const roll of values(rolls)) {
      if (!roll || typeof roll !== "object" || this.#seenRolls.has(roll)) continue;
      this.#seenRolls.add(roll);
      const face = keptD20(roll);
      if (face === null) continue;
      const source = this.#ledger.find({ actor: actorKey(activity.actor), itemId: activity.item?.id, activityId: activity.id });
      this.#ledger.remember({ id: this.#attackId(roll), actor: actorKey(activity.actor), itemId: activity.item?.id,
        activityId: activity.id, groupId: source?.id === this.#attackId(roll) ? source.groupId : undefined,
        face, whisper: source?.whisper, blind: source?.blind });
      if (![1, 20].includes(face)) continue;
      this.#createAttackExtra(activity, face, source).catch((error) => {
        this.#logger.error("Automatic attack extra roll failed", error);
        ui.notifications?.error(`Zusatz-W20 konnte nicht gewürfelt werden: ${error.message}`);
      });
    }
  }

  async #createAttackExtra(activity, face, source) {
    const roll = await new Roll("1d20").evaluate();
    const extraGroupId = foundry.utils.randomID();
    const data = {
      speaker: ChatMessage.getSpeaker({ actor: activity.actor }),
      flavor: `${activity.item?.name ?? "Angriff"}: ${face === 1 ? "Patzer" : "Krit"}-Zusatzwurf`,
      flags: {
        [MODULE_ID]: { kind: "attackExtra", sourceNatural: face, rollGroupId: extraGroupId },
        dnd5e: { item: { id: activity.item?.id, uuid: activity.item?.uuid } }
      }
    };
    if (source?.whisper) data.whisper = [...source.whisper];
    if (source?.blind !== undefined) data.blind = source.blind;
    await roll.toMessage(data, { rollMode: inheritedRollMode(source) });
  }

  async rollExtraDice(messageId) {
    if (this.#bonusBusy.has(messageId)) return;
    const message = game.messages?.get(messageId);
    const flags = message?.flags?.[MODULE_ID];
    if (flags?.kind !== "attackExtra" || flags.extraDiceRolled) return;
    this.#bonusBusy.add(messageId);
    try {
      const roll = await new Roll("2d6").evaluate();
      const result = await roll.toMessage({
        speaker: message.speaker, whisper: [...message.whisper ?? []], blind: message.blind,
        flavor: `${flags.sourceNatural === 1 ? "Patzer" : "Krit"}: freiwilliger 2W6-Zusatzwurf`,
        flags: { [MODULE_ID]: { kind: "extraDice", sourceNatural: flags.sourceNatural, rollGroupId: flags.rollGroupId },
          dnd5e: { item: message.flags.dnd5e?.item } }
      }, { rollMode: inheritedRollMode(message) });
      if (result) await message.setFlag(MODULE_ID, "extraDiceRolled", true);
    } finally {
      this.#bonusBusy.delete(messageId);
    }
  }
}
