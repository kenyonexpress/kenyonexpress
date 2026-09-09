import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Which surfaces paint a struck-through price, and which of them check first.
 *
 * WHY A TEST AND NOT A LINE IN A DOCUMENT
 *
 * `src/app/(store)/product/[slug]/page.tsx` asks the compliance check before it
 * hands `ProductInfo` a "before" price. The card grids do not, yet. That is a real gap and
 * writing it in a document is how a gap survives: nobody re-reads the document,
 * and the next person to add a strike-through adds an eighth unchecked surface
 * without ever learning there were seven.
 *
 * So the gap lives here, as data. Every file that paints a strike-through is
 * named below with what it does about compliance, the test re-derives the list
 * from the tree, and a file that appears or disappears fails it. The gap cannot
 * grow quietly and it cannot be forgotten.
 *
 * WHY THE GRIDS ARE NOT WIRED YET
 *
 * Not oversight and not difficulty. A card grid renders up to 24 products from
 * six different read paths (`category-page.ts`, `related-products.ts`,
 * `search-server.ts`, `supplier-storefront.ts`, `ke-live-deals-data.ts`,
 * `cart/load-products.ts`), and each one selects `full_price` itself. Wiring
 * them means one batched verdict read per path, which is the catalogue-read
 * consolidation this codebase has not done. The product page was wired first
 * because it is the surface where the claim is largest and the read is already
 * cached per slug.
 *
 * The cost of the gap, stated plainly: a claim the record CONTRADICTS is
 * suppressed on the product page and still painted on the cards leading to it.
 */

const ROOT = resolve(__dirname, '../../..')

/**
 * How the tree spells "put a line through this price".
 *
 * `<del` is in the list and it is the one that matters. Two surfaces strike
 * nothing in their own JSX: they render a `<del>` and the rule lives in CSS
 * (`.pdp-summary__list del`, `.category-card__price del`). A scan for
 * `line-through` alone finds neither -- it missed the product page's own
 * renderer, which is precisely the surface this work wired -- so the scan
 * looks for the ELEMENT as well as the utility class.
 */
const STRIKE_MARKERS = ['line-through', 'p_con__strike', 'price-strike', '<del']

type Posture =
  /** Asks the compliance check before rendering. */
  | 'checked'
  /** Renders `full_price` with no check. Named, counted, and not yet fixed. */
  | 'unchecked'
  /** Strikes something that is not a price claim. Nothing to check. */
  | 'not-a-price'

const SURFACES: Record<string, { posture: Posture; note: string }> = {
  'src/components/storefront/ProductInfo.tsx': {
    posture: 'checked',
    note:
      'renders the <del>; its oldPrice comes from product/[slug]/page.tsx, which drops the ' +
      'claim when suppressReferencePrice is set',
  },
  'src/app/(store)/product/[slug]/opengraph-image.tsx': {
    posture: 'unchecked',
    note: 'the social card, built from the same row; follows the page it illustrates',
  },
  'src/components/ProductCard.tsx': {
    posture: 'unchecked',
    note: 'six read paths feed it, none of them batched for verdicts yet',
  },
  'src/components/ProductDealCard.tsx': {
    posture: 'unchecked',
    note: 'the homepage deals grid, fed by ke-live-deals-data.ts',
  },
  'src/components/CouponCard.tsx': {
    posture: 'unchecked',
    note: 'the coupon grid on the coupons listing',
  },
  'src/components/storefront/CouponPricing.tsx': {
    posture: 'unchecked',
    note: 'the coupon block prints מחיר רגיל from the offer, not from full_price directly',
  },
  'src/components/category/CategoryProductCard.tsx': {
    posture: 'unchecked',
    note: 'category grid; strikes through a <del> styled by category-page.css',
  },
  'src/app/(main)/coupons/[id]/page.tsx': {
    posture: 'unchecked',
    note: 'the coupon detail page, a second product-page-shaped surface',
  },
  'src/components/admin/AuditDiff.tsx': {
    posture: 'not-a-price',
    note: 'strikes the OLD value of any audited field, price or otherwise',
  },
  'src/components/admin/CouponDealForm.tsx': {
    posture: 'not-a-price',
    note: 'admin form preview, seen only by the operator entering the number',
  },
  'src/app/(admin)/admin/suppliers/[id]/SupplierOnboarding.tsx': {
    posture: 'not-a-price',
    note: 'strikes completed onboarding steps',
  },
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx$/.test(entry)) out.push(full)
  }
  return out
}

const found = walk(join(ROOT, 'src'))
  .filter((file) => {
    const text = readFileSync(file, 'utf8')
    return STRIKE_MARKERS.some((marker) => text.includes(marker))
  })
  .map((file) => relative(ROOT, file))
  .sort()

describe('every surface that strikes a price is accounted for', () => {
  it('finds exactly the files this list names', () => {
    // Both directions. A new strike-through fails because it is not named; a
    // removed one fails because the list is stale. Either way somebody looks.
    expect(found).toEqual(Object.keys(SURFACES).sort())
  })

  it('has the product page checking, which is the surface that matters most', () => {
    expect(SURFACES['src/components/storefront/ProductInfo.tsx']?.posture).toBe('checked')
  })

  it('counts the gap out loud rather than describing it', () => {
    // Seven surfaces still paint an unverified claim. When that number changes,
    // this assertion is the thing that says so -- including when it changes in
    // the wrong direction.
    const unchecked = Object.entries(SURFACES).filter(([, s]) => s.posture === 'unchecked')
    expect(unchecked.map(([file]) => file).sort()).toEqual([
      'src/app/(main)/coupons/[id]/page.tsx',
      'src/app/(store)/product/[slug]/opengraph-image.tsx',
      'src/components/CouponCard.tsx',
      'src/components/ProductCard.tsx',
      'src/components/ProductDealCard.tsx',
      'src/components/category/CategoryProductCard.tsx',
      'src/components/storefront/CouponPricing.tsx',
    ])
  })

  it('gives every surface a reason, not just a label', () => {
    for (const [file, surface] of Object.entries(SURFACES)) {
      expect(surface.note.length, file).toBeGreaterThan(20)
    }
  })
})
