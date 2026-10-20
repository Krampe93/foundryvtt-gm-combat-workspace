import { MODULE_ID } from "./config.js";
import { EventBus } from "./core/event-bus.js";
import { createLogger } from "./core/logger.js";
import { CombatCoordinator } from "./services/combat-coordinator.js";
import { WorkspaceBridge } from "./services/workspace-bridge.js";
import { CombatRollRules } from "./services/combat-roll-rules.js";
import { registerSettings } from "./settings.js";

const eventBus = new EventBus();
let combatCoordinator = null;
let workspaceBridge = null;
let combatRollRules = null;

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

  combatRollRules = new CombatRollRules({ eventBus });
  combatRollRules.start();

  workspaceBridge = new WorkspaceBridge({
    eventBus,
    rollRules: combatRollRules,
    getSnapshot: () => combatCoordinator?.snapshot ?? null
  });
  workspaceBridge.start();

  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = Object.freeze({
      events: eventBus,
      getCombatSnapshot: () => combatCoordinator?.snapshot ?? null,
      openWorkspace: () => workspaceBridge?.openWorkspace() ?? false,
      isWorkspaceWindow: workspaceBridge.workspaceMode
    });
  }
});

Hooks.once("shutdown", () => {
  workspaceBridge?.stop();
  workspaceBridge = null;
  combatRollRules?.stop();
  combatRollRules = null;
  combatCoordinator?.stop();
  eventBus.clear();
  combatCoordinator = null;
});
