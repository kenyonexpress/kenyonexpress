import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  LCP_BUDGET_MS,
  ROUTES,
  TTFB_BUDGET_MS,
  median,
  splitCold,
  verdict,
} from './measure-live-vitals.mjs'

/**
 * The measurement mistakes this script made before it was believed.
 *
 * 1. It timed after `arrayBuffer()`, so it reported the whole download as time
 *    to first byte: 1312 ms where curl's `time_starttransfer` said 207 ms.
 * 2. Corrected, it read 90 ms - LOWER than curl - because Node pools
 *    connections and the build-bracket probe had already opened one. So it
 *    measures first byte on an established connection, not what a first-time
 *    visitor waits, and calling that "wire" was the same mislabelling again.
 *
 * Both are in the file's header now, with all three measurements side by side,
 * because a performance number whose definition is unstated is a number that
 * will be compared against the wrong budget.
 */
const source = readFileSync('scripts/measure-live-vitals.mjs', 'utf8')

describe('median', () => {
  it('takes the middle of an odd sample', () => {
    expect(median([3, 1, 2])).toBe(2)
  })

  it('averages the two middles of an even one', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })

  it('returns null rather than 0 for no samples', () => {
    // Zero would read as an excellent result for a route nothing reached.
    expect(median([])).toBeNull()
  })
})

describe('splitCold', () => {
  it('keeps the first sample out of the median', () => {
    const { cold, warm } = splitCold([500, 90, 92, 88])
    expect(cold).toBe(500)
    expect(warm).toEqual([90, 92, 88])
  })

  it('reports no cold sample when nothing was measured', () => {
    expect(splitCold([]).cold).toBeNull()
  })
})

describe('verdict', () => {
  it('does not call an unmeasured route a pass', () => {
    expect(verdict(null, TTFB_BUDGET_MS)).toBe('UNMEASURED')
  })

  it('passes at the budget and fails past it', () => {
    expect(verdict(TTFB_BUDGET_MS, TTFB_BUDGET_MS)).toBe('ok')
    expect(verdict(TTFB_BUDGET_MS + 1, TTFB_BUDGET_MS)).toBe('OVER')
  })
})

describe('the script says what it measured, not just what it got', () => {
  it('times the fetch before draining the body', () => {
    // Comments stripped first. The block explains the old bug by naming
    // `arrayBuffer()`, so a raw index finds the PROSE before the code and the
    // assertion inverts - which is what happened writing this, and is the same
    // mistake migration-lint.mjs once made against its own documentation.
    const code = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n')
    const body = code.slice(code.indexOf('for (let i = 0'))
    expect(body.indexOf('wire.push(')).toBeLessThan(body.indexOf('arrayBuffer()'))
  })

  it('records all three measurements so the definition is not guessable', () => {
    for (const figure of ['187-216 ms', '73-109 ms', '76- 92 ms']) {
      expect(source).toContain(figure)
    }
  })

  it('prints which build the numbers describe', () => {
    // The deployment is stale. Publishing vitals without the bracket hands
    // someone a real-looking figure for code that never ran in production.
    expect(source).toContain('PREDATES')
  })

  it('keeps the budgets STEP 14 names', () => {
    expect(TTFB_BUDGET_MS).toBe(200)
    expect(LCP_BUDGET_MS).toBe(2000)
    expect(ROUTES).toContain('/')
  })
})
