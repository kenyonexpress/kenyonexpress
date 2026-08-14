import { expect, test } from '@playwright/test'
import { FIXTURE_SLUGS } from './db'
import { expectHebrewRtl } from './helpers'

/**
 * The supplier block on the product page, pinned per `products.type`.
 *
 * WHY BOTH TYPES AND NOT ONE. `SupplierInfo` renders a per-type fulfilment
 * sentence out of a total record, and the two members most of the catalogue
 * uses say opposite things: a coupon is redeemed in person at the counter, a
 * physical product is shipped. The component has already shipped one wrong
 * sentence to a whole product type -- `recurring` fell through to the physical
 * branch and promised customers their subscription would be "נשלח ומסופק על ידי
 * הספק" -- and nothing failed, because a page that renders the wrong true
 * sentence looks exactly like a page that renders the right one. A spec that
 * checked only one type would not have caught it either.
 *
 * WHY THE ADDRESS AND PHONE MATTER HERE SPECIFICALLY. docs/BUSINESS-MODEL.md §2
 * makes address and phone mandatory on every product page, and the reason is
 * commercial rather than cosmetic: most of the catalogue is coupons redeemed at
 * a physical counter, and until the block was widened those details appeared
 * only AFTER paying. A shopper could not see where the business was before
 * deciding to buy.
 *
 * The fixtures are seeded by `pnpm seed:test` (both share one supplier that has
 * a phone), so this asserts a known shape rather than whatever the catalogue
 * happens to hold. Without the fixtures the specs skip; the generic
 * "every product page carries the block" assertion lives in purchase-flow.spec.ts
 * and keeps covering the real catalogue.
 */

const SUPPLIER_REGION = { role: 'region' as const, name: 'פרטי ספק' }

const CASES = [
  {
    type: 'coupon',
    slug: FIXTURE_SLUGS.coupon,
    /** SupplierInfo FULFILMENT_NOTE.coupon */
    fulfilment: 'מימוש הקופון מתבצע ישירות מול הספק בבית העסק.',
    /** The sentence belonging to the OTHER type, which must not appear. */
    wrongFulfilment: 'המוצר נשלח ומסופק על ידי הספק.',
  },
  {
    type: 'physical',
    slug: FIXTURE_SLUGS.physical,
    fulfilment: 'המוצר נשלח ומסופק על ידי הספק.',
    wrongFulfilment: 'מימוש הקופון מתבצע ישירות מול הספק בבית העסק.',
  },
] as const

for (const { type, slug, fulfilment, wrongFulfilment } of CASES) {
  test.describe(`supplier details on a ${type} product @money`, () => {
    test.beforeEach(async ({ page }) => {
      const response = await page.goto(`/product/${slug}`)
      test.skip(
        response?.status() !== 200,
        `fixture /product/${slug} is missing; run pnpm seed:test`,
      )
    })

    test('the block is present and names the supplier', async ({ page }) => {
      await expectHebrewRtl(page)

      const region = page.getByRole(SUPPLIER_REGION.role, { name: SUPPLIER_REGION.name })
      await expect(region).toBeVisible()
      await expect(region.getByRole('heading', { name: 'פרטי הספק' })).toBeVisible()

      // The fixture supplier has a name, so the "details coming soon" fallback
      // is the wrong branch here and would otherwise pass the visibility check
      // above on an empty block.
      await expect(region.getByText('פרטי הספק יתעדכנו בקרוב.')).toHaveCount(0)
      await expect(region.getByText('ספק בדיקות אוטומטיות')).toBeVisible()
    })

    test('the phone is dialable and written left to right inside the Hebrew page', async ({
      page,
    }) => {
      const region = page.getByRole(SUPPLIER_REGION.role, { name: SUPPLIER_REGION.name })
      const tel = region.locator('a[href^="tel:"]').first()

      await expect(tel).toBeVisible()
      // Without dir="ltr" a Hebrew paragraph reorders 03-0000000 to 0000000-03,
      // which is a different, undialable number to anyone reading it off screen.
      await expect(tel).toHaveAttribute('dir', 'ltr')
    })

    test(`the fulfilment sentence is the ${type} one, and not the other type's`, async ({
      page,
    }) => {
      const region = page.getByRole(SUPPLIER_REGION.role, { name: SUPPLIER_REGION.name })

      await expect(region.getByText(fulfilment)).toBeVisible()
      await expect(region.getByText(wrongFulfilment)).toHaveCount(0)
    })

    test('the block sits above the fold of the details column, not after the reviews', async ({
      page,
    }) => {
      // Position, not merely presence. The address exists to be read BEFORE the
      // buy decision; rendered below a review list it is documentation of where
      // the money already went.
      const region = page.getByRole(SUPPLIER_REGION.role, { name: SUPPLIER_REGION.name })
      const buy = page
        .locator('[data-pdp="summary"]')
        .getByRole('button', { name: /הוסף לסל|קנה עכשיו|אזל מהמלאי|לא זמין לרכישה/ })
        .first()

      const regionBox = await region.boundingBox()
      const buyBox = await buy.boundingBox()
      expect(regionBox, 'supplier block has no box').not.toBeNull()
      expect(buyBox, 'buy button has no box').not.toBeNull()

      // Same screen as the purchase control: within one viewport height of it.
      const viewport = page.viewportSize()
      expect(Math.abs((regionBox?.y ?? 0) - (buyBox?.y ?? 0))).toBeLessThan(
        (viewport?.height ?? 800) * 2,
      )
    })
  })
}

test.describe('supplier details survive the type the database actually stores @money', () => {
  test('the coupon fixture is typed coupon and the physical one physical', async ({ request }) => {
    // Guards the seam this whole file depends on: SupplierInfo keys its
    // sentence off `products.type`, and the two fixtures are only meaningful as
    // a pair if the database still spells the members the way the union does.
    // A renamed enum member would otherwise turn both specs above into a silent
    // fallback rather than a failure.
    for (const [slug, expected] of [
      [FIXTURE_SLUGS.coupon, 'מימוש הקופון מתבצע ישירות מול הספק בבית העסק.'],
      [FIXTURE_SLUGS.physical, 'המוצר נשלח ומסופק על ידי הספק.'],
    ] as const) {
      const response = await request.get(`/product/${slug}`)
      test.skip(response.status() !== 200, `fixture /product/${slug} is missing`)
      expect(await response.text(), `${slug} lost its fulfilment sentence`).toContain(expected)
    }
  })
})
