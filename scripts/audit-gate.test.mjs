import { describe, expect, it } from 'vitest'
import { classifyAdvisories, hasFix, summarize } from './audit-gate.mjs'

/**
 * THE GATE THAT WOULD HAVE CAUGHT 2026-09-08.
 *
 * WHAT HAPPENED. Two CRITICAL unauthenticated Next.js RCEs, one in the Image
 * Optimizer and therefore reachable on a live site, sat with their patches
 * WRITTEN AND UNMERGEABLE while every gate in this repository was green.
 * `ci.yml` does not run `pnpm audit` at all, and `nightly-health.sh` runs it as
 * `pnpm audit ... || true`, so its result can never reach the FAILED list. The
 * whole detection story rested on a person reading Dependabot, and that is what
 * did not happen in time.
 *
 * WHY NOT `--audit-level high` AND BE DONE. Because the comment in
 * `nightly-health.sh` is right: an advisory with no published patch cannot be
 * acted on by whoever reads the failure, and a permanent red teaches people to
 * skip the check. That is a worse end state than no gate, because it takes the
 * real ones down with it.
 *
 * SO THE LINE IS "FIXABLE". High or critical AND a published patch means one
 * version bump somebody can make today, and that is the only case that blocks.
 * Everything else is printed by name on every run, so nobody gets to say "we
 * have no vulnerabilities" when what is true is "we have some we chose not to
 * fail on".
 *
 * The trap held shut here is the empty semver range. npm spells "no patch
 * exists" as `<0`, and reading that as a version range would invert the gate:
 * it would block on the advisories nobody can fix and, worse, an advisory whose
 * `patched_versions` is missing entirely would read as fixable and block
 * forever.
 */

const CRITICAL_WITH_PATCH = {
  id: 1234,
  severity: 'critical',
  module_name: 'next',
  title: 'Unauthenticated RCE in the Image Optimizer',
  url: 'https://github.com/advisories/GHSA-xxxx',
  vulnerable_versions: '<16.3.3',
  patched_versions: '>=16.3.3',
}

const HIGH_NO_PATCH = {
  id: 5678,
  severity: 'high',
  module_name: 'some-transitive-thing',
  title: 'Prototype pollution, no fix published',
  url: 'https://github.com/advisories/GHSA-yyyy',
  vulnerable_versions: '<=9.9.9',
  patched_versions: '<0',
}

const MODERATE_WITH_PATCH = {
  id: 9012,
  severity: 'moderate',
  module_name: 'a-dev-tool',
  title: 'ReDoS',
  patched_versions: '>=2.0.0',
}

describe('what counts as fixable', () => {
  it("reads npm's empty range as no fix, not as a range", () => {
    expect(hasFix({ patched_versions: '<0' })).toBe(false)
    expect(hasFix({ patched_versions: '<0.0.0' })).toBe(false)
    expect(hasFix({ patched_versions: '  ' })).toBe(false)
  })

  it('refuses to guess when the field is missing', () => {
    // Absent must mean "not fixable". The other way round turns an advisory
    // nobody can act on into a permanent red, which is the failure this whole
    // gate is shaped to avoid.
    expect(hasFix({})).toBe(false)
    expect(hasFix(undefined)).toBe(false)
    expect(hasFix({ patched_versions: null })).toBe(false)
  })

  it('accepts a real published range', () => {
    expect(hasFix({ patched_versions: '>=16.3.3' })).toBe(true)
  })
})

describe('what blocks a build', () => {
  it('REGRESSION_2026_09_08: a critical with a patch blocks', () => {
    const { blocking, exitCode } = summarize({ advisories: { 1234: CRITICAL_WITH_PATCH } })
    expect(exitCode).toBe(1)
    expect(blocking).toHaveLength(1)
    expect(blocking[0].module).toBe('next')
    expect(blocking[0].patched).toBe('>=16.3.3')
  })

  it('a high with no published patch is reported and does NOT block', () => {
    const { blocking, unfixable, exitCode } = summarize({ advisories: { 5678: HIGH_NO_PATCH } })
    expect(exitCode).toBe(0)
    expect(blocking).toEqual([])
    expect(unfixable).toHaveLength(1)
    expect(unfixable[0].module).toBe('some-transitive-thing')
  })

  it('never hides the unfixable ones, even on a passing run', () => {
    // "audit gate: clean" while three high advisories sit unlisted is how the
    // gate would come to mean nothing.
    const { unfixable, exitCode } = summarize({
      advisories: { 5678: HIGH_NO_PATCH, 1: { ...HIGH_NO_PATCH, id: 1 } },
    })
    expect(exitCode).toBe(0)
    expect(unfixable).toHaveLength(2)
  })

  it('ignores moderate and below, patch or not', () => {
    const { blocking, unfixable } = summarize({ advisories: { 9012: MODERATE_WITH_PATCH } })
    expect(blocking).toEqual([])
    expect(unfixable).toEqual([])
  })

  it('sorts critical above high, because that is the order to fix them in', () => {
    const { blocking } = classifyAdvisories({
      advisories: {
        a: { ...CRITICAL_WITH_PATCH, id: 'a', severity: 'high', module_name: 'second' },
        b: { ...CRITICAL_WITH_PATCH, id: 'b', severity: 'critical', module_name: 'first' },
      },
    })
    expect(blocking.map((entry) => entry.module)).toEqual(['first', 'second'])
  })

  it('passes on a clean report', () => {
    expect(summarize({ advisories: {} }).exitCode).toBe(0)
    expect(summarize({}).exitCode).toBe(0)
  })
})
