/**
 * Retention person properties, for PostHog cohorts and retention insights.
 *
 * A PostHog retention table ("of the people who purchased in month M, how
 * many purchased again in M+1, M+2, ...") needs nothing but the `purchase`
 * event stream, which track.ts already sends. What it cannot do on its own is
 * SEGMENT that table: "repeat buyers", "first-time buyers", "lapsed buyers"
 * are person-property filters, and a person property has to be written by
 * someone. This module decides what gets written; server/analytics/
 * retention-cohorts.ts reads the orders and writes it after every purchase.
 *
 * Like cashback_tier (cashback-tier.ts), each value is a small stable label or
 * a count, never money: the money for any of these people is read from
 * `orders` / `order_items`, and the first-party cohort grid in
 * lib/analytics/cohorts.ts is still the audited number. This is the copy that
 * lets an analyst click a cohort in PostHog and see its funnel.
 *
 * No money arithmetic here, only counts and timestamps, so src/lib/money.ts is
 * not involved by construction.
 */

/** The person-property keys, exactly as cohorts and insights filter on them. */
export const RETENTION_PERSON_PROPERTIES = {
  purchaseCount: 'purchase_count',
  firstPurchaseAt: 'first_purchase_at',
  lastPurchaseAt: 'last_purchase_at',
  /** YYYY-MM of the first paid order in Asia/Jerusalem: the acquisition cohort. */
  acquisitionMonth: 'acquisition_month',
} as const

export type RetentionPersonProperties = {
  [RETENTION_PERSON_PROPERTIES.purchaseCount]: number
  [RETENTION_PERSON_PROPERTIES.firstPurchaseAt]: string
  [RETENTION_PERSON_PROPERTIES.lastPurchaseAt]: string
  [RETENTION_PERSON_PROPERTIES.acquisitionMonth]: string
}

/**
 * Cohort thresholds, named so the provisioning script and a reader of the
 * PostHog UI agree on what "repeat" and "loyal" mean. Counts of PAID orders.
 */
export const REPEAT_BUYER_MIN_PURCHASES = 2
export const LOYAL_BUYER_MIN_PURCHASES = 4

/** Days without a paid order after which a buyer counts as lapsed. */
export const LAPSED_AFTER_DAYS = 90

const israelMonthFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jerusalem',
  year: 'numeric',
  month: '2-digit',
})

function israelMonth(iso: string): string {
  // en-CA with year + 2-digit month formats as "YYYY-MM" directly.
  return israelMonthFormatter.format(new Date(iso))
}

/**
 * Builds the property set from the user's paid timestamps, in any order.
 * null when there is nothing paid yet: a person with no purchase gets no
 * property rather than a zero, so "purchase_count is not set" stays the
 * honest definition of "never bought", and a cohort of `purchase_count >= 1`
 * cannot be polluted by visitors who were written as 0 and then deleted.
 *
 * Unparseable timestamps are skipped rather than thrown on: one bad row must
 * not cost the person their label, and a label built from the good rows is
 * still true.
 */
export function retentionPersonProperties(
  paidAtIsoList: readonly (string | null | undefined)[],
): RetentionPersonProperties | null {
  const times: number[] = []
  for (const iso of paidAtIsoList) {
    if (!iso) continue
    const ms = Date.parse(iso)
    if (Number.isFinite(ms)) times.push(ms)
  }
  if (times.length === 0) return null
  times.sort((a, b) => a - b)
  const first = new Date(times[0] as number).toISOString()
  const last = new Date(times[times.length - 1] as number).toISOString()
  return {
    [RETENTION_PERSON_PROPERTIES.purchaseCount]: times.length,
    [RETENTION_PERSON_PROPERTIES.firstPurchaseAt]: first,
    [RETENTION_PERSON_PROPERTIES.lastPurchaseAt]: last,
    [RETENTION_PERSON_PROPERTIES.acquisitionMonth]: israelMonth(first),
  }
}
