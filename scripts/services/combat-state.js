const MONKS_COMBAT_DETAILS_ID = "monks-combat-details";

function readFlag(document, moduleId, key) {
  try {
    return document?.getFlag?.(moduleId, key);
  } catch (_error) {
    return undefined;
  }
}

export function classifyCombatant(combatant) {
  if (!combatant) return "none";

  const actor = combatant.actor ?? null;
  const isMonksPlaceholder =
    readFlag(combatant, MONKS_COMBAT_DETAILS_ID, "placeholder") === true ||
    Boolean(readFlag(combatant, MONKS_COMBAT_DETAILS_ID, "playerPlaceholder"));

  if (!actor || isMonksPlaceholder) return "placeholder";
  if (actor.type === "npc") return "npc";
  if (actor.type === "character") return "player";

  const hasPlayerOwner = Object.values(actor.ownership ?? {})
    .some((level) => Number(level) >= 3);

  return hasPlayerOwner ? "player" : "other";
}

export function resolveCombatScene(combat) {
  if (!combat) return null;

  if (combat.scene && typeof combat.scene === "object") {
    return combat.scene;
  }

  const sceneId = combat.sceneId ?? combat.scene ?? null;
  return sceneId ? game.scenes?.get(sceneId) ?? null : null;
}

export function resolveCombatantToken(combatant, scene) {
  if (!combatant) return null;

  if (combatant.token && typeof combatant.token === "object") {
    return combatant.token;
  }

  const tokenId = combatant.tokenId ?? null;
  return tokenId ? scene?.tokens?.get(tokenId) ?? null : null;
}

function summarizeCombatant(combatant, scene) {
  const actor = combatant.actor ?? null;
  const token = resolveCombatantToken(combatant, scene);

  return {
    id: combatant.id ?? null,
    name: combatant.name ?? actor?.name ?? token?.name ?? null,
    type: classifyCombatant(combatant),
    actorId: actor?.id ?? combatant.actorId ?? null,
    actorUuid: actor?.uuid ?? null,
    tokenId: token?.id ?? combatant.tokenId ?? null,
    tokenPresent: Boolean(token),
    initiative: combatant.initiative ?? null,
    hidden: Boolean(combatant.hidden ?? token?.hidden),
    defeated: Boolean(combatant.defeated ?? combatant.isDefeated)
  };
}

export function createCombatSnapshot(combat) {
  if (!combat) {
    return {
      combatId: null,
      sceneId: null,
      started: false,
      round: null,
      turn: null,
      activeCombatantId: null,
      activeType: "none",
      activeActorId: null,
      activeTokenId: null,
      activeHidden: false,
      combatants: [],
      context: null,
      signature: "none"
    };
  }

  const scene = resolveCombatScene(combat);
  const combatants = Array.from(combat.combatants ?? [])
    .map((combatant) => summarizeCombatant(combatant, scene));
  const activeCombatant = combat.combatant ?? null;
  const activeActor = activeCombatant?.actor ?? null;
  const activeToken = resolveCombatantToken(activeCombatant, scene);
  const started = Boolean(
    combat.started ??
    (combat.round !== null && combat.round !== undefined)
  );

  const summary = {
    combatId: combat.id ?? null,
    sceneId: scene?.id ?? combat.sceneId ?? null,
    started,
    round: combat.round ?? null,
    turn: combat.turn ?? null,
    activeCombatantId: activeCombatant?.id ?? null,
    activeType: classifyCombatant(activeCombatant),
    activeActorId: activeActor?.id ?? activeCombatant?.actorId ?? null,
    activeTokenId: activeToken?.id ?? activeCombatant?.tokenId ?? null,
    activeHidden: Boolean(activeCombatant?.hidden ?? activeToken?.hidden),
    combatants
  };

  return {
    ...summary,
    context: {
      combat,
      scene,
      combatant: activeCombatant,
      actor: activeActor,
      token: activeToken
    },
    signature: JSON.stringify(summary)
  };
}

export function diffCombatSnapshots(previous, current) {
  if (previous.signature === current.signature) return [];

  const events = [];
  const sameCombat =
    previous.combatId !== null &&
    previous.combatId === current.combatId;

  if (previous.started && (!current.started || !sameCombat)) {
    events.push({
      name: "combatEnded",
      snapshot: previous
    });
  }

  if (current.started && (!previous.started || !sameCombat)) {
    events.push({
      name: "combatStarted",
      snapshot: current
    });
  }

  if (sameCombat && previous.started && current.started) {
    if (previous.round !== current.round) {
      events.push({
        name: "roundChanged",
        snapshot: current,
        previousValue: previous.round,
        value: current.round
      });
    }

    if (previous.turn !== current.turn) {
      events.push({
        name: "turnChanged",
        snapshot: current,
        previousValue: previous.turn,
        value: current.turn
      });
    }
  }

  if (
    current.started &&
    (
      !previous.started ||
      !sameCombat ||
      previous.activeCombatantId !== current.activeCombatantId
    )
  ) {
    events.push({
      name: "activeCombatantChanged",
      snapshot: current,
      previousValue: previous.activeCombatantId,
      value: current.activeCombatantId
    });
  }

  events.push({
    name: "combatStateChanged",
    snapshot: current,
    previousSnapshot: previous
  });

  return events;
}
