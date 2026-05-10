/**
 * prng.ts — Seeded pseudo-random number generator (Mulberry32 algorithm).
 *
 * The engine must never call Math.random() directly.  All randomness goes
 * through a PRNG initialized from a per-session seed string.  This guarantees
 * that replaying the same seed + same choices always produces identical results,
 * which is the foundation of session serialization and reproducible playthroughs.
 */

/** A stateful PRNG function returning floats in [0, 1). */
export type PrngFn = () => number;

/**
 * Creates a Mulberry32 PRNG from a 32-bit unsigned integer seed.
 * Mulberry32 has excellent statistical properties and is trivial to serialize
 * (just store the seed — advance calls are deterministic).
 */
export function createPRNG(seed: number): PrngFn {
  let s = seed >>> 0; // ensure 32-bit unsigned
  return function random(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Converts an arbitrary string to a 32-bit unsigned integer via djb2 hashing.
 * Used to derive a numeric seed from the session's string seed.
 */
export function seedFromString(s: string): number {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    // hash * 33 + charCode
    hash = ((hash << 5) + hash + s.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Picks a uniformly random integer in [min, max] (inclusive).
 */
export function randomInt(prng: PrngFn, min: number, max: number): number {
  return Math.floor(prng() * (max - min + 1)) + min;
}

/**
 * Picks a uniformly random element from a non-empty array.
 */
export function randomChoice<T>(prng: PrngFn, arr: readonly T[]): T {
  if (arr.length === 0) throw new RangeError("Cannot pick from empty array");
  return arr[Math.floor(prng() * arr.length)] as T;
}
