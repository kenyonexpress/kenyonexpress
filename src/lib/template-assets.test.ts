import { describe, expect, it } from 'vitest'
import {
  REMOVED_TEMPLATE_ASSETS,
  formatTemplateAssets,
  scanTemplateAssets,
} from '../../scripts/template-asset-scan.mjs'

/**
 * NO OTHER COMPANY'S PRODUCT PHOTOGRAPHY SHIPS FROM THIS REPO.
 *
 * The rule and its reasoning are in `scripts/template-asset-scan.mjs`, which
 * `pnpm lint` also runs through `scripts/asset-gate.mjs`. This is the half that
 * fails `pnpm test`.
 *
 * Twenty-one files under public/images/hero and public/images/promo were the
 * Electro demo kit; eleven of them rendered on the homepage above the fold, on a
 * site that sells vouchers for restaurants, spas and hotels. Live serves the
 * same files from its own uploads, so "source it from live" could not replace
 * them -- the slots render `BrandPlaceholder` until real photography exists.
 */
describe('no template or vendor imagery', () => {
  it('finds none under public/images and no local path to a deleted one', () => {
    const offenders = scanTemplateAssets()
    expect(offenders, `template/vendor assets:\n${formatTemplateAssets(offenders)}`).toEqual([])
  })

  it('still remembers every file it removed', () => {
    // The denylist IS the rule. An empty one passes the assertion above and
    // means nothing, which is how a denylist quietly stops being one.
    expect(REMOVED_TEMPLATE_ASSETS).toHaveLength(11)
    expect(REMOVED_TEMPLATE_ASSETS).toContain(
      'ios13-iphone-11pro-airpods-pro-setup-animation-steps.webp',
    )
    expect(REMOVED_TEMPLATE_ASSETS).toContain('tesla-logo-main.webp')
  })

  it('leaves live catalogue photography alone', () => {
    // live really does list a Samsung Galaxy S22 and this is live's photo of it.
    // The vendor patterns are scoped to decoration slots precisely so that a
    // rule about borrowed hero imagery cannot delete a product the store sells.
    const offenders = scanTemplateAssets()
    expect(offenders.some((o) => o.where.includes('/products/'))).toBe(false)
  })
})
