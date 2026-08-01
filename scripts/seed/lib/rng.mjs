// scripts/seed/lib/rng.mjs
//
// A seeded PRNG, so "pick a customer for this order" is a decision the seed
// makes once and reproduces forever. Math.random() would make every run write
// a different fixture set, which defeats the point of a seed you can write
// assertions against.
//
// mulberry32: 32-bit state, one multiply-xorshift round. Not cryptographic and
// never used for anything that must be unguessable. Voucher codes, which must
// be unguessable, come from node:crypto in lib/voucher.mjs instead.

export function createRng(seed) {
  let state = typeof seed === 'string' ? hashString(seed) : seed >>> 0

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    /** Integer in [min, max], both inclusive. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1))
    },
    pick(items) {
      if (items.length === 0) throw new RangeError('pick() from an empty list')
      return items[Math.floor(next() * items.length)]
    },
    /** A new array, shuffled. Fisher-Yates, so every permutation is reachable. */
    shuffle(items) {
      const copy = [...items]
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[copy[i], copy[j]] = [copy[j], copy[i]]
      }
      return copy
    },
    bool(trueProbability = 0.5) {
      return next() < trueProbability
    },
  }
}

function hashString(value) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
