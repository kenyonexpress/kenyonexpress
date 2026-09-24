import { ilsToAgorot } from '@/lib/commerce/money'
import { DISTANCE_SALE_WINDOW_DAYS } from '@/lib/payments/refund-destination'
import type { Product } from '@/types/database'

/**
 * The per-product commercial terms the admin form sets beside the money knobs
 * (Q05, 2026-09-25): what shipping costs, how long after fulfilment the
 * supplier's share is transferred, how often the supplier is paid for this
 * product, how long the customer may cancel, and whether the statutory
 * cancellation fee is charged.
 *
 * ALL FIVE COLUMNS ARRIVE WITH `migrations/pending/243_product_terms.sql`,
 * WHICH IS NOT APPLIED. The generated `Product` type therefore does not carry
 * them, and this module is the one place that knows their names, their
 * defaults and how to read them off a row that may or may not have them, the
 * same way `product-fields.ts` reads the 112 columns. The write side in
 * `admin/products.ts` sends them as one group and drops the group on the
 * un-migrated database ONLY when every value is still the default, so a save
 * on production today neither fails nor silently loses a term the admin typed.
 *
 * WHAT EACH DEFAULT MEANS, so nobody reads a default as a decision:
 *
 *   shipping_price_agorot 0   Free shipping is what checkout charges today for
 *                             every product: the cart has no shipping line at
 *                             all (grep `shipping` in lib/cart/pricing.ts). The
 *                             column records the operator's price; charging it
 *                             is a checkout change and is listed as open in
 *                             STATE.md, not implied by this file.
 *   supplier_transfer_days    NULL = the supplier's own `payout_hold_business_
 *                             days` (PAYOUT-ENGINE.md), which the payout run
 *                             already applies. A number here is a per-product
 *                             override the run does not yet read.
 *   payout_cadence            NULL = the platform's daily run. The three named
 *                             cadences are recorded for the operator and the
 *                             supplier statement; the run does not yet group by
 *                             them.
 *   cancellation_window_days  14 = the Consumer Protection Law's distance-sale
 *                             window (`DISTANCE_SALE_WINDOW_DAYS`). It is the
 *                             FLOOR: a product may offer more, never less, and
 *                             the schema refuses less.
 *   refund_policy statutory   The law's terms as the returns page states them:
 *                             cancellation inside the window with the fee of
 *                             up to 5% or 100 ILS. `fee_waived` keeps the
 *                             window and waives the fee.
 *
 * Pure. No database, no clock.
 */

export const PAYOUT_CADENCES = ['per_order', 'weekly', 'monthly'] as const
export type PayoutCadence = (typeof PAYOUT_CADENCES)[number]

export const PAYOUT_CADENCE_LABELS: Record<PayoutCadence, string> = {
  per_order: 'לכל הזמנה, בתום ימי ההעברה',
  weekly: 'שבועי',
  monthly: 'חודשי',
}

export const REFUND_POLICIES = ['statutory', 'fee_waived'] as const
export type RefundPolicy = (typeof REFUND_POLICIES)[number]

export const REFUND_POLICY_LABELS: Record<RefundPolicy, string> = {
  statutory: 'לפי חוק הגנת הצרכן: דמי ביטול עד 5% או 100 ₪',
  fee_waived: 'ביטול בתוך החלון בלי דמי ביטול',
}

/** The statutory floor for the cancellation window, in days. */
export const STATUTORY_CANCELLATION_DAYS = DISTANCE_SALE_WINDOW_DAYS
export const MAX_CANCELLATION_DAYS = 365
export const MAX_SUPPLIER_TRANSFER_DAYS = 90

export const PRODUCT_TERMS_MIGRATION_FILE = 'migrations/pending/243_product_terms.sql'

/** The five columns 243 adds, in the order the migration declares them. */
export const PRODUCT_TERMS_COLUMNS = [
  'shipping_price_agorot',
  'supplier_transfer_days',
  'payout_cadence',
  'cancellation_window_days',
  'refund_policy',
] as const

// One template literal, never several joined with `+`: that concatenation has
// corrupted a production build here before (STATE, template-literal trap).
export const PRODUCT_TERMS_MIGRATION_NOTICE = `תנאי המוצר (משלוח, ימי העברה, תדירות תשלום, חלון ביטול, מדיניות החזר) עדיין לא מופעלים במסד הנתונים. יש להחיל את המיגרציה ${PRODUCT_TERMS_MIGRATION_FILE} ואז לשמור שוב. שאר שדות המוצר נשמרים כרגיל.`

export interface ProductTerms {
  /** Integer agorot. 0 = free shipping. */
  shippingPriceAgorot: number
  /** Days after fulfilment before the supplier's share transfers; null = supplier default. */
  supplierTransferDays: number | null
  /** null = the platform's daily run. */
  payoutCadence: PayoutCadence | null
  /** Calendar days from the charge; never below the statutory 14. */
  cancellationWindowDays: number
  refundPolicy: RefundPolicy
}

