/**
 * Deterministic hashing + PRNG helpers. Used so generated art (e.g. the
 * postcard starfield) is identical for a given seed (system symbol) on every
 * machine, with no backend or stored state.
 */

/** FNV-ish 32-bit string hash, matching the one in the orbit engine. */
export function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** mulberry32 PRNG — fast, seedable, returns a function yielding [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convenience: seed a mulberry32 stream from a string or number. */
export function seededRandom(seed: string | number): () => number {
  return mulberry32(typeof seed === 'number' ? seed : hashString(seed));
}
