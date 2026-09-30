/**
 * The saving a card shows, as a whole percent.
 *
 * ONE implementation, read by the card badge AND the archive's discount
 * facet, so "30% off" on a tile and "at least 30% off" in the sidebar cannot
 * disagree about the same product.
 *
 * Measured on production 30.09.2026 before this file existed: 16 of 46 active
 * products carry a `full_price` above `kenyon_price`, and ONE carries a value
 * in the `discount_percent` column. The badge has always been computed from
 * the two prices, so a facet on the stored column would have matched one
 * product while the grid showed sixteen badges. The facet therefore filters
 * on this arithmetic and never on `discount_percent`.
 *
 * This is a ratio of two displayed prices rounded to a whole number, not a
 * money amount, so it does not go through lib/money.ts; nothing billable is
 * derived from it.
 */
export function discountPercent(price: number, old: number): number {
  if (!(old > 0) || !(price >= 0) || price >= old) return 0
  return Math.round((1 - price / old) * 100)
}

/** The facet's steps, in the order the sidebar lists them. */
export const DISCOUNT_STEPS = [10, 20, 30, 50] as const

/**
 * The `discount` query value as a minimum whole percent, or undefined.
 *
 * Any integer 1..99 is accepted, not just the four steps: a link that says
 * `discount=25` should keep meaning "at least 25%" whether or not the sidebar
 * offers that button. 0 is "no filter" and 100 cannot match a priced product.
 */
export function parseMinDiscount(raw: string | string[] | undefined): number | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string' || !/^\d{1,3}$/.test(value)) return undefined
  const n = Number.parseInt(value, 10)
  return n >= 1 && n <= 99 ? n : undefined
}

/**
 * Whether a product's saving meets the facet, from the same two columns the
 * card reads. Null or malformed prices never match: they have no badge.
 */
export function meetsMinDiscount(
  product: { kenyon_price: number | string | null; full_price?: number | string | null },
  minDiscount: number,
): boolean {
  const price = product.kenyon_price != null ? Number(product.kenyon_price) : Number.NaN
  const old = product.full_price != null ? Number(product.full_price) : Number.NaN
  if (!Number.isFinite(price) || !Number.isFinite(old)) return false
  return discountPercent(price, old) >= minDiscount
}
