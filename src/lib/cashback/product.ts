/**
 * The cashback rate a product actually pays, as a percent.
 *
 * TWO COLUMNS, ONE ANSWER. `products.cashback_percent` (042, NOT NULL DEFAULT
 * 0) is the rate and `products.cashback_enabled` (048, NOT NULL DEFAULT false)
 * is the switch. Checkout and the cart used to read the rate alone, so a
 * product whose switch was off still paid its rate: measured 04.11.2026, three
 * ACTIVE products carried `cashback_enabled = false` with `cashback_percent =
 * 5`, and every purchase of them credited 5% to the buyer's wallet from
 * `platform:cashback_reserve`. Both readers go through here now.
 *
 * The rules, in order:
 *   - the switch explicitly off is zero, whatever the rate says;
 *   - a missing, non-numeric or negative rate is zero (the column default);
 *   - a rate above 100 is capped at 100, the CHECK the admin schema enforces.
 *
 * `cashback_enabled` ABSENT (undefined) is not "off". It means the reader did
 * not select the column, which is every fixture written before this file and
 * the cart's optional-column probe when 048 is missing. Treating that as off
 * would silently zero cashback on an environment that never had the switch.
 *
 * The admin form edits the rate only; `server/actions/admin/products.ts`
 * derives the switch from it on save, so a rate an admin types is a rate that
 * pays.
 */
export interface ProductCashbackColumns {
  cashback_percent?: number | string | null
  cashback_enabled?: boolean | null
}

export const DEFAULT_CASHBACK_PERCENT = 0
const MAX_CASHBACK_PERCENT = 100

export function effectiveCashbackPercent(product: ProductCashbackColumns): number {
  if (product.cashback_enabled === false) return DEFAULT_CASHBACK_PERCENT
  const raw = product.cashback_percent
  if (raw == null || raw === '') return DEFAULT_CASHBACK_PERCENT
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_CASHBACK_PERCENT
  return Math.min(value, MAX_CASHBACK_PERCENT)
}

/** The switch the admin save writes beside the rate it was given. */
export function cashbackEnabledFor(percent: number | null | undefined): boolean {
  return effectiveCashbackPercent({ cashback_percent: percent ?? null }) > 0
}
