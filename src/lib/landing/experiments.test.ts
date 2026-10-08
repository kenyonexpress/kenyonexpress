import { CLIENT_EVENT_NAMES, SERVER_EVENT_NAMES } from '@/lib/analytics/events'
import { assignExperiment } from '@/lib/analytics/experiment-events'
import { describe, expect, it } from 'vitest'
import { AUTHORED_LANDING_PAGES } from './authored'
import type { LandingPage } from './blocks'
import { landingExperiment, landingExperiments } from './experiments'
import { landingPageViewProps, setLandingExposure } from './exposure'

const PAGE: LandingPage = {
  ...(AUTHORED_LANDING_PAGES[0] as LandingPage),
  slug: 'summer-2026',
  hypothesisHe: 'כותרת קצרה יותר ממירה יותר.',
  variants: [
    { key: 'control', weight: 50 },
    { key: 'short', weight: 50 },
  ],
}

describe('landingExperiment', () => {
  it('is null for a page with fewer than two arms', () => {
    expect(landingExperiment({ ...PAGE, variants: [] })).toBeNull()
    expect(landingExperiment({ ...PAGE, variants: [{ key: 'only', weight: 1 }] })).toBeNull()
    expect(landingExperiments([PAGE, { ...PAGE, variants: [] }])).toHaveLength(1)
  })

  it('names only events the taxonomy carries, like the registered experiments', () => {
    const experiment = landingExperiment(PAGE)
    expect(experiment).not.toBeNull()
    for (const event of experiment?.exposureEvents ?? []) {
      expect(CLIENT_EVENT_NAMES).toContain(event)
    }
    expect(SERVER_EVENT_NAMES).toContain(experiment?.goalEvent)
    expect(experiment?.variants).toContain(experiment?.control)
    expect(experiment?.control).toBe('control')
    for (const key of experiment?.variants ?? []) {
      expect(experiment?.variantLabelsHe[key]).toBeTruthy()
    }
  })

  it('joins on exactly the property the page_view stamp writes', () => {
    const experiment = landingExperiment(PAGE)
    setLandingExposure({ slug: PAGE.slug, variant: 'short' })
    const props = landingPageViewProps('/lp/summer-2026')
    expect(experiment && props[experiment.property]).toBe('short')

    // End to end through the real assignment: one exposed identity that
    // later purchased counts as one conversion under its arm.
    const rows = [
      {
        event_name: 'page_view',
        session_id: 's1',
        anonymous_id: 'guest-1',
        user_id: null,
        props,
        occurred_at: '2026-10-01T10:00:00Z',
      },
      {
        event_name: 'purchase',
        session_id: 'server:1',
        anonymous_id: 'guest-1',
        user_id: 'u1',
        props: {},
        occurred_at: '2026-10-01T10:05:00Z',
      },
    ]
    const assignment = experiment && assignExperiment(rows, experiment)
    expect(assignment?.counts).toEqual([
      { variant: 'control', exposures: 0, conversions: 0 },
      { variant: 'short', exposures: 1, conversions: 1 },
    ])
  })
})
