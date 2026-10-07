/**
 * PostHog funnel, retention insights and cohorts, as code.
 *
 * A funnel built by typing event names into the PostHog UI is a funnel one
 * typo away from reporting zero conversions forever, and nothing in the repo
 * would notice. These builders produce the exact API payloads instead, keyed
 * on NAME so provision.mjs upserts them: run twice and the second run updates
 * in place. The UI is where definitions go to drift; this file is where they
 * live.
 *
 * Plain .mjs with JSDoc rather than .ts, for the same reason as
 * lib/images/optimize.mjs and scripts/seo: the provisioning script runs under
 * bare node and vitest imports the same module, so there is exactly one copy
 * of each definition. The event names and person-property keys are locked to
 * the TypeScript modules that emit them by insights.test.mjs: a rename
 * upstream fails the build here, not the dashboard.
 *
 * Payload shapes follow the query-based insight API (InsightVizNode over a
 * FunnelsQuery / RetentionQuery), which is what the current PostHog UI itself
 * saves; the legacy `filters` object is not used.
 */

/** Tag every object this script owns, so a human can tell them from hand-made ones. */
export const MANAGED_TAG = 'kenyonexpress-managed'

/**
 * The purchase funnel: visit -> product -> cart -> checkout -> purchase.
 * Mirrors PURCHASE_FUNNEL in src/lib/analytics/posthog-funnel.ts, in order.
 * The test locks the two lists together.
 */
export const FUNNEL_EVENTS = ['$pageview', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase']

/** Person properties the retention sync writes (src/lib/analytics/retention-cohorts.ts). */
export const PERSON_PROPERTIES = {
  cashbackTier: 'cashback_tier',
  purchaseCount: 'purchase_count',
  firstPurchaseAt: 'first_purchase_at',
  lastPurchaseAt: 'last_purchase_at',
  acquisitionMonth: 'acquisition_month',
}

/** Thresholds, mirrored from src/lib/analytics/retention-cohorts.ts and locked by test. */
export const REPEAT_BUYER_MIN_PURCHASES = 2
export const LOYAL_BUYER_MIN_PURCHASES = 4
export const LAPSED_AFTER_DAYS = 90

/** The event the recorder sends when a buggy session starts being recorded. */
export const REPLAY_STARTED_EVENT = 'replay_started'

/** Days a visitor has to get from first pageview to purchase and still count. */
export const FUNNEL_WINDOW_DAYS = 14

function eventsNode(event) {
  return { kind: 'EventsNode', event, name: event, math: 'total' }
}

/** @returns {object} the funnel insight payload for POST/PATCH /api/projects/:id/insights/ */
export function buildFunnelInsight() {
  return {
    name: 'KE purchase funnel',
    description:
      'visit -> product -> cart -> checkout -> purchase. Steps mirror src/lib/analytics/posthog-funnel.ts; managed by scripts/posthog/provision.mjs, edits in the UI are overwritten.',
    saved: true,
    tags: [MANAGED_TAG, 'funnel'],
    query: {
      kind: 'InsightVizNode',
      source: {
        kind: 'FunnelsQuery',
        series: FUNNEL_EVENTS.map(eventsNode),
        dateRange: { date_from: '-30d' },
        funnelsFilter: {
          funnelVizType: 'steps',
          funnelOrderType: 'ordered',
          funnelWindowInterval: FUNNEL_WINDOW_DAYS,
          funnelWindowIntervalUnit: 'day',
        },
      },
    },
  }
}

function retentionInsight({ name, description, event, period, totalIntervals }) {
  return {
    name,
    description: `${description} Managed by scripts/posthog/provision.mjs.`,
    saved: true,
    tags: [MANAGED_TAG, 'retention'],
    query: {
      kind: 'InsightVizNode',
      source: {
        kind: 'RetentionQuery',
        dateRange: { date_from: period === 'Month' ? '-12m' : '-8w' },
        retentionFilter: {
          targetEntity: { id: event, name: event, type: 'events' },
          returningEntity: { id: event, name: event, type: 'events' },
          retentionType: 'retention_first_time',
          period,
          totalIntervals,
        },
      },
    },
  }
}

/** @returns {object[]} the two retention insights: purchase by month, visit by week */
export function buildRetentionInsights() {
  return [
    retentionInsight({
      name: 'KE purchase retention (monthly)',
      description:
        'Of the people whose FIRST purchase fell in month M, how many purchased again in M+1..M+6. Break down by acquisition_month or cashback_tier.',
      event: 'purchase',
      period: 'Month',
      totalIntervals: 7,
    }),
    retentionInsight({
      name: 'KE visit retention (weekly)',
      description:
        'Of the people whose first visit fell in week W, how many came back in W+1..W+7. Consent-gated pageviews only.',
      event: '$pageview',
      period: 'Week',
      totalIntervals: 8,
    }),
  ]
}

function personFilter(key, operator, value) {
  return { key, type: 'person', operator, value, negation: false }
}

function cohort(name, description, filters) {
  return {
    name,
    description: `${description} Managed by scripts/posthog/provision.mjs.`,
    is_static: false,
    filters: { properties: { type: 'OR', values: [{ type: 'AND', values: filters }] } },
  }
}

/** @returns {object[]} the cohorts the retention properties make possible */
export function buildCohorts() {
  const P = PERSON_PROPERTIES
  return [
    cohort('KE first-time buyers', 'Exactly one paid order.', [
      personFilter(P.purchaseCount, 'exact', 1),
    ]),
    cohort('KE repeat buyers', `${REPEAT_BUYER_MIN_PURCHASES}+ paid orders.`, [
      personFilter(P.purchaseCount, 'gte', REPEAT_BUYER_MIN_PURCHASES),
    ]),
    cohort('KE loyal buyers', `${LOYAL_BUYER_MIN_PURCHASES}+ paid orders.`, [
      personFilter(P.purchaseCount, 'gte', LOYAL_BUYER_MIN_PURCHASES),
    ]),
    cohort(
      'KE lapsed buyers',
      `Bought at least once, nothing in the last ${LAPSED_AFTER_DAYS} days.`,
      [
        personFilter(P.purchaseCount, 'gte', 1),
        personFilter(P.lastPurchaseAt, 'is_date_before', `-${LAPSED_AFTER_DAYS}d`),
      ],
    ),
    cohort(
      'KE cashback gold',
      'Lifetime cashback tier gold (src/lib/analytics/cashback-tier.ts).',
      [personFilter(P.cashbackTier, 'exact', 'gold')],
    ),
    cohort('KE replayed sessions', 'People with at least one recorded buggy session.', [
      {
        key: REPLAY_STARTED_EVENT,
        type: 'behavioral',
        value: 'performed_event',
        event_type: 'events',
        time_value: 90,
        time_interval: 'day',
        negation: false,
      },
    ]),
  ]
}

/**
 * Decides create vs update by exact name against what the API already holds.
 * Pure, so the upsert logic is tested without a network.
 *
 * @param {{name: string, id: number|string}[]} existing
 * @param {{name: string}[]} desired
 * @returns {{create: object[], update: {id: number|string, payload: object}[]}}
 */
export function planUpserts(existing, desired) {
  const byName = new Map(existing.map((item) => [item.name, item.id]))
  const create = []
  const update = []
  for (const payload of desired) {
    const id = byName.get(payload.name)
    if (id === undefined) create.push(payload)
    else update.push({ id, payload })
  }
  return { create, update }
}
