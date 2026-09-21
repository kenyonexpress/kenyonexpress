import { describe, expect, it } from 'vitest'
import { legs, render, totals } from './load-summary.mjs'

/** The shape k6 2.x writes with --summary-export and summaryTrendStats med/p95/p99/max. */
const fixture = {
  metrics: {
    http_reqs: { count: 140 },
    iterations: { count: 56 },
    http_req_failed: { value: 0, passes: 0, fails: 140 },
    rate_limited: { value: 0.05 },
    checks: { value: 1 },
    http_req_duration: { med: 90, 'p(95)': 500, 'p(99)': 900, max: 1200 },
    'http_req_duration{expected_response:true}': { med: 90, 'p(95)': 500, 'p(99)': 900, max: 1200 },
    'http_req_duration{name:product}': {
      med: 34.4,
      'p(95)': 62.1,
      'p(99)': 80.9,
      max: 95.2,
      thresholds: { 'p(95)<800': false, 'p(95)<1500': false },
    },
    'http_req_duration{name:search}': {
      med: 545,
      'p(95)': 808.4,
      'p(99)': 950,
      max: 1200,
      thresholds: { 'p(95)<800': true, 'p(95)<1500': false },
    },
    // A threshold names this tag, but no request ever carried it.
    'http_req_duration{name:category}': {
      med: 0,
      'p(95)': 0,
      'p(99)': 0,
      max: 0,
      thresholds: { 'p(95)<1000': false, 'p(95)<2000': false },
    },
    'http_req_duration{phase:recovery}': { med: 40, 'p(95)': 70, 'p(99)': 90, max: 100 },
  },
}

describe('load-summary', () => {
  it('lists every tagged leg that saw a sample, and nothing that did not', () => {
    const rows = legs(fixture)
    expect(rows.map((r) => r.leg)).toEqual(['name:product', 'name:search', 'phase:recovery'])
  })

  it('reads k6 threshold booleans the right way round: true is crossed', () => {
    const byLeg = Object.fromEntries(legs(fixture).map((r) => [r.leg, r]))
    expect(byLeg['name:product'].crossed).toEqual([])
    expect(byLeg['name:search'].crossed).toEqual(['p(95)<800'])
    expect(byLeg['phase:recovery'].gated).toBe(false)
  })

  it('renders p50 from med and marks the crossed gate on its own row', () => {
    const out = render(fixture, 'mixed')
    expect(out).toContain('| name:product | 34ms | 62ms | 81ms | 95ms | ✅ |')
    expect(out).toContain('| name:search | 545ms | 808ms | 950ms | 1200ms | ❌ p(95)<800 |')
    expect(out).toContain('| phase:recovery | 40ms | 70ms | 90ms | 100ms | — |')
    expect(out).not.toContain('name:category')
    expect(out).toContain(
      'requests 140, iterations 56, failed 0.00%, rate-limited 5.00%, checks 100.00%',
    )
  })

  it('prints a dash for a stat the run did not keep', () => {
    const out = render(
      { metrics: { 'http_req_duration{name:home}': { med: 10, 'p(95)': 20, max: 30 } } },
      'x',
    )
    expect(out).toContain('| name:home | 10ms | 20ms | — | 30ms | — |')
    expect(totals({})).toEqual({
      requests: undefined,
      iterations: undefined,
      failed: undefined,
      rateLimited: undefined,
      checks: undefined,
    })
  })
})
