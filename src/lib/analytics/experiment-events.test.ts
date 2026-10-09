import { describe, expect, it } from 'vitest'
import { type AnalyticsEventRow, assignExperiment } from './experiment-events'
import { EXPERIMENTS } from './experiments'

const experiment = EXPERIMENTS[0]
if (!experiment) throw new Error('registry is empty')

const PROP = experiment.property

let clock = 0
function row(partial: Partial<AnalyticsEventRow> & { event_name: string }): AnalyticsEventRow {
  clock += 1
  return {
    session_id: `s${clock}`,
    anonymous_id: null,
    user_id: null,
    props: {},
    occurred_at: new Date(Date.UTC(2026, 8, 1, 0, 0, clock)).toISOString(),
    ...partial,
  }
}

describe('assignExperiment', () => {
  it('counts one exposure per identity and a conversion joined on the guest id', () => {
    const result = assignExperiment(
      [
        row({ event_name: 'checkout_step', anonymous_id: 'g1', props: { [PROP]: 'control' } }),
        row({ event_name: 'checkout_step', anonymous_id: 'g1', props: { [PROP]: 'control' } }),
        row({
          event_name: 'checkout_step',
          anonymous_id: 'g2',
          props: { [PROP]: 'express_summary' },
        }),
        row({ event_name: 'purchase', anonymous_id: 'g2', user_id: 'u2', session_id: 'server:x' }),
      ],
      experiment,
    )
    expect(result.counts).toEqual([
      { variant: 'control', exposures: 1, conversions: 0 },
      { variant: 'express_summary', exposures: 1, conversions: 1 },
    ])
    expect(result.unexposedConversions).toBe(0)
  })

  it('joins a purchase that lost its guest cookie through the user id link', () => {
    const result = assignExperiment(
      [
        row({
          event_name: 'checkout_step',
          anonymous_id: 'g1',
          user_id: 'u1',
          props: { [PROP]: 'express_summary' },
        }),
        row({ event_name: 'purchase', anonymous_id: null, user_id: 'u1', session_id: 'server:1' }),
      ],
      experiment,
    )
    expect(result.counts[1]).toEqual({ variant: 'express_summary', exposures: 1, conversions: 1 })
  })

  it('counts a conversion once however many purchase rows an identity has', () => {
    const result = assignExperiment(
      [
        row({ event_name: 'checkout_step', anonymous_id: 'g1', props: { [PROP]: 'control' } }),
        row({ event_name: 'purchase', anonymous_id: 'g1' }),
        row({ event_name: 'purchase', anonymous_id: 'g1' }),
      ],
      experiment,
    )
    expect(result.counts[0]).toEqual({ variant: 'control', exposures: 1, conversions: 1 })
  })

  it('ignores exposure rows without the property and rows for other events', () => {
    const result = assignExperiment(
      [
        row({ event_name: 'checkout_step', anonymous_id: 'g1', props: {} }),
        row({ event_name: 'view_product', anonymous_id: 'g2', props: { [PROP]: 'control' } }),
      ],
      experiment,
    )
    expect(result.counts.every((c) => c.exposures === 0)).toBe(true)
  })

  it('reports unknown variants, mixed identities and unexposed conversions instead of guessing', () => {
    const result = assignExperiment(
      [
        row({ event_name: 'checkout_step', anonymous_id: 'g1', props: { [PROP]: 'typo' } }),
        row({ event_name: 'checkout_step', anonymous_id: 'g2', props: { [PROP]: 'control' } }),
        row({
          event_name: 'checkout_step',
          anonymous_id: 'g2',
          props: { [PROP]: 'express_summary' },
        }),
        row({ event_name: 'purchase', anonymous_id: 'g9' }),
      ],
      experiment,
    )
    expect(result.unknownVariantRows).toBe(1)
    expect(result.mixedIdentities).toBe(1)
    expect(result.unexposedConversions).toBe(1)
    // The mixed identity stays under its FIRST variant.
    expect(result.counts[0]?.exposures).toBe(1)
    expect(result.counts[1]?.exposures).toBe(0)
  })

  it('orders by occurred_at, not by array position, when picking the first variant', () => {
    const later = row({
      event_name: 'checkout_step',
      anonymous_id: 'g1',
      props: { [PROP]: 'express_summary' },
    })
    const earlier = {
      ...row({ event_name: 'checkout_step', anonymous_id: 'g1', props: { [PROP]: 'control' } }),
      occurred_at: '2026-01-01T00:00:00.000Z',
    }
    const result = assignExperiment([later, earlier], experiment)
    expect(result.counts[0]?.exposures).toBe(1)
    expect(result.mixedIdentities).toBe(1)
  })

  it('falls back to the session id for a row with no other identity', () => {
    const result = assignExperiment(
      [row({ event_name: 'checkout_step', session_id: 'only', props: { [PROP]: 'control' } })],
      experiment,
    )
    expect(result.counts[0]?.exposures).toBe(1)
  })
})
