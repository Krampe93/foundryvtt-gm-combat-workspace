function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function rectangle(value) {
  if (!(value?.width > 0 && value?.height > 0)) return null;
  return { x: finite(value.x), y: finite(value.y), width: Number(value.width), height: Number(value.height) };
}

function mediaUrl(value, baseUrl) {
  if (!value) return null;
  try {
    const url = new URL(value, baseUrl);
    return ["http:", "https:", "blob:"].includes(url.protocol) ||
      (url.protocol === "data:" && /^data:image\//i.test(value)) ? url.href : null;
  } catch { return null; }
}

function backgroundAsset(scene, level, canvas, imageBounds, baseUrl) {
  const source = level ? level.background?.src : scene.background?.src;
  const src = mediaUrl(source, baseUrl);
  if (!src) return null;
  const candidates = [...(canvas.primary?.levelTextures ?? []), canvas.primary?.background].filter(Boolean);
  const matches = candidates.filter((mesh) => mediaUrl(mesh.sourceElement?.currentSrc || mesh.sourceElement?.src, baseUrl) === src);
  const mesh = matches.find((candidate) => candidate.elevation === level?.elevation?.bottom) ?? matches[0];
  let matrix = [imageBounds.width, 0, 0, imageBounds.height, imageBounds.x, imageBounds.y];
  if (mesh?.texture?.orig && canvas.stage?.toLocal) {
    const { width, height } = mesh.texture.orig;
    const x = -finite(mesh.anchor?.x) * width;
    const y = -finite(mesh.anchor?.y) * height;
    // PIXI's relative transform removes camera pan/zoom while preserving map offsets/rotation/scale.
    const origin = canvas.stage.toLocal({ x, y }, mesh);
    const right = canvas.stage.toLocal({ x: x + width, y }, mesh);
    const bottom = canvas.stage.toLocal({ x, y: y + height }, mesh);
    const transformed = [right.x - origin.x, right.y - origin.y, bottom.x - origin.x, bottom.y - origin.y, origin.x, origin.y];
    if (transformed.every(Number.isFinite)) matrix = transformed;
  }
  return { src, matrix, video: mesh?.sourceElement?.tagName === "VIDEO" || /\.(?:webm|mp4|m4v)(?:[?#]|$)/i.test(src) };
}

/** Read GM scene documents, including hidden tokens, without changing the map or its camera. */
export function createMinimapState({ canvas, snapshot, enemies, baseUrl, previews = new Map() }) {
  const scene = canvas?.scene;
  if (!canvas?.ready || !scene) return null;
  const dimensions = canvas.dimensions ?? scene.getDimensions?.() ?? scene.dimensions;
  const imageBounds = rectangle(dimensions?.sceneRect) ?? rectangle({
    x: dimensions?.sceneX, y: dimensions?.sceneY,
    width: dimensions?.sceneWidth ?? scene.width, height: dimensions?.sceneHeight ?? scene.height
  });
  const bounds = rectangle(dimensions?.rect) ?? imageBounds;
  if (!bounds || !imageBounds) return null;
  const level = canvas.level ?? null;
  const matchingCombat = snapshot?.started && snapshot.sceneId === scene.id;
  const points = (matchingCombat ? enemies : []).flatMap((enemy) => {
    if (enemy.defeated || enemy.type !== "npc") return [];
    const token = scene.tokens?.get(enemy.tokenId);
    if (!token || (level?.id && token.level && token.level !== level.id)) return [];
    const gridSize = finite(dimensions?.size ?? scene.grid?.size, 100);
    const rendered = previews.get(`${scene.id}:${token.id}`) ?? token.object;
    const center = rendered?.center ?? token.getCenterPoint?.() ?? {
      x: finite(token.x, NaN) + finite(token.width, 1) * gridSize / 2,
      y: finite(token.y, NaN) + finite(token.height, 1) * gridSize / 2
    };
    if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) return [];
    return [{ id: enemy.id, tokenId: token.id, name: enemy.displayName ?? enemy.name,
      x: center.x, y: center.y, color: enemy.color, active: enemy.id === snapshot.activeCombatantId }];
  });
  return { sceneId: scene.id, sceneName: scene.name, levelId: level?.id ?? null, bounds,
    background: backgroundAsset(scene, level, canvas, imageBounds, baseUrl), points };
}

export function minimapProjection(bounds, width, height) {
  if (!bounds || !(width > 24 && height > 24)) return null;
  const scale = Math.min((width - 24) / bounds.width, (height - 24) / bounds.height);
  return { scale, x: (width - bounds.width * scale) / 2 - bounds.x * scale,
    y: (height - bounds.height * scale) / 2 - bounds.y * scale };
}

/** Main-window publisher. Token movement bypasses the combat summary, which excludes coordinates. */
export class MinimapSource {
  #getState;
  #publish;
  #hooks = [];
  #active = false;
  #queued = false;
  #cleared = false;
  #previews = new Map();
  #signature = null;
  #force = false;

  constructor({ getState, publish }) {
    this.#getState = getState;
    this.#publish = publish;
  }

  start() {
    this.#active = true;
    for (const name of ["canvasReady", "updateScene", "updateLevel", "createLevel", "deleteLevel", "createToken", "updateToken", "deleteToken"]) {
      this.#hooks.push([name, Hooks.on(name, () => {
        if (name === "canvasReady") this.#cleared = false;
        this.refresh();
      })]);
    }
    this.#hooks.push(["canvasTearDown", Hooks.on("canvasTearDown", () => {
      this.#cleared = true;
      this.#previews.clear();
      this.#signature = "null";
      this.#publish(null);
    })]);
    this.#hooks.push(["refreshToken", Hooks.on("refreshToken", (token) => {
      if (token?.isPreview) this.#previews.set(this.#tokenKey(token), token);
      this.refresh();
    })]);
    this.#hooks.push(["destroyToken", Hooks.on("destroyToken", (token) => {
      const key = this.#tokenKey(token);
      if (this.#previews.get(key) === token) this.#previews.delete(key);
      this.refresh();
    })]);
    this.refresh({ force: true });
  }

  #tokenKey(token) {
    return `${token?.scene?.id ?? token?.document?.parent?.id}:${token?._original?.id ?? token?.id}`;
  }

  refresh({ force = false } = {}) {
    if (!this.#active) return;
    this.#force ||= force;
    if (this.#queued) return;
    this.#queued = true;
    queueMicrotask(() => {
      this.#queued = false;
      if (!this.#active) return;
      const state = this.#cleared ? null : this.#getState({ previews: this.#previews });
      const signature = JSON.stringify(state);
      if (this.#force || signature !== this.#signature) this.#publish(state);
      this.#signature = signature;
      this.#force = false;
    });
  }

  stop() {
    this.#active = false;
    this.#previews.clear();
    for (const [name, id] of this.#hooks) Hooks.off(name, id);
    this.#hooks = [];
  }
}

/** Lightweight 2D overview; updates only on changed data, loaded media or a resized panel. */
export class MinimapView {
  #host;
  #canvas;
  #context;
  #status;
  #state = null;
  #media = null;
  #src = null;
  #ready = false;
  #failed = false;
  #observer = null;
  #queued = false;
  #backgroundCanvas = null;
  #backgroundKey = null;
  #active = true;

  constructor(host) {
    this.#host = host;
    this.#canvas = host.querySelector("canvas");
    this.#context = this.#canvas?.getContext?.("2d");
    this.#status = host.querySelector('[data-role="minimap-status"]');
    if (this.#context && globalThis.ResizeObserver) {
      this.#observer = new ResizeObserver(() => this.#schedule());
      this.#observer.observe(host);
    }
  }

  setState(state) {
    this.#state = state;
    const src = state?.background?.src ?? null;
    if (src !== this.#src) {
      this.#releaseMedia();
      this.#src = src;
      this.#ready = false;
      this.#failed = false;
      if (src && this.#context) {
        const media = state.background.video ? document.createElement("video") : new Image();
        this.#media = media;
        const loaded = () => {
          if (media !== this.#media || !this.#active) return;
          this.#ready = true;
          this.#schedule();
        };
        media.onerror = () => {
          if (media !== this.#media || !this.#active) return;
          this.#failed = true;
          this.#schedule();
        };
        if (state.background.video) {
          media.muted = true;
          media.playsInline = true;
          media.preload = "auto";
          media.onloadeddata = loaded;
        } else media.onload = loaded;
        media.src = src;
      }
    }
    this.#schedule();
  }

  #releaseMedia() {
    if (!this.#media) return;
    this.#media.onload = this.#media.onloadeddata = this.#media.onerror = null;
    if (this.#media.tagName === "VIDEO") {
      this.#media.pause();
      this.#media.removeAttribute("src");
      this.#media.load();
    }
    this.#media = null;
  }

  #schedule() {
    if (!this.#active || !this.#context || this.#queued) return;
    this.#queued = true;
    // Do not wait for requestAnimationFrame, which can be throttled in the unfocused companion.
    queueMicrotask(() => {
      this.#queued = false;
      if (this.#active) this.#draw();
    });
  }

  #draw() {
    const { width, height } = this.#host.getBoundingClientRect();
    if (!(width > 0 && height > 0)) return;
    const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (this.#canvas.width !== pixelWidth) this.#canvas.width = pixelWidth;
    if (this.#canvas.height !== pixelHeight) this.#canvas.height = pixelHeight;
    const context = this.#context;
    const state = this.#state;
    const projection = minimapProjection(state?.bounds, width, height);
    const key = JSON.stringify([width, height, ratio, this.#ready, state?.bounds, state?.background]);
    if (key !== this.#backgroundKey) {
      this.#backgroundCanvas ??= document.createElement("canvas");
      this.#backgroundCanvas.width = pixelWidth;
      this.#backgroundCanvas.height = pixelHeight;
      const background = this.#backgroundCanvas.getContext("2d");
      background.setTransform(ratio, 0, 0, ratio, 0, 0);
      background.fillStyle = "#14181c";
      background.fillRect(0, 0, width, height);
      if (projection && this.#ready) {
        const { scale, x, y } = projection;
        background.save();
        background.beginPath();
        background.rect(x + state.bounds.x * scale, y + state.bounds.y * scale, state.bounds.width * scale, state.bounds.height * scale);
        background.clip();
        const [a, b, c, d, tx, ty] = state.background.matrix;
        background.transform(scale * a, scale * b, scale * c, scale * d, x + scale * tx, y + scale * ty);
        background.drawImage(this.#media, 0, 0, 1, 1);
        background.restore();
      }
      this.#backgroundKey = key;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(this.#backgroundCanvas, 0, 0);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const status = !state ? "Keine Szene im Hauptfenster geöffnet." : this.#failed ? "Kartenbild konnte nicht geladen werden." :
      !state.background ? "Diese Szene hat kein Hintergrundbild." : !this.#ready ? "Kartenbild wird geladen …" : "";
    if (projection) {
      const { scale, x, y } = projection;
      // Draw the active marker last, so its ring remains visible when markers overlap.
      for (const point of [...state.points].sort((a, b) => Number(a.active) - Number(b.active))) {
        if (point.x < state.bounds.x || point.y < state.bounds.y || point.x > state.bounds.x + state.bounds.width || point.y > state.bounds.y + state.bounds.height) continue;
        const px = x + point.x * scale;
        const py = y + point.y * scale;
        if (point.active) {
          context.beginPath();
          context.arc(px, py, 9, 0, Math.PI * 2);
          context.strokeStyle = "#101317";
          context.lineWidth = 5;
          context.stroke();
          context.strokeStyle = "#fff4ce";
          context.lineWidth = 2.5;
          context.stroke();
        }
        context.beginPath();
        context.arc(px, py, 5, 0, Math.PI * 2);
        context.fillStyle = /^#[0-9a-f]{6}$/i.test(point.color) ? point.color : "#d17b28";
        context.fill();
        context.strokeStyle = "#101317";
        context.lineWidth = 1.5;
        context.stroke();
      }
    }
    this.#status.textContent = status;
    this.#status.hidden = !status;
    const active = state?.points.find((point) => point.active);
    this.#canvas.setAttribute("aria-label", state ? `${state.sceneName}: ${state.points.length} Gegner${active ? `, am Zug: ${active.name}` : ""}` : "Keine Szene");
  }

  stop() {
    this.#active = false;
    this.#observer?.disconnect();
    this.#backgroundCanvas = null;
    this.#backgroundKey = null;
    this.#releaseMedia();
  }
}
