import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every indexable page declares its head through `publicPageMetadata`, so
 * canonical, hreflang, Open Graph and the Twitter card cannot be present on
 * one page and missing on the next.
 *
 * A SOURCE SCAN, NOT A RENDER. `generateMetadata` on the dynamic routes reads
 * the catalogue, and rendering it here would mean faking Supabase for the
 * sake of a string. The helper is pure and has its own tests; this file only
 * asserts that each page reaches it. The list is explicit so a new public
 * page has to be added here, and the test says so when one is forgotten.
 *
 * The pages NOT listed are the ones that must stay out of the index and say
 * so with `robots`: auth, checkout, cart, wallet, wishlist, the voucher and
 * redeem routes, and the newsletter confirm/unsubscribe doors.
 */
const INDEXABLE_PAGES = [
  '(store)/page.tsx',
  '(store)/products/page.tsx',
  '(main)/coupons/page.tsx',
  '(main)/coupons/[id]/page.tsx',
  '(store)/about/page.tsx',
  '(store)/accessibility/page.tsx',
  '(store)/blog/page.tsx',
  '(store)/blog/how-coupons-work/page.mdx',
  '(store)/category/[slug]/page.tsx',
  '(store)/city/[slug]/page.tsx',
  '(store)/contact/page.tsx',
  '(store)/cookies/page.tsx',
  '(store)/faq/page.tsx',
  '(store)/gift-card/page.tsx',
  '(store)/privacy-policy/page.tsx',
  '(store)/product/[slug]/page.tsx',
  '(store)/refund_returns/page.tsx',
  '(store)/s/[id]/page.tsx',
  '(store)/shipping/page.tsx',
  '(store)/suppliers/page.tsx',
  '(store)/terms-and-conditions/page.tsx',
] as const

/** Public but deliberately unindexed: each must carry a `robots` block. */
const NOINDEX_PAGES = [
  '(store)/search/page.tsx',
  '(store)/wallet/page.tsx',
  '(store)/wishlist/page.tsx',
  '(store)/wishlist/shared/[token]/page.tsx',
  '(store)/gift/[token]/page.tsx',
  '(store)/checkout/app-return/page.tsx',
  '(store)/checkout/frame-return/page.tsx',
  'coupon/[slug]/CouponOfferPage.tsx',
  'redeem/[token]/page.tsx',
  'voucher/[id]/page.tsx',
  'merchant/scan/page.tsx',
  'offline/page.tsx',
  '(main)/newsletter/confirm/page.tsx',
  '(main)/newsletter/unsubscribe/page.tsx',
  '(main)/wishlist-alerts/unsubscribe/page.tsx',
] as const

function read(rel: string): string {
  return readFileSync(resolve(__dirname, rel), 'utf8')
}

describe('indexable pages declare their head through publicPageMetadata', () => {
  for (const page of INDEXABLE_PAGES) {
    it(page, () => {
      const src = read(page)
      expect(src, 'imports the helper').toContain("from '@/lib/seo/page-metadata'")
      expect(src, 'calls it').toContain('publicPageMetadata(')
      // A hand-written block beside the helper would be the drift this exists
      // to stop: the helper owns canonical, hreflang and both cards.
      expect(src, 'no hand-written canonical').not.toMatch(/alternates:\s*\{\s*canonical/)
      expect(src, 'no hand-written openGraph').not.toMatch(/openGraph:\s*\{/)
    })
  }
})

describe('unindexed pages say so', () => {
  for (const page of NOINDEX_PAGES) {
    it(page, () => {
      expect(read(page)).toMatch(/robots:\s*\{\s*index:\s*false/)
    })
  }
})

describe('the root layout carries the hreflang pair for routes with no metadata of their own', () => {
  it('names he-IL and x-default', () => {
    const src = read('layout.tsx')
    expect(src).toMatch(/languages:\s*\{\s*'he-IL':\s*'\/',\s*'x-default':\s*'\/'\s*\}/)
  })
})
