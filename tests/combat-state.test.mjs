import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyCombatant,
  createCombatSnapshot,
  diffCombatSnapshots
} from "../scripts/services/combat-state.js";

globalThis.game = {
  scenes: new Map()
};

function actor(id, type, ownership = {}) {
  return {
    id,
    uuid: `Actor.${id}`,
    name: id,
    type,
    ownership
  };
}

function combatant({
  id,
  actor: combatantActor = null,
  tokenId = null,
  initiative = null,
  hidden = false,
  flags = {}
}) {
  return {
    id,
    name: id,
    actor: combatantActor,
    actorId: combatantActor?.id ?? null,
    tokenId,
    initiative,
    hidden,
    getFlag(moduleId, key) {
      return flags[moduleId]?.[key];
    }
  };
}

function combat({
  id = "combat-1",
  started = true,
  round = 1,
  turn = 0,
  entries = [],
  activeIndex = 0
} = {}) {
  const scene = {
    id: "scene-1",
    tokens: new Map(
      entries
        .filter((entry) => entry.tokenId)
        .map((entry) => [
          entry.tokenId,
          {
            id: entry.tokenId,
            hidden: entry.hidden
          }
        ])
    )
  };

  return {
    id,
    scene,
    started,
    round,
    turn,
    combatants: entries,
    combatant: entries[activeIndex] ?? null
  };
}

test("classifies NPCs, players, and placeholders", () => {
  assert.equal(
    classifyCombatant(combatant({
      id: "npc",
      actor: actor("npc", "npc")
    })),
    "npc"
  );

  assert.equal(
    classifyCombatant(combatant({
      id: "player",
      actor: actor("player", "character")
    })),
    "player"
  );

  assert.equal(
    classifyCombatant(combatant({
      id: "placeholder"
    })),
    "placeholder"
  );

  assert.equal(
    classifyCombatant(combatant({
      id: "monks-placeholder",
      actor: actor("linked", "character"),
      flags: {
        "monks-combat-details": {
          placeholder: true
        }
      }
    })),
    "placeholder"
  );
});

test("creates a resolved active NPC snapshot", () => {
  const npc = combatant({
    id: "goblin",
    actor: actor("goblin-actor", "npc"),
    tokenId: "goblin-token",
    initiative: 14,
    hidden: true
  });
  const snapshot = createCombatSnapshot(combat({
    entries: [npc]
  }));

  assert.equal(snapshot.activeType, "npc");
  assert.equal(snapshot.activeActorId, "goblin-actor");
  assert.equal(snapshot.activeTokenId, "goblin-token");
  assert.equal(snapshot.activeHidden, true);
  assert.equal(snapshot.context.actor, npc.actor);
  assert.equal(snapshot.context.token.id, "goblin-token");
});

test("emits combat start and active combatant once", () => {
  const empty = createCombatSnapshot(null);
  const npc = combatant({
    id: "goblin",
    actor: actor("goblin-actor", "npc"),
    tokenId: "goblin-token"
  });
  const started = createCombatSnapshot(combat({
    entries: [npc]
  }));

  assert.deepEqual(
    diffCombatSnapshots(empty, started).map(({ name }) => name),
    ["combatStarted", "activeCombatantChanged", "combatStateChanged"]
  );
  assert.deepEqual(diffCombatSnapshots(started, started), []);
});

test("emits one round, turn, and active change for a real turn transition", () => {
  const first = combatant({
    id: "goblin",
    actor: actor("goblin-actor", "npc"),
    tokenId: "goblin-token"
  });
  const second = combatant({
    id: "player",
    actor: actor("player-actor", "character"),
    tokenId: "player-token"
  });
  const previous = createCombatSnapshot(combat({
    round: 1,
    turn: 0,
    entries: [first, second],
    activeIndex: 0
  }));
  const current = createCombatSnapshot(combat({
    round: 2,
    turn: 1,
    entries: [first, second],
    activeIndex: 1
  }));

  assert.deepEqual(
    diffCombatSnapshots(previous, current).map(({ name }) => name),
    [
      "roundChanged",
      "turnChanged",
      "activeCombatantChanged",
      "combatStateChanged"
    ]
  );
});

test("combatant list changes do not create a false turn transition", () => {
  const first = combatant({
    id: "goblin",
    actor: actor("goblin-actor", "npc"),
    tokenId: "goblin-token",
    initiative: 12
  });
  const changed = combatant({
    id: "goblin",
    actor: first.actor,
    tokenId: "goblin-token",
    initiative: 18
  });
  const previous = createCombatSnapshot(combat({
    entries: [first]
  }));
  const current = createCombatSnapshot(combat({
    entries: [changed]
  }));

  assert.deepEqual(
    diffCombatSnapshots(previous, current).map(({ name }) => name),
    ["combatStateChanged"]
  );
});

test("emits combat end when a started combat disappears", () => {
  const npc = combatant({
    id: "goblin",
    actor: actor("goblin-actor", "npc"),
    tokenId: "goblin-token"
  });
  const previous = createCombatSnapshot(combat({
    entries: [npc]
  }));
  const empty = createCombatSnapshot(null);

  assert.deepEqual(
    diffCombatSnapshots(previous, empty).map(({ name }) => name),
    ["combatEnded", "combatStateChanged"]
  );
});
