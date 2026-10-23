import { MODULE_ID } from "../config.js";
import { createLogger } from "../core/logger.js";
import { calculateHpUpdate, halfDamage, parseHpInput, uniqueHpTargets } from "./hp-operations.js";
import { RollHistory, renderRollHistory, rollMessageConfig, rollMessageEntry } from "./roll-results.js";
import { WorkspaceLayout } from "./workspace-layout.js";
import { createMinimapState, MinimapSource, MinimapView } from "./minimap.js";
import {
  LEGACY_REACTION_FLAG_KEY,
  LEGACY_REACTION_MODULE_ID,
  LEGENDARY_LOCK_FLAG_KEY,
  REACTION_FLAG_KEY,
  actorMeleeAttacks,
  actorLegendaryActions,
  actorOpportunityPlan,
  actorReactions,
  actorTurnStartEffects,
  collectionValues,
  isPlayerFacingTurn,
  legendaryExecutionPlan,
  legendaryResourceState,
  reactionExecutionPlan,
  reactionResourceState,
  shouldRestoreReaction
} from "./reaction-operations.js";
import {
  executeStatblockActivity,
  missingStatblockItems,
  prepareInlineActivityCommands,
  prepareStatblockDescription,
  prepareStatblockSource,
  statblockActivityAction,
  statblockClickRoute
} from "./statblock-operations.js";

const CHANNEL_NAME = `${MODULE_ID}.workspace`;
const WORKSPACE_PARAMETER = "gmCombatWorkspace";
const WORKSPACE_TARGET = `${MODULE_ID}-companion`;
const SAVE_ABILITIES = Object.freeze([
  ["str", "STR"], ["dex", "DEX"], ["con", "CON"],
  ["int", "INT"], ["wis", "WIS"], ["cha", "CHA"]
]);

function formatModifier(value) {
  const modifier = Number(value) || 0;
  return modifier >= 0 ? `+${modifier}` : String(modifier);
}

export function savingThrowConfig(ability, mode = "normal") {
  return {
    config: {
      ability,
      advantage: mode === "advantage",
      disadvantage: mode === "disadvantage"
    },
    dialog: { configure: false }
  };
}

export function turnGuidancePhases(previous, current) {
  if (!current?.started) return [];
  if (!previous?.started || previous.combatId !== current.combatId) {
    return isPlayerFacingTurn(current.activeType) ? [{ timing: "start", snapshot: current }] : [];
  }
  const changed = previous.round !== current.round || previous.turn !== current.turn ||
    previous.activeCombatantId !== current.activeCombatantId;
  if (!changed) return [];

  const phases = [];
  if (isPlayerFacingTurn(previous.activeType)) phases.push({ timing: "end", snapshot: previous });
  if (isPlayerFacingTurn(current.activeType)) phases.push({ timing: "start", snapshot: current });
  return phases;
}

function isWorkspaceWindow() {
  return new URL(window.location.href).searchParams.get(WORKSPACE_PARAMETER) === "1";
}

function workspaceUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set(WORKSPACE_PARAMETER, "1");
  return url.href;
}

function tokenSummary(token) {
  const document = token?.document ?? token ?? null;
  const actor = token?.actor ?? document?.actor ?? null;

  return document ? {
    tokenId: document.id ?? token?.id ?? null,
    tokenName: document.name ?? token?.name ?? null,
    actorId: actor?.id ?? document.actorId ?? null,
    actorName: actor?.name ?? null,
    actorType: actor?.type ?? null,
    sceneId: document.parent?.id ?? canvas?.scene?.id ?? null
  } : null;
}

function displayValue(value, fallback = "–") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

