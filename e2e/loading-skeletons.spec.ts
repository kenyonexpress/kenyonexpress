import { type Cookie, expect, test } from '@playwright/test'
import {
  CONSENT_COOKIE,
  CONSENT_WORDING_VERSION,
  serializeConsent,
} from '../src/lib/analytics/consent'
import {
  E2E_CUSTOMER_EMAIL,
  E2E_CUSTOMER_PASSWORD,
  paidFlowEnabled,
  signInWithEmail,
} from './auth-session'
import { addOpenProductToCart, openPurchasableProduct } from './helpers'

/**
 * UX27: what a shopper sees WHILE something loads, on a built server.
 *
 * Measured before (logs/ux27/before.json): the cart page pronounced a cart
 * with lines in it empty for 1.5-2.0s on every visit; the archive's next
 * page changed a button label and nothing else for 0.6-1.2s; an account tab
 * press held the previous page for 2.3-2.6s and a direct load flushed an
 * empty column for 2s; the checkout press gave nothing back for 306-724ms.
 * Each case here records the STATES a region passes through, from the first
 * script, so the order is a fact and not a screenshot.
 */

type Page = import('@playwright/test').Page

declare global {
  interface Window {
    __ux27?: string[]
  }
}

async function preset(page: Page) {
  const base = new URL(test.info().project.use.baseURL ?? 'http://localhost:3000')
  await page.context().addCookies([
    {
      name: CONSENT_COOKIE,
      value: serializeConsent({ decision: 'denied', wordingVersion: CONSENT_WORDING_VERSION }),
      domain: base.hostname,
      path: '/',
    },
  ])
}

/** Records every distinct state of the cart column, from before the first script. */
async function watchCartStates(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = []
    window.__ux27 = seen
    const note = () => {
      const state = document.querySelector('[data-cart-skeleton]')
        ? 'skeleton'
        : document.querySelector('.cart-empty')
          ? 'empty'
          : document.querySelector('.cart-line__name')
            ? 'lines'
            : 'none'
      if (seen[seen.length - 1] !== state) seen.push(state)
    }
    new MutationObserver(note).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
    })
  })
}

test.describe('loading skeletons (UX27)', () => {
  test('the cart page never pronounces a cart with lines in it empty before the server answers', async ({
    page,
  }) => {
    await preset(page)
    await openPurchasableProduct(page)
    await addOpenProductToCart(page)

    await watchCartStates(page)
    await page.goto('/cart')
    // A real line carries a name link; the skeleton's rows share `.cart-line`
    // for their geometry and have none.
    await expect(page.locator('.cart-line__name').first()).toBeVisible()

    const seen = await page.evaluate(() => window.__ux27 ?? [])
    expect(seen).not.toContain('empty')
    expect(seen).toContain('skeleton')
    expect(seen[seen.length - 1]).toBe('lines')

    // The checkout link carries its pending ring, off until a press.
    const link = page.getByRole('link', { name: 'המשך לתשלום' }).first()
    const hint = link.locator('.checkout-link__hint')
    await expect(hint).toHaveAttribute('data-link-pending', 'false')
    await link.click()
    await expect(page).toHaveURL(/\/checkout/)
  })

  test('a device with no cart sees the empty state, not a skeleton that never resolves', async ({
    page,
  }) => {
    await preset(page)
    await watchCartStates(page)
    await page.goto('/cart')
    await expect(page.locator('.cart-empty')).toBeVisible()
    await expect(page.locator('[data-cart-skeleton]')).toHaveCount(0)
    const seen = await page.evaluate(() => window.__ux27 ?? [])
    // The HTML carries the skeleton; the mirror, once read, says "no cart".
    // ('none' is the head being parsed, before the body exists.)
    const states = seen.filter((state) => state !== 'none')
    expect(states[0]).toBe('skeleton')
    expect(states[states.length - 1]).toBe('empty')
    expect(seen).not.toContain('lines')
  })

  test('the archive holds a card-shaped box for every product in flight while a page loads', async ({
    page,
  }) => {
    await preset(page)
    await page.goto('/products')
    const grid = page.locator('ul.category-products')
    await expect(grid.locator('li.category-products__item')).toHaveCount(24)
    // The numbered pages render with the grid; give them a beat before
    // deciding the catalogue has one page (a bare count() here raced them
    // once and skipped a real archive).
    const pagination = page.locator('nav.category-pagination')
    await pagination.waitFor({ state: 'attached', timeout: 5_000 }).catch(() => {})
    test.skip(!(await pagination.count()), 'the shop archive has one page in this catalogue')

    // Hold page two for a moment so the in-flight state is observable.
    await page.route('**/api/catalog/page?*', async (route) => {
      await new Promise((r) => setTimeout(r, 1500))
      await route.continue()
    })
    await page
      .getByRole('group', { name: 'אופן הדפדוף' })
      .getByRole('button', { name: 'גלילה רציפה' })
      .click()

    await expect(grid.locator('[data-pending-card]').first()).toBeVisible()
    await expect(grid).toHaveAttribute('aria-busy', 'true')
    expect(
      await grid.locator('[data-pending-card] .category-card--skeleton').count(),
    ).toBeGreaterThan(0)
    // Decorative: not list items to a screen reader.
    await expect(grid.locator('[data-pending-card]').first()).toHaveAttribute('aria-hidden', 'true')

    await expect(grid.locator('[data-pending-card]')).toHaveCount(0, { timeout: 15_000 })
    await expect(grid).not.toHaveAttribute('aria-busy', 'true')
    expect(await grid.locator('li.category-products__item').count()).toBeGreaterThan(24)
  })
})

