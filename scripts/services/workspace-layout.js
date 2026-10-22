function pixels(style, property) {
  return Number.parseFloat(style[property]) || 0;
}

function verticalChrome(style) {
  return ["paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"]
    .reduce((total, property) => total + pixels(style, property), 0);
}

/** Preserve the original 47/53 dashboard split and 30/70 utility split as size limits. */
export function workspacePanelSizes({ height, gap, utilityGap, enemyContentHeight }) {
  const available = Math.max(0, height - gap);
  const enemyMaximum = available * 0.47;
  return {
    enemyHeight: Math.min(enemyMaximum, Math.ceil(enemyContentHeight)),
    enemyMaximum,
    minimapHeight: Math.max(0, (available * 0.53 - utilityGap) * 0.7)
  };
}

/** Enemy rows take their required height; spare height goes to rolls above a fixed minimap. */
export class WorkspaceLayout {
  #context;
  #enemies;
  #header;
  #list;
  #utility;
  #resizeObserver = null;
  #mutationObserver = null;
  #frame = null;

  constructor(root) {
    this.#context = root.querySelector(".gm-workspace-context-panel");
    this.#enemies = root.querySelector(".gm-workspace-enemies");
    this.#header = root.querySelector(".gm-workspace-enemy-header");
    this.#list = root.querySelector('[data-role="enemy-list"]');
    this.#utility = root.querySelector(".gm-workspace-utility-column");
  }

  start() {
    if (!globalThis.ResizeObserver) return;
    this.#resizeObserver = new ResizeObserver(() => this.#schedule());
    this.#observeRows();
    this.#mutationObserver = new MutationObserver(() => {
      this.#observeRows();
      this.#schedule();
    });
    this.#mutationObserver.observe(this.#list, { childList: true, subtree: true, characterData: true });
    this.#schedule();
  }

  stop() {
    this.#resizeObserver?.disconnect();
    this.#mutationObserver?.disconnect();
    if (this.#frame !== null) cancelAnimationFrame(this.#frame);
    this.#frame = null;
  }

  #observeRows() {
    this.#resizeObserver.disconnect();
    for (const element of [this.#context, this.#header, ...this.#list.children]) {
      this.#resizeObserver.observe(element);
    }
  }

  #schedule() {
    if (this.#frame !== null) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = null;
      this.#resize();
    });
  }

  #resize() {
    const contextStyle = getComputedStyle(this.#context);
    const listStyle = getComputedStyle(this.#list);
    const rows = [...this.#list.children];
    const rowHeight = rows.reduce((total, row) => {
      const style = getComputedStyle(row);
      return total + row.getBoundingClientRect().height + pixels(style, "marginTop") + pixels(style, "marginBottom");
    }, 0) + Math.max(0, rows.length - 1) * pixels(listStyle, "rowGap");
    const sizes = workspacePanelSizes({
      height: this.#context.getBoundingClientRect().height - verticalChrome(contextStyle),
      gap: pixels(contextStyle, "rowGap"),
      utilityGap: pixels(getComputedStyle(this.#utility), "rowGap"),
      enemyContentHeight: verticalChrome(getComputedStyle(this.#enemies)) +
        this.#header.getBoundingClientRect().height + pixels(listStyle, "marginTop") +
        pixels(listStyle, "marginBottom") + verticalChrome(listStyle) + rowHeight
    });
    this.#context.style.setProperty("--gm-workspace-context-rows", `minmax(0, ${sizes.enemyHeight}px) minmax(0, 1fr)`);
    this.#context.style.setProperty("--gm-workspace-utility-rows", `minmax(0, 1fr) minmax(0, ${sizes.minimapHeight}px)`);
  }
}
