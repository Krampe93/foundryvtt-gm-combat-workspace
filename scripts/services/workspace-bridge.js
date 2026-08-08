import { MODULE_ID } from "../config.js";
import { createLogger } from "../core/logger.js";
import { calculateHpUpdate, halfDamage, parseHpInput, uniqueHpTargets } from "./hp-operations.js";
import {
  LEGACY_REACTION_FLAG_KEY,
  LEGACY_REACTION_MODULE_ID,
  REACTION_FLAG_KEY,
  actorMeleeAttacks,
  actorReactions,
  actorTurnStartEffects,
  isPlayerFacingTurn
} from "./reaction-operations.js";
import {
  executeStatblockActivity,
  missingStatblockItems,
  prepareInlineActivityCommands,
  prepareStatblockDescription,
  prepareStatblockSource,
  statblockActivityAction
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
  #logger;
  #channel = null;
  #unsubscribe = null;
  #controlTokenHook = null;
  #canvasReadyHook = null;
  #systemStatusGuardHook = null;
  #systemStatusDeleteGuardHook = null;
  #rollAttackHook = null;
  #sheetRenderHooks = [];
  #sheetDiagnosticHooks = [];
  #sheetHostObserver = null;
  #sheetMountTimers = new Set();
  #windowFocusHandler = null;
  #root = null;
  #selectedToken = null;
  #pinnedSelection = null;
  #displayedActor = null;
  #displayedSheet = null;
  #sheetMinimizePatch = null;
  #sheetStateObserver = null;
  #preparedSheetElements = new WeakSet();
  #preparedItemLinks = new WeakSet();
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

  constructor({ eventBus, getSnapshot, logger = createLogger("WorkspaceBridge") }) {
    this.#eventBus = eventBus;
    this.#getSnapshot = getSnapshot;
    this.#logger = logger;
  }

  get workspaceMode() {
    return this.#workspaceMode;
  }

  start() {
    this.#channel = new BroadcastChannel(CHANNEL_NAME);
    this.#channel.addEventListener("message", (event) => this.#receive(event.data));
    this.#unsubscribe = this.#eventBus.on("combatStateChanged", (event) => {
      this.#handleEncounterTransition(event);
      this.#render();
      this.#broadcastState();
      this.#syncTokenColors();
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
      this.#channel.postMessage({ type: "workspaceReady" });
    } else {
      this.#renderLauncher();
    }

    this.#render();
    this.#syncTokenColors();
  }

  stop() {
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
                  <h2><i class="fa-solid fa-bolt" aria-hidden="true"></i> Reaktionen &amp; Hinweise</h2>
                </div>
                <span class="gm-workspace-reaction-count" data-field="reaction-count">0 verfügbar</span>
              </header>
              <div class="gm-workspace-turn-warnings" data-role="turn-warnings"></div>
              <div class="gm-workspace-reaction-list" data-role="reaction-list"></div>
            </section>
            <div class="gm-workspace-utility-column">
              <section class="gm-workspace-reserved gm-workspace-roll-results" aria-label="Würfelergebnisse">
                <header>
                  <h2><i class="fa-solid fa-dice-d20" aria-hidden="true"></i> Würfelergebnisse</h2>
                </header>
                <div class="gm-workspace-reserved-empty">
                  <i class="fa-solid fa-dice" aria-hidden="true"></i>
                  <span>Für eine spätere Etappe reserviert</span>
                </div>
              </section>
              <section class="gm-workspace-reserved gm-workspace-minimap" aria-label="Minimap">
                <header>
                  <h2><i class="fa-solid fa-map" aria-hidden="true"></i> Minimap</h2>
                </header>
                <div class="gm-workspace-minimap-placeholder" aria-hidden="true">
                  <span></span><span></span><span></span><span></span>
                </div>
                <p>Interaktive Gegnerpunkte folgen in einer späteren Etappe.</p>
              </section>
            </div>
          </section>
        </aside>
      </section>
    `;

    root.querySelector('[data-action="toggle-pin"]')
      .addEventListener("click", () => this.#togglePin());

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

    document.body.append(root);
    this.#root = root;
    this.#exposeNotifications();
    this.#registerSheetDiagnostics();

  }

  #exposeNotifications() {
    const notifications = document.querySelector("#notifications, .notifications");
    if (!notifications) return;
    if (notifications.parentElement !== document.body) document.body.append(notifications);
    notifications.classList.add("gm-workspace-notifications");
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
      }, { capture: true });
    }

    this.#wireStatblockItemLinks(element);
    void this.#augmentStatblock(element, this.#displayedActor).catch((error) => {
      this.#logger.warn("Statblock additions could not be prepared", error);
    });
  }

  #wireStatblockItemLinks(element) {
    for (const link of element.querySelectorAll('.roll-link[data-action="use"][data-item-id]')) {
      if (this.#preparedItemLinks.has(link)) continue;
      this.#preparedItemLinks.add(link);
      link.addEventListener("click", (event) => this.#useItemWithoutStaleModifiers(event, link));
    }
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

    this.#wireStatblockItemLinks(element);
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

    const itemId = link.closest("[data-item-id]")?.dataset?.itemId;
    const item = this.#displayedActor?.items?.get(itemId) ?? null;
    if (!item || link.ariaDisabled === "true") return;
    const activityId = link.dataset.activityId ?? null;
    const activity = activityId
      ? item.system?.activities?.get?.(activityId) ?? Array.from(item.system?.activities?.values?.() ?? [])
        .find(({ id }) => id === activityId) ?? null
      : null;

    const downKeysBefore = Array.from(game.keyboard?.downKeys ?? []).sort();
    const bindings = this.#rollKeybindings();

    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    this.#releaseStaleModifiers();

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
        activityAction: link.dataset.activityAction ?? null,
        route: activity ? "Workspace → activity" : "Workspace → item.use(cleanEvent)"
      },
      roll: null
    };
    this.#renderRollDebug();
    this.#recordSheetDebug("item click", {
      item: item.name,
      itemId: item.id,
      snapshot: this.#sheetSnapshot(this.#displayedSheet)
    });

    const cleanEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      detail: event.detail,
      screenX: event.screenX,
      screenY: event.screenY,
      clientX: event.clientX,
      clientY: event.clientY,
      button: event.button,
      buttons: event.buttons,
      relatedTarget: event.relatedTarget,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false
    });

    try {
      let result;
      if (activity) result = executeStatblockActivity(activity, link.dataset.activityAction);
      else result = item.use({ event: cleanEvent });
      result?.catch?.((error) => {
        this.#logger.error(`Statblock activity failed: ${item.name}`, error);
        ui.notifications?.error(`${item.name} konnte nicht ausgeführt werden: ${error.message}`);
      });
    } catch (error) {
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
      return;
    }

    if (message.type === "tokenSelected" && this.#workspaceMode) {
      this.#selectedToken = message.token ?? null;
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

  #reactionEntryData(entry) {
    const actor = this.#actorForEntry(entry);
    const state = this.#getSnapshot?.()?.reactionStates?.[entry.id] ?? {};
    return {
      ...entry,
      actor,
      reactions: actorReactions(actor),
      meleeAttacks: actorMeleeAttacks(actor),
      used: Boolean(state.used)
    };
  }

  #renderReactionOverview() {
    const panel = this.#root?.querySelector('[data-role="reaction-panel"]');
    const list = this.#root?.querySelector('[data-role="reaction-list"]');
    const warnings = this.#root?.querySelector('[data-role="turn-warnings"]');
    if (!panel || !list || !warnings) return;

    const snapshot = this.#getSnapshot?.();
    const playerTurn = Boolean(snapshot?.started && isPlayerFacingTurn(snapshot.activeType));
    const entries = this.#enemyEntries().map((entry) => this.#reactionEntryData(entry));
    const available = entries.filter(({ used }) => !used).length;

    panel.classList.toggle("is-player-turn", playerTurn);
    this.#set("reaction-count", `${available} verfügbar`);

    const reminderGroups = new Map();
    if (playerTurn) {
      for (const entry of entries) {
        for (const effect of actorTurnStartEffects(entry.actor)) {
          const key = `${effect.name}:${effect.timing}:${effect.description}`;
          const group = reminderGroups.get(key) ?? { effect, enemies: [] };
          group.enemies.push(entry.displayName);
          reminderGroups.set(key, group);
        }
      }
    }

    warnings.innerHTML = [...reminderGroups.values()].map(({ effect, enemies }) => {
      const timingLabel = effect.timing === "start"
        ? "Zu Beginn des Zuges prüfen"
        : effect.timing === "end"
          ? "Am Ende des Zuges prüfen"
          : "Aura während des Zuges prüfen";
      return `
      <div class="gm-workspace-turn-warning">
        <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
        <span><strong>${timingLabel}: ${foundry.utils.escapeHTML(effect.name)}</strong>
        <small>${foundry.utils.escapeHTML(enemies.join(", "))} · ${foundry.utils.escapeHTML(effect.description)}</small></span>
      </div>
    `;
    }).join("");

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
          ? `<button type="button" class="gm-workspace-reaction-action" data-action="execute-reaction" data-item-id="${reaction.itemId}" data-activity-id="${reaction.activityId}" data-tooltip="${tooltip}" title="${tooltip}" ${entry.used ? "disabled" : ""}>${foundry.utils.escapeHTML(reaction.name)}</button>`
          : `<button type="button" class="gm-workspace-reaction-action" data-action="show-reaction-actor" data-tooltip="${tooltip}" title="${tooltip}">${foundry.utils.escapeHTML(reaction.name)}</button>`;
      }).join("");

      const choiceOpen = this.#openReactionChoices.has(entry.id);
      let opportunityTooltip = "";
      let opportunityAction = "";
      if (entry.meleeAttacks.length === 1) {
        const attack = entry.meleeAttacks[0];
        opportunityTooltip = foundry.utils.escapeHTML(`${attack.name} als Gelegenheitsangriff ausführen.`).replaceAll('"', "&quot;");
        opportunityAction = `<button type="button" class="gm-workspace-reaction-action" data-action="execute-opportunity" data-item-id="${attack.itemId}" data-activity-id="${attack.activityId}" data-tooltip="${opportunityTooltip}" title="${opportunityTooltip}" ${entry.used ? "disabled" : ""}>Gelegenheitsangriff</button>`;
      } else if (entry.meleeAttacks.length > 1) {
        opportunityTooltip = `${entry.meleeAttacks.length} mögliche Nahkampfangriffe – klicken, um einen auszuwählen.`;
        opportunityAction = `<button type="button" class="gm-workspace-reaction-action" data-action="toggle-opportunity-choices" aria-expanded="${choiceOpen}" data-tooltip="${opportunityTooltip}" title="${opportunityTooltip}" ${entry.used ? "disabled" : ""}>Gelegenheitsangriff</button>`;
      }

      const attackChoices = choiceOpen && entry.meleeAttacks.length > 1 ? `
        <div class="gm-workspace-opportunity-choices">
          ${entry.meleeAttacks.map((attack) => `
            <button type="button" data-action="execute-opportunity" data-item-id="${attack.itemId}" data-activity-id="${attack.activityId}">
              ${foundry.utils.escapeHTML(attack.name)}
            </button>
          `).join("")}
        </div>
      ` : "";

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
    const entry = this.#enemyEntries().find(({ id }) => id === row.dataset.combatantId);
    if (!entry) return;

    if (button.dataset.action === "show-reaction-actor") {
      this.#selectEnemyEntry(entry);
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
      this.#setReactionUsed(entry.id, !used, "manual").catch((error) => {
        this.#logger.error("Reaction status update failed", error);
        ui.notifications?.error(`Reaktionsstatus konnte nicht geändert werden: ${error.message}`);
      });
      return;
    }

    if (["execute-reaction", "execute-opportunity"].includes(button.dataset.action)) {
      this.#executeReactionActivity(entry, button, button.dataset.action === "execute-opportunity").catch((error) => {
        this.#logger.error("Reaction execution failed", error);
        ui.notifications?.error(`Reaktion konnte nicht ausgeführt werden: ${error.message}`);
      });
    }
  }

  async #executeReactionActivity(entry, button, forceAttack = false) {
    if (this.#reactionBusy.has(entry.id)) return;
    const actor = this.#actorForEntry(entry);
    const item = actor?.items?.get?.(button.dataset.itemId) ?? null;
    const activity = item?.system?.activities?.get?.(button.dataset.activityId) ??
      Array.from(item?.system?.activities?.values?.() ?? []).find(({ id }) => id === button.dataset.activityId) ?? null;
    if (!actor || !item || !activity) throw new Error("Die zugehörige D&D5e-Aktivität wurde nicht gefunden.");

    this.#reactionBusy.add(entry.id);
    this.#renderReactionOverview();
    this.#releaseStaleModifiers();

    try {
      const activityType = String(activity.type ?? activity.system?.type ?? "").toLowerCase();
      let result;
      if ((forceAttack || activityType === "attack") && typeof activity.rollAttack === "function") {
        result = await activity.rollAttack({}, { configure: false });
      } else if (typeof activity.use === "function") {
        result = await activity.use({}, { configure: false });
      } else {
        throw new Error("Diese Aktivität kann nicht direkt ausgeführt werden.");
      }

      const succeeded = Array.isArray(result) ? result.length > 0 : Boolean(result);
      if (succeeded) {
        await this.#setReactionUsed(entry.id, true, forceAttack ? "opportunity-attack" : "activity-use");
        this.#openReactionChoices.delete(entry.id);
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
    const ended = Boolean(previous?.started) && (!current?.started || previous.combatId !== current?.combatId);
    if (!ended) return;

    this.#combatantColors.clear();
    this.#colorCombatId = null;
    this.#nextColorIndex = 0;
    this.#remoteEnemyColors = [];
    this.#openReactionChoices.clear();
    this.#reactionBusy.clear();

    if (this.#workspaceMode) {
      this.#pinnedSelection = null;
      this.#selectedToken = null;
      this.#selectionRevision += 1;
      this.#channel?.postMessage({ type: "clearTokenSelection" });
    } else {
      this.#clearLaptopSelection();
    }
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

    const revision = ++this.#selectionRevision;
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
