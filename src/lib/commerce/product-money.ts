/**
 * The four per-product money knobs, and the supplier identity that has to
 * accompany them, in one place.
 *
 * The model (docs/ADMIN-ARCHITECTURE.md section 0, decided 2026-07-27) is that
 * there is NO fixed commission. Every value below is chosen by the admin per
 * product, and none of them has a default in the database or here:
 *
 *   platformPercent       the platform's share of what the customer pays on site
 *   supplierSplitPercent  the supplier's share of the same base
 *   discountPercent       saving off the sticker price, shown to the customer
 *   couponPriceIls        absolute amount charged on site for a coupon
 *
 * This module is pure. It reads no database and no clock, so the admin form, the
 * server action, the checkout snapshot and the tests all agree by construction
 * rather than by three separate implementations happening to match. That is the
 * failure this codebase already had once: the product page rendered
 * `price * 0.1` while checkout billed `coupon_price_ils`, so a customer was
 * quoted one number and charged another (see coupon-offer.ts).
 *
 * Where the money is concerned there is one rule worth stating twice: the
 * platform fee is rounded once, on the line total, and the supplier's share is
 * the RESIDUAL, `base - platformFee`. `supplierSplitPercent` is the snapshot of
 * the agreement, never a second multiplication. Applying both percents
 * independently is how an agora goes missing on some line totals and appears
 * from nowhere on others.
 */

import { type Agorot, agorot, ilsToAgorot, percentToBasisPoints, percentageOf } from './money'

export type ProductMoneyType = 'coupon' | 'physical'

/** The two halves always sum to this. Enforced by CHECK in migration 070. */
export const SPLIT_TOTAL = 100

/** Field keys the publish gate can complain about, for the form to highlight. */
export type ProductMoneyField =
  | 'platform_percent'
  | 'supplier_split_percent'
  | 'discount_percent'
  | 'coupon_price_ils'
  | 'coupon_expiry_days'
  | 'price_ils'
  | 'supplier_id'
  | 'supplier_name'
  | 'supplier_phone'
  | 'supplier_address'
  | 'supplier_logo_url'
  | 'supplier_status'

export interface PublishBlocker {
  field: ProductMoneyField
  /** Hebrew, shown to the admin as-is. */
  message: string
}

/**
 * Coerces a percent from a form value. Returns null for anything that is not a
 * usable percent, including the empty string, so a missing value stays missing
 * instead of collapsing to 0. A silent 0 here would mean "the supplier gets
 * nothing", which is a real business outcome and must never be inferred.
 */
export function normalizePercent(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(parsed)) return null
  if (parsed < 0 || parsed > 100) return null
  return round2(parsed)
}

