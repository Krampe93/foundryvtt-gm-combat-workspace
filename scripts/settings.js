import { MODULE_ID, SETTING_KEYS } from "./config.js";

const CLIENT_BOOLEAN_SETTINGS = [
  {
    key: SETTING_KEYS.debugMode,
    name: "GMCOMBAT.Settings.DebugMode.Name",
    hint: "GMCOMBAT.Settings.DebugMode.Hint",
    default: false
  },
  {
    key: SETTING_KEYS.openNpcSheetOnTurn,
    name: "GMCOMBAT.Settings.OpenNpcSheet.Name",
    hint: "GMCOMBAT.Settings.OpenNpcSheet.Hint",
    default: true
  },
  {
    key: SETTING_KEYS.closePreviousNpcSheet,
    name: "GMCOMBAT.Settings.ClosePreviousNpcSheet.Name",
    hint: "GMCOMBAT.Settings.ClosePreviousNpcSheet.Hint",
    default: true
  },
  {
    key: SETTING_KEYS.selectActiveNpcToken,
    name: "GMCOMBAT.Settings.SelectActiveNpcToken.Name",
    hint: "GMCOMBAT.Settings.SelectActiveNpcToken.Hint",
    default: true
  },
  {
    key: SETTING_KEYS.panToActiveNpc,
    name: "GMCOMBAT.Settings.PanToActiveNpc.Name",
    hint: "GMCOMBAT.Settings.PanToActiveNpc.Hint",
    default: false
  },
  {
    key: SETTING_KEYS.hiddenMovementTracker,
    name: "GMCOMBAT.Settings.HiddenMovement.Name",
    hint: "GMCOMBAT.Settings.HiddenMovement.Hint",
    default: true
  }
];

export function registerSettings() {
  for (const setting of CLIENT_BOOLEAN_SETTINGS) {
    game.settings.register(MODULE_ID, setting.key, {
      name: setting.name,
      hint: setting.hint,
      scope: "client",
      config: true,
      type: Boolean,
      default: setting.default
    });
  }
}
