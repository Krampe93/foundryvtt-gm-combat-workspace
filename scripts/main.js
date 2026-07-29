const MODULE_ID = "gm-combat-workspace";

Hooks.once("init", () => {
  console.info(`${MODULE_ID} | Initializing`);

  game.settings.register(MODULE_ID, "openNpcSheetOnTurn", {
    name: "GMCOMBAT.Settings.OpenNpcSheet.Name",
    hint: "GMCOMBAT.Settings.OpenNpcSheet.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "closePreviousNpcSheet", {
    name: "GMCOMBAT.Settings.ClosePreviousNpcSheet.Name",
    hint: "GMCOMBAT.Settings.ClosePreviousNpcSheet.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "selectActiveNpcToken", {
    name: "GMCOMBAT.Settings.SelectActiveNpcToken.Name",
    hint: "GMCOMBAT.Settings.SelectActiveNpcToken.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "panToActiveNpc", {
    name: "GMCOMBAT.Settings.PanToActiveNpc.Name",
    hint: "GMCOMBAT.Settings.PanToActiveNpc.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "hiddenMovementTracker", {
    name: "GMCOMBAT.Settings.HiddenMovement.Name",
    hint: "GMCOMBAT.Settings.HiddenMovement.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });
});

Hooks.once("ready", () => {
  if (!game.user.isGM) return;

  console.info(`${MODULE_ID} | Ready`);
  ui.notifications.info(game.i18n.localize("GMCOMBAT.Ready"));
});
