import { describe, expect, it } from 'vitest'
import {
  LAPSED_AFTER_DAYS,
  LOYAL_BUYER_MIN_PURCHASES,
  REPEAT_BUYER_MIN_PURCHASES,
  RETENTION_PERSON_PROPERTIES,
  retentionPersonProperties,
} from './retention-cohorts'

/**
 * The properties a PostHog cohort segments retention on. Held to: a count
 * of PAID orders, first and last as ISO instants, the acquisition month in
 * Israel time (the same month the first-party cohort grid would file the
 * customer under), and NO property at all for someone who never bought.
 */
describe('retentionPersonProperties', () => {
  it('writes nothing for a person with no paid order', () => {
    expect(retentionPersonProperties([])).toBeNull()
    expect(retentionPersonProperties([null, undefined, ''])).toBeNull()
    expect(retentionPersonProperties(['not a date'])).toBeNull()
  })

  it('counts paid orders and finds first and last whatever the input order', () => {
    const out = retentionPersonProperties([
      '2026-03-10T10:00:00.000Z',
      '2026-01-05T08:30:00.000Z',
      '2026-02-20T18:00:00.000Z',
    ])
    expect(out).toEqual({
      [RETENTION_PERSON_PROPERTIES.purchaseCount]: 3,
      [RETENTION_PERSON_PROPERTIES.firstPurchaseAt]: '2026-01-05T08:30:00.000Z',
      [RETENTION_PERSON_PROPERTIES.lastPurchaseAt]: '2026-03-10T10:00:00.000Z',
      [RETENTION_PERSON_PROPERTIES.acquisitionMonth]: '2026-01',
    })
  })

  it('files the acquisition month in Asia/Jerusalem, not UTC', () => {
    // 23:30 UTC on 31 January is 01:30 on 1 February in Israel (UTC+2).
    const out = retentionPersonProperties(['2026-01-31T23:30:00.000Z'])
    expect(out?.[RETENTION_PERSON_PROPERTIES.acquisitionMonth]).toBe('2026-02')
  })

  it('skips an unparseable row rather than losing the person', () => {
    const out = retentionPersonProperties(['garbage', '2026-05-01T00:00:00.000Z'])
    expect(out?.[RETENTION_PERSON_PROPERTIES.purchaseCount]).toBe(1)
  })

  it('keeps the cohort thresholds in a sane order', () => {
    expect(REPEAT_BUYER_MIN_PURCHASES).toBe(2)
    expect(LOYAL_BUYER_MIN_PURCHASES).toBeGreaterThan(REPEAT_BUYER_MIN_PURCHASES)
    expect(LAPSED_AFTER_DAYS).toBeGreaterThan(0)
  })
})
