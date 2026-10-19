import { describe, expect, it } from 'vitest'
import { DEFAULT_BASE, MARKERS, bracket, isPresent } from './audit-deployed-build.mjs'

/**
 * The reasoning this script encodes, pinned.
 *
 * Risk 1 read "find who serves kenyonexpress.vercel.app". The host serves. What
 * it serves is a build from before 2026-09-02, measured by asking it for
 * `/api/ready`, which was added that day, exists on both branches and needs no
 * credential. "Find the host" is a search; "deploy to the host already serving"
 * is a button.
 */
describe('a route that refuses a caller is a route that exists', () => {
  it('counts 401 as present for the cron marker', () => {
    const cron = MARKERS.find((m) => m.path === '/api/cron/health')
    expect(isPresent(401, cron.expect)).toBe(true)
    expect(isPresent(404, cron.expect)).toBe(false)
  })

  it('counts 503 as present for a health route that is up and unhappy', () => {
    // A dependency report saying "not ready" is the route working.
    const ready = MARKERS.find((m) => m.path === '/api/ready')
    expect(isPresent(503, ready.expect)).toBe(true)
    expect(isPresent(200, ready.expect)).toBe(true)
    expect(isPresent(404, ready.expect)).toBe(false)
  })
})

describe('the bracket', () => {
  it('names the oldest absent marker, which is what dates the build', () => {
    const results = [
      { added: '2026-06-01', present: true },
      { added: '2026-08-20', present: true },
      { added: '2026-09-02', present: false },
      { added: '2026-09-08', present: false },
    ]
    expect(bracket(results)).toEqual({ newestPresent: '2026-08-20', oldestAbsent: '2026-09-02' })
  })

  it('reports no absence when the build carries everything', () => {
    const results = [
      { added: '2026-06-01', present: true },
      { added: '2026-09-02', present: true },
    ]
    expect(bracket(results).oldestAbsent).toBeNull()
  })
})

describe('the markers stay usable', () => {
  it('probes the origin first, so an unreachable host is not read as an old build', () => {
    // main() checks MARKERS[0] before the rest and exits 2 if it fails. If the
    // root ever stops being first, every marker reads absent when the host is
    // down and the script reports a very old build instead of no build.
    expect(MARKERS[0].path).toBe('/')
  })

  it('needs no credential for any marker', () => {
    // A marker behind auth would read absent on a build that has it.
    for (const marker of MARKERS) {
      expect(marker.expect.some((s) => s === 200 || s === 401 || s === 503)).toBe(true)
    }
  })

  it('keeps the markers in date order so the bracket reads left to right', () => {
    const dates = MARKERS.map((m) => m.added)
    expect([...dates].sort()).toEqual(dates)
  })

  it('points at the host the cron scheduler actually calls', () => {
    // scripts/run-cron-jobs.sh falls back to this when CRON_BASE_URL is empty,
    // which it is - so this is the origin production traffic reaches.
    expect(DEFAULT_BASE).toBe('https://kenyonexpress.vercel.app')
  })
})
