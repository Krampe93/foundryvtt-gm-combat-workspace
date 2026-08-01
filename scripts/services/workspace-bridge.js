import { MODULE_ID } from "../config.js";
import { createLogger } from "../core/logger.js";

const CHANNEL_NAME = `${MODULE_ID}.workspace`;
const WORKSPACE_PARAMETER = "gmCombatWorkspace";
const WORKSPACE_TARGET = `${MODULE_ID}-companion`;

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
  #sheetRenderHooks = [];
  #sheetMountTimers = new Set();
  #windowFocusHandler = null;
  #windowResizeHandler = null;
  #root = null;
  #selectedToken = null;
  #pinnedSelection = null;
  #displayedActor = null;
  #displayedSheet = null;
  #preparedSheetElements = new WeakSet();
  #selectionRevision = 0;
  #workspaceMode = isWorkspaceWindow();
  #workspaceWindow = null;

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
    this.#unsubscribe = this.#eventBus.on("combatStateChanged", () => {
      this.#render();
      this.#broadcastState();
    });

    this.#controlTokenHook = Hooks.on("controlToken", () => {
      if (this.#workspaceMode) return;
      queueMicrotask(() => this.#broadcastControlledToken());
    });

    if (this.#workspaceMode) {
      this.#registerSheetHooks();
      this.#registerModifierReset();
      this.#renderWorkspace();
      this.#channel.postMessage({ type: "workspaceReady" });
    } else {
      this.#renderLauncher();
    }

    this.#render();
  }

  stop() {
    this.#unsubscribe?.();
    this.#unsubscribe = null;

    if (this.#controlTokenHook !== null) {
      Hooks.off("controlToken", this.#controlTokenHook);
      this.#controlTokenHook = null;
    }

    for (const [hookName, hookId] of this.#sheetRenderHooks) {
      Hooks.off(hookName, hookId);
    }
    this.#sheetRenderHooks = [];

    for (const timer of this.#sheetMountTimers) clearTimeout(timer);
    this.#sheetMountTimers.clear();

    if (this.#windowFocusHandler) {
      window.removeEventListener("focus", this.#windowFocusHandler);
      this.#windowFocusHandler = null;
    }

    if (this.#windowResizeHandler) {
      window.removeEventListener("resize", this.#windowResizeHandler);
      this.#windowResizeHandler = null;
    }

    this.#closeDisplayedSheet();
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
      <header class="gm-workspace-header">
        <div>
          <h1>GM Combat Workspace</h1>
          <p>Statblock-Arbeitsplatz · Version 0.4</p>
        </div>
        <span class="gm-workspace-status">Verbunden</span>
      </header>
      <section class="gm-workspace-columns">
        <section class="gm-workspace-statblock-panel" aria-label="Statblock">
          <header class="gm-workspace-panel-header">
            <div>
              <span class="gm-workspace-eyebrow">Statblock</span>
              <h2 data-field="displayed-name">Kein Gegner ausgewählt</h2>
            </div>
            <span class="gm-workspace-source" data-field="selection-source">Keine Auswahl</span>
          </header>
          <div class="gm-workspace-sheet-host" data-role="sheet-host">
            <div class="gm-workspace-empty">
              <i class="fa-solid fa-dragon" aria-hidden="true"></i>
              <strong>Wähle auf dem Laptop einen Gegner aus oder starte dessen Zug.</strong>
            </div>
          </div>
        </section>
        <aside class="gm-workspace-context-panel">
          <section>
            <h2>Auswahlkontrolle</h2>
            <dl>
              <dt>Aktiver Teilnehmer</dt><dd data-field="active-name">–</dd>
              <dt>Typ</dt><dd data-field="active-type">–</dd>
              <dt>Auf Laptop angeklickt</dt><dd data-field="selected-name">–</dd>
              <dt>Angezeigt durch</dt><dd data-field="selection-source-detail">Keine Auswahl</dd>
            </dl>
          </section>
          <section>
            <h2>Statblock-Steuerung</h2>
            <button type="button" class="gm-workspace-pin" data-action="toggle-pin" disabled>
              <i class="fa-solid fa-thumbtack" aria-hidden="true"></i>
              <span>Gegner anpinnen</span>
            </button>
            <p class="gm-workspace-help">Ein angepinnter Gegner bleibt sichtbar, auch wenn sich Zug oder Tokenauswahl ändern.</p>
          </section>
          <section>
            <h2>Kampf</h2>
            <dl>
              <dt>Status</dt><dd data-field="combat-status">–</dd>
              <dt>Runde</dt><dd data-field="round">–</dd>
              <dt>Zug</dt><dd data-field="turn">–</dd>
            </dl>
          </section>
          <section class="gm-workspace-future">
            <h2>Dashboard</h2>
            <p>Gegnerliste, TP, RK, Bewegung und Rettungswürfe folgen nach Abnahme des nativen Statblocks.</p>
          </section>
        </aside>
      </section>
    `;

    root.querySelector('[data-action="toggle-pin"]')
      .addEventListener("click", () => this.#togglePin());

    document.body.append(root);
    this.#root = root;

    this.#windowResizeHandler = () => this.#positionDisplayedSheet();
    window.addEventListener("resize", this.#windowResizeHandler);
  }

  #registerSheetHooks() {
    for (const hookName of ["renderActorSheet", "renderActorSheetV2"]) {
      const hookId = Hooks.on(hookName, (application, html) => {
        const actor = application?.actor ?? application?.document ?? application?.object ?? null;
        if (!this.#workspaceMode || actor !== this.#displayedActor) return;
        this.#scheduleSheetMount(application);
      });
      this.#sheetRenderHooks.push([hookName, hookId]);
    }
  }

  #registerModifierReset() {
    this.#windowFocusHandler = () => this.#releaseStaleModifiers();
    window.addEventListener("focus", this.#windowFocusHandler);
    queueMicrotask(() => this.#releaseStaleModifiers());
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
    if (this.#preparedSheetElements.has(element)) return;
    this.#preparedSheetElements.add(element);

    element.addEventListener("click", (event) => {
      if (event.altKey || event.ctrlKey || event.shiftKey || event.metaKey) return;
      this.#releaseStaleModifiers();
    }, { capture: true });
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
    if (snapshot?.activeType !== "npc" || !active) return null;

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
      : "Gegner anpinnen";

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

    const sheet = actor.sheet;
    if (!sheet) throw new Error(`Für ${actor.name} ist kein Actor-Sheet verfügbar.`);
    this.#displayedSheet = sheet;

    const ApplicationV2 = foundry?.applications?.api?.ApplicationV2;
    const renderResult = ApplicationV2 && sheet instanceof ApplicationV2
      ? sheet.render({ force: true, focus: false })
      : sheet.render(true, { focus: false });
    if (renderResult?.then) await renderResult;
    this.#mountSheet(sheet);
  }

  #mountSheet(sheet) {
    if (!this.#root || sheet !== this.#displayedSheet) return;
    const host = this.#root.querySelector('[data-role="sheet-host"]');
    const element = applicationElement(sheet);
    if (!host || !element) return;

    element.classList.add("gm-workspace-embedded-sheet");
    this.#prepareSheetElement(element);
    if (element.parentElement !== document.body) document.body.append(element);
    host.classList.add("has-embedded-sheet");
    this.#positionSheetElement(element, host);
  }

  #scheduleSheetMount(sheet) {
    const mount = () => {
      if (sheet !== this.#displayedSheet) return;
      this.#mountSheet(sheet);
    };

    queueMicrotask(mount);

    for (const delay of [50, 200, 500]) {
      const timer = setTimeout(() => {
        this.#sheetMountTimers.delete(timer);
        mount();
      }, delay);
      this.#sheetMountTimers.add(timer);
    }
  }

  #positionDisplayedSheet() {
    if (!this.#displayedSheet) return;
    this.#mountSheet(this.#displayedSheet);
  }

  #positionSheetElement(element, host) {
    const rect = host.getBoundingClientRect();
    element.style.setProperty("--gm-workspace-sheet-left", `${rect.left}px`);
    element.style.setProperty("--gm-workspace-sheet-top", `${rect.top}px`);
    element.style.setProperty("--gm-workspace-sheet-width", `${rect.width}px`);
    element.style.setProperty("--gm-workspace-sheet-height", `${rect.height}px`);
  }

  async #closeDisplayedSheet() {
    const sheet = this.#displayedSheet;
    this.#displayedSheet = null;
    this.#displayedActor = null;
    this.#root?.querySelector('[data-role="sheet-host"]')
      ?.classList.remove("has-embedded-sheet");
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
