import { type DealCandidate, rankDeals } from '@/lib/pricing/flash-deals'

/**
 * The rules behind the home page sections that sit BELOW the parity gate's
 * window, pure so they can be tested without a database.
 *
 * WHERE THESE SECTIONS MAY GO IS A MEASURED CONSTRAINT, not a layout choice.
 * `scripts/diff-bands.mjs` scores the first 2600px of the page against the
 * archived live capture and nothing under that line. The deals grid alone runs
 * past 2600 at every width (32 cards: 31 rows at 380, 16 at 768, 8 at 1440), so
 * a section mounted AFTER it cannot move a scored pixel, and a section mounted
 * before it moves every band under it. The 11% ceiling in CLAUDE.md is a locked
 * rule; these sections are therefore appended after the grid and nowhere else.
 * `src/lib/live-home-sections.test.ts` pins that order.
 */

/** Eight tiles: two rows of four on a desktop, four rows of two on a phone. */
export const HOME_CATEGORY_TILE_COUNT = 8

/** The hot coupons row shows one screen of deals and links to the rest. */
export const HOT_COUPON_COUNT = 8

export interface CategoryTileRow {
  slug: string
  name_he: string
  /** `categories.image_url`: an uploaded (R2) image when an editor set one. */
  image_url: string | null
}

export interface CategoryTile {
  slug: string
  nameHe: string
  imageUrl: string | null
}

/**
 * The tiles to render, in menu order, with the ones that have a real image
 * first. A category's own `image_url` wins; otherwise the ingested file the
 * slug maps to in `CATEGORY_TILE_IMAGES`; otherwise the tile renders the
 * SmartImage fallback rather than being dropped, so a catalogue with fewer
 * than `limit` photographed categories still fills the grid.
 */
export function pickCategoryTiles(
  rows: readonly CategoryTileRow[],
  images: Readonly<Record<string, string>>,
  limit: number = HOME_CATEGORY_TILE_COUNT,
): CategoryTile[] {
  const withImage: CategoryTile[] = []
  const without: CategoryTile[] = []
  for (const row of rows) {
    const imageUrl = row.image_url || images[row.slug] || null
    const tile = { slug: row.slug, nameHe: row.name_he, imageUrl }
    if (imageUrl) withImage.push(tile)
    else without.push(tile)
  }
  return [...withImage, ...without].slice(0, Math.max(0, limit))
}

const DAY_SECONDS = 86_400

/**
 * Seconds until the next midnight in Israel, from `now`.
 *
 * Read through `Intl` with `hourCycle: 'h23'` rather than by adding hours to
 * a UTC value: Israel switches daylight time, and a fixed offset is wrong for
 * two nights a year. `h23` is spelled out because `hour12: false` alone yields
 * "24" at midnight in some engines, which would count a whole extra day.
 * Returns 1..86400, never 0: at the stroke of midnight a new day starts.
 */
export function secondsUntilJerusalemMidnight(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now)
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)
  const elapsed = read('hour') * 3600 + read('minute') * 60 + read('second')
  return DAY_SECONDS - Math.min(Math.max(elapsed, 0), DAY_SECONDS - 1)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** `HH:MM:SS`, digits only, for an LTR isolate. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

/** The first image path on a product row, whichever shape the import wrote. */
export function firstImage(images: unknown): string | null {
  if (!Array.isArray(images) || images.length === 0) return null
  const head = images[0] as unknown
  if (typeof head === 'string') return head || null
  if (head && typeof head === 'object' && typeof (head as { url?: unknown }).url === 'string') {
    return (head as { url: string }).url || null
  }
  return null
}

export interface DealOfTheDayCandidate extends DealCandidate {
  images: unknown
  category?: { name_he: string; slug: string } | null
}

export interface DealOfTheDay {
  id: string
  slug: string
  nameHe: string
  imageUrl: string
  priceAgorot: number
  referenceAgorot: number
  /** Basis points off the reference, from `rankDeals`; 2500 is 25% off. */
  discountBp: number
  category: { name_he: string; slug: string } | null
}

/**
 * The deal of the day is the deepest discount in the catalogue that has a
 * photograph, a slug and a name - the same ranking the daily cron journals
 * (`rankDeals`), restricted to what a card can actually show. Deterministic:
 * the same catalogue yields the same deal, and the cron's price changes plus
 * its `CATALOGUE_TAG` invalidation are what make it change from day to day.
 */
export function pickDealOfTheDay(
  candidates: readonly DealOfTheDayCandidate[],
): DealOfTheDay | null {
  const showable = candidates.filter((c) => c.slug && c.name_he && firstImage(c.images))
  const top = rankDeals(showable, 1)[0]
  if (!top) return null
  const product = showable.find((c) => c.id === top.id)
  if (!product) return null
  return {
    id: product.id,
    slug: product.slug as string,
    nameHe: product.name_he as string,
    imageUrl: firstImage(product.images) as string,
    priceAgorot: top.priceAgorot,
    referenceAgorot: top.referenceAgorot,
    discountBp: top.discountBp,
    category: product.category ?? null,
  }
}
