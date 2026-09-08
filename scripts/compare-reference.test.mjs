import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * THE PIXEL GATE WAS ONE ENVIRONMENT VARIABLE AWAY FROM SCORING ITSELF.
 *
 * kenyonexpress.co.il no longer serves WordPress - the DNS was cut to Vercel and
 * the host serves THIS app. Pointed at the network, compare.mjs measured the
 * local build against our own production deployment and still printed a
 * percentage: 39.76% at 380px.
 *
 * The fix defaults to an archived snapshot under refs/localized/. Its first
 * shape ended `?? networkUrl`, which re-created the bug: `refs/` is gitignored
 * in full, so refs/localized/ cannot exist on a CI runner, and the fallback
 * would have quietly gone back to the network. The pixel-gate job skips today
 * only because CI_SUPABASE_URL is unset - and setting it is an open MANUAL item,
 * so the trap was armed to spring on the day someone did what they are asked.
 */
const compare = readFileSync('scripts/compare.mjs', 'utf8')
const localizer = readFileSync('scripts/localize-live-refs.mjs', 'utf8')
const gitignore = readFileSync('.gitignore', 'utf8')

describe('the reference never silently becomes the network', () => {
  it('has no `?? networkUrl` fallback left', () => {
    expect(compare).not.toMatch(/localizedRef\([^)]*\)\s*\?\?\s*networkUrl/)
  })

  it('throws when the snapshot is absent instead of choosing a wrong answer', () => {
    const fn = compare.slice(
      compare.indexOf('const REFERENCE ='),
      compare.indexOf('if (!process.env.PLAYWRIGHT_BROWSERS_PATH)'),
    )
    expect(fn).toContain('throw new Error')
  })

  it('says in the error that the live host now serves this app', () => {
    expect(compare).toMatch(/now serves THIS app/)
  })

  it('still allows an explicit opt-in to the network', () => {
    // The escape hatch stays: the day the reference is hosted somewhere real,
    // COMPARE_USE_NETWORK=1 is how it comes back.
    expect(compare).toContain("COMPARE_USE_NETWORK === '1'")
  })
})

describe('why the fallback was dangerous is pinned, not just the fix', () => {
  it('refs/ is gitignored, so the snapshot cannot reach a runner', () => {
    // If this ever stops being true the reasoning above needs re-reading, which
    // is exactly when a test should fail.
    expect(gitignore).toMatch(/^refs\/$/m)
  })
})

describe('the snapshot is degraded and says so', () => {
  it('records that fonts are missing and not recoverable', () => {
    expect(localizer).toMatch(/no \.woff, \.woff2 or \.ttf/)
  })

  it('keeps the three non-interchangeable percentages together', () => {
    for (const figure of ['10.68%', '39.76%', '30.26%']) {
      expect(compare).toContain(figure)
    }
  })

  it('records what the degradation actually costs, measured at 1440', () => {
    // Pass 42 said 30.26% should be read as a floor "rather than as a failure
    // against that ceiling", which implied the missing fonts explained much of
    // it. Pass 59 measured all three widths on one build: 380 30.26%, 768
    // 28.99%, 1440 8.29%. Against the historical 7.08% at 1440 the reference
    // costs 1.2 points - and a reference costing one point at desktop is not
    // costing twenty at mobile. The mobile numbers are KNOWN-ISSUES #3, the
    // structural divergence, not an artefact of the snapshot.
    const policy = readFileSync('docs/REFS-POLICY.md', 'utf8')
    expect(policy).toContain('8.29%')
    expect(policy).toMatch(/about one point/)
    expect(policy).toContain('conservative pass')
  })

  it('does not widen the image regex to fonts it cannot fetch', () => {
    // Widening turns silence into noise and recovers nothing: the bytes are
    // gone and the origin 403s.
    expect(localizer).toContain('IMAGE_EXT = /\\.(jpe?g|png|gif|webp|avif|svg)$/i')
  })
})
