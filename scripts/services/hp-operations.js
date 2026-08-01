function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

export function parseHpInput(rawValue) {
  const input = String(rawValue ?? "").replace(/\s/g, "");
  if (/^\+\d+$/.test(input)) return { mode: "heal", amount: integer(input.slice(1)) };
  if (/^-\d+$/.test(input)) return { mode: "damage", amount: integer(input.slice(1)) };
  if (/^\d+$/.test(input)) return { mode: "set", amount: integer(input) };
  return null;
}

export function calculateHpUpdate(hp, mode, rawAmount) {
  const value = Math.max(0, integer(hp?.value));
  const maximum = Math.max(0, integer(hp?.max));
  const temporary = Math.max(0, integer(hp?.temp));
  const amount = Math.max(0, integer(rawAmount));

  if (mode === "set") {
    return { value: Math.min(maximum, amount), temp: temporary };
  }
  if (mode === "heal") {
    return { value: Math.min(maximum, value + amount), temp: temporary };
  }
  if (mode === "damage") {
    const absorbed = Math.min(temporary, amount);
    return {
      value: Math.max(0, value - (amount - absorbed)),
      temp: temporary - absorbed
    };
  }
  throw new TypeError(`Unknown HP operation: ${mode}`);
}

export function halfDamage(amount) {
  return Math.floor(Math.max(0, integer(amount)) / 2);
}

export function uniqueHpTargets(targets = []) {
  const unique = new Map();
  for (const target of targets) {
    const key = target?.linked
      ? `actor:${target.actorId ?? target.actorUuid}`
      : `token:${target.sceneId}:${target.tokenId}`;
    if (!unique.has(key)) unique.set(key, target);
  }
  return [...unique.values()];
}
