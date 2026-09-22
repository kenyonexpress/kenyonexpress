import { describe, expect, it } from 'vitest'
import { classify } from './verify-cutover.mjs'

const HEALTHY = { httpRedirects: true, homeOk: true, healthOk: true, identityMatches: true }

describe('classify', () => {
  it('is not-yet-cut-over (exit 2) when the apex does not resolve at all', () => {
    const result = classify({ apexResolves: false, pointsAtVercel: false }, HEALTHY)
    expect(result).toEqual({ exitCode: 2, verdict: 'not-yet-cut-over' })
  })

  it('is not-yet-cut-over (exit 2) when it resolves somewhere that is not Vercel', () => {
    // The DNS-moved-but-not-to-us case, distinct from NXDOMAIN but scored
    // the same way: neither is "cut over", so behaviour is never even asked.
    const result = classify({ apexResolves: true, pointsAtVercel: false }, HEALTHY)
    expect(result.exitCode).toBe(2)
  })

  it('is cut-over-and-healthy (exit 0) when DNS points at Vercel and every check passes', () => {
    const result = classify({ apexResolves: true, pointsAtVercel: true }, HEALTHY)
    expect(result).toEqual({ exitCode: 0, verdict: 'cut-over-and-healthy' })
  })

  it.each([
    ['httpRedirects', 'the http->https redirect is missing'],
    ['homeOk', 'the home page does not answer 200'],
    ['healthOk', '/api/health does not say the database is reachable'],
    ['identityMatches', 'the apex does not look like the same deployment as the reference host'],
  ])('is cut-over-but-broken (exit 1) when only %s fails: %s', (key) => {
    const result = classify(
      { apexResolves: true, pointsAtVercel: true },
      { ...HEALTHY, [key]: false },
    )
    expect(result).toEqual({ exitCode: 1, verdict: 'cut-over-but-broken' })
  })

  it('DNS state always wins over behaviour: not-cut-over even if every behaviour flag is true', () => {
    // A caller passing HEALTHY behaviour by mistake on a domain that has not
    // moved must never read as "done" -- the DNS check is the gate, and
    // classify() is the only place both are combined, so this is the one
    // test that would catch the check being reordered wrong.
    const result = classify({ apexResolves: false, pointsAtVercel: false }, HEALTHY)
    expect(result.exitCode).toBe(2)
  })
})
