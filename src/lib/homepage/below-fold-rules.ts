import { type DealCandidate, rankDeals } from '@/lib/pricing/flash-deals'
import { type PopularSearch, searchHref } from '@/lib/search/empty-state'

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

/** One row of chips on a desktop; two on a phone. */
export const HOME_POPULAR_SEARCH_COUNT = 8

export interface PopularSearchChip {
  term: string
  href: string
}

/**
 * The promoted terms as chips: blank terms dropped, duplicates (case- and
 * whitespace-insensitive) collapsed to the first, an operator's target URL
 * kept when it is same-site and otherwise replaced by the search page for
 * that term. CURATED, NOT COMPUTED: the rows are the operator's list
 * (`popular_searches`, migration 118); `search_events` is analytics and is
 * never published, for the reason api/search/quick-links gives.
 */
export function pickPopularSearches(rows: PopularSearch[], limit: number): PopularSearchChip[] {
  const seen = new Set<string>()
  const chips: PopularSearchChip[] = []
  for (const row of rows) {
    const term = row.term.replace(/\s+/g, ' ').trim()
    if (!term) continue
    const key = term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const target = row.target_url?.trim()
    const href = target?.startsWith('/') && !target.startsWith('//') ? target : searchHref(term)
    chips.push({ term, href })
    if (chips.length >= limit) break
  }
  return chips
}

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
 * Pictographs and the joiners that dress them: the emoji blocks (Misc Symbols
 * through Supplemental Symbols and Pictographs), the arrows/dingbats range
 * the fire and star glyphs sit in, the text/emoji variation selectors, the
 * zero-width joiner (the skin-tone modifiers sit inside the first block).
 * Written as code points, not
 * `\p{Extended_Pictographic}`: the project's TS target predates Unicode
 * property escapes, and a `\p{}` that passes vitest fails type-check. The
 * selectors and the joiner are alternations, not class members, because biome
 * refuses a class that mixes a character with a combining one.
 *
 * NOT TOUCHED: the LTR isolates (U+2066..U+2069) and the no-break space that
 * `shekelsRounded` wraps a price in, so "עד 99 ₪" keeps its direction. That
 * is why the collapse below is ` {2,}` and not `\s+`: `\s` matches U+00A0.
 */
const PICTOGRAPHS =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]|\u{FE0E}|\u{FE0F}|\u{200D}/gu

/**
 * A category's name as the tile prints it: the row's Hebrew with any emoji
 * (and the whitespace it left behind) removed. The tile already carries a
 * photograph of the department; a glyph beside the name was a second,
 * font-dependent picture, and on a phone it also wrapped the label. The
 * database row keeps its emoji for the hero panel and the admin, which read
 * `name_he` directly; this is the home grid's rule only.
 */
export function tileLabel(nameHe: string): string {
  return nameHe.replace(PICTOGRAPHS, '').replace(/ {2,}/g, ' ').trim()
}

/**
 * The tiles to render, in menu order, with the ones that have a real image
 * first. A category's own `image_url` wins; otherwise the ingested file the
 * slug maps to in `CATEGORY_TILE_IMAGES`; otherwise the tile renders the
 * SmartImage fallback rather than being dropped, so a catalogue with fewer
 * than `limit` photographed categories still fills the grid. Names go
 * through `tileLabel`.
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
    const tile = { slug: row.slug, nameHe: tileLabel(row.name_he), imageUrl }
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