export const DEFAULT_PRODUCT_TERMS: Readonly<ProductTerms> = Object.freeze({
  shippingPriceAgorot: 0,
  supplierTransferDays: null,
  payoutCadence: null,
  cancellationWindowDays: STATUTORY_CANCELLATION_DAYS,
  refundPolicy: 'statutory',
})

type Row = Product | Record<string, unknown> | null | undefined

function record(row: Row): Record<string, unknown> | null {
  return row !== null && row !== undefined && typeof row === 'object'
    ? (row as Record<string, unknown>)
    : null
}

function wholeNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (value === null || value === undefined || value === '') return null
  return Number.isFinite(parsed) && Number.isInteger(parsed) ? parsed : null
}

export function isPayoutCadence(value: unknown): value is PayoutCadence {
  return typeof value === 'string' && (PAYOUT_CADENCES as readonly string[]).includes(value)
}

export function isRefundPolicy(value: unknown): value is RefundPolicy {
  return typeof value === 'string' && (REFUND_POLICIES as readonly string[]).includes(value)
}

/**
 * The terms as stored, with every absent or malformed column read as its
 * default. A row from production today has none of the five columns and reads
 * as `DEFAULT_PRODUCT_TERMS`, which is also what the form shows for it.
 */
export function readProductTerms(row: Row): ProductTerms {
  const r = record(row)
  if (!r) return { ...DEFAULT_PRODUCT_TERMS }

  const shipping = wholeNumber(r.shipping_price_agorot)
  const transfer = wholeNumber(r.supplier_transfer_days)
  const window = wholeNumber(r.cancellation_window_days)

  return {
    shippingPriceAgorot: shipping !== null && shipping >= 0 ? shipping : 0,
    supplierTransferDays:
      transfer !== null && transfer >= 0 && transfer <= MAX_SUPPLIER_TRANSFER_DAYS
        ? transfer
        : null,
    payoutCadence: isPayoutCadence(r.payout_cadence) ? r.payout_cadence : null,
    cancellationWindowDays:
      window !== null && window >= STATUTORY_CANCELLATION_DAYS && window <= MAX_CANCELLATION_DAYS
        ? window
        : STATUTORY_CANCELLATION_DAYS,
    refundPolicy: isRefundPolicy(r.refund_policy) ? r.refund_policy : 'statutory',
  }
}

/**
 * True when dropping the whole group from a write loses nothing the admin
 * asked for. This is what lets a save on the un-migrated database succeed:
 * the group is retried without only when it is all defaults.
 */
export function isDefaultProductTerms(terms: ProductTerms): boolean {
  return (
    terms.shippingPriceAgorot === DEFAULT_PRODUCT_TERMS.shippingPriceAgorot &&
    terms.supplierTransferDays === DEFAULT_PRODUCT_TERMS.supplierTransferDays &&
    terms.payoutCadence === DEFAULT_PRODUCT_TERMS.payoutCadence &&
    terms.cancellationWindowDays === DEFAULT_PRODUCT_TERMS.cancellationWindowDays &&
    terms.refundPolicy === DEFAULT_PRODUCT_TERMS.refundPolicy
  )
}

/** The five columns as the row spread names them. */
export function productTermsWrite(
  terms: ProductTerms,
): Record<(typeof PRODUCT_TERMS_COLUMNS)[number], number | string | null> {
  return {
    shipping_price_agorot: terms.shippingPriceAgorot,
    supplier_transfer_days: terms.supplierTransferDays,
    payout_cadence: terms.payoutCadence,
    cancellation_window_days: terms.cancellationWindowDays,
    refund_policy: terms.refundPolicy,
  }
}

/**
 * The form's nine boxes as the five terms, every blank box its default.
 *
 * Shekels to agorot happens HERE, once, through money.ts, on the one field
 * that is money. The other four are days and labels. The result is what the
 * write sends and what `isDefaultProductTerms` judges, so the retry ladder in
 * `admin/products.ts` and this function agree on what "untouched" means.
 */
export function productTermsFromForm(input: {
  shipping_price_ils?: number | null
  supplier_transfer_days?: number | null
  payout_cadence?: PayoutCadence | null
  cancellation_window_days?: number | null
  refund_policy?: RefundPolicy | null
}): ProductTerms {
  return {
    shippingPriceAgorot:
      input.shipping_price_ils != null
        ? ilsToAgorot(input.shipping_price_ils.toFixed(2))
        : DEFAULT_PRODUCT_TERMS.shippingPriceAgorot,
    supplierTransferDays:
      input.supplier_transfer_days ?? DEFAULT_PRODUCT_TERMS.supplierTransferDays,
    payoutCadence: input.payout_cadence ?? DEFAULT_PRODUCT_TERMS.payoutCadence,
    cancellationWindowDays:
      input.cancellation_window_days ?? DEFAULT_PRODUCT_TERMS.cancellationWindowDays,
    refundPolicy: input.refund_policy ?? DEFAULT_PRODUCT_TERMS.refundPolicy,
  }
}
