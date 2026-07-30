import { MODULE_ID } from "./config.js";
import { createLogger } from "./core/logger.js";
import { registerSettings } from "./settings.js";

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
});
