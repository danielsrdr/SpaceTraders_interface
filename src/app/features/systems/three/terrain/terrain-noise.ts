function hash2d(seed: number, x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7 + seed * 17.13) * 43758.5453;
  return n - Math.floor(n);
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smooth 2D value noise in [0, 1]. */
export function noise2d(seed: number, x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = smoothstep(fx);
  const sz = smoothstep(fz);

  const a = hash2d(seed, ix, iz);
  const b = hash2d(seed, ix + 1, iz);
  const c = hash2d(seed, ix, iz + 1);
  const d = hash2d(seed, ix + 1, iz + 1);

  return lerp(lerp(a, b, sx), lerp(c, d, sx), sz);
}

/** Multi-octave noise centered around 0 with approximate unit amplitude. */
export function fbm2d(
  seed: number,
  x: number,
  z: number,
  octaves: number,
  lacunarity = 2,
  gain = 0.5,
): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    sum += (noise2d(seed + i * 97, x * freq, z * freq) * 2 - 1) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }

  return norm > 0 ? sum / norm : 0;
}

export function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}