export function combatantColor(index = 0) {
  const hue = (10 + Number(index) * 137.508) % 360;
  const saturation = 68;
  const lightness = 58;
  const chroma = (1 - Math.abs((2 * lightness / 100) - 1)) * saturation / 100;
  const segment = hue / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  const [red, green, blue] = segment < 1 ? [chroma, secondary, 0]
    : segment < 2 ? [secondary, chroma, 0]
      : segment < 3 ? [0, chroma, secondary]
        : segment < 4 ? [0, secondary, chroma]
          : segment < 5 ? [secondary, 0, chroma]
            : [chroma, 0, secondary];
  const match = lightness / 100 - chroma / 2;
  return `#${[red, green, blue]
    .map((value) => Math.round((value + match) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function isAutomaticActorDeltaStatus(effect, data = {}) {
  const effectIds = [effect?.id, data?._id, data?.id].filter((id) => typeof id === "string");
  return effectIds.some((id) => id.startsWith("dnd5edead") || id.startsWith("dnd5ebloodied"));
}

function applicationElement(application, renderedHtml = null) {
  const candidate = renderedHtml ?? application?.element ?? null;
  if (!candidate) return null;
  if (candidate instanceof HTMLElement) return candidate;
  if (candidate?.jquery && candidate[0] instanceof HTMLElement) return candidate[0];
  if (candidate[0] instanceof HTMLElement) return candidate[0];
  return null;
}

export class WorkspaceBridge {
  #eventBus;
  #getSnapshot;
  #rollRules;
  #extraDiceBusy = new Set();
  #logger;
  #channel = null;
  #unsubscribe = null;
  #controlTokenHook = null;
  #canvasReadyHook = null;
  #systemStatusGuardHook = null;
  #systemStatusDeleteGuardHook = null;
  #rollAttackHook = null;
  #rollMessageHooks = [];
  #rollHistory = new RollHistory();
  #sheetRenderHooks = [];
  #sheetDiagnosticHooks = [];
  #sheetHostObserver = null;
  #sheetMountTimers = new Set();
  #windowFocusHandler = null;
  #root = null;
  #layout = null;
  #minimapSource = null;
  #minimapView = null;
  #selectedToken = null;
  #pinnedSelection = null;
  #displayedActor = null;
  #displayedSheet = null;
  #sheetMinimizePatch = null;
  #sheetStateObserver = null;
  #preparedSheetElements = new WeakSet();
  #statblockBusy = new Set();
  #selectionRevision = 0;
  #rollDebug = {
    status: "Noch kein Item im Workspace benutzt.",
    click: null,
    roll: null
  };
  #sheetDebug = [];
  #workspaceMode = isWorkspaceWindow();
  #workspaceWindow = null;
  #tokenColorOverlays = new Map();
  #hoveredToken = null;
  #combatantColors = new Map();
  #colorCombatId = null;
  #nextColorIndex = 0;
  #remoteEnemyColors = [];
  #bulkSelection = new Set();
  #openReactionChoices = new Set();
  #reactionBusy = new Set();
  #pendingReactionDamage = new Map();
  #legendaryBusy = new Set();
  #pendingLegendaryDamage = new Map();
  #turnGuidance = null;
  #combatControlBusy = false;

  constructor({ eventBus, getSnapshot, rollRules = null, logger = createLogger("WorkspaceBridge") }) {
    this.#eventBus = eventBus;
    this.#getSnapshot = getSnapshot;
    this.#rollRules = rollRules;
    this.#logger = logger;
  }

  get workspaceMode() {
    return this.#workspaceMode;
  }

  start() {
    this.#channel = new BroadcastChannel(CHANNEL_NAME);
    this.#channel.addEventListener("message", (event) => this.#receive(event.data));
    this.#unsubscribe = this.#eventBus.on("combatStateChanged", (event) => {
      this.#rollHistory.advance(event.previousSnapshot, event.snapshot);
      this.#handleEncounterTransition(event);
      this.#restoreReactionAtTurnStart(event);
      this.#restoreLegendaryAtTurnStart(event);
      this.#render();
      this.#broadcastState();
      this.#syncTokenColors();
      this.#minimapSource?.refresh();
    });

    this.#controlTokenHook = Hooks.on("controlToken", () => {
      if (this.#workspaceMode) return;
      queueMicrotask(() => this.#broadcastControlledToken());
    });

    this.#canvasReadyHook = Hooks.on("canvasReady", () => {
      this.#clearTokenColors();
      this.#syncTokenColors();
    });

    if (this.#workspaceMode) {
      this.#systemStatusGuardHook = Hooks.on("preCreateActiveEffect", (effect, data) => {
        if (!isAutomaticActorDeltaStatus(effect, data)) return;
        const effectId = effect?.id ?? data?._id ?? data?.id ?? "";
        const parentName = effect?.parent?.documentName ?? effect?.parent?.constructor?.name ?? "";
        this.#recordSheetDebug("duplicate system status blocked", { effectId, parentName });
        return false;
      });
      this.#systemStatusDeleteGuardHook = Hooks.on("preDeleteActiveEffect", (effect) => {
        if (!isAutomaticActorDeltaStatus(effect)) return;
        this.#recordSheetDebug("duplicate system status deletion blocked", { effectId: effect?.id ?? null });
        return false;
      });
    }

    if (this.#workspaceMode) {
      this.#registerSheetHooks();
      this.#registerModifierReset();
      this.#registerRollDiagnostics();
      this.#renderWorkspace();
      this.#registerRollHistory();
      this.#channel.postMessage({ type: "workspaceReady" });
    } else {
      this.#renderLauncher();
      this.#minimapSource = new MinimapSource({
        getState: ({ previews }) => createMinimapState({
          canvas, snapshot: this.#getSnapshot?.(), baseUrl: window.location.href, previews,
          enemies: this.#enemyEntries().map((enemy) => ({ ...enemy,
            color: this.#remoteEnemyColors.find((entry) => entry.sceneId === enemy.sceneId && entry.tokenId === enemy.tokenId)?.color ?? enemy.color
          }))
        }),
        publish: (state) => this.#channel?.postMessage({ type: "minimapState", state })
      });
      this.#minimapSource.start();
    }

    this.#render();
    this.#syncTokenColors();
  }

  stop() {
    this.#minimapSource?.stop();
    this.#minimapSource = null;
    this.#minimapView?.stop();
    this.#minimapView = null;
    this.#layout?.stop();
    this.#layout = null;
    this.#unsubscribe?.();
    this.#unsubscribe = null;

    if (this.#controlTokenHook !== null) {
      Hooks.off("controlToken", this.#controlTokenHook);
      this.#controlTokenHook = null;
    }

    if (this.#canvasReadyHook !== null) {
      Hooks.off("canvasReady", this.#canvasReadyHook);
      this.#canvasReadyHook = null;
    }

    if (this.#systemStatusGuardHook !== null) {
      Hooks.off("preCreateActiveEffect", this.#systemStatusGuardHook);
      this.#systemStatusGuardHook = null;
    }

    if (this.#systemStatusDeleteGuardHook !== null) {
      Hooks.off("preDeleteActiveEffect", this.#systemStatusDeleteGuardHook);
      this.#systemStatusDeleteGuardHook = null;
    }

    if (this.#rollAttackHook !== null) {
      Hooks.off("dnd5e.rollAttackV2", this.#rollAttackHook);
      this.#rollAttackHook = null;
    }
    for (const [hookName, hookId] of this.#rollMessageHooks) Hooks.off(hookName, hookId);
    this.#rollMessageHooks = [];

    for (const [hookName, hookId] of this.#sheetRenderHooks) {
      Hooks.off(hookName, hookId);
    }
    this.#sheetRenderHooks = [];

    for (const [hookName, hookId] of this.#sheetDiagnosticHooks) {
      Hooks.off(hookName, hookId);
    }
    this.#sheetDiagnosticHooks = [];
    this.#sheetHostObserver?.disconnect();
    this.#sheetHostObserver = null;

    for (const timer of this.#sheetMountTimers) clearTimeout(timer);
    this.#sheetMountTimers.clear();

    if (this.#windowFocusHandler) {
      window.removeEventListener("focus", this.#windowFocusHandler);
      this.#windowFocusHandler = null;
    }


    if (this.#workspaceMode) this.#channel?.postMessage({ type: "hoverToken", active: false });
    this.#closeDisplayedSheet();
    this.#clearTokenColors();
    this.#channel?.close();
    this.#channel = null;
    this.#root?.remove();
    this.#root = null;
    document.body.classList.remove("gm-combat-workspace-companion");
  }

  openWorkspace() {
    if (this.#workspaceWindow && !this.#workspaceWindow.closed) {
      this.#workspaceWindow.focus();
      return true;
    }

    const popup = window.open(
      "",
      WORKSPACE_TARGET,
      "popup=yes,width=1400,height=900,resizable=yes,scrollbars=yes"
    );

    if (!popup) {
      ui.notifications?.warn(game.i18n.localize("GMCOMBAT.Workspace.PopupBlocked"));
      return false;
    }

    let alreadyWorkspace = false;
    try {
      alreadyWorkspace = new URL(popup.location.href)
        .searchParams.get(WORKSPACE_PARAMETER) === "1";
    } catch (_error) {
      alreadyWorkspace = false;
    }

    if (!alreadyWorkspace) popup.location.href = workspaceUrl();

    this.#workspaceWindow = popup;
    popup.focus();
    return true;
  }

  #renderLauncher() {
    const button = document.createElement("button");
    button.id = "gm-combat-workspace-launcher";
    button.type = "button";
    button.innerHTML = '<i class="fa-solid fa-display" aria-hidden="true"></i><span>GM Workspace öffnen</span>';
    button.addEventListener("click", () => this.openWorkspace());
    document.body.append(button);
    this.#root = button;
  }

  #renderWorkspace() {
    document.body.classList.add("gm-combat-workspace-companion");

    const root = document.createElement("main");
    root.id = "gm-combat-workspace-shell";
    root.className = "gm-combat-workspace";
    root.innerHTML = `
      <section class="gm-workspace-columns">
        <section class="gm-workspace-statblock-panel" aria-label="Statblock">
          <header class="gm-workspace-left-header">
            <div class="gm-workspace-brand-row">
              <h1>GM Combat Workspace</h1>
              <p>Statblock und Gegnerübersicht · Version ${game.modules.get(MODULE_ID)?.version ?? "–"}</p>
            </div>
            <div class="gm-workspace-statblock-row">
              <div>
                <span class="gm-workspace-eyebrow">Statblock</span>
                <h2 data-field="displayed-name">Kein Gegner ausgewählt</h2>
              </div>
              <div class="gm-workspace-statblock-actions">
                <span class="gm-workspace-source" data-field="selection-source">Keine Auswahl</span>
                <button type="button" class="gm-workspace-guidance-return" data-action="show-turn-guidance" hidden>
                  <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                  <span>Hinweise</span>
                </button>
                <button type="button" class="gm-workspace-pin" data-action="toggle-pin" disabled>
                  <i class="fa-solid fa-thumbtack" aria-hidden="true"></i>
                  <span>Anpinnen</span>
                </button>
              </div>
            </div>
          </header>
          <div class="gm-workspace-sheet-host" data-role="sheet-host">
            <div class="gm-workspace-empty">
              <i class="fa-solid fa-dragon" aria-hidden="true"></i>
              <strong>Wähle auf dem Laptop einen Gegner aus oder starte dessen Zug.</strong>
            </div>
          </div>
          <nav class="gm-workspace-combat-controls" data-role="combat-controls" aria-label="Kampfsteuerung">
            <button type="button" data-combat-action="previous-round" title="Vorherige Runde" aria-label="Vorherige Runde">
              <i class="fa-solid fa-backward-step" aria-hidden="true"></i>
            </button>
            <button type="button" data-combat-action="previous-turn" title="Vorheriger Zug" aria-label="Vorheriger Zug">
              <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
            </button>
            <button type="button" class="gm-workspace-end-turn" data-combat-action="end-turn">
              <i class="fa-solid fa-check" aria-hidden="true"></i>
              <span>End Turn</span>
            </button>
            <button type="button" data-combat-action="next-turn" title="Nächster Zug" aria-label="Nächster Zug">
              <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </button>
            <button type="button" data-combat-action="next-round" title="Nächste Runde" aria-label="Nächste Runde">
              <i class="fa-solid fa-forward-step" aria-hidden="true"></i>
            </button>
          </nav>
        </section>
        <aside class="gm-workspace-context-panel" aria-label="Kampfübersicht">
          <section class="gm-workspace-enemies">
            <header class="gm-workspace-enemy-header">
              <div>
                <h2>Runde <span data-field="round">–</span></h2>
              </div>
              <div class="gm-workspace-current-turn" data-role="current-turn">
                <span>Aktueller Zug</span>
                <strong data-field="current-turn-name">Kein laufender Kampf</strong>
              </div>
              <div class="gm-workspace-dashboard-actions">
                <span class="gm-workspace-enemy-count" data-field="enemy-count">0 Gegner</span>
                <span class="gm-workspace-status">Verbunden</span>
                <details class="gm-workspace-tools-menu">
                  <summary title="Weitere Werkzeuge" aria-label="Weitere Werkzeuge"><i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i></summary>
                  <div class="gm-workspace-tools-popover">
                    <section>
                      <h2>Roll-Diagnose</h2>
                      <p>Letzter Workspace-Klick und daraus entstandener D&amp;D5e-Angriff.</p>
                      <pre data-role="roll-debug">Noch kein Item im Workspace benutzt.</pre>
                    </section>
                    <section>
                      <h2>Statblock-Diagnose</h2>
                      <p>Render-, Actor-Update-, Close- und Container-Ereignisse.</p>
                      <pre data-role="sheet-debug">Noch kein Statblock-Ereignis aufgezeichnet.</pre>
                    </section>
                  </div>
                </details>
              </div>
            </header>
            <div class="gm-workspace-bulk-tools">
              <strong><span data-field="bulk-count">0</span> ausgewählt</strong>
              <input type="number" min="0" step="1" placeholder="Wert" data-role="bulk-value">
              <button type="button" data-action="bulk-damage">Schaden</button>
              <button type="button" data-action="bulk-half">½ Schaden</button>
              <button type="button" data-action="bulk-heal">Heilen</button>
              <button type="button" data-action="bulk-clear" title="Auswahl aufheben"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="gm-workspace-enemy-list" data-role="enemy-list"></div>
          </section>
          <section class="gm-workspace-lower-deck" aria-label="Reaktionen, Würfelergebnisse und Minimap">
            <section class="gm-workspace-reactions" data-role="reaction-panel" aria-label="Reaktionsübersicht">
              <header class="gm-workspace-reaction-header">
                <div>
                  <h2><i class="fa-solid fa-bolt" aria-hidden="true"></i> Reaktionen</h2>
                </div>
                <span class="gm-workspace-reaction-count" data-field="reaction-count">0 verfügbar</span>
              </header>
              <div class="gm-workspace-reaction-list" data-role="reaction-list"></div>
            </section>
            <div class="gm-workspace-utility-column">
              <section class="gm-workspace-reserved gm-workspace-roll-results" aria-label="Würfelergebnisse">
                <header>
                  <h2><i class="fa-solid fa-dice-d20" aria-hidden="true"></i> Würfelergebnisse</h2>
                  <button type="button" data-action="clear-roll-history" title="Würfelverlauf vollständig leeren" aria-label="Würfelverlauf vollständig leeren"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
                </header>
                <div class="gm-workspace-roll-list" data-role="roll-results" role="log" aria-label="Würfelverlauf"></div>
              </section>
              <section class="gm-workspace-reserved gm-workspace-minimap" aria-label="Minimap">
                <header>
                  <h2><i class="fa-solid fa-map" aria-hidden="true"></i> Minimap</h2>
                </header>
                <div class="gm-workspace-minimap-view" data-role="minimap">
                  <canvas role="img" aria-label="Minimap"></canvas>
                  <p data-role="minimap-status">Minimap wartet auf das Hauptfenster.</p>
                </div>
              </section>
            </div>
          </section>
        </aside>
      </section>
    `;

    root.querySelector('[data-action="toggle-pin"]')
      .addEventListener("click", () => this.#togglePin());
    root.querySelector('[data-action="show-turn-guidance"]')
      .addEventListener("click", () => this.#showStoredTurnGuidance());
    root.querySelector('[data-role="sheet-host"]')
      .addEventListener("click", (event) => this.#onTurnGuidanceClick(event));
    root.querySelector('[data-role="combat-controls"]')
      .addEventListener("click", (event) => this.#onCombatControl(event));

    root.querySelector('[data-role="enemy-list"]')
      .addEventListener("click", (event) => this.#onEnemyClick(event));
    root.querySelector('[data-role="enemy-list"]')
      .addEventListener("change", (event) => this.#onEnemySelection(event));
    root.querySelector('[data-role="enemy-list"]')
      .addEventListener("keydown", (event) => this.#onHpInput(event));
    root.querySelector('[data-role="enemy-list"]')
      .addEventListener("focusin", (event) => this.#selectHpInput(event));
    root.querySelector('.gm-workspace-bulk-tools')
      .addEventListener("click", (event) => this.#onBulkAction(event));
    root.querySelector('[data-role="enemy-list"]')
      .addEventListener("pointerover", (event) => this.#onEnemyHover(event, true));
    root.querySelector('[data-role="enemy-list"]')
      .addEventListener("pointerout", (event) => this.#onEnemyHover(event, false));
    root.querySelector('[data-role="reaction-panel"]')
      .addEventListener("click", (event) => this.#onReactionClick(event));
    root.addEventListener("contextmenu", (event) => this.#onPendingDamageMiss(event));
    root.querySelector('[data-action="clear-roll-history"]').addEventListener("click", () => {
      this.#rollHistory.clear();
      this.#renderRollResults();
    });
    root.querySelector('[data-role="roll-results"]').addEventListener("click", (event) => {
      const button = event.target.closest?.('[data-action="roll-extra-dice"]');
      if (!button || !this.#rollRules || this.#extraDiceBusy.has(button.dataset.messageId)) return;
      const messageId = button.dataset.messageId;
      this.#extraDiceBusy.add(messageId);
      button.disabled = true;
      this.#rollRules.rollExtraDice(messageId).catch((error) => {
        this.#logger.error("Optional extra dice failed", error);
        ui.notifications?.error(`2W6 konnten nicht gewürfelt werden: ${error.message}`);
      }).finally(() => {
        this.#extraDiceBusy.delete(messageId);
        this.#renderRollResults();
      });
    });

    document.body.append(root);
    this.#root = root;
    this.#layout = new WorkspaceLayout(root);
    this.#layout.start();
    this.#minimapView = new MinimapView(root.querySelector('[data-role="minimap"]'));
    this.#exposeNotifications();
    this.#registerSheetDiagnostics();

  }

  #exposeNotifications() {
    const notifications = document.querySelector("#notifications, .notifications");
    if (!notifications) return;
    if (notifications.parentElement !== document.body) document.body.append(notifications);
    notifications.classList.add("gm-workspace-notifications");
  }

  #registerRollHistory() {
    for (const hookName of ["createChatMessage", "updateChatMessage"]) {
      const id = Hooks.on(hookName, (message) => {
        try {
          const speaker = message.speaker ?? {};
          const actor = message.getAssociatedActor?.() ??
            game.scenes?.get(speaker.scene)?.tokens?.get(speaker.token)?.actor ?? game.actors?.get(speaker.actor);
          const itemFlag = message.flags?.dnd5e?.item;
          const item = itemFlag ? actor?.items?.get(itemFlag.id) ?? message.getAssociatedItem?.() : null;
          const piece = rollMessageEntry(message, {
            actor, item,
            damageLabel: (type) => {
              const configured = CONFIG.DND5E?.damageTypes?.[type] ?? CONFIG.DND5E?.healingTypes?.[type];
              const label = typeof configured === "string" ? configured : configured?.label ?? type;
              return game.i18n.localize(label);
            }
          });
          if (this.#rollHistory.add(piece)) this.#renderRollResults();
        } catch (error) {
          this.#logger.error("Roll result could not be displayed", error);
        }
      });
      this.#rollMessageHooks.push([hookName, id]);
    }
    const id = Hooks.on("deleteChatMessage", (message) => {
      this.#rollHistory.remove(message.id);
      this.#renderRollResults();
    });
    this.#rollMessageHooks.push(["deleteChatMessage", id]);
  }

  #renderRollResults() {
    const list = this.#root?.querySelector('[data-role="roll-results"]');
    if (!list) return;
    const scrolledToTop = list.scrollTop < 8;
    const previousScroll = list.scrollTop;
    const previousHeight = list.scrollHeight;
    list.innerHTML = renderRollHistory(this.#rollHistory);
    for (const button of list.querySelectorAll('[data-action="roll-extra-dice"]')) {
      button.disabled = this.#extraDiceBusy.has(button.dataset.messageId);
    }
    list.scrollTop = scrolledToTop ? 0 : previousScroll + list.scrollHeight - previousHeight;
  }

  #registerSheetHooks() {
    for (const hookName of ["renderActorSheet", "renderActorSheetV2"]) {
      const hookId = Hooks.on(hookName, (application, html) => {
        const actor = application?.actor ?? application?.document ?? application?.object ?? null;
        if (!this.#workspaceMode || actor !== this.#displayedActor) return;
        this.#recordSheetDebug(hookName, this.#sheetSnapshot(application, html));
        this.#scheduleSheetMount(application, html);
      });
      this.#sheetRenderHooks.push([hookName, hookId]);
    }
  }

  #registerSheetDiagnostics() {
    for (const hookName of ["closeActorSheet", "closeActorSheetV2"]) {
      const hookId = Hooks.on(hookName, (application) => {
        const actor = application?.actor ?? application?.document ?? application?.object ?? null;
        if (actor !== this.#displayedActor) return;
        this.#recordSheetDebug(hookName, this.#sheetSnapshot(application));
      });
      this.#sheetDiagnosticHooks.push([hookName, hookId]);
    }

    const updateActorHook = Hooks.on("updateActor", (actor, changes) => {
      if (actor !== this.#displayedActor) return;
      let changedPaths = Object.keys(changes ?? {});
      try {
        changedPaths = Object.keys(foundry.utils.flattenObject(changes ?? {}));
      } catch (_error) {
        // Top-level paths are enough when flattenObject is unavailable.
      }
      this.#recordSheetDebug("updateActor", {
        actor: actor.name,
        changedPaths
      });
      this.#scheduleSheetSnapshots("after updateActor");
    });
    this.#sheetDiagnosticHooks.push(["updateActor", updateActorHook]);

    const host = this.#root?.querySelector('[data-role="sheet-host"]');
    if (host) {
      this.#sheetHostObserver = new MutationObserver((mutations) => {
        const directChanges = mutations.filter((mutation) => mutation.target === host);
        if (!directChanges.length) return;
        this.#recordSheetDebug("sheetHost childList", {
          added: directChanges.reduce((total, mutation) => total + mutation.addedNodes.length, 0),
          removed: directChanges.reduce((total, mutation) => total + mutation.removedNodes.length, 0),
          snapshot: this.#sheetSnapshot(this.#displayedSheet)
        });
      });
      this.#sheetHostObserver.observe(host, { childList: true });
    }
  }

  #registerModifierReset() {
    this.#windowFocusHandler = () => this.#releaseStaleModifiers();
    window.addEventListener("focus", this.#windowFocusHandler);
    queueMicrotask(() => this.#releaseStaleModifiers());
  }

  #registerRollDiagnostics() {
    this.#rollAttackHook = Hooks.on("dnd5e.rollAttackV2", (rolls, data) => {
      const roll = rolls?.[0] ?? null;
      const d20 = roll?.d20 ?? roll?.terms?.find?.((term) => Number(term?.faces) === 20) ?? null;
      this.#rollDebug.roll = {
        item: data?.subject?.item?.name ?? null,
        activity: data?.subject?.name ?? null,
        formula: roll?.formula ?? null,
        total: roll?.total ?? null,
        advantageMode: roll?.options?.advantageMode ?? null,
        advantage: roll?.options?.advantage ?? false,
        disadvantage: roll?.options?.disadvantage ?? false,
        d20Number: d20?.number ?? null,
        d20Modifiers: Array.from(d20?.modifiers ?? []),
        results: Array.from(d20?.results ?? []).map((result) => ({
          result: result.result,
          active: result.active !== false,
          discarded: result.discarded === true
        }))
      };
      this.#rollDebug.status = "D&D5e-Angriff empfangen";
      this.#renderRollDebug();
    });
  }

  #releaseStaleModifiers() {
    if (!this.#workspaceMode) return;

    const modifierKeys = [
      ["Control", "ControlLeft"],
      ["Control", "ControlRight"],
      ["Alt", "AltLeft"],
      ["Alt", "AltRight"],
      ["Shift", "ShiftLeft"],
      ["Shift", "ShiftRight"],
      ["Meta", "MetaLeft"],
      ["Meta", "MetaRight"]
    ];

    for (const [key, code] of modifierKeys) {
      game.keyboard?.downKeys?.delete?.(code);
      window.dispatchEvent(new KeyboardEvent("keyup", {
        key,
        code,
        bubbles: true
      }));
    }
  }

  #prepareSheetElement(element) {
    if (!this.#preparedSheetElements.has(element)) {
      this.#preparedSheetElements.add(element);

      element.addEventListener("click", (event) => {
        if (event.altKey || event.ctrlKey || event.shiftKey || event.metaKey) return;
        this.#releaseStaleModifiers();
        const link = event.target.closest?.('.roll-link[data-action="use"][data-item-id], .gm-workspace-inline-activity, .roll-link-group[data-type="attack"], .roll-link-group[data-type="damage"]');
        if (link && element.contains(link)) this.#useItemWithoutStaleModifiers(event, link);
      }, { capture: true });
    }

    void this.#augmentStatblock(element, this.#displayedActor).catch((error) => {
      this.#logger.warn("Statblock additions could not be prepared", error);
    });
  }

  async #augmentStatblock(element, actor) {
    const content = element.querySelector(".statblock-content");
    if (!content || !actor || actor !== this.#displayedActor) return;

    const revision = Number(element.dataset.gmWorkspaceStatblockRevision ?? 0) + 1;
    element.dataset.gmWorkspaceStatblockRevision = String(revision);

    for (const action of content.querySelectorAll(".statblock-action")) {
      if (!/[[@](?:\[\/|status\[|spell\[|variantrule\[)|(?:&|&amp;)Reference\[/i.test(action.innerHTML)) continue;
      const itemId = action.dataset.id ?? action.querySelector("[data-item-id]")?.dataset?.itemId;
      const item = actor.items?.get?.(itemId) ?? null;
      const source = prepareInlineActivityCommands(action.innerHTML, this.#statblockActivityRoutes(item));
      const enriched = await TextEditor.enrichHTML(prepareStatblockSource(source), {
        secrets: false,
        rollData: item?.getRollData?.() ?? actor.getRollData?.() ?? {},
        relativeTo: item ?? actor
      });
      if (revision !== Number(element.dataset.gmWorkspaceStatblockRevision) || actor !== this.#displayedActor) return;
      action.innerHTML = prepareStatblockDescription(enriched);
    }

    for (const supplemental of content.querySelectorAll(".gm-workspace-supplemental-action")) supplemental.remove();
    for (const section of content.querySelectorAll(".gm-workspace-supplemental-section")) {
      if (!section.querySelector(".statblock-action")) section.remove();
    }

    const displayedIds = Array.from(content.querySelectorAll(".statblock-action[data-id]"), ({ dataset }) => dataset.id);
    const missing = missingStatblockItems(actor, displayedIds);

    for (const { item, category } of missing) {
      const rawDescription = prepareStatblockSource(prepareInlineActivityCommands(
        item.system?.description?.value ?? "",
        this.#statblockActivityRoutes(item)
      ));
      let description = await TextEditor.enrichHTML(rawDescription, {
        secrets: false,
        rollData: item.getRollData?.() ?? {},
        relativeTo: item
      });
      if (revision !== Number(element.dataset.gmWorkspaceStatblockRevision) || actor !== this.#displayedActor) return;
      description = prepareStatblockDescription(description);

      const section = this.#statblockSection(content, category);
      const action = document.createElement("div");
      action.className = "statblock-action gm-workspace-supplemental-action";
      action.dataset.id = item.id;
      action.dataset.identifier = item.identifier ?? "";
      action.innerHTML = description;

      while (action.children.length === 1 && action.firstElementChild?.tagName === "DIV") {
        action.firstElementChild.replaceWith(...action.firstElementChild.childNodes);
      }

      let firstParagraph = action.firstElementChild;
      if (!firstParagraph) {
        firstParagraph = document.createElement("p");
        action.append(firstParagraph);
      }

      const name = document.createElement("span");
      name.className = "name statblock-roll-link-group";
      const link = document.createElement("span");
      link.className = "roll-link";
      link.dataset.action = "use";
      link.dataset.itemId = item.id;
      const activities = Array.from(item.system?.activities?.values?.() ?? []);
      const primaryActivity = activities.find((activity) => statblockActivityAction(activity)) ?? null;
      if (primaryActivity) {
        link.dataset.activityId = primaryActivity.id;
        link.dataset.activityAction = statblockActivityAction(primaryActivity);
      }
      link.textContent = `${item.name}.`;
      name.append(link, document.createTextNode(" "));
      firstParagraph.prepend(name);

      section.append(action);
    }

  }

  #statblockActivityRoutes(item) {
    const activities = Array.from(item?.system?.activities?.values?.() ?? []);
    const save = activities.find((activity) =>
      String(activity?.type ?? activity?.system?.type ?? "").toLowerCase() === "save" &&
      typeof activity.use === "function"
    ) ?? null;
    const damage = activities.find((activity) =>
      String(activity?.type ?? activity?.system?.type ?? "").toLowerCase() === "damage" &&
      typeof activity.rollDamage === "function"
    ) ?? activities.find((activity) =>
      typeof activity.rollDamage === "function" && Number(activity?.damage?.parts?.length ?? 0) > 0
    ) ?? null;
    return {
      save: save ? { itemId: item.id, activityId: save.id, action: "use" } : null,
      damage: damage ? { itemId: item.id, activityId: damage.id, action: "damage" } : null
    };
  }

  #statblockSection(content, category) {
    const existing = content.querySelector(`.statblock-actions.${category}`);
    if (existing) return existing;

    const section = document.createElement("div");
    section.className = `statblock-actions ${category} gm-workspace-supplemental-section`;
    if (category !== "trait") {
      const labels = {
        action: "DND5E.NPC.SECTIONS.Actions",
        bonus: "DND5E.NPC.SECTIONS.BonusActions",
        reaction: "DND5E.NPC.SECTIONS.Reactions",
        legendary: "DND5E.NPC.SECTIONS.LegendaryActions",
        mythic: "DND5E.NPC.SECTIONS.MythicActions"
      };
      const heading = document.createElement("h5");
      heading.className = "statblock-actions-title";
      heading.dataset.noToc = "";
      heading.textContent = game.i18n.localize(labels[category] ?? category);
      section.append(heading);
    }

    const order = ["trait", "action", "bonus", "reaction", "legendary", "mythic"];
    const later = order.slice(order.indexOf(category) + 1)
      .map((key) => content.querySelector(`.statblock-actions.${key}`))
      .find(Boolean);
    content.insertBefore(section, later ?? null);
    return section;
  }

  #useItemWithoutStaleModifiers(event, link) {
    if (event.altKey || event.ctrlKey || event.shiftKey || event.metaKey) return;

    const route = statblockClickRoute(this.#displayedActor, link);
    if (!route || link.ariaDisabled === "true") return;
    const { item, activity, action } = route;
    const activityId = activity?.id ?? null;

    const downKeysBefore = Array.from(game.keyboard?.downKeys ?? []).sort();
    const bindings = this.#rollKeybindings();

    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    this.#releaseStaleModifiers();
    const busyKey = `${this.#displayedActor?.uuid ?? this.#displayedActor?.id}:${item.id}:${activityId}:${action}`;
    if (this.#statblockBusy.has(busyKey)) return;

    this.#rollDebug = {
      status: activity
        ? "Statblock-Aktivität wird direkt ausgeführt …"
        : "Item-Klick erfasst; warte auf D&D5e-Auswertung …",
      click: {
        item: item.name,
        itemId: item.id,
        eventModifiers: {
          alt: event.altKey,
          control: event.ctrlKey,
          shift: event.shiftKey,
          meta: event.metaKey
        },
        downKeysBefore,
        downKeysAfter: Array.from(game.keyboard?.downKeys ?? []).sort(),
        keybindings: bindings,
        activity: activity?.name ?? null,
        activityId,
        activityAction: action,
        route: activity ? "Workspace → activity" : "Workspace → item.use(originalEvent)"
      },
      roll: null
    };
    this.#renderRollDebug();
    this.#recordSheetDebug("item click", {
      item: item.name,
      itemId: item.id,
      snapshot: this.#sheetSnapshot(this.#displayedSheet)
    });

    this.#statblockBusy.add(busyKey);
    try {
      let result;
      if (activity) result = executeStatblockActivity(activity, action);
      else result = item.use({ event });
      Promise.resolve(result).catch((error) => {
        this.#logger.error(`Statblock activity failed: ${item.name}`, error);
        ui.notifications?.error(`${item.name} konnte nicht ausgeführt werden: ${error.message}`);
      }).finally(() => {
        this.#statblockBusy.delete(busyKey);
      });
    } catch (error) {
      this.#statblockBusy.delete(busyKey);
      this.#logger.error(`Statblock activity failed: ${item.name}`, error);
      ui.notifications?.error(`${item.name} konnte nicht ausgeführt werden: ${error.message}`);
    }
    this.#scheduleSheetSnapshots(`after statblock activity: ${item.name}`);
  }

  #rollKeybindings() {
    const actions = [
      "skipDialogNormal",
      "skipDialogAdvantage",
      "skipDialogDisadvantage"
    ];

    return Object.fromEntries(actions.map((action) => [
      action,
      Array.from(game.keybindings?.get?.("dnd5e", action) ?? []).map((binding) => ({
        key: binding.key,
        modifiers: Array.from(binding.modifiers ?? [])
      }))
    ]));
  }

  #renderRollDebug() {
    const output = this.#root?.querySelector('[data-role="roll-debug"]');
    if (!output) return;
    output.textContent = JSON.stringify(this.#rollDebug, null, 2);
  }

  #sheetSnapshot(application = this.#displayedSheet, renderedHtml = null) {
    const element = applicationElement(application, renderedHtml);
    const host = this.#root?.querySelector('[data-role="sheet-host"]') ?? null;
    return {
      actor: this.#displayedActor?.name ?? null,
      applicationClass: application?.constructor?.name ?? null,
      rendered: application?.rendered ?? null,
      elementFound: Boolean(element),
      elementConnected: element?.isConnected ?? false,
      elementParent: element?.parentElement?.id || element?.parentElement?.className || null,
      elementClasses: element ? Array.from(element.classList) : [],
      elementChildren: element?.childElementCount ?? null,
      elementTextLength: element?.textContent?.trim()?.length ?? null,
      hostChildren: host?.childElementCount ?? null,
      hostTextLength: host?.textContent?.trim()?.length ?? null
    };
  }

  #scheduleSheetSnapshots(reason) {
    for (const delay of [0, 50, 200, 500, 1000]) {
      const timer = setTimeout(() => {
        this.#sheetMountTimers.delete(timer);
        this.#recordSheetDebug(`${reason} +${delay}ms`, this.#sheetSnapshot());
      }, delay);
      this.#sheetMountTimers.add(timer);
    }
  }

  #recordSheetDebug(event, data = {}) {
    this.#sheetDebug.push({
      time: new Date().toLocaleTimeString("de-DE", { hour12: false }),
      event,
      ...data
    });
    if (this.#sheetDebug.length > 40) this.#sheetDebug.splice(0, this.#sheetDebug.length - 40);
    this.#renderSheetDebug();
  }

  #renderSheetDebug() {
    const output = this.#root?.querySelector('[data-role="sheet-debug"]');
    if (!output) return;
    output.textContent = JSON.stringify(this.#sheetDebug, null, 2);
    output.scrollTop = output.scrollHeight;
  }

  #broadcastControlledToken() {
    const controlled = Array.from(canvas?.tokens?.controlled ?? []);
    this.#selectedToken = tokenSummary(controlled.at(-1) ?? null);
    this.#channel?.postMessage({ type: "tokenSelected", token: this.#selectedToken });
  }

  #receive(message) {
    if (!message || typeof message !== "object") return;

    if (message.type === "workspaceReady" && !this.#workspaceMode) {
      this.#broadcastState();
      this.#broadcastControlledToken();
      this.#minimapSource?.refresh({ force: true });
      return;
    }

    if (message.type === "minimapState" && this.#workspaceMode) {
      this.#minimapView?.setState(message.state ?? null);
      return;
    }

    if (message.type === "tokenSelected" && this.#workspaceMode) {
      this.#selectedToken = message.token ?? null;
      if (this.#selectedToken?.actorType === "npc" && this.#turnGuidance) this.#turnGuidance.visible = false;
      this.#render();
      return;
    }

    if (message.type === "selectToken" && !this.#workspaceMode) {
      this.#selectLaptopToken(message);
      return;
    }

    if (message.type === "hoverToken" && !this.#workspaceMode) {
      this.#hoverLaptopToken(message);
      return;
    }

    if (message.type === "clearTokenSelection" && !this.#workspaceMode) {
      this.#clearLaptopSelection();
      return;
    }

    if (message.type === "applyHpOperation" && !this.#workspaceMode) {
      this.#applyHpOperation(message);
      return;
    }

    if (message.type === "hpOperationResult" && this.#workspaceMode) {
      if (message.error) ui.notifications?.error(message.error);
      return;
    }

    if (message.type === "enemyColors" && !this.#workspaceMode) {
      this.#remoteEnemyColors = Array.isArray(message.entries) ? message.entries : [];
      this.#syncTokenColors();
      this.#minimapSource?.refresh();
    }
  }

  #enemyEntries() {
    const snapshot = this.#getSnapshot?.();
    if (!snapshot?.combatId || !snapshot.started) return [];
    if (this.#colorCombatId !== snapshot.combatId) {
      this.#combatantColors.clear();
      this.#colorCombatId = snapshot.combatId;
      this.#nextColorIndex = 0;
    }
    const allEnemies = snapshot.combatants.filter((combatant) => combatant.type === "npc");
    const totals = new Map();
    for (const enemy of allEnemies) totals.set(enemy.name, (totals.get(enemy.name) ?? 0) + 1);
    const occurrences = new Map();

    return allEnemies.map((combatant) => {
      if (!this.#combatantColors.has(combatant.id)) {
        this.#combatantColors.set(combatant.id, combatantColor(this.#nextColorIndex));
        this.#nextColorIndex += 1;
      }
      const occurrence = (occurrences.get(combatant.name) ?? 0) + 1;
      occurrences.set(combatant.name, occurrence);
      return {
        ...combatant,
        displayName: totals.get(combatant.name) > 1 ? `${combatant.name} ${occurrence}` : combatant.name,
        sceneId: snapshot.sceneId,
        active: combatant.id === snapshot.activeCombatantId,
        onCurrentScene: snapshot.sceneId === canvas?.scene?.id && combatant.tokenPresent,
        color: this.#combatantColors.get(combatant.id)
      };
    }).filter((combatant) => !combatant.defeated);
  }

  #actorForEntry(entry) {
    const scene = game.scenes?.get(entry?.sceneId) ?? null;
    const tokenDocument = scene?.tokens?.get(entry?.tokenId) ?? null;
    return tokenDocument?.actor ?? game.actors?.get(entry?.actorId) ?? null;
  }

  #legendaryResourceBadge(entry) {
    const resource = legendaryResourceState(this.#actorForEntry(entry));
    if (resource.maximum <= 0) return "";
    return `<span class="gm-workspace-legendary-resource" title="Legendäre Aktionen: ${resource.remaining} von ${resource.maximum}"><i class="fa-solid fa-crown" aria-hidden="true"></i> ${resource.remaining}/${resource.maximum}</span>`;
  }

  #legendaryLocks() {
    const snapshot = this.#getSnapshot?.();
    return snapshot?.context?.combat?.getFlag?.(MODULE_ID, LEGENDARY_LOCK_FLAG_KEY) ?? snapshot?.legendaryLocks ?? {};
  }

  #legendaryActionLocked(combatantId, actionId) {
    return Boolean(this.#legendaryLocks()?.[combatantId]?.[actionId]);
  }

  #reactionEntryData(entry) {
    const actor = this.#actorForEntry(entry);
    const state = this.#getSnapshot?.()?.reactionStates?.[entry.id] ?? {};
    return {
      ...entry,
      actor,
      reactions: actorReactions(actor),
      meleeAttacks: actorMeleeAttacks(actor),
      opportunityPlan: actorOpportunityPlan(actor),
      pendingDamage: this.#pendingReactionDamage.get(entry.id) ?? [],
      used: Boolean(state.used)
    };
  }

  #renderReactionOverview() {
    const panel = this.#root?.querySelector('[data-role="reaction-panel"]');
    const list = this.#root?.querySelector('[data-role="reaction-list"]');
    if (!panel || !list) return;

    const snapshot = this.#getSnapshot?.();
    const playerTurn = Boolean(snapshot?.started && isPlayerFacingTurn(snapshot.activeType));
    const entries = this.#enemyEntries().map((entry) => this.#reactionEntryData(entry));
    const available = entries.filter(({ used }) => !used).length;

    panel.classList.toggle("is-player-turn", playerTurn);
    this.#set("reaction-count", `${available} verfügbar`);

    if (!entries.length) {
      list.innerHTML = `<div class="gm-workspace-reaction-empty">${snapshot?.started
        ? "Keine kampffähigen Gegner mit Reaktionen im Encounter."
        : "Die Reaktionsübersicht erscheint mit dem nächsten Encounter."}</div>`;
      return;
    }

    list.innerHTML = entries.map((entry) => {
      const nativeReactions = entry.reactions.map((reaction) => {
        const tooltip = foundry.utils.escapeHTML(
          [reaction.condition, reaction.description].filter(Boolean).join(" — ") || "Keine Beschreibung hinterlegt."
        ).replaceAll('"', "&quot;");
        return reaction.executable
          ? `<button type="button" class="gm-workspace-reaction-action" data-action="execute-reaction" data-item-id="${reaction.itemId}" data-activity-id="${reaction.activityId}" data-tooltip="${tooltip}" title="${tooltip}" aria-disabled="${entry.used}">${foundry.utils.escapeHTML(reaction.name)}</button>`
          : `<button type="button" class="gm-workspace-reaction-action" data-action="show-reaction-actor" data-tooltip="${tooltip}" title="${tooltip}">${foundry.utils.escapeHTML(reaction.name)}</button>`;
      }).join("");

      const choiceOpen = this.#openReactionChoices.has(entry.id);
      let opportunityTooltip = "";
      let opportunityAction = "";
      if (entry.opportunityPlan.mode === "sequence") {
        const sequence = entry.opportunityPlan.sequence.map(({ name }) => name).join(", ");
        opportunityTooltip = foundry.utils.escapeHTML(`${sequence} als Gelegenheitsangriff ausführen.`).replaceAll('"', "&quot;");
        opportunityAction = `<button type="button" class="gm-workspace-reaction-action" data-action="execute-opportunity-plan" data-tooltip="${opportunityTooltip}" title="${opportunityTooltip}" aria-disabled="${entry.used}">Gelegenheitsangriff</button>`;
      } else if (entry.opportunityPlan.mode === "choose") {
        opportunityTooltip = `${entry.opportunityPlan.slots} Angriff${entry.opportunityPlan.slots === 1 ? "" : "e"} auswählen.`;
        opportunityAction = `<button type="button" class="gm-workspace-reaction-action" data-action="toggle-opportunity-choices" aria-expanded="${choiceOpen}" data-tooltip="${opportunityTooltip}" title="${opportunityTooltip}" aria-disabled="${entry.used}">Gelegenheitsangriff</button>`;
      }
      if (entry.pendingDamage.length) opportunityAction = "";

      const attackChoices = choiceOpen && entry.opportunityPlan.mode === "choose" ? `
        <div class="gm-workspace-opportunity-choices">
          ${Array.from({ length: entry.opportunityPlan.slots }, (_, index) => `
            <label>Angriff ${index + 1}
              <select data-opportunity-slot="${index}">
                ${entry.opportunityPlan.options.map((attack) => `<option value="${attack.itemId}:${attack.activityId}">${foundry.utils.escapeHTML(attack.name)}</option>`).join("")}
              </select>
            </label>
          `).join("")}
          <button type="button" data-action="execute-opportunity-plan">Auswahl ausführen</button>
        </div>
      ` : "";

      const pendingDamage = entry.pendingDamage.map((pending) => `
        <button type="button" class="gm-workspace-reaction-action gm-workspace-pending-damage" title="Linksklick: Schaden würfeln · Rechtsklick: Verfehlt bestätigen" data-action="roll-pending-damage" data-pending-id="${pending.id}">
          ${foundry.utils.escapeHTML(pending.label)} – Schaden
        </button>
      `).join("");

      return `
        <article class="gm-workspace-reaction-enemy${entry.used ? " is-used" : ""}${this.#reactionBusy.has(entry.id) ? " is-busy" : ""}"
          style="--gm-enemy-color:${entry.color}" data-combatant-id="${entry.id}">
          <span class="gm-workspace-reaction-color" aria-hidden="true"></span>
          <header>
            <button type="button" class="gm-workspace-reaction-name" data-action="show-reaction-actor">${foundry.utils.escapeHTML(entry.displayName)}</button>
            <button type="button" class="gm-workspace-reaction-status ${entry.used ? "is-used" : "is-available"}" data-action="toggle-reaction-status">
              <i class="fa-solid ${entry.used ? "fa-bolt-slash" : "fa-bolt"}" aria-hidden="true"></i>
              ${entry.used ? "Verwendet" : "Verfügbar"}
            </button>
          </header>
          <div class="gm-workspace-reaction-abilities">
            ${nativeReactions}
            ${opportunityAction}
            ${pendingDamage}
            ${attackChoices}
          </div>
        </article>
      `;
    }).join("");
  }

  #renderEnemyList() {
    const list = this.#root?.querySelector('[data-role="enemy-list"]');
    if (!list) return;
    const entries = this.#enemyEntries();
    const validIds = new Set(entries.map(({ id }) => id));
    this.#bulkSelection = new Set([...this.#bulkSelection].filter((id) => validIds.has(id)));
    this.#set("bulk-count", this.#bulkSelection.size, "0");
    this.#root?.querySelector(".gm-workspace-enemies")
      ?.classList.toggle("has-bulk-selection", this.#bulkSelection.size > 0);
    this.#channel?.postMessage({
      type: "enemyColors",
      entries: entries.map(({ tokenId, sceneId, color, active }) => ({ tokenId, sceneId, color, active }))
    });
    this.#set("enemy-count", `${entries.length} ${entries.length === 1 ? "Gegner" : "Gegner"}`);

    if (!entries.length) {
      const snapshot = this.#getSnapshot?.();
      list.innerHTML = `<div class="gm-workspace-enemy-empty">${snapshot?.started
        ? "Keine kampffähigen Gegner im Encounter."
        : "Kein laufender Encounter."}</div>`;
      return;
    }

    const selectedTokenId = this.#selectedToken?.tokenId ?? null;
    list.innerHTML = entries.map((entry) => `
      <div
        class="gm-workspace-enemy${entry.active ? " is-active" : ""}${entry.tokenId === selectedTokenId ? " is-selected" : ""}"
        style="--gm-enemy-color:${entry.color}"
        data-combatant-id="${entry.id}"
        data-token-id="${entry.tokenId ?? ""}"
        data-scene-id="${entry.sceneId ?? ""}">
        <input type="checkbox" class="gm-workspace-enemy-check" data-action="bulk-select" ${this.#bulkSelection.has(entry.id) ? "checked" : ""} aria-label="Für Mehrfachaktion auswählen">
        <button type="button" class="gm-workspace-enemy-open" data-action="select-enemy">
          <span class="gm-workspace-enemy-name">${foundry.utils.escapeHTML(entry.displayName ?? "Unbenannter Gegner")}</span>
          ${this.#legendaryResourceBadge(entry)}
        </button>
        <span class="gm-workspace-enemy-indicators">
          ${entry.active ? '<span class="gm-workspace-turn-badge"><i class="fa-solid fa-swords" aria-hidden="true"></i> Am Zug</span>' : ""}
          ${entry.tokenId === selectedTokenId ? '<span class="gm-workspace-selected-badge"><i class="fa-solid fa-crosshairs" aria-hidden="true"></i> Ausgewählt</span>' : ""}
          ${entry.hidden ? '<span class="gm-workspace-hidden-badge" data-tooltip="Versteckter Gegner" title="Versteckter Gegner"><i class="fa-solid fa-eye-slash" aria-label="Versteckter Gegner"></i></span>' : ""}
        </span>
        <span class="gm-workspace-enemy-ac"><small>RK</small><strong>${entry.armorClass}</strong></span>
        <label class="gm-workspace-enemy-hp">
          <span><small>TP</small> <input type="text" inputmode="numeric" value="${entry.hpValue}" data-action="hp-input" data-current-value="${entry.hpValue}" title="50 = setzen · -20 = Schaden · +10 = Heilung"> / ${entry.hpMax}</span>
          <span class="gm-workspace-hp-bar"><i style="width:${entry.hpMax > 0 ? Math.max(0, Math.min(100, entry.hpValue / entry.hpMax * 100)) : 0}%"></i></span>
        </label>
        <span class="gm-workspace-saves">
          ${SAVE_ABILITIES.map(([abilityId, label]) => `
            <span class="gm-workspace-save-group">
              <button type="button" class="gm-workspace-save-main" data-action="roll-save" data-ability="${abilityId}" data-mode="normal" aria-label="${label}-Rettungswurf normal">
                <small>${label}</small><strong>${formatModifier(entry.savingThrows?.[abilityId])}</strong>
              </button>
              <button type="button" class="gm-workspace-save-mode is-advantage" data-action="roll-save" data-ability="${abilityId}" data-mode="advantage" aria-label="${label}-Rettungswurf mit Vorteil">V</button>
              <button type="button" class="gm-workspace-save-mode is-disadvantage" data-action="roll-save" data-ability="${abilityId}" data-mode="disadvantage" aria-label="${label}-Rettungswurf mit Nachteil">N</button>
            </span>
          `).join("")}
        </span>
      </div>
    `).join("");
  }

  #onEnemyClick(event) {
    const hpInput = event.target.closest?.('[data-action="hp-input"]');
    if (hpInput) {
      hpInput.select();
      return;
    }
    const saveButton = event.target.closest?.('[data-action="roll-save"]');
    if (saveButton) {
      this.#rollSavingThrow(saveButton).catch((error) => {
        this.#logger.error("Saving throw failed", error);
        ui.notifications?.error(`Rettungswurf fehlgeschlagen: ${error.message}`);
      });
      return;
    }
    if (!event.target.closest?.('[data-action="select-enemy"]')) return;
    const row = event.target.closest?.("[data-combatant-id]");
    if (!row) return;
    const entry = this.#enemyEntries().find(({ id }) => id === row.dataset.combatantId);
    if (!entry) return;
    this.#selectEnemyEntry(entry);
  }

  #selectEnemyEntry(entry) {
    const actor = this.#actorForEntry(entry);
    if (!actor || actor.type !== "npc") return;

    if (this.#turnGuidance) this.#turnGuidance.visible = false;
    this.#pinnedSelection = null;
    this.#selectedToken = {
      tokenId: entry.tokenId,
      tokenName: entry.name,
      actorId: actor.id,
      actorName: actor.name,
      actorType: actor.type,
      sceneId: entry.sceneId
    };
    this.#channel?.postMessage({ type: "selectToken", tokenId: entry.tokenId, sceneId: entry.sceneId });
    this.#render();
  }

  #onReactionClick(event) {
    const button = event.target.closest?.("[data-action]");
    const row = button?.closest?.("[data-combatant-id]");
    if (!button || !row) return;
    const enemy = this.#enemyEntries().find(({ id }) => id === row.dataset.combatantId);
    if (!enemy) return;
    const entry = this.#reactionEntryData(enemy);

    if (button.dataset.action === "show-reaction-actor") {
      this.#selectEnemyEntry(entry);
      return;
    }

    if (entry.used && [
      "toggle-opportunity-choices",
      "execute-reaction",
      "execute-opportunity-plan"
    ].includes(button.dataset.action)) {
      ui.notifications?.warn("Die Reaktion dieses Gegners wurde bereits verwendet.");
      return;
    }

    if (button.dataset.action === "toggle-opportunity-choices") {
      if (this.#openReactionChoices.has(entry.id)) this.#openReactionChoices.delete(entry.id);
      else this.#openReactionChoices.add(entry.id);
      this.#renderReactionOverview();
      return;
    }

    if (button.dataset.action === "toggle-reaction-status") {
      const used = Boolean(this.#getSnapshot?.()?.reactionStates?.[entry.id]?.used);
      if (used) this.#pendingReactionDamage.delete(entry.id);
      this.#setReactionUsed(entry.id, !used, "manual").catch((error) => {
        this.#logger.error("Reaction status update failed", error);
        ui.notifications?.error(`Reaktionsstatus konnte nicht geändert werden: ${error.message}`);
      });
      return;
    }

    if (button.dataset.action === "execute-reaction") {
      this.#executeReactionDamage(entry, button).catch((error) => {
        this.#logger.error("Reaction execution failed", error);
        ui.notifications?.error(`Reaktion konnte nicht ausgeführt werden: ${error.message}`);
      });
      return;
    }

    if (button.dataset.action === "execute-opportunity-plan") {
      this.#executeOpportunityPlan(entry, row).catch((error) => {
        this.#logger.error("Opportunity attack failed", error);
        ui.notifications?.error(`Gelegenheitsangriff konnte nicht ausgeführt werden: ${error.message}`);
      });
      return;
    }

    if (button.dataset.action === "roll-pending-damage") {
      this.#rollPendingReactionDamage(entry, button.dataset.pendingId).catch((error) => {
        this.#logger.error("Opportunity damage failed", error);
        ui.notifications?.error(`Schaden konnte nicht ausgewürfelt werden: ${error.message}`);
      });
    }
  }

  async #executeReactionDamage(entry, button) {
    if (this.#reactionBusy.has(entry.id)) return;
    const actor = this.#actorForEntry(entry);
    const item = actor?.items?.get?.(button.dataset.itemId) ?? null;
    const activity = item?.system?.activities?.get?.(button.dataset.activityId) ??
      Array.from(item?.system?.activities?.values?.() ?? []).find(({ id }) => id === button.dataset.activityId) ?? null;
    if (!actor || !item || !activity) throw new Error("Die zugehörige D&D5e-Aktivität wurde nicht gefunden.");

    const plan = reactionExecutionPlan(item, activity);
    if (!plan.executable) {
      this.#selectEnemyEntry(entry);
      throw new Error("Für diese Reaktion wurde kein Schaden und keine Verringerungsformel gefunden. Der Statblock wurde geöffnet.");
    }
    const resource = reactionResourceState(item, activity);
    if (resource.recharge && !resource.available) {
      throw new Error(`${item.name} ist nicht verfügbar. Die Recharge-Ressource muss zuerst wiederhergestellt werden.`);
    }
    if (resource.recharge) {
      if (!resource.spentPath || typeof item.update !== "function") {
        throw new Error(`Die Recharge-Ressource von ${item.name} konnte nicht aktualisiert werden.`);
      }
      await item.update({ [resource.spentPath]: resource.spent + 1 });
    }

    this.#reactionBusy.add(entry.id);
    this.#renderReactionOverview();
    this.#releaseStaleModifiers();

    try {
      let succeeded = false;
      if (plan.reductionFormula) {
        const roll = await new Roll(plan.reductionFormula, actor.getRollData?.() ?? {}).evaluate();
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({ actor }),
          flavor: `${item.name}: Schadensverringerung`
        });
        succeeded = true;
      }

      for (const damageActivity of plan.damageActivities) {
        const result = await damageActivity.rollDamage({}, { configure: false });
        succeeded ||= Array.isArray(result) ? result.length > 0 : Boolean(result);
      }

      if (succeeded) {
        await this.#setReactionUsed(entry.id, true, "reaction-damage");
        this.#openReactionChoices.delete(entry.id);
      }
    } finally {
      this.#reactionBusy.delete(entry.id);
      this.#renderReactionOverview();
    }
  }

  async #executeOpportunityPlan(entry, row) {
    if (this.#reactionBusy.has(entry.id)) return;
    const actor = this.#actorForEntry(entry);
    if (!actor) throw new Error("Der zugehörige Gegner wurde nicht gefunden.");

    const plan = actorOpportunityPlan(actor);
    let sequence = plan.sequence;
    if (plan.mode === "choose") {
      const selected = Array.from(row.querySelectorAll("[data-opportunity-slot]"), ({ value }) => value);
      if (selected.length !== plan.slots) throw new Error("Bitte für jeden Angriffsplatz einen Nahkampfangriff auswählen.");
      sequence = selected.map((value) => {
        const [itemId, activityId] = value.split(":");
        return plan.options.find((attack) => attack.itemId === itemId && attack.activityId === activityId) ?? null;
      }).filter(Boolean);
    }
    if (!sequence.length) throw new Error("Es wurde kein geeigneter Nahkampfangriff gefunden.");

    this.#reactionBusy.add(entry.id);
    this.#renderReactionOverview();
    this.#releaseStaleModifiers();
    const pending = [];

    try {
      for (let index = 0; index < sequence.length; index += 1) {
        const attack = sequence[index];
        const item = actor.items?.get?.(attack.itemId) ?? null;
        const activity = item?.system?.activities?.get?.(attack.activityId) ??
          collectionValues(item?.system?.activities).find(({ id }) => id === attack.activityId) ?? null;
        if (!activity || typeof activity.rollAttack !== "function") {
          throw new Error(`${attack.name} besitzt keinen ausführbaren Angriffswurf.`);
        }
        const rollGroupId = foundry.utils.randomID();
        const result = await activity.rollAttack({}, { configure: false }, rollMessageConfig(rollGroupId));
        const succeeded = Array.isArray(result) ? result.length > 0 : Boolean(result);
        if (!succeeded) continue;
        if (typeof activity.rollDamage === "function") {
          pending.push({
            id: `${Date.now()}-${index}-${attack.activityId}`,
            rollGroupId,
            itemId: attack.itemId,
            activityId: attack.activityId,
            label: sequence.length > 1 ? `${attack.itemName ?? attack.name} ${index + 1}` : attack.itemName ?? attack.name
          });
        }
      }

      if (pending.length) this.#pendingReactionDamage.set(entry.id, pending);
      await this.#setReactionUsed(entry.id, true, "opportunity-attack");
      this.#openReactionChoices.delete(entry.id);
    } finally {
      this.#reactionBusy.delete(entry.id);
      this.#renderReactionOverview();
    }
  }

  #onPendingDamageMiss(event) {
    const button = event.target.closest?.('[data-action="roll-pending-damage"], [data-guidance-action="roll-legendary-damage"]');
    if (!button) return;
    event.preventDefault();
    const legendary = button.dataset.guidanceAction === "roll-legendary-damage";
    const combatantId = legendary ? button.dataset.combatantId : button.closest?.("[data-combatant-id]")?.dataset.combatantId;
    const key = legendary ? button.dataset.legendaryKey : combatantId;
    if (!key || (legendary ? this.#legendaryBusy.has(key) : this.#reactionBusy.has(key))) return;
    const pending = legendary ? this.#pendingLegendaryDamage : this.#pendingReactionDamage;
    const target = (pending.get(key) ?? []).find(({ id }) => id === button.dataset.pendingId);
    if (target?.rollGroupId) {
      this.#rollHistory.markMiss(target.rollGroupId);
      this.#renderRollResults();
    }
    const remaining = (pending.get(key) ?? []).filter(({ id }) => id !== button.dataset.pendingId);
    if (remaining.length) pending.set(key, remaining);
    else pending.delete(key);
    if (legendary) this.#render();
    else this.#renderReactionOverview();
  }

  async #rollPendingReactionDamage(entry, pendingId) {
    if (this.#reactionBusy.has(entry.id)) return;
    const actor = this.#actorForEntry(entry);
    const pending = this.#pendingReactionDamage.get(entry.id) ?? [];
    const target = pending.find(({ id }) => id === pendingId) ?? null;
    const item = actor?.items?.get?.(target?.itemId) ?? null;
    const activity = item?.system?.activities?.get?.(target?.activityId) ??
      collectionValues(item?.system?.activities).find(({ id }) => id === target?.activityId) ?? null;
    if (!activity || typeof activity.rollDamage !== "function") throw new Error("Der zugehörige Schadenswurf wurde nicht gefunden.");

    this.#reactionBusy.add(entry.id);
    this.#releaseStaleModifiers();
    try {
      const result = await activity.rollDamage({}, { configure: false }, rollMessageConfig(target.rollGroupId));
      const succeeded = Array.isArray(result) ? result.length > 0 : Boolean(result);
      if (succeeded) {
        const remaining = pending.filter(({ id }) => id !== pendingId);
        if (remaining.length) this.#pendingReactionDamage.set(entry.id, remaining);
        else this.#pendingReactionDamage.delete(entry.id);
      }
    } finally {
      this.#reactionBusy.delete(entry.id);
      this.#renderReactionOverview();
    }
  }

  async #setReactionUsed(combatantId, used, source) {
    const combat = this.#getSnapshot?.()?.context?.combat ?? game.combat ?? null;
    if (!combat?.started || !combat.combatants?.get?.(combatantId)) {
      throw new Error("Der Gegner gehört nicht mehr zum laufenden Encounter.");
    }

    const current = foundry.utils.deepClone(combat.getFlag(MODULE_ID, REACTION_FLAG_KEY) ?? {});
    current[combatantId] = {
      ...(current[combatantId] ?? {}),
      used: Boolean(used),
      round: combat.round ?? null,
      turn: combat.turn ?? null,
      source
    };
    await combat.setFlag(MODULE_ID, REACTION_FLAG_KEY, current);
    if (game.modules?.get?.(LEGACY_REACTION_MODULE_ID)?.active) {
      const legacy = foundry.utils.deepClone(combat.getFlag(LEGACY_REACTION_MODULE_ID, LEGACY_REACTION_FLAG_KEY) ?? {});
      legacy[combatantId] = { ...current[combatantId] };
      await combat.setFlag(LEGACY_REACTION_MODULE_ID, LEGACY_REACTION_FLAG_KEY, legacy);
    }
    this.#renderReactionOverview();
  }

  async #rollSavingThrow(button) {
    const row = button.closest("[data-combatant-id]");
    const entry = this.#enemyEntries().find(({ id }) => id === row?.dataset.combatantId);
    if (!entry) throw new Error("Der Gegner wurde nicht gefunden.");

    const scene = game.scenes?.get(entry.sceneId) ?? null;
    const tokenDocument = scene?.tokens?.get(entry.tokenId) ?? null;
    const actor = tokenDocument?.actor ?? game.actors?.get(entry.actorId) ?? null;
    if (!actor || typeof actor.rollSavingThrow !== "function") {
      throw new Error("Für diesen Gegner ist kein Rettungswurf verfügbar.");
    }

    const { config, dialog } = savingThrowConfig(button.dataset.ability, button.dataset.mode);
    const speaker = ChatMessage.getSpeaker({
      actor,
      token: tokenDocument,
      scene: tokenDocument?.parent ?? scene
    });

    button.disabled = true;
    try {
      await actor.rollSavingThrow(config, dialog, { data: { speaker } });
    } finally {
      button.disabled = false;
    }
  }

  #onEnemySelection(event) {
    const checkbox = event.target.closest?.('[data-action="bulk-select"]');
    const row = checkbox?.closest?.("[data-combatant-id]");
    if (!checkbox || !row) return;
    if (checkbox.checked) this.#bulkSelection.add(row.dataset.combatantId);
    else this.#bulkSelection.delete(row.dataset.combatantId);
    this.#set("bulk-count", this.#bulkSelection.size, "0");
    this.#root?.querySelector(".gm-workspace-enemies")
      ?.classList.toggle("has-bulk-selection", this.#bulkSelection.size > 0);
  }

  #selectHpInput(event) {
    event.target.closest?.('[data-action="hp-input"]')?.select();
  }

  #onHpInput(event) {
    const input = event.target.closest?.('[data-action="hp-input"]');
    if (!input || event.key !== "Enter") return;
    event.preventDefault();
    const operation = parseHpInput(input.value);
    const row = input.closest("[data-combatant-id]");
    const entry = this.#enemyEntries().find(({ id }) => id === row?.dataset.combatantId);
    if (!operation || !entry) {
      input.value = input.dataset.currentValue;
      ui.notifications?.warn("Ungültige TP-Eingabe. Erlaubt sind 50, -20 oder +10.");
      return;
    }
    this.#requestHpOperation(operation.mode, operation.amount, [entry]);
  }

  #onBulkAction(event) {
    const button = event.target.closest?.("[data-action]");
    if (!button?.dataset.action?.startsWith("bulk-")) return;
    if (button.dataset.action === "bulk-clear") {
      this.#bulkSelection.clear();
      this.#renderEnemyList();
      return;
    }
    const input = this.#root.querySelector('[data-role="bulk-value"]');
    const amount = Math.max(0, Math.trunc(Number(input?.value)));
    const targets = this.#enemyEntries().filter(({ id }) => this.#bulkSelection.has(id));
    if (!amount || !targets.length) {
      ui.notifications?.warn(targets.length ? "Bitte einen gültigen Wert eingeben." : "Bitte zuerst mindestens einen Gegner auswählen.");
      return;
    }
    const action = button.dataset.action;
    this.#requestHpOperation(
      action === "bulk-heal" ? "heal" : "damage",
      action === "bulk-half" ? halfDamage(amount) : amount,
      targets
    );
  }

  #requestHpOperation(mode, amount, targets) {
    this.#channel?.postMessage({
      type: "applyHpOperation",
      mode,
      amount,
      targets: targets.map(({ actorId, actorUuid, actorLinked, tokenId, sceneId }) => ({
        actorId, actorUuid, linked: actorLinked, tokenId, sceneId
      }))
    });
  }

  async #applyHpOperation(message) {
    try {
      for (const target of uniqueHpTargets(message.targets)) {
        const scene = game.scenes?.get(target.sceneId) ?? null;
        const token = scene?.tokens?.get(target.tokenId) ?? null;
        const actor = token?.actor ?? game.actors?.get(target.actorId) ?? null;
        if (!actor) continue;
        const hp = actor.system?.attributes?.hp ?? {};
        const next = calculateHpUpdate(hp, message.mode, message.amount);
        const update = { "system.attributes.hp.value": next.value };
        if (next.temp !== (Number(hp.temp) || 0)) update["system.attributes.hp.temp"] = next.temp;
        await actor.update(update);
      }
      this.#channel?.postMessage({ type: "hpOperationResult" });
    } catch (error) {
      this.#logger.error("HP operation failed", error);
      this.#channel?.postMessage({
        type: "hpOperationResult",
        error: `TP konnten nicht geändert werden: ${error.message}`
      });
    }
  }

  #onEnemyHover(event, active) {
    const row = event.target.closest?.("[data-combatant-id]");
    if (!row) return;
    if (!active && row.contains(event.relatedTarget)) return;
    if (active && row.contains(event.relatedTarget)) return;
    this.#channel?.postMessage({
      type: "hoverToken",
      tokenId: row.dataset.tokenId || null,
      sceneId: row.dataset.sceneId || null,
      active
    });
  }

  #selectLaptopToken({ tokenId, sceneId }) {
    if (!tokenId || sceneId !== canvas?.scene?.id) return;
    const token = canvas.tokens?.get(tokenId) ?? null;
    if (!token) return;
    token.control({ releaseOthers: true });
  }

  #handleEncounterTransition(event) {
    const previous = event?.previousSnapshot ?? null;
    const current = event?.snapshot ?? this.#getSnapshot?.();
    const turnChanged = Boolean(previous?.started && current?.started) && (
      previous.combatId !== current.combatId || previous.round !== current.round || previous.turn !== current.turn
    );
    if (turnChanged) {
      this.#pendingReactionDamage.clear();
      this.#pendingLegendaryDamage.clear();
    }
    const phases = turnGuidancePhases(previous, current);
    const nextGuidance = phases.length ? this.#buildTurnGuidance(phases) : null;
    if (phases.length) this.#turnGuidance = nextGuidance;
    else if (turnChanged) this.#turnGuidance = null;
    const ended = Boolean(previous?.started) && (!current?.started || previous.combatId !== current?.combatId);
    if (!ended) return;

    this.#combatantColors.clear();
    this.#colorCombatId = null;
    this.#nextColorIndex = 0;
    this.#remoteEnemyColors = [];
    this.#openReactionChoices.clear();
    this.#reactionBusy.clear();
    this.#pendingReactionDamage.clear();
    this.#legendaryBusy.clear();
    this.#pendingLegendaryDamage.clear();
    this.#turnGuidance = null;

    if (this.#workspaceMode) {
      this.#pinnedSelection = null;
      this.#selectedToken = null;
      this.#selectionRevision += 1;
      this.#channel?.postMessage({ type: "clearTokenSelection" });
    } else {
      this.#clearLaptopSelection();
    }
    this.#turnGuidance = nextGuidance;
  }

  #restoreReactionAtTurnStart(event) {
    if (this.#workspaceMode) return;
    const previous = event?.previousSnapshot ?? null;
    const current = event?.snapshot ?? this.#getSnapshot?.();
    if (!shouldRestoreReaction(previous, current)) return;

    this.#setReactionUsed(current.activeCombatantId, false, "turn-start").catch((error) => {
      this.#logger.error("Reaction reset at turn start failed", error);
      ui.notifications?.error(`Reaktion konnte zu Zugbeginn nicht zurückgesetzt werden: ${error.message}`);
    });
  }

  #restoreLegendaryAtTurnStart(event) {
    if (this.#workspaceMode) return;
    const previous = event?.previousSnapshot ?? null;
    const current = event?.snapshot ?? this.#getSnapshot?.();
    if (!shouldRestoreReaction(previous, current)) return;

    const actor = current?.context?.actor ?? null;
    const combat = current?.context?.combat ?? game.combat ?? null;
    const resource = legendaryResourceState(actor);
    if (!actor || resource.maximum <= 0 || !combat) return;

    Promise.resolve().then(async () => {
      if (resource.spent > 0 && typeof actor.update === "function") {
        await actor.update({ [resource.spentPath]: 0 });
      }
      const locks = foundry.utils.deepClone(combat.getFlag(MODULE_ID, LEGENDARY_LOCK_FLAG_KEY) ?? {});
      if (locks[current.activeCombatantId]) {
        delete locks[current.activeCombatantId];
        await combat.setFlag(MODULE_ID, LEGENDARY_LOCK_FLAG_KEY, locks);
      }
    }).catch((error) => {
      this.#logger.error("Legendary action reset at turn start failed", error);
      ui.notifications?.error(`Legendäre Aktionen konnten zu Zugbeginn nicht zurückgesetzt werden: ${error.message}`);
    });
  }

  #clearLaptopSelection() {
    canvas?.tokens?.releaseAll?.();
    this.#hoverLaptopToken({ active: false });
  }

  #hoverLaptopToken({ tokenId, sceneId, active }) {
    if (this.#hoveredToken && (!active || this.#hoveredToken.id !== tokenId)) {
      this.#hoveredToken.hover = false;
      this.#hoveredToken.renderFlags?.set?.({ refreshState: true });
      this.#hoveredToken = null;
    }
    if (!active || !tokenId || sceneId !== canvas?.scene?.id) return;
    const token = canvas.tokens?.get(tokenId) ?? null;
    if (!token) return;
    token.hover = true;
    token.renderFlags?.set?.({ refreshState: true });
    this.#hoveredToken = token;
  }

  #syncTokenColors() {
    if (this.#workspaceMode || !canvas?.ready) return;
    const desired = new Map(this.#remoteEnemyColors
      .filter(({ tokenId, sceneId }) => tokenId && sceneId === canvas.scene?.id)
      .map((entry) => [entry.tokenId, entry]));

    for (const [tokenId, overlay] of this.#tokenColorOverlays) {
      if (desired.has(tokenId)) continue;
      overlay.destroy?.({ children: true });
      this.#tokenColorOverlays.delete(tokenId);
    }

    for (const [tokenId, entry] of desired) {
      const token = canvas.tokens?.get(tokenId) ?? null;
      if (!token) continue;
      this.#drawTokenColor(token, entry);
    }
  }

  #drawTokenColor(token, entry) {
    let overlay = this.#tokenColorOverlays.get(token.id) ?? null;
    if (!overlay) {
      overlay = new PIXI.Graphics();
      overlay.eventMode = "none";
      overlay.zIndex = 1000;
      token.addChild(overlay);
      this.#tokenColorOverlays.set(token.id, overlay);
    }
    overlay.clear();
    const color = Number.parseInt(entry.color.slice(1), 16);
    const padding = 5;
    const width = Math.max(1, token.w - padding * 2);
    const height = Math.max(1, token.h - padding * 2);
    if (typeof overlay.rect === "function") {
      overlay.rect(padding, padding, width, height).stroke({ color, width: entry.active ? 6 : 4, alpha: 0.95 });
    } else {
      overlay.lineStyle(entry.active ? 6 : 4, color, 0.95);
      overlay.drawRect(padding, padding, width, height);
    }
  }

  #clearTokenColors() {
    for (const overlay of this.#tokenColorOverlays.values()) overlay.destroy?.({ children: true });
    this.#tokenColorOverlays.clear();
    if (this.#hoveredToken) {
      this.#hoveredToken.hover = false;
      this.#hoveredToken.renderFlags?.set?.({ refreshState: true });
      this.#hoveredToken = null;
    }
  }

  #broadcastState() {
    if (this.#workspaceMode) return;
    const snapshot = this.#getSnapshot?.();
    this.#channel?.postMessage({
      type: "combatState",
      combatId: snapshot?.combatId ?? null,
      round: snapshot?.round ?? null,
      turn: snapshot?.turn ?? null
    });
  }

  #activeSelection() {
    const snapshot = this.#getSnapshot?.();
    const active = snapshot?.combatants?.find(({ id }) => id === snapshot.activeCombatantId) ?? null;
    if (!snapshot?.started || snapshot?.activeType !== "npc" || !active) return null;

    return {
      actor: snapshot.context?.actor ?? null,
      summary: {
        tokenId: snapshot.activeTokenId,
        tokenName: active.name,
        actorId: snapshot.activeActorId,
        actorName: snapshot.context?.actor?.name ?? active.name,
        actorType: "npc",
        sceneId: snapshot.sceneId
      },
      source: "Aktiver Kampfteilnehmer"
    };
  }

  async #clickedSelection() {
    const selection = this.#selectedToken;
    if (selection?.actorType !== "npc") return null;

    const snapshot = this.#getSnapshot?.();
    if (
      snapshot?.activeType === "npc" &&
      selection.tokenId &&
      selection.tokenId === snapshot.activeTokenId
    ) {
      return this.#activeSelection();
    }

    const scene = game.scenes?.get(selection.sceneId) ?? null;
    const tokenDocument = scene?.tokens?.get(selection.tokenId) ?? null;
    const actor = tokenDocument?.actor ?? game.actors?.get(selection.actorId) ?? null;
    if (!actor || actor.type !== "npc") return null;

    return {
      actor,
      summary: selection,
      source: "Auf Laptop angeklickt"
    };
  }

  async #desiredSelection() {
    if (this.#pinnedSelection?.actor) {
      return { ...this.#pinnedSelection, source: "Angepinnt" };
    }

    return await this.#clickedSelection() ?? this.#activeSelection();
  }

  #togglePin() {
    if (this.#pinnedSelection) {
      this.#pinnedSelection = null;
    } else if (this.#displayedActor) {
      this.#pinnedSelection = {
        actor: this.#displayedActor,
        summary: {
          actorId: this.#displayedActor.id,
          actorName: this.#displayedActor.name,
          actorType: this.#displayedActor.type
        }
      };
    }

    this.#render();
  }

  #buildTurnGuidance(phases) {
    const enemies = this.#enemyEntries();
    const sections = phases.map(({ timing, snapshot }) => {
      const active = snapshot?.combatants?.find(({ id }) => id === snapshot.activeCombatantId) ?? null;
      const reminders = [];
      const legendary = [];

      for (const enemy of enemies) {
        const actor = this.#actorForEntry(enemy);
        if (!actor) continue;
        for (const effect of actorTurnStartEffects(actor).filter((entry) => entry.timing === timing)) {
          reminders.push({
            ...effect,
            actorId: actor.id,
            actorName: actor.name,
            combatantId: enemy.id,
            color: enemy.color
          });
        }
        if (timing !== "end") continue;
        for (const action of actorLegendaryActions(actor)) {
          const item = actor.items?.get?.(action.itemId) ?? collectionValues(actor.items)
            .find(({ id }) => id === action.itemId) ?? null;
          legendary.push({
            ...action,
            plan: legendaryExecutionPlan(actor, item),
            actorId: actor.id,
            actorName: actor.name,
            combatantId: enemy.id,
            color: enemy.color
          });
        }
      }

      return {
        timing,
        playerName: active?.name ?? "Spieler",
        reminders,
        legendary
      };
    }).filter(({ reminders, legendary }) => reminders.length || legendary.length);

    if (!sections.length) return null;
    return {
      id: `${phases.map(({ timing, snapshot }) => `${timing}:${snapshot.combatId}:${snapshot.round}:${snapshot.turn}`).join("|")}`,
      sections,
      count: sections.reduce((total, section) => total + section.reminders.length + section.legendary.length, 0),
      visible: true
    };
  }

  #showStoredTurnGuidance() {
    if (!this.#turnGuidance) return;
    this.#turnGuidance.visible = true;
    this.#render();
  }

  #hideTurnGuidance() {
    if (!this.#turnGuidance) return;
    this.#turnGuidance.visible = false;
    this.#render();
  }

  #onTurnGuidanceClick(event) {
    const button = event.target.closest?.("[data-guidance-action]");
    if (!button) return;
    const action = button.dataset.guidanceAction;
    if (action === "dismiss") {
      this.#hideTurnGuidance();
      return;
    }

    const enemy = this.#enemyEntries().find(({ id }) => id === button.dataset.combatantId);
    if (action === "show-actor" && enemy) {
      this.#selectEnemyEntry(enemy);
      return;
    }
    if (action === "roll-legendary-damage" && enemy) {
      this.#rollPendingLegendaryDamage(enemy, button.dataset.legendaryKey, button.dataset.pendingId).catch((error) => {
        this.#logger.error("Legendary damage failed", error);
        ui.notifications?.error(`Legendärer Schaden konnte nicht ausgewürfelt werden: ${error.message}`);
      });
      return;
    }
    if (action !== "execute-legendary" || !enemy) return;

    const legendary = this.#turnGuidance?.sections
      ?.flatMap((section) => section.legendary)
      ?.find((entry) => entry.combatantId === enemy.id && entry.id === button.dataset.legendaryId) ?? null;
    if (!legendary) return;
    this.#executeLegendaryAction(enemy, legendary).catch((error) => {
      this.#logger.error("Legendary action failed", error);
      ui.notifications?.error(`Legendäre Aktion konnte nicht ausgeführt werden: ${error.message}`);
    });
  }

  #legendaryKey(combatantId, actionId) {
    return `${combatantId}:${actionId}`;
  }

  async #setLegendaryActionLocked(combatantId, actionId) {
    const combat = this.#getSnapshot?.()?.context?.combat ?? game.combat ?? null;
    if (!combat?.started) throw new Error("Es läuft kein Encounter mehr.");
    const locks = foundry.utils.deepClone(combat.getFlag(MODULE_ID, LEGENDARY_LOCK_FLAG_KEY) ?? {});
    locks[combatantId] = { ...(locks[combatantId] ?? {}), [actionId]: true };
    await combat.setFlag(MODULE_ID, LEGENDARY_LOCK_FLAG_KEY, locks);
  }

  async #executeLegendaryAction(enemy, legendary) {
    const key = this.#legendaryKey(enemy.id, legendary.id);
    if (this.#legendaryBusy.has(key)) return;
    const actor = this.#actorForEntry(enemy);
    const item = actor?.items?.get?.(legendary.itemId) ?? collectionValues(actor?.items)
      .find(({ id }) => id === legendary.itemId) ?? null;
    const activity = item?.system?.activities?.get?.(legendary.activityId) ?? collectionValues(item?.system?.activities)
      .find(({ id }) => id === legendary.activityId) ?? null;
    const activityAction = statblockActivityAction(activity);
    if (!actor || !item || !activity || !activityAction) {
      throw new Error("Die zugehörige legendäre D&D5e-Aktivität wurde nicht gefunden.");
    }

    const resource = legendaryResourceState(actor);
    if (resource.remaining < legendary.cost) {
      throw new Error(`${item.name} benötigt ${legendary.cost} legendäre Aktion${legendary.cost === 1 ? "" : "en"}; verfügbar sind ${resource.remaining}.`);
    }
    if (this.#legendaryActionLocked(enemy.id, legendary.id)) {
      throw new Error(`${item.name} ist bis zum Beginn des nächsten eigenen Zugs gesperrt.`);
    }

    this.#legendaryBusy.add(key);
    this.#render();
    this.#releaseStaleModifiers();
    try {
      const useResult = await executeStatblockActivity(activity, activityAction);
      if (useResult === false || useResult === null) throw new Error(`${item.name} wurde von D&D5e nicht ausgeführt.`);
      if (legendary.locksUntilNextTurn) await this.#setLegendaryActionLocked(enemy.id, legendary.id);

      const plan = legendaryExecutionPlan(actor, item);
      const linkedItem = actor.items?.get?.(plan.linkedItemId) ?? collectionValues(actor.items)
        .find(({ id }) => id === plan.linkedItemId) ?? null;
      const attack = linkedItem?.system?.activities?.get?.(plan.attackActivityId) ?? collectionValues(linkedItem?.system?.activities)
        .find(({ id }) => id === plan.attackActivityId) ?? null;
      const pending = [];

      if (attack && typeof attack.rollAttack === "function") {
        for (let index = 0; index < Math.max(1, plan.attackCount); index += 1) {
          const rollGroupId = foundry.utils.randomID();
          const result = await attack.rollAttack({}, { configure: false }, rollMessageConfig(rollGroupId));
          if (result === false || result === null) continue;
          if (typeof attack.rollDamage === "function") {
            pending.push({
              id: `${Date.now()}-${index}-${attack.id}`,
              rollGroupId,
              itemId: linkedItem.id,
              activityId: attack.id,
              label: plan.attackCount > 1 ? `${linkedItem.name} ${index + 1}` : linkedItem.name
            });
          }
        }
      } else if (plan.save?.ability && plan.save.dc) {
        ui.notifications?.info(`${linkedItem?.name ?? item.name}: ${this.#saveAbilityLabel(plan.save.ability)}-Rettungswurf – SG ${plan.save.dc}`);
      }

      if (pending.length) this.#pendingLegendaryDamage.set(key, pending);
    } finally {
      this.#legendaryBusy.delete(key);
      this.#render();
    }
  }

  #saveAbilityLabel(ability) {
    return ({ str: "STÄ", dex: "GES", con: "KON", int: "INT", wis: "WEI", cha: "CHA" })[
      String(ability ?? "").toLowerCase()
    ] ?? String(ability ?? "").toUpperCase();
  }

  async #rollPendingLegendaryDamage(enemy, key, pendingId) {
    if (this.#legendaryBusy.has(key)) return;
    const actor = this.#actorForEntry(enemy);
    const pending = this.#pendingLegendaryDamage.get(key) ?? [];
    const target = pending.find(({ id }) => id === pendingId) ?? null;
    const item = actor?.items?.get?.(target?.itemId) ?? null;
    const activity = item?.system?.activities?.get?.(target?.activityId) ?? collectionValues(item?.system?.activities)
      .find(({ id }) => id === target?.activityId) ?? null;
    if (!activity || typeof activity.rollDamage !== "function") throw new Error("Der zugehörige Schadenswurf wurde nicht gefunden.");

    this.#legendaryBusy.add(key);
    try {
      const result = await activity.rollDamage({}, { configure: false }, rollMessageConfig(target.rollGroupId));
      if (result !== false && result !== null) {
        const remaining = pending.filter(({ id }) => id !== pendingId);
        if (remaining.length) this.#pendingLegendaryDamage.set(key, remaining);
        else this.#pendingLegendaryDamage.delete(key);
      }
    } finally {
      this.#legendaryBusy.delete(key);
      this.#render();
    }
  }

  async #onCombatControl(event) {
    const button = event.target.closest?.("[data-combat-action]");
    if (!button || this.#combatControlBusy) return;
    const combat = game.combat;
    const method = ({
      "previous-round": "previousRound",
      "previous-turn": "previousTurn",
      "end-turn": "nextTurn",
      "next-turn": "nextTurn",
      "next-round": "nextRound"
    })[button.dataset.combatAction];
    if (!combat?.started || !method || typeof combat[method] !== "function") return;

    this.#combatControlBusy = true;
    this.#renderCombatControls();
    try {
      await combat[method]();
    } catch (error) {
      this.#logger.error("Combat navigation failed", error);
      ui.notifications?.error(`Kampfsteuerung fehlgeschlagen: ${error.message}`);
    } finally {
      this.#combatControlBusy = false;
      this.#renderCombatControls();
    }
  }

  #renderCombatControls() {
    const started = Boolean(this.#getSnapshot?.()?.started);
    for (const button of this.#root?.querySelectorAll?.("[data-combat-action]") ?? []) {
      button.disabled = !started || this.#combatControlBusy;
    }
  }

  #set(field, value, fallback) {
    const element = this.#root?.querySelector?.(`[data-field="${field}"]`);
    if (element) element.textContent = displayValue(value, fallback);
  }

  #render() {
    if (!this.#workspaceMode || !this.#root) return;

    const snapshot = this.#getSnapshot?.();
    const active = snapshot?.combatants?.find(({ id }) => id === snapshot.activeCombatantId) ?? null;
    this.#set("combat-status", snapshot?.started ? "Gestartet" : "Kein gestarteter Kampf");
    this.#set("round", snapshot?.round);
    this.#set("turn", snapshot?.turn === null || snapshot?.turn === undefined ? null : snapshot.turn + 1);
    this.#set("active-name", active?.name);
    this.#set("active-type", snapshot?.activeType);
    this.#set("selected-name", this.#selectedToken?.actorName ?? this.#selectedToken?.tokenName);
    this.#set("current-turn-name", snapshot?.started ? active?.name : null, "Kein laufender Kampf");
    const currentTurn = this.#root.querySelector('[data-role="current-turn"]');
    currentTurn.classList.toggle("is-player-turn", snapshot?.started && snapshot?.activeType === "player");
    currentTurn.classList.toggle("is-npc-turn", snapshot?.started && snapshot?.activeType === "npc");
    this.#renderEnemyList();
    this.#renderReactionOverview();
    this.#renderCombatControls();
    this.#renderRollResults();

    const guidanceReturn = this.#root.querySelector('[data-action="show-turn-guidance"]');
    guidanceReturn.hidden = !this.#turnGuidance || this.#turnGuidance.visible;
    if (this.#turnGuidance) guidanceReturn.querySelector("span").textContent = `Hinweise (${this.#turnGuidance.count})`;

    const revision = ++this.#selectionRevision;
    if (this.#turnGuidance?.visible) {
      this.#renderTurnGuidance(revision).catch((error) => this.#showSheetError(error));
      return;
    }
    this.#desiredSelection()
      .then((selection) => {
        if (revision !== this.#selectionRevision) return;
        return this.#applySelection(selection);
      })
      .catch((error) => this.#showSheetError(error));
  }

  async #applySelection(selection) {
    const actor = selection?.actor ?? null;
    const source = selection?.source ?? "Keine Auswahl";
    this.#set("displayed-name", actor?.name, "Kein Gegner ausgewählt");
    this.#set("selection-source", source);
    this.#set("selection-source-detail", source);
    const eyebrow = this.#root.querySelector(".gm-workspace-statblock-row .gm-workspace-eyebrow");
    if (eyebrow) eyebrow.textContent = "Statblock";

    const pinButton = this.#root.querySelector('[data-action="toggle-pin"]');
    pinButton.disabled = !actor;
    pinButton.classList.toggle("is-pinned", Boolean(this.#pinnedSelection));
    pinButton.querySelector("span").textContent = this.#pinnedSelection
      ? "Anheften lösen"
      : "Anpinnen";

    if (!actor) {
      await this.#closeDisplayedSheet();
      this.#showEmptySheet();
      return;
    }

    if (this.#displayedActor === actor && this.#displayedSheet?.rendered) {
      this.#mountSheet(this.#displayedSheet);
      return;
    }

    await this.#showActorSheet(actor);
  }

  async #renderTurnGuidance(revision) {
    const guidance = this.#turnGuidance;
    if (!guidance?.visible) return;
    await this.#closeDisplayedSheet();
    if (revision !== this.#selectionRevision || guidance !== this.#turnGuidance || !guidance.visible) return;

    const escape = (value) => foundry.utils.escapeHTML(String(value ?? ""));
    const phaseLabel = (timing) => timing === "start" ? "Zugbeginn" : "Zugende";
    const title = guidance.sections.map(({ timing, playerName }) => `${phaseLabel(timing)}: ${playerName}`).join(" · ");
    const active = this.#getSnapshot?.()?.combatants?.find(({ id }) => id === this.#getSnapshot?.()?.activeCombatantId) ?? null;
    const dismissLabel = this.#pinnedSelection?.actor
      ? `Zurück zu ${this.#pinnedSelection.actor.name}`
      : this.#getSnapshot?.()?.activeType === "npc" && active
        ? `Weiter zu ${active.name}`
        : "Statblock anzeigen";

    const eyebrow = this.#root.querySelector(".gm-workspace-statblock-row .gm-workspace-eyebrow");
    if (eyebrow) eyebrow.textContent = "Zughinweise";
    this.#set("displayed-name", title);
    this.#set("selection-source", `${guidance.count} Hinweise`);

    const pinButton = this.#root.querySelector('[data-action="toggle-pin"]');
    pinButton.disabled = true;
    pinButton.classList.toggle("is-pinned", Boolean(this.#pinnedSelection));

    const host = this.#root.querySelector('[data-role="sheet-host"]');
    host.innerHTML = `
      <div class="gm-workspace-turn-guidance">
        ${guidance.sections.map((section) => `
          <section class="gm-workspace-guidance-phase is-${section.timing}">
            <header>
              <span>${phaseLabel(section.timing)}</span>
              <h3>${escape(section.playerName)}</h3>
            </header>
            ${section.reminders.length ? `
              <div class="gm-workspace-guidance-group">
                <h4><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Auren &amp; Hinweise</h4>
                ${section.reminders.map((entry) => `
                  <article class="gm-workspace-guidance-card" style="--gm-enemy-color:${entry.color}">
                    <div>
                      <span>${escape(entry.actorName)}</span>
                      <h5>${escape(entry.name)}</h5>
                      <p>${escape(entry.description)}</p>
                    </div>
                    <button type="button" data-guidance-action="show-actor" data-combatant-id="${entry.combatantId}">Statblock</button>
                  </article>
                `).join("")}
              </div>
            ` : ""}
            ${section.legendary.length ? `
              <div class="gm-workspace-guidance-group">
                <h4><i class="fa-solid fa-crown" aria-hidden="true"></i> Legendäre Aktionen</h4>
                ${section.legendary.map((entry) => {
                  const enemy = this.#enemyEntries().find(({ id }) => id === entry.combatantId) ?? null;
                  const actor = this.#actorForEntry(enemy);
                  const resource = legendaryResourceState(actor);
                  const locked = this.#legendaryActionLocked(entry.combatantId, entry.id);
                  const key = this.#legendaryKey(entry.combatantId, entry.id);
                  const busy = this.#legendaryBusy.has(key);
                  const insufficient = resource.remaining < entry.cost;
                  const unavailable = locked || insufficient || busy;
                  const reason = locked
                    ? "Bis zum Beginn des nächsten eigenen Zugs gesperrt."
                    : insufficient
                      ? `Nicht genügend legendäre Aktionen: ${resource.remaining}/${resource.maximum} verfügbar.`
                      : busy ? "Wird gerade ausgeführt." : "";
                  const save = entry.plan?.save?.ability && entry.plan?.save?.dc
                    ? `<strong class="gm-workspace-legendary-save">${this.#saveAbilityLabel(entry.plan.save.ability)}-Rettungswurf · SG ${entry.plan.save.dc}</strong>`
                    : "";
                  const pending = (this.#pendingLegendaryDamage.get(key) ?? []).map((damage) => `
                    <button type="button" class="is-primary gm-workspace-legendary-damage" title="Linksklick: Schaden würfeln · Rechtsklick: Verfehlt bestätigen" data-guidance-action="roll-legendary-damage" data-combatant-id="${entry.combatantId}" data-legendary-key="${key}" data-pending-id="${damage.id}">${escape(damage.label)} – Schaden</button>
                  `).join("");
                  return `
                    <article class="gm-workspace-guidance-card${unavailable ? " is-unavailable" : ""}" style="--gm-enemy-color:${entry.color}">
                      <div>
                        <span>${escape(entry.actorName)} · Kosten ${entry.cost} · <i class="fa-solid fa-crown" aria-hidden="true"></i> ${resource.remaining}/${resource.maximum}</span>
                        <h5>${escape(entry.name)}</h5>
                        <p>${escape(entry.description)}</p>
                        ${save}
                        ${reason ? `<em class="gm-workspace-legendary-reason">${escape(reason)}</em>` : ""}
                      </div>
                      <div class="gm-workspace-guidance-card-actions">
                        <button type="button" data-guidance-action="show-actor" data-combatant-id="${entry.combatantId}">Statblock</button>
                        ${pending}
                        ${entry.activityId ? `<button type="button" class="is-primary" data-guidance-action="execute-legendary" data-combatant-id="${entry.combatantId}" data-legendary-id="${entry.id}" aria-disabled="${unavailable}" title="${escape(reason)}">${locked ? "Gesperrt" : "Ausführen"}</button>` : ""}
                      </div>
                    </article>
                  `;
                }).join("")}
              </div>
            ` : ""}
          </section>
        `).join("")}
        <button type="button" class="gm-workspace-guidance-dismiss" data-guidance-action="dismiss">
          ${escape(dismissLabel)} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
        </button>
      </div>
    `;
  }

  async #showActorSheet(actor) {
    await this.#closeDisplayedSheet();
    this.#displayedActor = actor;
    this.#showSheetLoading(actor.name);
    this.#recordSheetDebug("showActorSheet start", { actor: actor.name });

    const sheet = actor.sheet;
    if (!sheet) throw new Error(`Für ${actor.name} ist kein Actor-Sheet verfügbar.`);
    this.#displayedSheet = sheet;

    const ApplicationV2 = foundry?.applications?.api?.ApplicationV2;
    const renderResult = ApplicationV2 && sheet instanceof ApplicationV2
      ? sheet.render({ force: true, focus: false })
      : sheet.render(true, { focus: false });
    if (renderResult?.then) await renderResult;
    this.#recordSheetDebug("showActorSheet render returned", this.#sheetSnapshot(sheet));
    this.#mountSheet(sheet);
  }

  #mountSheet(sheet, renderedHtml = null) {
    if (!this.#root || sheet !== this.#displayedSheet) return;
    const host = this.#root.querySelector('[data-role="sheet-host"]');
    const element = applicationElement(sheet, renderedHtml);
    if (!host || !element) return;

    element.classList.add("gm-workspace-embedded-sheet");
    this.#preventSheetMinimization(sheet, element);
    this.#prepareSheetElement(element);
    host.replaceChildren(element);
  }

  #preventSheetMinimization(sheet, element) {
    if (this.#sheetMinimizePatch?.sheet !== sheet) {
      this.#restoreSheetMinimize();
      const hadOwn = Object.hasOwn(sheet, "minimize");
      const ownDescriptor = Object.getOwnPropertyDescriptor(sheet, "minimize");
      const original = sheet.minimize;

      if (typeof original === "function") {
        try {
          Object.defineProperty(sheet, "minimize", {
            configurable: true,
            writable: true,
            value: (...args) => {
              this.#recordSheetDebug("minimize blocked", {
                arguments: args.length,
                snapshot: this.#sheetSnapshot(sheet)
              });
              return sheet;
            }
          });
          this.#sheetMinimizePatch = { sheet, hadOwn, ownDescriptor, original };
        } catch (error) {
          this.#logger.warn("Statblock minimize could not be patched", error);
        }
      }
    }

    this.#sheetStateObserver?.disconnect();
    this.#sheetStateObserver = new MutationObserver(() => {
      if (!element.classList.contains("minimizing") && !element.classList.contains("minimized")) return;
      this.#recordSheetDebug("minimized state recovered", this.#sheetSnapshot(sheet));
      element.classList.remove("minimizing", "minimized");
      try {
        const result = sheet.maximize?.();
        if (result?.catch) result.catch((error) => this.#logger.warn("Statblock could not be maximized", error));
      } catch (error) {
        this.#logger.warn("Statblock could not be maximized", error);
      }
    });
    this.#sheetStateObserver.observe(element, { attributes: true, attributeFilter: ["class"] });
  }

  #restoreSheetMinimize() {
    this.#sheetStateObserver?.disconnect();
    this.#sheetStateObserver = null;
    const patch = this.#sheetMinimizePatch;
    this.#sheetMinimizePatch = null;
    if (!patch) return;

    try {
      if (patch.hadOwn) Object.defineProperty(patch.sheet, "minimize", patch.ownDescriptor);
      else delete patch.sheet.minimize;
    } catch (error) {
      this.#logger.warn("Statblock minimize patch could not be restored", error);
    }
  }

  #scheduleSheetMount(sheet, renderedHtml = null) {
    const mount = (html = null) => {
      if (sheet !== this.#displayedSheet) return;
      this.#mountSheet(sheet, html);
    };

    queueMicrotask(() => mount(renderedHtml));

    for (const delay of [50, 200]) {
      const timer = setTimeout(() => {
        this.#sheetMountTimers.delete(timer);
        mount();
      }, delay);
      this.#sheetMountTimers.add(timer);
    }
  }

  async #closeDisplayedSheet() {
    const sheet = this.#displayedSheet;
    this.#displayedSheet = null;
    this.#displayedActor = null;
    this.#restoreSheetMinimize();
    if (!sheet?.rendered) return;

    try {
      const result = sheet.close({ animate: false });
      if (result?.then) await result;
    } catch (error) {
      this.#logger.warn("Previous statblock could not be closed", error);
    }
  }

  #showEmptySheet() {
    const host = this.#root?.querySelector('[data-role="sheet-host"]');
    if (!host) return;
    host.innerHTML = `
      <div class="gm-workspace-empty">
        <i class="fa-solid fa-dragon" aria-hidden="true"></i>
        <strong>Wähle auf dem Laptop einen Gegner aus oder starte dessen Zug.</strong>
      </div>
    `;
  }

  #showSheetLoading(name) {
    const host = this.#root?.querySelector('[data-role="sheet-host"]');
    if (!host) return;
    host.innerHTML = `
      <div class="gm-workspace-empty">
        <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
        <strong>Statblock für ${name} wird geladen …</strong>
      </div>
    `;
  }

  #showSheetError(error) {
    this.#logger.error("Native statblock could not be embedded", error);
    const host = this.#root?.querySelector('[data-role="sheet-host"]');
    if (!host) return;
    host.innerHTML = `
      <div class="gm-workspace-empty gm-workspace-error">
        <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
        <strong>Der native Statblock konnte nicht eingebettet werden.</strong>
        <span>Details stehen in der F12-Konsole.</span>
      </div>
    `;
  }
}
