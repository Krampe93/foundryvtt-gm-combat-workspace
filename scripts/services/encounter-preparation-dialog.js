const escape = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

/** One modal contains the entire preparation, including errors. Nothing changes on cancel. */
export class EncounterPreparationDialog {
  #preview;
  #prepare;
  #host;
  #dialog = null;
  #opening = null;
  #busy = false;
  #closed = false;

  constructor({ preview, prepare, host = () => document.body }) {
    this.#preview = preview;
    this.#prepare = prepare;
    this.#host = host;
  }

  open() {
    if (this.#dialog) { this.#dialog.querySelector("input")?.focus(); return Promise.resolve(); }
    if (this.#opening) return this.#opening;
    this.#opening = this.#open().finally(() => { this.#opening = null; });
    return this.#opening;
  }

  async #open() {
    const preview = await this.#preview();
    if (this.#closed) return;
    const dialog = document.createElement("dialog");
    dialog.className = "gm-workspace-preparation-dialog";
    dialog.setAttribute("aria-label", "Encounter vorbereiten");
    dialog.innerHTML = `<form novalidate>
      <header><h2>Encounter vorbereiten</h2><p>${escape(preview.sceneName)}</p></header>
      <p class="gm-preparation-summary"><strong>${preview.npcCount} Gegner</strong> auf dieser Map ·
        W12 + Initiative-Modifikator${preview.rollCount < preview.npcCount ? ` · ${preview.rollCount} Initiativgruppen` : ""}</p>
      <p class="gm-preparation-hint">Alle Gegner werden neu gewürfelt, auch verborgene und nicht ausgewählte. Vorhandene Kampfteilnehmer werden wiederverwendet.</p>
      <section><h3>Spieler-Initiative</h3><p class="gm-preparation-hint">Teilnehmende Spieler anhaken und ihre Initiative eintragen. Bestehende Einträge werden nicht entfernt.</p>
        <div class="gm-preparation-players">${preview.players.map((player) => this.#playerRow(player)).join("")}</div>
        <button type="button" data-preparation="add"><i class="fa-solid fa-plus" aria-hidden="true"></i> Spieler ergänzen</button>
      </section>
      <section><h3>Im Hort</h3><p class="gm-preparation-hint">D&amp;D5e berechnet die Hort-Ressourcen selbst.</p>
        ${preview.lairs.length ? preview.lairs.map((lair) => `<label class="gm-preparation-lair">
          <input type="checkbox" data-lair="${escape(lair.uuid)}" ${lair.inside ? "checked" : ""}>
          <span>${escape(lair.tokens.length === 1 ? lair.tokens[0] : lair.name)}${lair.tokens.length > 1
    ? `<small>Gemeinsamer Actor: ${escape(lair.tokens.join(", "))}</small>` : ""}</span></label>`).join("")
    : '<p class="gm-preparation-hint">Keine Gegner mit nativen Hort-Aktionen auf dieser Map.</p>'}
      </section>
      <p class="gm-preparation-error" role="alert" hidden></p>
      <footer><button type="button" data-preparation="cancel">Abbrechen</button>
        <button type="submit" class="gm-preparation-confirm">Vorbereiten</button></footer>
    </form>`;
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); if (!this.#busy) this.#remove(); });
    dialog.querySelector('[data-preparation="cancel"]').addEventListener("click", () => { if (!this.#busy) this.#remove(); });
    let nextRow = 0;
    dialog.querySelector('[data-preparation="add"]').addEventListener("click", () => {
      const list = dialog.querySelector(".gm-preparation-players");
      list.insertAdjacentHTML("beforeend", this.#playerRow({ key: `new:${nextRow++}`, name: "", enabled: true }));
      this.#syncRows();
      list.lastElementChild.querySelector('[data-player="name"]').focus();
    });
    dialog.addEventListener("change", () => this.#syncRows());
    dialog.addEventListener("input", () => { dialog.querySelector(".gm-preparation-error").hidden = true; });
    dialog.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (this.#busy) return;
      const error = dialog.querySelector(".gm-preparation-error");
      error.hidden = true;
      const submission = {
        players: [...dialog.querySelectorAll("[data-player-key]")].map((row) => ({ key: row.dataset.playerKey,
          enabled: row.querySelector('[data-player="enabled"]').checked,
          name: row.querySelector('[data-player="name"]').value,
          initiative: row.querySelector('[data-player="initiative"]').value })),
        lairs: [...dialog.querySelectorAll("[data-lair]")].map((input) => ({ uuid: input.dataset.lair, inside: input.checked }))
      };
      this.#busy = true;
      dialog.querySelectorAll("input, button").forEach((input) => { input.disabled = true; });
      dialog.querySelector('[type="submit"]').textContent = "Wird vorbereitet …";
      try {
        const result = await this.#prepare(preview.id, submission);
        this.#remove();
        ui.notifications?.info(`${result.npcCount} Gegner gewürfelt, ${result.playerCount} Spieler übernommen. Encounter bereit.`);
      } catch (failure) {
        error.textContent = failure.message;
        error.hidden = false;
        dialog.querySelectorAll("input, button").forEach((input) => { input.disabled = false; });
        dialog.querySelector('[type="submit"]').textContent = "Vorbereiten";
        this.#syncRows();
        error.scrollIntoView({ block: "nearest" });
      } finally { this.#busy = false; this.#syncRows(); }
    });
    this.#dialog = dialog;
    this.#host().append(dialog);
    this.#syncRows();
    dialog.showModal();
  }

  #playerRow(player) {
    return `<div class="gm-preparation-player" data-player-key="${escape(player.key)}">
      <input type="checkbox" data-player="enabled" aria-label="${escape(player.name || "Spieler")} nimmt teil" ${player.enabled ? "checked" : ""}>
      <input type="text" data-player="name" aria-label="Spielername" maxlength="100" placeholder="Name" value="${escape(player.name)}" ${player.actorId || player.combatantId ? "readonly" : ""}>
      <input type="text" inputmode="decimal" data-player="initiative" aria-label="Initiative ${escape(player.name)}" placeholder="Initiative" value="${escape(player.initiative)}">
    </div>`;
  }

  #syncRows() {
    if (this.#busy) return;
    for (const row of this.#dialog?.querySelectorAll("[data-player-key]") ?? []) {
      const enabled = row.querySelector('[data-player="enabled"]').checked;
      row.classList.toggle("is-inactive", !enabled);
      row.querySelector('[data-player="initiative"]').disabled = !enabled;
      row.querySelector('[data-player="name"]').disabled = !enabled;
    }
  }

  #remove() {
    this.#dialog?.close();
    this.#dialog?.remove();
    this.#dialog = null;
  }

  stop() { this.#closed = true; this.#remove(); }
}