/** Coerces an absolute shekel amount. Null for missing or non-positive. */
export function normalizeIls(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return round2(parsed)
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export interface SplitPair {
  platformPercent: number
  supplierSplitPercent: number
}

export type SplitPairResult =
  | { ok: true; pair: SplitPair }
  | { ok: false; field: ProductMoneyField; message: string }

/**
 * Completes and validates the pair.
 *
 * Either half alone determines the other, so a form that sends only one is
 * accepted and the complement is filled in. Sending both is accepted only when
 * they sum to 100: the disagreement is reported rather than silently resolved,
 * because picking a winner would mean deciding for the admin how much a supplier
 * is owed.
 *
 * Deriving the complement is not the "invented default" the model forbids. The
 * admin supplied one real number; 100 minus it is arithmetic, not a guess.
 */
export function completeSplitPair(input: {
  platformPercent?: unknown
  supplierSplitPercent?: unknown
}): SplitPairResult {
  const platform = normalizePercent(input.platformPercent)
  const supplier = normalizePercent(input.supplierSplitPercent)

  if (platform === null && supplier === null) {
    return {
      ok: false,
      field: 'platform_percent',
      message: 'חייב להגדיר עמלת פלטפורמה או אחוז לספק. אין ברירת מחדל.',
    }
  }
  if (platform === null && supplier !== null) {
    return {
      ok: true,
      pair: { platformPercent: round2(SPLIT_TOTAL - supplier), supplierSplitPercent: supplier },
    }
  }
  if (supplier === null && platform !== null) {
    return {
      ok: true,
      pair: { platformPercent: platform, supplierSplitPercent: round2(SPLIT_TOTAL - platform) },
    }
  }

  const pair = { platformPercent: platform as number, supplierSplitPercent: supplier as number }
  if (round2(pair.platformPercent + pair.supplierSplitPercent) !== SPLIT_TOTAL) {
    return {
      ok: false,
      field: 'supplier_split_percent',
      message: `עמלת פלטפורמה ואחוז לספק חייבים להסתכם ב-${SPLIT_TOTAL}%. כרגע ${round2(
        pair.platformPercent + pair.supplierSplitPercent,
      )}%.`,
    }
  }
  return { ok: true, pair }
}

/**
 * The saving the two prices already imply, as a whole-agora percent.
 *
 * On a coupon this is the only honest value for the badge, because the billed
 * number is the absolute coupon price. Letting the admin type a badge that
 * disagrees with the prices would recreate the quote-versus-charge split.
 */
export function deriveDiscountPercent(
  priceIls: number | null | undefined,
  couponPriceIls: number | null | undefined,
): number | null {
  const price = normalizeIls(priceIls)
  const coupon = normalizeIls(couponPriceIls)
  if (price === null || coupon === null) return null
  if (coupon > price) return null
  return round2((1 - coupon / price) * 100)
}

/**
 * What a physical product actually charges on site. Rounded to agorot once, at
 * the unit level, so the cart, the snapshot and the invoice cannot disagree by a
 * rounding step.
 */
export function physicalOnSiteChargeIls(
  priceIls: number,
  discountPercent: number | null | undefined,
): number {
  const discount = normalizePercent(discountPercent) ?? 0
  return round2(priceIls * (1 - discount / 100))
}

export interface SplitAmounts {
  /** What the split applies to. */
  base: Agorot
  platformFee: Agorot
  /** The residual. Always `base - platformFee`, never a second multiplication. */
  supplierDue: Agorot
}

/**
 * Splits an on-site charge. Identical for both product types since 2026-07-27:
 * a coupon splits its prepayment, a physical splits its discounted price.
 */
export function splitOnSiteCharge(base: Agorot, platformPercent: number | string): SplitAmounts {
  const platformFee = percentageOf(base, percentToBasisPoints(platformPercent))
  return { base, platformFee, supplierDue: agorot(base - platformFee) }
}

/** Supplier identity as the product page needs it. */
export interface SupplierIdentity {
  id?: string | null
  name?: string | null
  phone?: string | null
  address?: string | null
  logoUrl?: string | null
  status?: string | null
}

const SUPPLIER_FIELD_LABELS: Record<string, { field: ProductMoneyField; label: string }> = {
  name: { field: 'supplier_name', label: 'שם העסק' },
  phone: { field: 'supplier_phone', label: 'טלפון' },
  address: { field: 'supplier_address', label: 'כתובת' },
  logoUrl: { field: 'supplier_logo_url', label: 'לוגו' },
}

function present(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Which of the four mandatory supplier details are missing.
 *
 * All eleven live suppliers were missing an address and a logo when this was
 * written, and six had no phone, which is exactly why the requirement is
 * enforced in the application on publish and not as NOT NULL: the constraint
 * would either fail the migration or unpublish the whole catalog silently.
 */
export function missingSupplierDetails(
  supplier: SupplierIdentity | null | undefined,
): PublishBlocker[] {
  if (!supplier || !present(supplier.id)) {
    return [{ field: 'supplier_id', message: 'חייב לשייך ספק למוצר' }]
  }
  const blockers: PublishBlocker[] = []
  for (const key of ['name', 'phone', 'address', 'logoUrl'] as const) {
    if (!present(supplier[key])) {
      const meta = SUPPLIER_FIELD_LABELS[key]
      blockers.push({ field: meta.field, message: `חסר ${meta.label} של הספק` })
    }
  }
  return blockers
}

export interface PublishGateInput {
  type: ProductMoneyType
  priceIls: number | null | undefined
  platformPercent: number | null | undefined
  supplierSplitPercent: number | null | undefined
  discountPercent: number | null | undefined
  couponPriceIls: number | null | undefined
  couponExpiryDays: number | null | undefined
  supplier: SupplierIdentity | null | undefined
}

export type PublishGateResult =
  | { ok: true; pair: SplitPair }
  | { ok: false; blockers: readonly PublishBlocker[] }

/**
 * Everything a product needs before it may leave `draft`.
 *
 * Reports EVERY failing reason rather than the first. An admin filling in a
 * product should not have to submit six times to discover six missing fields.
 */
export function assertPublishable(input: PublishGateInput): PublishGateResult {
  const blockers: PublishBlocker[] = []

  const price = normalizeIls(input.priceIls)
  if (price === null) {
    blockers.push({ field: 'price_ils', message: 'חייב להגדיר מחיר רגיל חיובי' })
  }

  const split = completeSplitPair({
    platformPercent: input.platformPercent,
    supplierSplitPercent: input.supplierSplitPercent,
  })
  if (!split.ok) {
    blockers.push({ field: split.field, message: split.message })
  }

  if (normalizePercent(input.discountPercent) === null) {
    blockers.push({ field: 'discount_percent', message: 'חייב להגדיר אחוז הנחה בין 0 ל-100' })
  }

  if (input.type === 'coupon') {
    const coupon = normalizeIls(input.couponPriceIls)
    if (coupon === null) {
      blockers.push({
        field: 'coupon_price_ils',
        message: 'חייב להגדיר מחיר קופון לתשלום באתר. אין ברירת מחדל.',
      })
    } else if (price !== null && coupon > price) {
      blockers.push({
        field: 'coupon_price_ils',
        message: 'מחיר הקופון לא יכול לעלות על המחיר הרגיל',
      })
    }

    const days = Number(input.couponExpiryDays)
    if (!Number.isFinite(days) || !Number.isInteger(days) || days <= 0) {
      blockers.push({ field: 'coupon_expiry_days', message: 'חייב להגדיר תוקף קופון בימים' })
    }
  }

  blockers.push(...missingSupplierDetails(input.supplier))

  if (input.supplier && present(input.supplier.id) && input.supplier.status !== 'active') {
    blockers.push({
      field: 'supplier_status',
      message: 'הספק אינו פעיל ולכן המוצר לא יכול להתפרסם',
    })
  }

  if (blockers.length > 0) return { ok: false, blockers }
  // split.ok is guaranteed here: a failure would have pushed a blocker.
  return { ok: true, pair: (split as { ok: true; pair: SplitPair }).pair }
}

/**
 * The snapshot written onto `order_items` at purchase.
 *
 * Every field is a VALUE. Nothing here is a reference, and nothing may be
 * re-read from `products` or `suppliers` afterwards: a line bought at 70/30 has
 * to keep reading 70/30 after the product moves to 85/15, and an order has to
 * keep naming the business it was bought from after that business is renamed.
 */
export interface OrderItemMoneySnapshot {
  platform_percent: number
  supplier_split_percent: number
  discount_percent: number | null
  coupon_price_ils: number | null
  supplier_name: string | null
  supplier_phone: string | null
  supplier_address: string | null
  supplier_logo_url: string | null
}

export function buildOrderItemSnapshot(input: {
  type: ProductMoneyType
  platformPercent: number | null | undefined
  supplierSplitPercent: number | null | undefined
  discountPercent: number | null | undefined
  couponPriceIls: number | null | undefined
  supplier: SupplierIdentity | null | undefined
}): OrderItemMoneySnapshot {
  const split = completeSplitPair({
    platformPercent: input.platformPercent,
    supplierSplitPercent: input.supplierSplitPercent,
  })
  if (!split.ok) {
    // Refusing beats snapshotting a constant. A line that reaches purchase
    // without a split is a bug upstream, and writing 100/0 to paper over it
    // would hand the supplier's money to the platform without a trace.
    throw new TypeError(`cannot snapshot a product without a split pair: ${split.message}`)
  }

  return {
    platform_percent: split.pair.platformPercent,
    supplier_split_percent: split.pair.supplierSplitPercent,
    discount_percent: normalizePercent(input.discountPercent),
    coupon_price_ils: input.type === 'coupon' ? normalizeIls(input.couponPriceIls) : null,
    supplier_name: trimOrNull(input.supplier?.name),
    supplier_phone: trimOrNull(input.supplier?.phone),
    supplier_address: trimOrNull(input.supplier?.address),
    supplier_logo_url: trimOrNull(input.supplier?.logoUrl),
  }
}

function trimOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * What the admin form shows under the money fields, so the person setting the
 * numbers sees the consequence of them before saving.
 */
export interface MoneyPreview {
  /** What the customer pays on this site. */
  paidOnlineIls: number
  /** Coupon only: settled in cash at the business. */
  balanceAtBusinessIls: number
  platformKeepsIls: number
  supplierGetsIls: number
  discountPercent: number
}

export function previewProductMoney(input: {
  type: ProductMoneyType
  priceIls: number
  platformPercent: number
  couponPriceIls?: number | null
  discountPercent?: number | null
}): MoneyPreview {
  const paidOnlineIls =
    input.type === 'coupon'
      ? (normalizeIls(input.couponPriceIls) ?? 0)
      : physicalOnSiteChargeIls(input.priceIls, input.discountPercent)

  const base = ilsToAgorot(paidOnlineIls.toFixed(2))
  const { platformFee, supplierDue } = splitOnSiteCharge(base, input.platformPercent)

  return {
    paidOnlineIls,
    balanceAtBusinessIls:
      input.type === 'coupon' ? round2(Math.max(0, input.priceIls - paidOnlineIls)) : 0,
    platformKeepsIls: round2(platformFee / 100),
    supplierGetsIls: round2(supplierDue / 100),
    discountPercent:
      input.type === 'coupon'
        ? (deriveDiscountPercent(input.priceIls, paidOnlineIls) ?? 0)
        : (normalizePercent(input.discountPercent) ?? 0),
  }
}
