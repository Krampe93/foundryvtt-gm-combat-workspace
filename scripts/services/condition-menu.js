import { actorConditions, conditionOptions } from "./condition-operations.js";

function escape(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

/** A compact context editor which stays outside the scrolling enemy list. */
export class ConditionMenu {
  #root;
  #getTarget;
  #getSources;
  #apply;
  #element = null;
  #targetId = null;
  #busy = false;
  #dismiss = null;
  #key = null;
  #resize = null;

  constructor({ root, getTarget, getSources, apply }) {
    this.#root = root;
    this.#getTarget = getTarget;
    this.#getSources = getSources;
    this.#apply = apply;
  }

  open(id, x, y) {
    this.close();
    const target = this.#getTarget(id);
    if (!target) return;
    const options = conditionOptions();
    if (!options.length) return;
    this.#targetId = id;
    const active = actorConditions(target.actor);
    const sources = this.#getSources();
    const element = document.createElement("section");
    element.className = "gm-workspace-condition-menu";
    element.setAttribute("role", "dialog");
    element.setAttribute("aria-label", `Zustände: ${target.name}`);
    element.innerHTML = `<header><strong>${escape(target.name)} · Zustand</strong>
      <button type="button" data-condition-close aria-label="Schließen">×</button></header>
      <form><fieldset>
        ${active.length ? `<div class="gm-workspace-current-conditions">${active.map(condition =>
          `<button type="button" data-condition-existing="${escape(condition.id)}" title="${escape(condition.text)}">${escape(condition.text)}</button>`).join("")}</div>` : ""}
        <label>Zustand<select name="statusId">${options.map(option =>
          `<option value="${escape(option.id)}">${active.some(({ id }) => id === option.id) ? "✓ " : ""}${escape(option.label)}</option>`).join("")}</select></label>
        <label>Verursacht durch<select name="sourceUuid"><option value="">Ohne Quelle</option>
          ${[["character", "Spieler"], ["npc", "Gegner"]].map(([type, label]) => {
            const entries = sources.filter(entry => entry.type === type);
            return entries.length ? `<optgroup label="${label}">${entries.map(entry =>
              `<option value="${escape(entry.uuid)}">${escape(entry.name)}${entry.inCombat ? "" : " (außerhalb des Encounters)"}</option>`).join("")}</optgroup>` : "";
          }).join("")}</select></label>
        <div class="gm-workspace-condition-actions"><button type="submit" data-condition-save>Zustand setzen</button>
          <button type="button" data-condition-remove>Entfernen</button></div>
      </fieldset><p class="gm-workspace-condition-error" role="alert" hidden></p></form>`;
    this.#element = element;
    this.#root.append(element);
    element.querySelector('[name="statusId"]').value = active[0]?.id ?? options[0].id;
    this.#selectStatus();
    element.addEventListener("change", event => {
      if (event.target.name === "statusId") this.#selectStatus();
    });
    element.addEventListener("click", event => {
      if (event.target.closest("[data-condition-close]")) this.close(true);
      const existing = event.target.closest("[data-condition-existing]");
      if (existing && !this.#busy) {
        element.querySelector('[name="statusId"]').value = existing.dataset.conditionExisting;
        this.#selectStatus();
      }
      if (event.target.closest("[data-condition-remove]")) this.#submit(false);
    });
    element.querySelector("form").addEventListener("submit", event => { event.preventDefault(); this.#submit(true); });
    this.#dismiss = event => { if (!element.contains(event.target)) this.close(); };
    this.#key = event => {
      if (event.key === "Escape") { event.preventDefault(); this.close(true); }
      if (event.key !== "Tab") return;
      const controls = [...element.querySelectorAll("button:not(:disabled), select:not(:disabled)")].filter(node => !node.hidden);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    this.#resize = () => this.close();
    document.addEventListener("pointerdown", this.#dismiss, true);
    document.addEventListener("keydown", this.#key, true);
    window.addEventListener("resize", this.#resize);
    const bounds = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8))}px`;
    element.querySelector('[name="statusId"]').focus();
  }

  #selectStatus() {
    const target = this.#getTarget(this.#targetId);
    const id = this.#element.querySelector('[name="statusId"]').value;
    const condition = actorConditions(target?.actor).find(condition => condition.id === id);
    const source = this.#element.querySelector('[name="sourceUuid"]');
    // Preserve the recorded source even if that character has since left the world.
    for (const option of source.querySelectorAll("[data-missing-source]")) option.remove();
    if (condition?.source && ![...source.options].some(option => option.value === condition.source.uuid)) {
      const option = document.createElement("option");
      option.value = condition.source.uuid;
      option.textContent = `${condition.source.name} (nicht mehr verfügbar)`;
      option.dataset.missingSource = "true";
      source.append(option);
    }
    source.value = condition?.source?.uuid ?? "";
    this.#element.querySelector("[data-condition-remove]").disabled = !condition;
    this.#element.querySelector("[data-condition-save]").textContent = condition ? "Speichern" : "Zustand setzen";
    this.#element.querySelector('[role="alert"]').hidden = true;
  }

  async #submit(active) {
    if (this.#busy || !this.#element) return;
    const element = this.#element;
    const statusId = element.querySelector('[name="statusId"]').value;
    const sourceUuid = element.querySelector('[name="sourceUuid"]').value;
    this.#busy = true;
    element.querySelector("fieldset").disabled = true;
    try {
      await this.#apply(this.#targetId, { statusId, sourceUuid, active });
      if (this.#element === element) this.close(true);
    } catch (error) {
      if (this.#element === element) {
        const alert = element.querySelector('[role="alert"]');
        alert.textContent = error.message;
        alert.hidden = false;
      }
    } finally {
      if (this.#element === element) { this.#busy = false; element.querySelector("fieldset").disabled = false; }
    }
  }

  refresh() {
    if (this.#element && !this.#getTarget(this.#targetId)) this.close();
  }

  close(restoreFocus = false) {
    const id = this.#targetId;
    if (this.#dismiss) document.removeEventListener("pointerdown", this.#dismiss, true);
    if (this.#key) document.removeEventListener("keydown", this.#key, true);
    if (this.#resize) window.removeEventListener("resize", this.#resize);
    this.#element?.remove();
    this.#element = this.#targetId = this.#dismiss = this.#key = this.#resize = null;
    this.#busy = false;
    if (restoreFocus && id) (this.#root.querySelector(`[data-player-target="${CSS.escape(id)}"]`) ??
      this.#root.querySelector(`.gm-workspace-enemy[data-combatant-id="${CSS.escape(id)}"] [data-action="select-enemy"]`))?.focus();
  }
}
