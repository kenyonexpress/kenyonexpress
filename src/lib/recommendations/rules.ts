/**
 * The arithmetic behind every recommendation strip, with no I/O in it.
 *
 * FOUR SURFACES, ONE MODULE. The product page shows "נקנו יחד" (bought
 * together, from paid `order_items`), "צפו גם ב" (viewed together, from
 * PostHog `view_item` events grouped into baskets) and "במחיר דומה" (same price
 * band in the catalogue); the home page shows a "מותאם לך" row built from the
 * visitor's own `view_item` history. All four reduce to the same two
 * operations: counting which products share a basket, and ranking a candidate
 * list against a seed. Those live here so that the readers in `sources.ts`
 * are nothing but queries, and so that every threshold is a named constant
 * with a test rather than a literal inside a query.
 *
 * WHY THERE ARE THRESHOLDS AT ALL. Measured on production 2026-10-08:
 * 28 paid orders, ONE of which holds two different products; 384 `view_product`
 * events in 90 days across 209 sessions, THREE of which saw two products. A
 * co-occurrence of one is not a signal, it is one shopper, and a strip titled
 * "נקנו יחד" over it would be naming a stranger's basket. `MIN_SUPPORT` is the
 * floor under which a pair does not exist; `MIN_STRIP` is the floor under
 * which a strip does not render, because a two-card "row" reads as a mistake.
 *
 * MONEY. Prices arrive as integer agorot (`kenyon_price_agorot`) and are
 * compared as integers. The band is a percentage of the seed price, computed
 * with integer arithmetic and rounded once; nothing here divides.
 */

/** A pair must be seen in at least this many baskets to count. */
export const MIN_SUPPORT = 2

/** A strip with fewer products than this renders nothing. */
export const MIN_STRIP = 2

/** Cards per strip on the product page (the live row is five across). */
export const STRIP_SIZE = 5

/** Cards in the personalised home row. */
export const FOR_YOU_SIZE = 8

/** Half-width of the similar-price band, in basis points (2500 = ±25%). */
export const PRICE_BAND_BP = 2500

/** Narrowest band in agorot, so a ₪20 item still has neighbours. */
export const PRICE_BAND_MIN_AGOROT = 1_000

/** Baskets older than this are not evidence of today's catalogue. */
export const BASKET_WINDOW_DAYS = 90

/** Baskets wider than this are a bot or a bulk import, not a shopper. */
export const MAX_BASKET_SIZE = 25

export type Basket = {
  /** Order id, session id or `distinct_id:day`. Only used to dedupe. */
  key: string
  productIds: readonly string[]
}

/** product -> (other product -> number of baskets both appeared in) */
export type CooccurrenceMatrix = ReadonlyMap<string, ReadonlyMap<string, number>>

function distinctIds(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  for (const id of ids) {
    if (typeof id === 'string' && id.length > 0) seen.add(id)
  }
  return [...seen]
}

/**
 * Counts, for every product, how many baskets it shared with each other
 * product. Symmetric by construction. A basket is counted once however many
 * times a product repeats inside it (two units of the same coupon are one
 * basket, not two), and a basket wider than `MAX_BASKET_SIZE` is dropped
 * whole rather than contributing n² pairs of noise.
 */
export function buildCooccurrence(baskets: readonly Basket[]): CooccurrenceMatrix {
  const matrix = new Map<string, Map<string, number>>()
  const seenKeys = new Set<string>()
  for (const basket of baskets) {
    if (seenKeys.has(basket.key)) continue
    seenKeys.add(basket.key)
    const ids = distinctIds(basket.productIds)
    if (ids.length < 2 || ids.length > MAX_BASKET_SIZE) continue
    for (const a of ids) {
      let row = matrix.get(a)
      if (!row) {
        row = new Map()
        matrix.set(a, row)
      }
      for (const b of ids) {
        if (a === b) continue
        row.set(b, (row.get(b) ?? 0) + 1)
      }
    }
  }
  return matrix
}

export type RankedNeighbour = { productId: string; support: number }

/**
 * The products most often in a basket with `productId`, strongest first,
 * ties broken by id so the strip is stable between renders. Pairs under
 * `MIN_SUPPORT` are not returned at all.
 */
export function neighboursOf(
  matrix: CooccurrenceMatrix,
  productId: string,
  options: { limit?: number; exclude?: ReadonlySet<string>; minSupport?: number } = {},
): RankedNeighbour[] {
  const row = matrix.get(productId)
  if (!row) return []
  const minSupport = options.minSupport ?? MIN_SUPPORT
  const exclude = options.exclude ?? new Set<string>()
  const ranked: RankedNeighbour[] = []
  for (const [other, support] of row) {
    if (other === productId || exclude.has(other) || support < minSupport) continue
    ranked.push({ productId: other, support })
  }
  ranked.sort((x, y) => y.support - x.support || (x.productId < y.productId ? -1 : 1))
  return options.limit === undefined ? ranked : ranked.slice(0, options.limit)
}

/**
 * Merges several seeds' neighbour lists: a product seen beside two of the
 * visitor's viewed items outranks one seen beside one. This is the whole of
 * the "personalisation": sum the support across the seeds, exclude what the
 * visitor already looked at, rank.
 */
