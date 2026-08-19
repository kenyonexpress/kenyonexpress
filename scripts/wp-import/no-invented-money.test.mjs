import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULTS } from './config.mjs'

/**
 * The import pipeline wrote three numbers nobody chose onto every product it
 * projected: `platform_percent: 10`, `commission_percent: 15` and
 * `coupon_expiry_days: 365`.
 *
 * `emit-missing-products.mjs` was written in August specifically because of
 * this, and its header documents the reasoning at length. But it was written as
 * a SUBSTITUTE for `04-project-public.mjs` rather than a fix to it, so the
 * original kept its defaults and stayed one working service key away from
 * writing them. The self-audit in FINAL-REPORT.md reported "no hardcoded
 * platform_percent" as clean because it swept `src/`, and this lives in
 * `scripts/`.
 *
 * platform_percent is the only split handle, it is chosen per product, and it
 * is snapshotted onto order_items at purchase. A constant would have decided
 * every supplier's cut on import, silently and in their favour or against it.
 *
 * These assertions are on source text because the projectors are scripts that
 * talk to a database on import; there is no seam to call. A grep-shaped test is
 * a poor test in general and the right one here.
 */

function source(name) {
  return readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')
}

describe('the import invents no money', () => {
  it('has no platform or commission default left to reach for', () => {
    expect(DEFAULTS.platformPercent).toBeUndefined()
    expect(DEFAULTS.commissionPercent).toBeUndefined()
  })

  it('projects a null platform_percent from both projectors', () => {
    for (const file of ['04-project-public.mjs', 'xml-fxp-dryrun.mjs']) {
      expect(source(file)).toMatch(/platform_percent: null/)
      expect(source(file)).not.toMatch(/platform_percent: DEFAULTS/)
    }
  })

  it('never restores a coupon validity default', () => {
    // C7: an unset validity became a silent 90 days in finalize once already.
    expect(source('04-project-public.mjs')).toMatch(/coupon_expiry_days: null/)
    expect(DEFAULTS.couponExpiryDays).toBeUndefined()
  })

  it('keeps the surviving defaults to ones that decide no money', () => {
    // What is left is vocabulary and policy, not amounts: which categories mean
    // coupon, the legacy supplier's name, and the marketing opt-out.
    expect(DEFAULTS.marketingOptIn).toBe(false)
    expect(DEFAULTS.cashbackPercent).toBe(0)
    expect(typeof DEFAULTS.legacySupplierName).toBe('string')
  })
})
