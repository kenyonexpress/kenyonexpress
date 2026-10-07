import { describe, expect, it } from 'vitest'
import { CASHBACK_TIER_PROPERTY } from '../../src/lib/analytics/cashback-tier.ts'
import {
  COHORT_PERSON_PROPERTIES,
  REPLAY_STARTED_EVENT as EMITTED_REPLAY_STARTED,
  purchaseFunnelEventNames,
} from '../../src/lib/analytics/posthog-funnel.ts'
import {
  LAPSED_AFTER_DAYS as LIB_LAPSED_AFTER_DAYS,
  LOYAL_BUYER_MIN_PURCHASES as LIB_LOYAL,
  REPEAT_BUYER_MIN_PURCHASES as LIB_REPEAT,
  RETENTION_PERSON_PROPERTIES,
} from '../../src/lib/analytics/retention-cohorts.ts'
import {
  FUNNEL_EVENTS,
  LAPSED_AFTER_DAYS,
  LOYAL_BUYER_MIN_PURCHASES,
  MANAGED_TAG,
  PERSON_PROPERTIES,
  REPEAT_BUYER_MIN_PURCHASES,
  REPLAY_STARTED_EVENT,
  buildCohorts,
  buildFunnelInsight,
  buildRetentionInsights,
  planUpserts,
} from './insights.mjs'

/**
 * The script and the emitters are two files on purpose (bare node on one
 * side, the Next bundle on the other), so this is where they are held to one
 * truth. Every name the payloads carry must be a name the app actually sends.
 */
describe('definitions are locked to the emitters', () => {
  it('the funnel steps are PURCHASE_FUNNEL, in order', () => {
    expect(FUNNEL_EVENTS).toEqual(purchaseFunnelEventNames())
  })

  it('every person property the cohorts filter on is one the app writes', () => {
    for (const key of Object.values(PERSON_PROPERTIES)) {
      expect(COHORT_PERSON_PROPERTIES).toContain(key)
    }
    expect(PERSON_PROPERTIES.cashbackTier).toBe(CASHBACK_TIER_PROPERTY)
    expect(PERSON_PROPERTIES.purchaseCount).toBe(RETENTION_PERSON_PROPERTIES.purchaseCount)
    expect(PERSON_PROPERTIES.lastPurchaseAt).toBe(RETENTION_PERSON_PROPERTIES.lastPurchaseAt)
    expect(PERSON_PROPERTIES.acquisitionMonth).toBe(RETENTION_PERSON_PROPERTIES.acquisitionMonth)
  })

  it('thresholds match the library', () => {
    expect(REPEAT_BUYER_MIN_PURCHASES).toBe(LIB_REPEAT)
    expect(LOYAL_BUYER_MIN_PURCHASES).toBe(LIB_LOYAL)
    expect(LAPSED_AFTER_DAYS).toBe(LIB_LAPSED_AFTER_DAYS)
  })

  it('the replay cohort filters on the event the recorder emits', () => {
    expect(REPLAY_STARTED_EVENT).toBe(EMITTED_REPLAY_STARTED)
  })
})

describe('payloads', () => {
  it('the funnel is an ordered steps funnel over the five events', () => {
    const insight = buildFunnelInsight()
    expect(insight.query.kind).toBe('InsightVizNode')
    expect(insight.query.source.kind).toBe('FunnelsQuery')
    expect(insight.query.source.series.map((s) => s.event)).toEqual(FUNNEL_EVENTS)
    expect(insight.query.source.funnelsFilter).toMatchObject({
      funnelVizType: 'steps',
      funnelOrderType: 'ordered',
      funnelWindowIntervalUnit: 'day',
    })
    expect(insight.tags).toContain(MANAGED_TAG)
    expect(insight.saved).toBe(true)
  })

  it('retention is first-time retention on purchase by month and on visits by week', () => {
    const [purchase, visit] = buildRetentionInsights()
    expect(purchase.query.source.retentionFilter).toMatchObject({
      targetEntity: { id: 'purchase' },
      returningEntity: { id: 'purchase' },
      retentionType: 'retention_first_time',
      period: 'Month',
    })
    expect(visit.query.source.retentionFilter).toMatchObject({
      targetEntity: { id: '$pageview' },
      period: 'Week',
    })
  })

  it('cohorts are dynamic, named, and filter on person properties', () => {
    const cohorts = buildCohorts()
    expect(cohorts.every((c) => c.is_static === false)).toBe(true)
    expect(new Set(cohorts.map((c) => c.name)).size).toBe(cohorts.length)
    const repeat = cohorts.find((c) => c.name === 'KE repeat buyers')
    expect(repeat.filters.properties.values[0].values[0]).toMatchObject({
      key: 'purchase_count',
      type: 'person',
      operator: 'gte',
      value: REPEAT_BUYER_MIN_PURCHASES,
    })
    const lapsed = cohorts.find((c) => c.name === 'KE lapsed buyers')
    expect(lapsed.filters.properties.values[0].values).toHaveLength(2)
    expect(lapsed.filters.properties.values[0].values[1]).toMatchObject({
      key: 'last_purchase_at',
      operator: 'is_date_before',
      value: `-${LAPSED_AFTER_DAYS}d`,
    })
  })
})

describe('planUpserts', () => {
  it('creates what is missing and updates what matches by exact name', () => {
    const plan = planUpserts(
      [
        { id: 7, name: 'KE purchase funnel' },
        { id: 9, name: 'ke purchase funnel' },
      ],
      [{ name: 'KE purchase funnel' }, { name: 'KE visit retention (weekly)' }],
    )
    expect(plan.update).toEqual([{ id: 7, payload: { name: 'KE purchase funnel' } }])
    expect(plan.create).toEqual([{ name: 'KE visit retention (weekly)' }])
  })

  it('is a pure create plan against an empty project', () => {
    const plan = planUpserts([], buildCohorts())
    expect(plan.update).toEqual([])
    expect(plan.create).toHaveLength(buildCohorts().length)
  })
})
