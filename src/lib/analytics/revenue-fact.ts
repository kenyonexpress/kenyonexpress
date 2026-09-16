/**
 * The revenue fact shipped to Axiom on every money moment, and the field list
 * the revenue dashboard is allowed to query.
 *
 * Pure: the server module beside it (server/analytics/revenue-facts.ts)
 * gathers the inputs and ships; this file only shapes them. The shape is a
 * contract with `scripts/axiom/dashboards/revenue.json`, and the test beside
 * this file reads that JSON and refuses any APL that names a field not
 * listed in REVENUE_FACT_FIELDS, so a renamed field here cannot leave a
 * dashboard that silently charts nothing.
 *
 * Money is integer agorot and is COPIED from the ledger row that already froze
 * it. This is the one place where an amount travels beside an event, and it
 * is allowed because Axiom is a reporting sink fed from `orders`, not a
 * source anything reads money back from.
 */

export const REVENUE_FACT_KINDS = ['purchase', 'refund'] as const
export type RevenueFactKind = (typeof REVENUE_FACT_KINDS)[number]

/** Axiom `event` names, alongside the log stream's `<area>.<what>` convention. */
export const REVENUE_FACT_EVENT: Record<RevenueFactKind, string> = {
  purchase: 'revenue.purchase',
  refund: 'revenue.refund',
}

/**
 * Every field a fact carries. The dashboard test walks each APL query and
 * checks every identifier against this list plus Axiom's own `_time`.
 */
export const REVENUE_FACT_FIELDS = [
  'event',
  'kind',
  'order_id',
  'amount_agorot',
  'signed_amount_agorot',
  'cohort_month',
  'event_month',
  'months_since_first_order',
  'is_first_order',
  'cashback_tier',
  'checkout_variant',
  'product_types',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'customer_key',
] as const

export type RevenueFactField = (typeof REVENUE_FACT_FIELDS)[number]

export type RevenueFact = Record<RevenueFactField, string | number | boolean | null> & {
  event: string
  kind: RevenueFactKind
  order_id: string
  amount_agorot: number
  signed_amount_agorot: number
  cohort_month: string | null
  event_month: string
  months_since_first_order: number | null
  is_first_order: boolean
  cashback_tier: string | null
  checkout_variant: string | null
  /** Comma-joined sorted distinct product types, e.g. "coupon,physical". */
  product_types: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  /** Opaque per-customer key for cohort grouping in Axiom; never the user id. */
  customer_key: string | null
}

export type RevenueFactInput = {
  kind: RevenueFactKind
  orderId: string
  /** Positive integer agorot. A refund is passed positive and signed here. */
  amountAgorot: number
  /** ISO timestamp of the money moment. */
  occurredAt: string
  /** The customer's first paid order, or null when unknown. */
  firstOrder: { orderId: string; paidAt: string } | null
  cashbackTier?: string | null
  checkoutVariant?: string | null
  productTypes?: readonly string[]
  utm?: { utm_source?: string; utm_medium?: string; utm_campaign?: string } | null
  customerKey?: string | null
}

const israelMonthFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jerusalem',
  year: 'numeric',
  month: '2-digit',
})

function monthKey(iso: string): string {
  return israelMonthFormatter.format(new Date(iso))
}

function monthIndex(key: string): number {
  const [year, month] = key.split('-')
  return Number(year) * 12 + (Number(month) - 1)
}

export function buildRevenueFact(input: RevenueFactInput): RevenueFact {
  if (!Number.isSafeInteger(input.amountAgorot) || input.amountAgorot < 0) {
    throw new TypeError(`amountAgorot must be a non-negative integer (got ${input.amountAgorot})`)
  }
  const eventMonth = monthKey(input.occurredAt)
  const cohortMonth = input.firstOrder ? monthKey(input.firstOrder.paidAt) : null
  const monthsSince = cohortMonth === null ? null : monthIndex(eventMonth) - monthIndex(cohortMonth)
  const productTypes =
    input.productTypes && input.productTypes.length > 0
      ? [...new Set(input.productTypes)].sort().join(',')
      : null

  return {
    event: REVENUE_FACT_EVENT[input.kind],
    kind: input.kind,
    order_id: input.orderId,
    amount_agorot: input.amountAgorot,
    signed_amount_agorot: input.kind === 'refund' ? -input.amountAgorot : input.amountAgorot,
    cohort_month: cohortMonth,
    event_month: eventMonth,
    months_since_first_order: monthsSince,
    is_first_order: input.kind === 'purchase' && input.firstOrder?.orderId === input.orderId,
    cashback_tier: input.cashbackTier ?? null,
    checkout_variant: input.checkoutVariant ?? null,
    product_types: productTypes,
    utm_source: input.utm?.utm_source ?? null,
    utm_medium: input.utm?.utm_medium ?? null,
    utm_campaign: input.utm?.utm_campaign ?? null,
    customer_key: input.customerKey ?? null,
  }
}
