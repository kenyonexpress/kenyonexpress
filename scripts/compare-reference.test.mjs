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

  it('does not widen the image regex to fonts it cannot fetch', () => {
    // Widening turns silence into noise and recovers nothing: the bytes are
    // gone and the origin 403s.
    expect(localizer).toContain('IMAGE_EXT = /\\.(jpe?g|png|gif|webp|avif|svg)$/i')
  })
})
