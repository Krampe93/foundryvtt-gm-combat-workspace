import { MODULE_ID } from "./config.js";
import { EventBus } from "./core/event-bus.js";
import { createLogger } from "./core/logger.js";
import { CombatCoordinator } from "./services/combat-coordinator.js";
import { registerSettings } from "./settings.js";

const eventBus = new EventBus();
let combatCoordinator = null;

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("ready", () => {
  if (!game.user.isGM) return;

  const logger = createLogger();
  logger.debug("Ready", {
    foundry: game.version,
    system: game.system.version
  });

  combatCoordinator = new CombatCoordinator({
    eventBus
  });
  combatCoordinator.start();

  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = Object.freeze({
      events: eventBus,
      getCombatSnapshot: () => combatCoordinator?.snapshot ?? null
    });
  }
});

Hooks.once("shutdown", () => {
  combatCoordinator?.stop();
  eventBus.clear();
  combatCoordinator = null;
});
