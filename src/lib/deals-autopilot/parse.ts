import { createHash } from 'node:crypto'
import { catalogueIlsToAgorot } from '@/lib/admin/bulk-price'
import { parseCsvGrid, stripBom } from '@/lib/admin/import/parseProductsCsv'
import { type FeedEntry, type ParseResult, type ParsedCandidate, feedEntrySchema } from './types'

const MAX_ENTRIES_PER_FETCH = 500

/**
 * A stable id for a feed entry that did not supply its own `external_ref`.
 *
 * Derived from name + link rather than a random one so the SAME entry,
 * re-fetched six hours later with the same name and link, updates the same
 * `deal_candidates` row (the migration's UNIQUE (supplier_id, external_ref))
 * instead of inserting a duplicate every cycle forever.
 */
function derivedRef(entry: { name: string; link: string }): string {
  return `derived:${createHash('sha256').update(`${entry.name}\u0000${entry.link}`).digest('hex').slice(0, 32)}`
}

function toCandidate(
  entry: FeedEntry,
  raw: Record<string, unknown>,
): { candidate: ParsedCandidate } | { error: string } {
  const priceAgorot = catalogueIlsToAgorot(entry.price)
  if (priceAgorot === null || priceAgorot <= 0) {
    return { error: `invalid price: ${String(entry.price)}` }
  }

  let fullPriceAgorot: number | null = null
  if (entry.full_price !== undefined) {
    fullPriceAgorot = catalogueIlsToAgorot(entry.full_price)
    if (fullPriceAgorot === null) {
      return { error: `invalid full_price: ${String(entry.full_price)}` }
    }
    if (fullPriceAgorot <= priceAgorot) {
      // Not an error: a feed row with no real discount just carries no strike
      // price rather than a full_price equal to (or below) the sale price.
      fullPriceAgorot = null
    }
  }

  let discountPercent: number | null = null
  if (entry.discount_percent !== undefined) {
    const n = Number(entry.discount_percent)
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return { error: `invalid discount_percent: ${String(entry.discount_percent)}` }
    }
    discountPercent = Math.round(n)
  }

  return {
    candidate: {
      externalRef: entry.external_ref ?? derivedRef(entry),
      nameHe: entry.name,
      priceAgorot,
      fullPriceAgorot,
      discountPercent,
      linkUrl: entry.link,
      imageUrl: entry.image ?? null,
      categoryText: entry.category ?? null,
      rawPayload: raw,
    },
  }
}

function toResult(rows: Array<{ raw: Record<string, unknown>; index: number }>): ParseResult {
  const candidates: ParsedCandidate[] = []
  const rejected: ParseResult['rejected'] = []

  for (const { raw, index } of rows.slice(0, MAX_ENTRIES_PER_FETCH)) {
    const parsed = feedEntrySchema.safeParse(raw)
    if (!parsed.success) {
      rejected.push({ index, reason: parsed.error.issues[0]?.message ?? 'invalid entry' })
      continue
    }
    const outcome = toCandidate(parsed.data, raw)
    if ('error' in outcome) {
      rejected.push({ index, reason: outcome.error })
    } else {
      candidates.push(outcome.candidate)
    }
  }

  if (rows.length > MAX_ENTRIES_PER_FETCH) {
    rejected.push({
      index: MAX_ENTRIES_PER_FETCH,
      reason: `feed carried ${rows.length} entries, only the first ${MAX_ENTRIES_PER_FETCH} were read`,
    })
  }

  return { candidates, rejected }
}

/**
 * A JSON feed is either a bare array of entries, or `{ "deals": [...] }` --
 * accepting both because "the array itself" and "an object with one key
 * pointing at it" are the two shapes every supplier who is asked for a JSON
 * export actually sends, and refusing the second to save one `.deals` read
 * would just move the problem to a support message asking why nothing
 * ingested.
 */
export function parseJsonFeed(text: string): ParseResult {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { candidates: [], rejected: [{ index: 0, reason: 'invalid JSON' }] }
  }

  const list = Array.isArray(json)
    ? json
    : json && typeof json === 'object' && Array.isArray((json as Record<string, unknown>).deals)
      ? ((json as Record<string, unknown>).deals as unknown[])
      : null

  if (!list) {
    return {
      candidates: [],
      rejected: [{ index: 0, reason: 'expected a JSON array or { "deals": [...] }' }],
    }
  }

  return toResult(
    list.map((raw, index) => ({
      raw: (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>,
      index,
    })),
  )
}

/**
 * A CSV feed, RFC 4180, first row is the header naming the fields in
 * `feedEntrySchema` (name, price, full_price, discount_percent, link,
 * category, image, external_ref). Reuses parseCsvGrid rather than a second,
 * possibly-diverging quoting implementation -- see the export note on it.
 */
export function parseCsvFeed(text: string): ParseResult {
  const grid = parseCsvGrid(stripBom(text))
  if (grid.length === 0) {
    return { candidates: [], rejected: [{ index: 0, reason: 'empty CSV' }] }
  }

  const header = grid[0]?.map((h) => h.trim()) ?? []
  const dataRows = grid.slice(1).filter((row) => row.some((cell) => cell.trim() !== ''))

  const rows = dataRows.map((row, index) => {
    const raw: Record<string, unknown> = {}
    header.forEach((key, col) => {
      const value = row[col]?.trim()
      if (key && value !== undefined && value !== '') raw[key] = value
    })
    return { raw, index }
  })

  return toResult(rows)
}
