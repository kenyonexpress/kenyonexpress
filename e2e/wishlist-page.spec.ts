import { type Cookie, expect, test } from '@playwright/test'
import {
  E2E_CUSTOMER_EMAIL,
  E2E_CUSTOMER_PASSWORD,
  E2E_PHYSICAL_SLUG,
  paidFlowEnabled,
  signInWithEmail,
} from './auth-session'

/**
 * UX20: the wishlist page as a product grid with move-to-cart, remove (with
 * undo) and a share link, on a built server, as the seeded customer.
 *
 * One password login per project, copied into each test's context as
 * cookies: the login limiter is 10 per hour per client IP. The fixture
 * products are saved through their own hearts at the start, so the list is
 * never empty when a test opens it; a test that removes a product undoes it
 * before it ends.
 *
 * The share assertions take the state the server reports: production has
 * not applied migration 248 (`wishlist_shares` is a 404 to anon REST on
 * 14.10), in which case the button explains in a toast instead of hiding;
 * once 248 lands the same press mints and copies a link.
 */
const SLUGS = [E2E_PHYSICAL_SLUG, 'e2e-test-coupon']

test.describe('wishlist page (UX20)', () => {
  test.skip(!paidFlowEnabled(), 'E2E customer fixture is disabled (E2E_PAID_FLOW=0)')

  let session: Cookie[] = []

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    await signInWithEmail(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD, '/account')
    for (const slug of SLUGS) {
      await page.goto(`/product/${slug}`)
      // The product's own heart (inline, with its word) and not an overlay
      // heart on a related-products card, which the shell paints first.
      const heart = page
        .getByRole('button', { name: /רשימת המשאלות/ })
        .filter({ hasText: /שמירה|נשמר/ })
        .first()
      await heart.waitFor()
      // The heart reads "הוסף" until the store's first read answers, and on
      // the hosted database that read sat past the 600ms this used to wait
      // (15.10.2026, XF04: the press then REMOVED a saved product and the list
      // opened with one card). Wait for the page to go quiet, and let the
      // press's outcome decide: a product that was saved after all comes back
      // with a second press.
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(400)
      if ((await heart.getAttribute('aria-label')) === 'הוסף לרשימת המשאלות') {
        await heart.click()
        await expect(heart).not.toBeDisabled({ timeout: 15_000 })
        if ((await heart.getAttribute('aria-label')) === 'הוסף לרשימת המשאלות') {
          await heart.click()
        }
        await expect(heart).toHaveAttribute('aria-label', 'הסר מרשימת המשאלות', {
          timeout: 15_000,
        })
      }
    }
    session = (await page.context().storageState()).cookies
    await page.close()
  })

  test.beforeEach(async ({ context }) => {
    await context.addCookies(session)
    await context.addInitScript(() => {
      window.localStorage.setItem('ke_consent', 'denied.2')
    })
  })

  test('the list is a grid of product cards with a toolbar', async ({ page }) => {
    await page.goto('/account/wishlist')
    const grid = page.getByRole('list', { name: 'המוצרים השמורים' })
    await expect(grid).toBeVisible()
    await expect(grid).toHaveClass(/wishlist-grid/)
    const cards = grid.locator('article.wishlist-card')
    expect(await cards.count()).toBeGreaterThanOrEqual(2)

    // Two across on a phone, three or more from 768: the first two cards
    // share a top edge.
    const first = await cards.nth(0).boundingBox()
    const second = await cards.nth(1).boundingBox()
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(Math.abs((first?.y ?? 0) - (second?.y ?? 1))).toBeLessThan(2)

    // Every card: a square photo slot, the name as a link, both actions at
    // 44px.
    const card = cards.first()
    const thumb = await card.locator('.wishlist-card__thumb').boundingBox()
    expect(thumb).not.toBeNull()
    expect(Math.abs((thumb?.width ?? 0) - (thumb?.height ?? 1))).toBeLessThan(2)
    await expect(card.getByRole('link')).toHaveAttribute('href', /^\/product\//)
    const move = await card.getByRole('button', { name: /לסל|אזל|זמין/ }).boundingBox()
    const remove = await card.getByRole('button', { name: /^הסרת/ }).boundingBox()
    expect(move?.height).toBeGreaterThanOrEqual(44)
    expect(remove?.height).toBeGreaterThanOrEqual(44)
    expect(remove?.width).toBeGreaterThanOrEqual(44)

    // The toolbar: the count and the share button.
    await expect(page.getByText(/מוצרים שמורים|מוצר אחד שמור/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'שיתוף הרשימה' })).toBeVisible()
  })

  test('remove leaves with an exit, announces, and the undo puts it back', async ({ page }) => {
    await page.goto('/account/wishlist')
    const grid = page.getByRole('list', { name: 'המוצרים השמורים' })
    await expect(grid).toBeVisible()
    const cards = grid.locator('article.wishlist-card')
    const before = await cards.count()
    const last = cards.nth(before - 1)
    const name = (await last.getByRole('button', { name: /^הסרת/ }).getAttribute('aria-label'))
      ?.replace(/^הסרת /, '')
      .replace(/ מהרשימה$/, '')

    await last.getByRole('button', { name: /^הסרת/ }).click()
    // Mid-flight: the card is still there, marked leaving, its buttons frozen.
    await expect(last).toHaveAttribute('data-leaving', 'remove')
    await expect(last.getByRole('button', { name: /^הסרת/ })).toBeDisabled()

    await expect(cards).toHaveCount(before - 1)
    await expect(page.getByRole('status').filter({ hasText: `${name} הוסר מהרשימה` })).toHaveCount(
      1,
    )

    // The undo in the toast.
    const undo = page.locator('[data-sonner-toast]').getByRole('button', { name: 'ביטול' })
    await expect(undo).toBeVisible()
    await undo.click()
    await expect(cards).toHaveCount(before)
    await expect(page.getByRole('status').filter({ hasText: `${name} חזר לרשימה` })).toHaveCount(1)
  })

  test('move to cart asks the cart first, then the card leaves and the header counts it', async ({
    page,
  }) => {
    await page.goto('/account/wishlist')
    const grid = page.getByRole('list', { name: 'המוצרים השמורים' })
    await expect(grid).toBeVisible()
    const movable = grid.locator('article.wishlist-card').filter({
      has: page.getByRole('button', { name: /^העברת .* לסל$/ }),
    })
    expect(await movable.count()).toBeGreaterThanOrEqual(1)
    const card = movable.first()
    const name = (await card.getByRole('button', { name: /^הסרת/ }).getAttribute('aria-label'))
      ?.replace(/^הסרת /, '')
      .replace(/ מהרשימה$/, '')
    const productHref = (await card.getByRole('link').getAttribute('href')) ?? ''
    const before = await grid.locator('article.wishlist-card').count()

    const cartLink = page.getByRole('button', { name: /^עגלת קניות/ }).first()
    const countBefore = Number(
      (await cartLink.getAttribute('aria-label'))?.match(/(\d+) פריטים/)?.[1] ?? '0',
    )

    await card.getByRole('button', { name: /^העברת .* לסל$/ }).click()
    await expect(card).toHaveAttribute('data-leaving', 'move')
    await expect(grid.locator('article.wishlist-card')).toHaveCount(before - 1)
    await expect(page.getByRole('status').filter({ hasText: `${name} עבר לסל` })).toHaveCount(1)
    await expect
      .poll(async () =>
        Number((await cartLink.getAttribute('aria-label'))?.match(/(\d+) פריטים/)?.[1] ?? '0'),
      )
      .toBeGreaterThan(countBefore)

    // Put the fixture back for the next test, through its own heart.
    await page.goto(productHref)
    const heart = page
      .getByRole('button', { name: /רשימת המשאלות/ })
      .filter({ hasText: /שמירה|נשמר/ })
      .first()
    await heart.waitFor()
    // Same race as the seeding above: the label is stale until the store's
    // first read answers.
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(400)
    if ((await heart.getAttribute('aria-label')) === 'הוסף לרשימת המשאלות') {
      await heart.click()
      await expect(heart).not.toBeDisabled({ timeout: 15_000 })
      if ((await heart.getAttribute('aria-label')) === 'הוסף לרשימת המשאלות') {
        await heart.click()
      }
      await expect(heart).toHaveAttribute('aria-label', 'הסר מרשימת המשאלות', {
        timeout: 15_000,
      })
    }
  })

  test('the share button either copies a link or says the feature is not open', async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions are a Chromium API')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/account/wishlist')
    const share = page.getByRole('button', { name: 'שיתוף הרשימה' })
    await expect(share).toBeVisible()
    const state = await share.getAttribute('data-share')
    await share.click()
    if (state === 'unavailable') {
      await expect(page.locator('[data-sonner-toast]')).toContainText('שיתוף הרשימה עוד לא פתוח')
      await expect(page.getByRole('heading', { name: 'שיתוף הרשימה' })).toHaveCount(0)
      return
    }
    await expect(page.locator('[data-sonner-toast]')).toContainText('הקישור הועתק')
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied).toMatch(/\/wishlist\/shared\/[A-Za-z0-9_-]{32,64}$/)
    await expect(share).toHaveAttribute('data-share', 'live')
    // The card below shows the same link.
    await expect(page.locator('input[readonly]').first()).toHaveValue(copied)
  })
})
