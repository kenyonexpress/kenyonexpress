import { FACET_PARAM, facetValueLabel } from '@/lib/search/facet-links'
import { parseFacetedParams } from '@/lib/search/faceted'
import { z } from 'zod'

/**
 * Saved searches: the pure rules (STEP 08, 30.09).
 *
 * A saved search is a canonical `/search?...` URL plus a name. Everything a
 * shopper can narrow by lives in that URL already (lib/search/faceted.ts), so
 * the table stores the URL whole and this module decides what "canonical"
 * means, what counts as a valid one, and what to call it when the shopper
 * does not. Pure, so migration 245's CHECK and these rules can be pinned
 * together by a unit test without a database.
 */

export const SAVED_SEARCH_LIMIT = 30
export const MAX_SAVED_NAME = 60
export const MAX_SAVED_QUERY = 120
export const MAX_SAVED_HREF = 600

/** Paging never belongs in a saved search: page three of today is not a search. */
const DROPPED = new Set(['limit', 'offset'])

/**
 * The URL the row stores: the search page's own parameters, sorted so two
 * spellings of one search collapse into one row (the UNIQUE in 245 is on
 * this string), without paging, and with the aliases `min`/`max` folded into
 * `price_min`/`price_max` the way the page reads them.
 */
export function canonicalSearchHref(input: URLSearchParams | string): string {
  const source =
    typeof input === 'string' ? new URLSearchParams(input.replace(/^[^?]*\?/, '')) : input
  const params = new URLSearchParams()
  for (const [key, value] of source) {
    if (DROPPED.has(key)) continue
    const trimmed = value.trim()
    if (!trimmed) continue
    const name = key === 'min' ? 'price_min' : key === 'max' ? 'price_max' : key
    if (!params.has(name)) params.set(name, trimmed)
  }
  params.sort()
  return `/search?${params.toString()}`
}

export type SavedSearchCandidate = { href: string; query: string }

/**
 * Validates a search worth saving: a same-site search URL whose parameters
 * the results page would accept, with a query at least two characters long
 * (the page's own floor). Returns the canonical form, never the input.
 */
export function toSavedSearchCandidate(
  href: string,
): { ok: true; candidate: SavedSearchCandidate } | { ok: false; error: string } {
  if (typeof href !== 'string' || !href.startsWith('/search?')) {
    return { ok: false, error: 'not_a_search' }
  }
  const canonical = canonicalSearchHref(href)
  if (canonical.length > MAX_SAVED_HREF) return { ok: false, error: 'too_long' }
  const params = new URLSearchParams(canonical.slice('/search?'.length))
  const parsed = parseFacetedParams(params)
  if (!parsed.ok) return { ok: false, error: parsed.error }
  const query = parsed.params.q
  if (query.length < 2) return { ok: false, error: 'query_too_short' }
  if (query.length > MAX_SAVED_QUERY) return { ok: false, error: 'too_long' }
  return { ok: true, candidate: { href: canonical, query } }
}

/**
 * The name a search gets when the shopper does not give one: the query, then
 * every active facet's label, joined with a middle dot and cut at the column's
 * ceiling. "ספא · קופונים · תל אביב" reads as what it is.
 */
export function defaultSavedSearchName(href: string): string {
  const params = new URLSearchParams(href.replace(/^[^?]*\?/, ''))
  const parts: string[] = []
  const q = params.get('q')?.trim()
  if (q) parts.push(q)
  for (const [facet, param] of Object.entries(FACET_PARAM)) {
    const value = params.get(param)?.trim()
    if (value) parts.push(facetValueLabel(facet as keyof typeof FACET_PARAM, value))
  }
  const min = params.get('price_min')
  const max = params.get('price_max')
  if (min && max) parts.push(`₪${min}–₪${max}`)
  else if (min) parts.push(`מ-₪${min}`)
  else if (max) parts.push(`עד ₪${max}`)
  return clampName(parts.join(' · ')) || 'חיפוש שמור'
}

export function clampName(name: string): string {
  const collapsed = name.replace(/\s+/g, ' ').trim()
  return collapsed.length <= MAX_SAVED_NAME
    ? collapsed
    : `${collapsed.slice(0, MAX_SAVED_NAME - 1)}…`
}

/** What the save action accepts from the client. */
export const saveSearchInputSchema = z.object({
  href: z.string().min(9).max(2000),
  name: z.string().max(200).optional(),
})

export const savedSearchIdSchema = z.string().uuid()
