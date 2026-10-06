/**
 * The five filter chips under the category row: open on the weekend, free
 * shipping, near me, under 99, newest.
 *
 * Pure. The URL tokens, the parsers that read them back, the href that toggles
 * one, and the filter each one adds to a PostgREST query. No React and no
 * Supabase client, so the chips row, both archive pages and the query share
 * one definition and the tests need no database.
 *
 * WHAT EACH CHIP FILTERS ON, AND WHY IT IS A COLUMN PRODUCTION HAS
 *
 * `products.tags text[]` and `products.requires_shipping boolean` exist on the
 * hosted project today (src/types/database.ts is generated from it). A chip
 * that named a column from a pending migration would be Postgres 42703, which
 * fails the WHOLE select and empties the grid - the failure category-page.ts
 * already documents for `latitude`/`longitude`.
 *
 * - Open on the weekend is a tag, `open-weekend`, set from a checkbox in the
 *   admin product form. Business hours are free text (`suppliers.opening_hours`
 *   in pending 232) and cannot be filtered; a marker the operator sets on
 *   purpose can. The marker is a tag rather than a new boolean column because
 *   the column would sit in `migrations/pending/` behind an approval, and until
 *   then the chip would be a 42703 on every click.
 *
 * - Free shipping is a physical product (`requires_shipping = true`) whose
 *   `shipping_price_agorot` is 0. That column arrives with pending 243 and
 *   defaults to 0, which is also what checkout charges today for everything
 *   (243's own header says so). So the query names it only while the database
 *   has it: `isMissingShippingColumn` recognises the 42703 and the caller
 *   retries with `requires_shipping` alone, which on a pre-243 database is the
 *   same set of rows.
 *
 * - Near me is not a filter here at all: it is the `?near=lat,lng` sort that
 *   `parseNear`/`sortByDistance` already implement, asked for on click and
 *   never on mount. See `use-near-me.ts`.
 */

/** The marker tag the admin form writes for a business open on Friday and Saturday. */
export const OPEN_WEEKEND_TAG = 'open-weekend'

export const OPEN_PARAM = 'open'
export const SHIPPING_PARAM = 'shipping'

export type OpenFilter = 'weekend'
export type ShippingFilter = 'free'

export interface ChipFilters {
  openWeekend?: boolean
  freeShipping?: boolean
}

function first(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw
}

/** `?open=weekend`, and nothing else. A bad value widens to "no filter". */
export function parseOpen(raw: string | string[] | undefined): OpenFilter | undefined {
  return first(raw) === 'weekend' ? 'weekend' : undefined
}

/** `?shipping=free`, and nothing else. */
export function parseShipping(raw: string | string[] | undefined): ShippingFilter | undefined {
  return first(raw) === 'free' ? 'free' : undefined
}

export function chipFiltersFromParams(sp: {
  [key: string]: string | string[] | undefined
}): ChipFilters {
  return {
    openWeekend: parseOpen(sp[OPEN_PARAM]) === 'weekend' || undefined,
    freeShipping: parseShipping(sp[SHIPPING_PARAM]) === 'free' || undefined,
  }
}

/** The query-string form, for pagination links that must keep the chips on. */
export function chipLinkParams(filters: ChipFilters): Record<string, string | undefined> {
  return {
    [OPEN_PARAM]: filters.openWeekend ? 'weekend' : undefined,
    [SHIPPING_PARAM]: filters.freeShipping ? 'free' : undefined,
  }
}

/**
 * The href a chip links to: the current query with this one parameter toggled
 * and the page number dropped, because page 3 of the old result set means
 * nothing under a new filter. `near` is kept - a customer who asked for
 * nearest-first keeps that order while they narrow the set.
 */
export function toggleChipHref(
  pathname: string,
  params: Record<string, string | undefined>,
  key: string,
  value: string,
): string {
  const next = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '' || k === 'page') continue
    if (k === key) continue
    next.set(k, v)
  }
  if (params[key] !== value) next.set(key, value)
  const qs = next.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

/** The subset of the PostgREST builder the chip filters use. */
export interface ChipFilterable<Q> {
  contains(column: string, value: string[]): Q
  eq(column: string, value: boolean | number): Q
}

