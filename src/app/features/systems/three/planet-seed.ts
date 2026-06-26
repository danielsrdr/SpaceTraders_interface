/** Stable integer seed from a planet or waypoint name. */
export function planetSeedInt(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Stable unit seed in [0, 1) — matches celestial baker / shader usage. */
export function planetSeedUnit(name: string): number {
  return (planetSeedInt(name) % 100_000) / 100_000;
}
