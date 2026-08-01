import { MODULE_ID } from "../config.js";
import { createLogger } from "../core/logger.js";

const CHANNEL_NAME = `${MODULE_ID}.workspace`;
const WORKSPACE_PARAMETER = "gmCombatWorkspace";

function isWorkspaceWindow() {
  return new URL(window.location.href).searchParams.get(WORKSPACE_PARAMETER) === "1";
}

function workspaceUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set(WORKSPACE_PARAMETER, "1");
  return url.href;
}

function selectedTokenSummary(token) {
  const document = token?.document ?? token ?? null;
  const actor = token?.actor ?? document?.actor ?? null;

  return {
    tokenId: document?.id ?? token?.id ?? null,
    tokenName: document?.name ?? token?.name ?? null,
    actorId: actor?.id ?? document?.actorId ?? null,
    actorName: actor?.name ?? null,
    actorType: actor?.type ?? null,
    sceneId: document?.parent?.id ?? canvas?.scene?.id ?? null
  };
}

function displayValue(value, fallback = "–") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

export class WorkspaceBridge {
  #eventBus;
  #getSnapshot;
  #logger;
  #channel = null;
  #unsubscribe = null;
  #controlTokenHook = null;
  #root = null;
  #selectedToken = null;
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
    this.#controlTokenHook = Hooks.on("controlToken", (token, controlled) => {
      if (!controlled || this.#workspaceMode) return;
      this.#selectedToken = selectedTokenSummary(token);
      this.#channel?.postMessage({ type: "tokenSelected", token: this.#selectedToken });
    });

    if (this.#workspaceMode) {
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

    const target = `${MODULE_ID}-companion`;
    const popup = window.open(
      "",
      target,
      "popup=yes,width=1400,height=900,resizable=yes,scrollbars=yes"
    );

    if (!popup) {
      ui.notifications?.warn(game.i18n.localize("GMCOMBAT.Workspace.PopupBlocked"));
      return false;
    }

    let alreadyWorkspace = false;
    try {
      const currentUrl = new URL(popup.location.href);
      alreadyWorkspace = currentUrl.searchParams.get(WORKSPACE_PARAMETER) === "1";
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
    root.id = "gm-combat-workspace-connection-test";
    root.className = "gm-combat-workspace";
    root.innerHTML = `
      <header class="gm-workspace-test-header">
        <div>
          <h1>GM Combat Workspace</h1>
          <p>Zwei-Fenster-Verbindungstest</p>
        </div>
        <span class="gm-workspace-status" data-field="connection">Verbunden</span>
      </header>
      <section class="gm-workspace-test-grid" aria-label="Synchronisierte Foundry-Daten">
        <article>
          <h2>Kampf</h2>
          <dl>
            <dt>Status</dt><dd data-field="combat-status">–</dd>
            <dt>Runde</dt><dd data-field="round">–</dd>
            <dt>Zug</dt><dd data-field="turn">–</dd>
            <dt>Kampf-ID</dt><dd data-field="combat-id">–</dd>
          </dl>
        </article>
        <article>
          <h2>Aktiver Teilnehmer</h2>
          <dl>
            <dt>Name</dt><dd data-field="active-name">–</dd>
            <dt>Typ</dt><dd data-field="active-type">–</dd>
            <dt>Actor-ID</dt><dd data-field="active-actor-id">–</dd>
            <dt>Token-ID</dt><dd data-field="active-token-id">–</dd>
          </dl>
        </article>
        <article>
          <h2>Auf Laptop angeklickt</h2>
          <dl>
            <dt>Name</dt><dd data-field="selected-name">Noch kein Token ausgewählt</dd>
            <dt>Typ</dt><dd data-field="selected-type">–</dd>
            <dt>Actor-ID</dt><dd data-field="selected-actor-id">–</dd>
            <dt>Token-ID</dt><dd data-field="selected-token-id">–</dd>
          </dl>
        </article>
      </section>
      <footer>Dieses Fenster darf auf den zweiten Monitor verschoben und maximiert werden.</footer>
    `;
    document.body.append(root);
    this.#root = root;
  }

  #receive(message) {
    if (!message || typeof message !== "object") return;

    if (message.type === "workspaceReady" && !this.#workspaceMode) {
      this.#broadcastState();
      if (this.#selectedToken) {
        this.#channel?.postMessage({ type: "tokenSelected", token: this.#selectedToken });
      }
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
    this.#set("combat-id", snapshot?.combatId);
    this.#set("active-name", active?.name);
    this.#set("active-type", snapshot?.activeType);
    this.#set("active-actor-id", snapshot?.activeActorId);
    this.#set("active-token-id", snapshot?.activeTokenId);
    this.#set("selected-name", this.#selectedToken?.actorName ?? this.#selectedToken?.tokenName, "Noch kein Token ausgewählt");
    this.#set("selected-type", this.#selectedToken?.actorType);
    this.#set("selected-actor-id", this.#selectedToken?.actorId);
    this.#set("selected-token-id", this.#selectedToken?.tokenId);
  }
}
