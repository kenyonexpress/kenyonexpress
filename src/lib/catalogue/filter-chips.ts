/**
 * The filter chips under the category row: open on the weekend, free shipping,
 * under 99, newest.
 *
 * Pure. The URL tokens, the parsers that read them back, the href that toggles
 * one, and the filter each one adds to a PostgREST query. No React and no
 * Supabase client, so the chips row, both archive pages and the query share
 * one definition and the tests need no database.
 *
 * WHAT EACH CHIP FILTERS ON
 *
 * `products.open_weekend` and `products.free_shipping`, two booleans (NOT NULL
 * DEFAULT false) from `migrations/pending/262_product_chip_flags.sql`, applied
 * to production on 2026-11-06 (S35). The operator ticks each in the admin
 * product form, so a product is in a chip only because somebody said so.
 *
 * Until 262 the chips filtered on stand-ins: a marker tag inside
 * `products.tags` for the weekend, and `requires_shipping` with a zero
 * `shipping_price_agorot` for shipping. 262 carried both over once (the tag
 * became the column and left `tags`; the rows the shipping chip listed were
 * ticked), so the chips list the same products on both sides of the change.
 *
 * - Open on the weekend is the operator's statement that the business takes
 *   customers on Friday and Saturday. Business hours are free text
 *   (`suppliers.opening_hours`, pending 232) and cannot be filtered.
 *
 * - Free shipping is the operator's statement that the product ships free.
 *   The table refuses a row that says so while recording a shipping price or
 *   while not shipping at all (`products_free_shipping_consistent`), and
 *   `freeShippingConflict` is the same rule for the admin action, in Hebrew.
 *
 * There is no location chip in the row. `?near=lat,lng` is still a sort the
 * archive pages honour (`parseNear`/`sortByDistance`); nothing in the row
 * writes it.
 */

export const OPEN_WEEKEND_COLUMN = 'open_weekend'
export const FREE_SHIPPING_COLUMN = 'free_shipping'

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
  eq(column: string, value: boolean): Q
}

/** Adds the active chips to a query: one boolean column each. */
export function applyChipFilters<Q extends ChipFilterable<Q>>(query: Q, filters: ChipFilters): Q {
  let q = query
  if (filters.openWeekend) q = q.eq(OPEN_WEEKEND_COLUMN, true)
  if (filters.freeShipping) q = q.eq(FREE_SHIPPING_COLUMN, true)
  return q
}

/** The name of the table constraint that refuses a contradictory free-shipping row. */
export const FREE_SHIPPING_CONSTRAINT = 'products_free_shipping_consistent'

export const FREE_SHIPPING_NEEDS_SHIPPING =
  'משלוח חינם אפשרי רק למוצר שדורש משלוח פיזי. סמנו "דורש משלוח פיזי" או הסירו את הסימון ממשלוח חינם.'
export const FREE_SHIPPING_HAS_PRICE =
  'מוצר שמסומן כמשלוח חינם לא יכול לשאת מחיר משלוח. אפסו את מחיר המשלוח או הסירו את הסימון ממשלוח חינם.'

/**
 * Why a product may not be saved as free shipping, or null when it may. The
 * same rule as `products_free_shipping_consistent`, checked before the write
 * so the admin reads a sentence and not a constraint name.
 *
 * `shippingPriceAgorot` is integer agorot, or null when the caller does not
 * know the stored price (the content uploader's form has no price box). Null
 * is not treated as a conflict here; the table still refuses the row, and
 * `freeShippingConstraintError` words that refusal.
 */
export function freeShippingConflict(input: {
  freeShipping: boolean
  requiresShipping: boolean
  shippingPriceAgorot: number | null
}): string | null {
  if (!input.freeShipping) return null
  if (!input.requiresShipping) return FREE_SHIPPING_NEEDS_SHIPPING
  if (input.shippingPriceAgorot != null && input.shippingPriceAgorot > 0) {
    return FREE_SHIPPING_HAS_PRICE
  }
  return null
}

/** The table's refusal of a contradictory row, as a sentence. Null for any other error. */
export function freeShippingConstraintError(message: string | null | undefined): string | null {
  return (message ?? '').includes(FREE_SHIPPING_CONSTRAINT) ? FREE_SHIPPING_HAS_PRICE : null
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