/**
 * Adds the active chips to a query. `withShippingColumn` is whether to name
 * `shipping_price_agorot`; the caller passes false on the retry after a 42703.
 */
export function applyChipFilters<Q extends ChipFilterable<Q>>(
  query: Q,
  filters: ChipFilters,
  withShippingColumn: boolean,
): Q {
  let q = query
  if (filters.openWeekend) q = q.contains('tags', [OPEN_WEEKEND_TAG])
  if (filters.freeShipping) {
    q = q.eq('requires_shipping', true)
    if (withShippingColumn) q = q.eq('shipping_price_agorot', 0)
  }
  return q
}

/** Postgres: undefined_column. */
const UNDEFINED_COLUMN = '42703'

/**
 * True when the failure is exactly "this database has no shipping_price_agorot
 * yet" (pending 243), which is the one error the free-shipping chip may retry
 * past. Any other failure is a real one and stays a failure.
 */
export function isMissingShippingColumn(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false
  if (error.code !== UNDEFINED_COLUMN) return false
  return (error.message ?? '').includes('shipping_price_agorot')
}

export function hasActiveChip(filters: ChipFilters): boolean {
  return Boolean(filters.openWeekend || filters.freeShipping)
}

/*
 * THE TWO CHIPS THAT RIDE ON PARAMETERS THE PAGE ALREADY HAS.
 *
 * "Under 99" and "newest" are not new filters: `?max=` is the price facet the
 * sidebar writes and `getCategoryProducts` applies as `kenyon_price <= max`,
 * and `?sort=newest` is the control bar's "most recent" order. A chip that
 * minted a second parameter for the same thing would let the URL say two
 * things at once (`max=150&under=99`), and the sidebar, the sort select and
 * the chip would each show a different state for one result set. So the chip
 * writes the parameter the other control reads, and all three agree because
 * there is one value to agree on.
 *
 * 99 is the bound of the `under-99` collection (`collectionRule`), so the chip
 * on any category page shows the same rows the collection page shows for that
 * category. It compares a whole-shekel bound against `kenyon_price` like the
 * facet does; no arithmetic, so it does not go through the money module.
 */

const PRICE_MAX_PARAM = 'max'
const PRICE_MIN_PARAM = 'min'
const SORT_PARAM = 'sort'
const UNDER_PRICE_ILS = 99
const NEWEST_SORT = 'newest'

export interface QuickChips {
  under99: boolean
  newest: boolean
}

/**
 * Whether the two parameter-backed chips are on, read from the page's link
 * params (strings, as the links carry them). `max=99` exactly: a customer who
 * typed 120 into the facet has a price cap, but not this one, and the chip
 * then links to the URL that tightens it to 99.
 */
export function quickChipsFromParams(params: Record<string, string | undefined>): QuickChips {
  return {
    under99: params[PRICE_MAX_PARAM] === String(UNDER_PRICE_ILS),
    newest: params[SORT_PARAM] === NEWEST_SORT,
  }
}

/**
 * The href of the under-99 chip. `toggleChipHref` on `max=99`, plus one rule:
 * a `min` at or above the cap is dropped when the chip turns on, because
 * `min=120&max=99` is an empty set by construction and the customer did not
 * ask for an empty page, they asked for the cheap ones.
 */
export function under99ChipHref(
  pathname: string,
  params: Record<string, string | undefined>,
): string {
  const turningOn = params[PRICE_MAX_PARAM] !== String(UNDER_PRICE_ILS)
  const min = Number.parseFloat(params[PRICE_MIN_PARAM] ?? '')
  const next =
    turningOn && Number.isFinite(min) && min >= UNDER_PRICE_ILS
      ? { ...params, [PRICE_MIN_PARAM]: undefined }
      : params
  return toggleChipHref(pathname, next, PRICE_MAX_PARAM, String(UNDER_PRICE_ILS))
}

/** The href of the newest chip: `sort=newest` on, or back to the default order. */
export function newestChipHref(
  pathname: string,
  params: Record<string, string | undefined>,
): string {
  return toggleChipHref(pathname, params, SORT_PARAM, NEWEST_SORT)
}
