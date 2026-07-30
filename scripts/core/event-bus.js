export class EventBus {
  #listeners = new Map();

  on(eventName, listener) {
    if (typeof listener !== "function") {
      throw new TypeError("EventBus listeners must be functions.");
    }

    const listeners = this.#listeners.get(eventName) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(eventName, listeners);

    return () => this.off(eventName, listener);
  }

  off(eventName, listener) {
    const listeners = this.#listeners.get(eventName);
    if (!listeners) return false;

    const removed = listeners.delete(listener);
    if (!listeners.size) this.#listeners.delete(eventName);
    return removed;
  }

  emit(eventName, payload) {
    const listeners = [...(this.#listeners.get(eventName) ?? [])];

    for (const listener of listeners) {
      try {
        listener(payload);
      } catch (error) {
        console.error(
          `gm-combat-workspace | Event listener failed: ${eventName}`,
          error
        );
      }
    }
  }

  clear() {
    this.#listeners.clear();
  }
}
