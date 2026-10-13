/**
 * Ranking for the "מומלצים" strip: which products in a category sit closest to
 * the one being viewed.
 *
 * Pure, so the order is testable without a database and identical on every
 * render. The loader in `related-products.ts` fetches a pool of candidates
 * newest-first and hands them here.
 *
 * Two signals, in this order of weight:
 *
 *   shared tags   Each tag in common is one point. Tags are the only field an
 *                 admin sets to say "these belong together", so they outrank
 *                 price.
 *   price band    A candidate priced within the band around the anchor gets a
 *                 fraction of a point that shrinks with distance. It can order
 *                 two candidates with the same tag overlap and can never lift
 *                 one above a candidate with more tags in common.
 *
 * Ties keep the pool's order, which is newest first. A product with no tags
 * and no price therefore ranks exactly as the strip did before this module.
 *
 * Prices are compared as integer agorot and the score is an integer too. It is
 * a ranking weight, never an amount: nothing computed here is charged, stored
 * or displayed.
 */

/** How far, as a share of the anchor price, a candidate may sit and still count as "in band". */
export const PRICE_BAND_PERCENT = 30

export interface RankableProduct {
  id: string
  /** Integer agorot, or null when the product has no price to compare. */
  priceAgorot: number | null
  tags: readonly string[]
}

function normalizeTag(tag: string): string {
  return tag.trim().toLocaleLowerCase('he-IL')
}

function tagSet(tags: readonly string[]): Set<string> {
  const set = new Set<string>()
  for (const tag of tags) {
    const normalized = normalizeTag(tag)
    if (normalized) set.add(normalized)
  }
  return set
}

/** Number of distinct tags the two products share, ignoring case and padding. */
export function sharedTagCount(a: readonly string[], b: readonly string[]): number {
  const left = tagSet(a)
  let shared = 0
  for (const tag of tagSet(b)) {
    if (left.has(tag)) shared++
  }
  return shared
}

/** True when `candidate` is within `PRICE_BAND_PERCENT` of `anchor`, both in agorot. */
export function inPriceBand(anchor: number | null, candidate: number | null): boolean {
  return priceCloseness(anchor, candidate) > 0
}

/** One shared tag, on the integer scale the score is kept in. */
const TAG_POINT = 1000

/**
 * 0 outside the band, 900 at an equal price, 100 at the edge of the band.
 * Always below `TAG_POINT`, so it stays a tie-breaker under one shared tag.
 * Integer arithmetic throughout, like everything else that touches a price.
 */
function priceCloseness(anchor: number | null, candidate: number | null): number {
  if (anchor === null || candidate === null || anchor <= 0 || candidate <= 0) return 0
  const distance = Math.abs(candidate - anchor)
  // distance / anchor > PRICE_BAND_PERCENT / 100, without dividing.
  if (distance * 100 > anchor * PRICE_BAND_PERCENT) return 0
  return 900 - Math.floor((distance * 100 * 800) / (anchor * PRICE_BAND_PERCENT))
}

/**
 * Orders `candidates` by closeness to `anchor` and returns the first `limit`.
 * The anchor itself is dropped if it appears in the pool.
 */
export function rankRelated<T extends RankableProduct>(
  anchor: RankableProduct | null,
  candidates: readonly T[],
  limit: number,
): T[] {
  const pool = anchor ? candidates.filter((c) => c.id !== anchor.id) : [...candidates]
  if (!anchor) return pool.slice(0, limit)

  return pool
    .map((candidate, index) => ({
      candidate,
      index,
      score:
        sharedTagCount(anchor.tags, candidate.tags) * TAG_POINT +
        priceCloseness(anchor.priceAgorot, candidate.priceAgorot),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.candidate)
}