export function neighboursOfMany(
  matrix: CooccurrenceMatrix,
  seeds: readonly string[],
  options: { limit?: number; exclude?: ReadonlySet<string>; minSupport?: number } = {},
): RankedNeighbour[] {
  const exclude = new Set<string>(options.exclude ?? [])
  for (const seed of seeds) exclude.add(seed)
  const totals = new Map<string, number>()
  for (const seed of distinctIds(seeds)) {
    for (const n of neighboursOf(matrix, seed, { exclude, minSupport: options.minSupport })) {
      totals.set(n.productId, (totals.get(n.productId) ?? 0) + n.support)
    }
  }
  const ranked = [...totals].map(([productId, support]) => ({ productId, support }))
  ranked.sort((x, y) => y.support - x.support || (x.productId < y.productId ? -1 : 1))
  return options.limit === undefined ? ranked : ranked.slice(0, options.limit)
}

export type PriceBand = { minAgorot: number; maxAgorot: number }

/**
 * The band a product's "similar price" neighbours are drawn from: ±25% of
 * the seed price, never narrower than `PRICE_BAND_MIN_AGOROT` on each side,
 * never below zero. Integer agorot in, integer agorot out; the one rounding
 * is on the percentage.
 */
export function priceBand(priceAgorot: number): PriceBand | null {
  if (!Number.isInteger(priceAgorot) || priceAgorot <= 0) return null
  const half = Math.max(Math.round((priceAgorot * PRICE_BAND_BP) / 10_000), PRICE_BAND_MIN_AGOROT)
  return { minAgorot: Math.max(0, priceAgorot - half), maxAgorot: priceAgorot + half }
}

export type PricedCandidate = { id: string; priceAgorot: number | null }

/**
 * Orders candidates by how close their price is to the seed, closest first,
 * dropping the seed itself, anything excluded, and anything without a price.
 * Ties fall back to id so the strip does not shuffle between requests.
 */
export function rankBySimilarPrice<T extends PricedCandidate>(
  candidates: readonly T[],
  seedPriceAgorot: number,
  options: { limit?: number; exclude?: ReadonlySet<string> } = {},
): T[] {
  const exclude = options.exclude ?? new Set<string>()
  const seen = new Set<string>()
  const kept: T[] = []
  for (const c of candidates) {
    if (exclude.has(c.id) || seen.has(c.id)) continue
    if (c.priceAgorot === null || !Number.isFinite(c.priceAgorot)) continue
    seen.add(c.id)
    kept.push(c)
  }
  kept.sort((a, b) => {
    const da = Math.abs((a.priceAgorot as number) - seedPriceAgorot)
    const db = Math.abs((b.priceAgorot as number) - seedPriceAgorot)
    return da - db || (a.id < b.id ? -1 : 1)
  })
  return options.limit === undefined ? kept : kept.slice(0, options.limit)
}

/**
 * Applies the strip floor: a list shorter than `MIN_STRIP` becomes empty, so
 * the component's "render nothing" check is one `length === 0` and the
 * threshold lives here with its reason instead of in JSX.
 */
export function stripOrNothing<T>(items: readonly T[], min = MIN_STRIP): T[] {
  return items.length >= min ? [...items] : []
}

/**
 * Three strips that never show the same card twice. Bought-together is the
 * strongest signal (money moved), so it keeps its cards; viewed-together loses
 * any card already in the first strip; similar-price loses any card in either.
 * Each strip is then held to the floor, in that order, so a strip emptied by
 * dedupe does not pull cards back from a weaker one.
 */
export function dedupeStrips<T extends { id: string }>(strips: {
  boughtTogether: readonly T[]
  viewedTogether: readonly T[]
  similarPrice: readonly T[]
}): { boughtTogether: T[]; viewedTogether: T[]; similarPrice: T[] } {
  const taken = new Set<string>()
  const take = (items: readonly T[], limit: number): T[] => {
    const out: T[] = []
    for (const item of items) {
      if (taken.has(item.id)) continue
      out.push(item)
      if (out.length >= limit) break
    }
    const kept = stripOrNothing(out)
    for (const item of kept) taken.add(item.id)
    return kept
  }
  const boughtTogether = take(strips.boughtTogether, STRIP_SIZE)
  const viewedTogether = take(strips.viewedTogether, STRIP_SIZE)
  const similarPrice = take(strips.similarPrice, STRIP_SIZE)
  return { boughtTogether, viewedTogether, similarPrice }
}

/**
 * Whether a string is something the catalogue could have as a product id.
 * Seeds arrive from a query string and from PostHog properties, both of
 * which a stranger can write; anything that is not a UUID is dropped before
 * it reaches a query, and the list is capped so a long URL cannot turn into a
 * long `IN (...)`.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const MAX_SEEDS = 12

export function sanitizeSeedIds(raw: readonly unknown[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of raw) {
    if (typeof value !== 'string') continue
    const id = value.trim().toLowerCase()
    if (!UUID.test(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= MAX_SEEDS) break
  }
  return out
}

/**
 * Turns flat `(basketKey, productId)` rows, as every source returns them,
 * into baskets. The HogQL and PostgREST readers both produce this shape, so
 * one grouping serves both and the matrix builder sees one input type.
 */
export function basketsFromRows(rows: readonly { key: string; productId: string }[]): Basket[] {
  const byKey = new Map<string, string[]>()
  for (const row of rows) {
    if (!row.key || !row.productId) continue
    const list = byKey.get(row.key)
    if (list) list.push(row.productId)
    else byKey.set(row.key, [row.productId])
  }
  return [...byKey].map(([key, productIds]) => ({ key, productIds }))
}
