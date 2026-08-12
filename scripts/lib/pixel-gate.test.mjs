import { describe, expect, it } from 'vitest'
import { GATE_PERCENT, REGISTERED_DEVIATIONS, gateVerdict, verdictLines } from './pixel-gate.mjs'

describe('gateVerdict', () => {
  it('holds an unregistered page to the 11% rule', () => {
    expect(gateVerdict({ page: 'category', overallPct: 8.34 }).status).toBe('PASS')
    expect(gateVerdict({ page: 'category', overallPct: 11.01 }).status).toBe('FAIL')
    expect(gateVerdict({ page: 'category', overallPct: 8.34 }).ceiling).toBe(GATE_PERCENT)
  })

  /**
   * The reason the deviations exist at all. Each one passes at the number it was
   * registered with and fails a point above it, which is the difference between
   * "this page is allowed to be 31.81%" and "this page is known to be bad".
   */
  it('holds a registered page to its own ceiling, and still fails it above that', () => {
    for (const [page, { ceiling, measured }] of Object.entries(REGISTERED_DEVIATIONS)) {
      expect(measured, `${page} was registered above its own ceiling`).toBeLessThanOrEqual(ceiling)
      expect(gateVerdict({ page, overallPct: measured }).status, page).toBe('PASS')
      expect(gateVerdict({ page, overallPct: ceiling + 0.01 }).status, page).toBe('FAIL')
    }
  })

  it('names the rule it applied, so the output says which one decided', () => {
    expect(gateVerdict({ page: 'cart', overallPct: 8.49 }).reason).toContain('11% rule')
    expect(gateVerdict({ page: 'products', overallPct: 31.81 }).reason).toContain(
      'registered deviation',
    )
  })

  /**
   * /search: the live site answers the query with 17 results and this catalogue
   * with 3. A pass or a fail there would both be a claim about styling that the
   * measurement cannot support.
   */
  it('refuses to score a page where one side carries less than half the content', () => {
    const verdict = gateVerdict({ page: 'search', overallPct: 15.88, contentRatio: 0.35 })
    expect(verdict.status).toBe('NOT_A_SCORE')
    expect(verdict.ceiling).toBeNull()
    expect(verdictLines({ page: 'search', overallPct: 15.88, verdict })[0]).toContain('NOT A SCORE')
  })

  it('scores a page whose two sides carry comparable content', () => {
    expect(gateVerdict({ page: 'home', overallPct: 11.03, contentRatio: 0.99 }).status).toBe('PASS')
  })

  it('ignores registered 1440 ceilings at narrow widths', () => {
    // home is registered at 11.1% for 1440. At 380 the same number must not
    // pass a 40% score under that ceiling.
    expect(gateVerdict({ page: 'home', overallPct: 40, width: 380 }).status).toBe('FAIL')
    expect(gateVerdict({ page: 'home', overallPct: 40, width: 380 }).ceiling).toBe(GATE_PERCENT)
    expect(gateVerdict({ page: 'home', overallPct: 11.03, width: 1440 }).status).toBe('PASS')
  })

  it('takes the content ratio ahead of the ceiling, on a registered page too', () => {
    expect(gateVerdict({ page: 'products', overallPct: 31.81, contentRatio: 0.2 }).status).toBe(
      'NOT_A_SCORE',
    )
  })
})