test.describe('account loading skeleton (UX27)', () => {
  test.skip(!paidFlowEnabled(), 'E2E customer fixture is disabled (E2E_PAID_FLOW=0)')

  let session: Cookie[] = []

  // One login per project, copied into each test's context: the login
  // limiter is 10 per hour per client IP.
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    await signInWithEmail(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD, '/account')
    session = (await page.context().storageState()).cookies
    await page.close()
  })

  test.beforeEach(async ({ context }) => {
    await context.addCookies(session)
  })

  test('a tab press paints the column skeleton before the new page, and a direct load flushes it first', async ({
    page,
  }) => {
    await preset(page)
    await page.goto('/account')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('האזור האישי')

    await page.evaluate(() => {
      const seen: string[] = []
      window.__ux27 = seen
      const column = document.querySelector('.account-content')
      if (!column) throw new Error('no .account-content')
      const note = () => {
        const state = column.querySelector('[data-account-skeleton]')
          ? 'skeleton'
          : (document.querySelector('main h1')?.textContent?.trim() ?? 'none')
        if (seen[seen.length - 1] !== state) seen.push(state)
      }
      note()
      new MutationObserver(note).observe(column, { childList: true, subtree: true })
    })

    const bar = page.getByRole('navigation', { name: 'אזורי החשבון' })
    await bar.getByRole('link', { name: 'ההזמנות שלי' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ההזמנות שלי')

    const seen = await page.evaluate(() => window.__ux27 ?? [])
    expect(seen[0]).toBe('האזור האישי')
    expect(seen).toContain('skeleton')
    expect(seen.indexOf('skeleton')).toBeLessThan(seen.indexOf('ההזמנות שלי'))
    await expect(page.locator('[data-account-skeleton]')).toHaveCount(0)

    // A direct load: the streamed document carries the skeleton (the first
    // flush) and then the page, in that order.
    const res = await page.request.get('/account/orders')
    expect(res.status()).toBe(200)
    const html = await res.text()
    const skeletonAt = html.indexOf('data-account-skeleton')
    const titleAt = html.indexOf('class="account-title"')
    expect(skeletonAt).toBeGreaterThan(-1)
    expect(titleAt).toBeGreaterThan(skeletonAt)
  })
})
