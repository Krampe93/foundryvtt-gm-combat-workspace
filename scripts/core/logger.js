import { MODULE_ID, SETTING_KEYS } from "../config.js";

function isDebugEnabled() {
  try {
    return game.settings.get(MODULE_ID, SETTING_KEYS.debugMode) === true;
  } catch (_error) {
    return false;
  }
}

export function createLogger(scope = null) {
  const prefix = scope
    ? `${MODULE_ID} | ${scope}`
    : MODULE_ID;

  return Object.freeze({
    debug(message, data) {
      if (!isDebugEnabled()) return;

      if (data === undefined) {
        console.debug(`${prefix} | ${message}`);
      } else {
        console.debug(`${prefix} | ${message}`, data);
      }
    },

    info(message, data) {
      if (data === undefined) {
        console.info(`${prefix} | ${message}`);
      } else {
        console.info(`${prefix} | ${message}`, data);
      }
    },

    warn(message, data) {
      if (data === undefined) {
        console.warn(`${prefix} | ${message}`);
      } else {
        console.warn(`${prefix} | ${message}`, data);
      }
    },

    error(message, error) {
      console.error(`${prefix} | ${message}`, error);
    }
  });
}
