import { type Locator, type Page, expect } from '@playwright/test'

/**
 * Catalog content is DB-driven and the slugs are Hebrew, so specs discover a
 * real product or category at runtime instead of hard-coding a demo slug that
 * rots the moment the seed changes.
 */

const DISCOVERY_TIMEOUT = 15_000

/** Assert the document root is Hebrew RTL (dir + lang). */
export async function expectHebrewRtl(page: Page): Promise<void> {
  const html = page.locator('html')
  await expect(html).toHaveAttribute('dir', 'rtl')
  await expect(html).toHaveAttribute('lang', 'he')
}

export async function firstProductHref(page: Page): Promise<string> {
  await page.goto('/products')
  const link = page.locator('a[href^="/product/"]').first()
  await expect(link).toBeVisible({ timeout: DISCOVERY_TIMEOUT })
  const href = await link.getAttribute('href')
  if (!href) throw new Error('product link has no href')
  return href
}

/** Opens the first product in the catalog, whatever its stock. */
export async function openFirstProduct(page: Page): Promise<void> {
  await page.goto('/products')
  const link = page.locator('a[href^="/product/"]').first()
  await expect(link).toBeVisible({ timeout: DISCOVERY_TIMEOUT })
  await link.click()
  await page.waitForURL(/\/product\//)
}

/**
 * Opens a product that can actually be bought, which is a different question
 * from opening the first one.
 *
 * The first product in the local catalog is `demo-prod-03`, stock_quantity 0,
 * so its buy button reads "אזל מהמלאי" and is disabled. The cart specs then
 * clicked the first button matching BUY_BUTTON anywhere on the page - and with
 * the real one disabled and differently labelled, that was a RELATED PRODUCT's
 * card button. The specs added product B and asserted product A's name appeared
 * in the cart.
 *
 * Being out of stock is correct behaviour and is not what those specs are for,
 * so this walks the catalog for an enabled one. Only the specs that need to buy
 * pay the extra page loads; the product-page specs keep using
 * openFirstProduct.
 */
export async function openPurchasableProduct(page: Page): Promise<void> {
  await page.goto('/products')
  const links = page.locator('a[href^="/product/"]')
  await expect(links.first()).toBeVisible({ timeout: DISCOVERY_TIMEOUT })

  // One atomic read of the hrefs, not count() followed by nth(i): the
  // archive streams in under a Suspense boundary, and for a moment the hidden
  // streamed copy and the live grid are BOTH in the document, so a count
  // taken then (48) outlives the swap and nth(24) waits for a link that no
  // longer exists until the test times out (UX27 saw it twice in a row on a
  // slow database night).
  const hrefs = await links.evaluateAll((anchors) => {
    const seen: string[] = []
    for (const anchor of anchors) {
      const href = anchor.getAttribute('href')
      if (href && !seen.includes(href)) seen.push(href)
    }
    return seen
  })

  // Bounded: a seed where none of the first few is buyable is a seed problem,
  // and walking all of it would blow the per-test timeout instead of saying so.
  for (const href of hrefs.slice(0, 6)) {
    await page.goto(href)
    const enabled = await buyButton(page)
      .isEnabled({ timeout: 2_000 })
      .catch(() => false)
    if (enabled) return
  }

  throw new Error('no purchasable product among the first 6 in the catalog')
}

/**
 * The product's own buy button, scoped to the summary block.
 *
 * Unscoped, `.first()` can resolve to a related-product card lower down the
 * page, which is a different product entirely.
 */
function buyButton(page: Page) {
  return page.locator('[data-pdp="summary"]').getByRole('button', { name: BUY_BUTTON }).first()
}

/**
 * Returns the slug of a category that actually has products, discovered from
 * the homepage navigation. Returns null when the catalog exposes no category
 * links at all, which lets a spec skip rather than fail on an empty seed.
 */
export async function firstCategorySlug(page: Page): Promise<string | null> {
  await page.goto('/')
  const links = page.locator('a[href^="/category/"]')
  await expect(links.first())
    .toBeVisible({ timeout: DISCOVERY_TIMEOUT })
    .catch(() => undefined)

  // ONE ROUND TRIP, NOT ONE PER LINK.
  //
  // This was `links.nth(i).getAttribute()` in a loop. The homepage carries more
  // than fifty category links between the navigation, the strip and the promo
  // banners, so the loop was fifty protocol calls before the function had even
  // started visiting candidates, and under load it spent the whole 30s test
  // timeout: three specs failed on `waiting for locator(...).nth(49)`, reported
  // as a missing breadcrumb or a missing sort control. `evaluateAll` reads them
  // all in the page, in one call.
  const candidates = [
    ...new Set(
      (
        await links.evaluateAll((els) =>
          els.map((el) => el.getAttribute('href') ?? '').filter(Boolean),
        )
      )
        .map((href) => href.split('?')[0]?.replace('/category/', ''))
        .filter((slug): slug is string => Boolean(slug)),
    ),
  ]

  // Returning the first link was not the same thing as this function's
  // contract, which is "a category that actually has products". The homepage
  // promo banners hardcode /category/hot-deals and /category/phones-computers
  // (src/components/home/HeroPromoBanners.tsx); neither slug exists in the
  // local seed, and both sort ahead of the real navigation links. Seven
  // category specs were therefore asserting against a 404 page, and reported
  // it as a missing breadcrumb rather than as a dead link.
  //
  // Each candidate is now visited before being handed back. A slug that 404s
  // is skipped rather than returned, so the specs test the archive and the
  // dead banners stay a separate, visible problem.
  for (const slug of candidates) {
    const response = await page.goto(`/category/${slug}`)
    if (response?.status() === 200) return slug
  }
  return null
}

/**
 * The purchase button's label depends on the product: a coupon says "קנה עכשיו"
 * (it is a single-item purchase, priced by the absolute coupon model), anything
 * else says "הוסף לסל". Specs match either rather than assuming a product type,
 * because the seed decides which one they land on.
 */
export const BUY_BUTTON = /הוסף לסל|קנה עכשיו/

/** Reads the item count the header badge advertises via its aria-label. */
async function headerCartCount(page: Page): Promise<number> {
  const label = await page
    .getByRole('button', { name: /עגלת קניות, \d+ פריטים/ })
    .first()
    .getAttribute('aria-label')
    .catch(() => null)
  const match = /עגלת קניות, (\d+) פריטים/.exec(label ?? '')
  return match ? Number(match[1]) : 0
}

/**
 * Adds the currently open product to the cart and waits until it is actually in
 * there.
 *
 * This used to wait for the button to relabel itself "נוסף לסל". That label is
 * a two-second `setTimeout` in ProductInfo.tsx, and the add path refreshes the
 * route, so the confirmation can be gone before an assertion sees it while the
 * add itself has plainly succeeded. Seven cart specs and the purchase-flow spec
 * failed here, always with a drawer open on screen holding the item they said
 * was never added.
 *
 * The header badge is the durable version of the same fact: it is derived from
 * cart state rather than from a timer, so it stays true for as long as the item
 * is in the cart.
 *
 * The badge ALONE was still not enough, and this is the second half of the same
 * bug. `createCartStore` is optimistic: `begin()` raises the count and sets
 * `isPending` in the same tick as the click, and `settle()` only later replaces
 * it with what the server confirmed — or rolls it back if the server refused.
 * Measured, the badge reached 1 in **2 ms** while the row took another second or
 * so to exist. A spec that navigated on the badge alone therefore asked the
 * server for `/cart` before the insert had landed and was told, correctly, that
 * the cart was empty. Seven cart specs, two checkout specs and the purchase
 * flow failed that way, and the app was never wrong.
 *
 * So this waits for the count to be up AND the button to have come back out of
 * its pending state, which is the moment `settle()` ran. The two together are
 * the server's answer rather than the browser's guess: on a refusal the button
 * re-enables too, but `settle()` has put the count back to `before`, so the
 * condition stays false and the spec fails as it should.
 */
export async function addOpenProductToCart(page: Page): Promise<void> {
  const before = await headerCartCount(page)
  const addButton = buyButton(page)
  await expect(addButton).toBeVisible()
  await expect(addButton).toBeEnabled()
  await addButton.click()
  try {
    await expect
      .poll(async () => (await addButton.isEnabled()) && (await headerCartCount(page)) > before, {
        timeout: DISCOVERY_TIMEOUT,
      })
      .toBe(true)
  } catch {
    // A REFUSAL AND A DEAD BUTTON FAIL IDENTICALLY, AND ONE OF THEM IS NOT A BUG.
    //
    // The poll above is correct and stays: on a refusal `settle()` rolls the
    // count back, so the condition is false either way. What it cannot do is
    // say WHICH, and every caller inherited the same message -- "Timeout
    // 15000ms exceeded while waiting on the predicate" at this line -- for two
    // completely different situations. STATE.md carries a whole paragraph
    // explaining that a recurring set of these is not a regression, which is
    // the cost of a failure that does not name itself.
    //
    // On this machine the usual cause is the third case and not a product bug
    // at all: the guest cart's stock read goes through the admin client, the
    // local SUPABASE_SECRET_KEY is the stock demo key, and the hosted project
    // answers `Invalid API key`. Measured 2026-08-19, the server logging
    // `stock.available_read_failed` with that reason while this poll timed out.
    //
    // `toast.error` in CartProvider carries the server's own words, so they go
    // into the message when there are any.
    const refusal = await page
      .locator('[data-sonner-toast][data-type="error"]')
      .first()
      .textContent({ timeout: 1000 })
      .catch(() => null)
    const after = await headerCartCount(page)
    throw new Error(
      [
        `add-to-cart did not stick: the header badge went ${before} -> ${after}.`,
        refusal
          ? `The cart refused it and said: ${refusal.trim()}`
          : 'No error toast was raised, so the click either never reached the server or the answer never came back.',
        'If the server log shows `Invalid API key`, this is the known SUPABASE_SECRET_KEY blocker and not a regression.',
      ].join(' '),
    )
  }
}

/**
 * Raises the PWA install banner, and keeps asking until it is up.
 *
 * WHY IT DISPATCHES MORE THAN ONCE. The banner renders off a captured
 * `beforeinstallprompt`, and the listener that captures it is attached by a
 * client component on mount. Both callers used to fire the event once, right
 * after `domcontentloaded`, which is BEFORE hydration - so the whole test hung
 * on whether hydration won a race against one synchronous dispatch. Measured
 * 2026-08-20 at two workers: both install-banner tests failed in the same full
 * run with "the install banner did not render", and both passed alone. The
 * component was never involved; nothing was scanned and nothing was measured,
 * which is the worst way for an a11y check to be green or red.
 *
 * Re-dispatching costs nothing - the component's handler only calls
 * `preventDefault` and stores the event - and it turns a race into a poll.
 *
 * WHY IT ALSO SYNTHESISES AN INTERACTION. `InstallPrompt` renders on
 * `deferred !== null && engaged`, and `engaged` is set by a one-shot listener
 * on `scroll` / `pointerdown` / `keydown`. That second half of the condition
 * arrived with eb918c3e9 and this helper was never told, so from that commit
 * until 2026-09-06 BOTH install-banner tests failed with "the install banner
 * did not render" - which means the banner's accessibility had not actually
 * been scanned in all that time. The assertion in the caller is what kept that
 * honest instead of green.
 *
 * `pointerdown` is dispatched rather than driven through `page.mouse` or
 * `page.keyboard` deliberately: a real click moves focus and a real scroll
 * moves the viewport, and both change what axe then measures. A synthesised
 * event on `window` satisfies the same one-shot listener and leaves the page
 * exactly as the scan expects to find it - the same argument that already
 * applies to `beforeinstallprompt` two lines below.
 */
export async function raiseInstallBanner(page: Page): Promise<Locator> {
  const banner = page.getByRole('region', { name: 'התקנת האפליקציה' })
  const fire = () =>
    page.evaluate(() => {
      window.dispatchEvent(new Event('pointerdown'))

      const event = new Event('beforeinstallprompt') as Event & {
        prompt: () => Promise<void>
        userChoice: Promise<{ outcome: string }>
      }
      event.prompt = async () => {}
      event.userChoice = Promise.resolve({ outcome: 'dismissed' })
      window.dispatchEvent(event)
    })

  for (let attempt = 0; attempt < 20; attempt++) {
    await fire()
    if (await banner.isVisible().catch(() => false)) return banner
    await page.waitForTimeout(250)
  }
  return banner
}

/**
 * The sentence the checkout shows when payment is not live
 * (src/lib/payments/provider-gate.ts, PAYMENT_GATE_CLOSED_MESSAGE). A mock
 * provider in a production build closes the gate unless the server runs with
 * E2E_MOCK_CHECKOUT=local-build (never honoured on Vercel), so the money specs
 * skip on this text rather than time out on a pay button that reads
 * "התשלום ייפתח בקרוב" (measured 15.10.2026, XF04).
 */
export const PAYMENT_GATE_CLOSED_TEXT = 'התשלום באתר עדיין לא פעיל'

export async function paymentGateClosed(page: Page): Promise<boolean> {
  return (await page.getByText(PAYMENT_GATE_CLOSED_TEXT).count()) > 0
}

/**
 * Empties the signed-in customer's cart through the cart page's own "רוקן
 * עגלה" button, if there is anything in it. The E2E customer's cart is never
 * cleared by the suite and carried 27 lines from earlier runs by 15.10.2026,
 * so the pay step refused with "אין מספיק במלאי לאחד הפריטים" before the
 * spec's own line was even looked at (post-fix run 1 of XF04). Call it after
 * sign-in and before the spec adds its product.
 */
export async function emptyCart(page: Page): Promise<void> {
  await page.goto('/cart')
  const clear = page.getByRole('button', { name: 'רוקן עגלה' })
  if (await clear.isVisible().catch(() => false)) {
    await clear.click()
    await expect(clear).toBeHidden({ timeout: 15_000 })
  }
}

/**
 * Walks the desktop checkout wizard from wherever it opens to the payment
 * step, filling the details and the address when their steps are current,
 * and ends with the terms checkbox visible. Below 768 (D25) every section
 * is on the page at once and the walk is a no-op apart from the fields.
 * The order the three money specs used to repeat by hand; one of them
 * (physical-purchase, admin-refund) expected to land on the payment step
 * directly and timed out on a hidden checkbox once the wizard opened on the
 * details step for a signed-in customer too (measured 15.10.2026, XF04).
 */
export async function walkCheckoutToPayment(page: Page, email: string): Promise<void> {
  // Field ids rather than labels: the footer newsletter box also answers to
  // "כתובת אימייל", so labels are ambiguous the moment the footer renders.
  if (
    await page
      .locator('#co-first-name')
      .isVisible()
      .catch(() => false)
  ) {
    await page.locator('#co-first-name').fill('בדיקה')
    await page.locator('#co-last-name').fill('אוטומטית')
    await page.locator('#co-phone').fill('0501234567')
    await page.locator('#co-email').fill(email)
    await page.getByRole('button', { name: 'המשך', exact: true }).click()
  }

  // The address step is required even for coupon-only carts. A saved
  // address shows the step with a summary line and the same continue button.
  if (
    await page
      .locator('#co-city')
      .isVisible()
      .catch(() => false)
  ) {
    await page.locator('#co-city').fill('תל אביב')
    await page.locator('#co-street').fill('הרצל')
    await page.locator('#co-number').fill('1')
  }
  const toPayment = page.getByRole('button', { name: 'המשך', exact: true })
  if (await toPayment.isVisible().catch(() => false)) {
    await toPayment.click()
  }

  await expect(page.locator('input[name="accept_terms"]')).toBeVisible()
}
