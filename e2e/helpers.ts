import fs from 'node:fs'
import path from 'node:path'
import {
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  expect,
  test,
} from '@playwright/test'
import { CONSENT_WORDING_VERSION, serializeConsent } from '../src/lib/analytics/consent'
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_CUSTOMER_EMAIL,
  E2E_CUSTOMER_PASSWORD,
  E2E_SUPPLIER_EMAIL,
  E2E_SUPPLIER_PASSWORD,
  signInWithEmail,
} from './auth-session'

/**
 * Catalog content is DB-driven and the slugs are Hebrew, so specs discover a
 * real product or category at runtime instead of hard-coding a demo slug that
 * rots the moment the seed changes.
 */

export const DISCOVERY_TIMEOUT = 15_000

/**
 * THE SERVER'S OWN WORST CASE IS LONGER THAN A SPEC'S DEFAULT BUDGET.
 *
 * Every Supabase call made from the app carries a 10 s ceiling
 * (`src/lib/supabase/timeout-fetch.ts`), and a cart write is not one call: the
 * add action reads the cart row, checks the rate limit, validates the product
 * twice (product + stock RPC each), writes the row and re-prices it, all in
 * series. One slow call inside that chain is 10 s on its own, so a 15 s wait
 * on the add and a 30 s budget for the whole test were both below what the
 * product is allowed to take and still succeed.
 *
 * MEASURED 2026-10-20, run 5 and its re-run: 83 and then 29 `supabase.timeout`
 * events in the server log, `cart.add` and `cart.get` among them. The spec
 * reds in those windows were a product page `goto` past 30 s (the test
 * timeout, hit mid-navigation), an add whose button was still pending at the
 * 15 s mark with the badge already at 1, and a `/cart` whose CTA had not
 * arrived in 5 s. Each retry passed in 9 to 12 s. The same cases were green in
 * run 4 on a quiet backend.
 *
 * So a test that writes to the cart gets a budget the server can actually fit
 * inside: 25 s for the add to settle (two slow calls plus the rest) and 60 s
 * for the test. The assertions do not change; a refusal still rolls the badge
 * back and still fails here. Raised from a helper rather than per file because
 * the specs that write to the cart are spread over nine files, and the next
 * one would be the one that forgot.
 */
export const CART_WRITE_TIMEOUT = 25_000
const SLOW_BACKEND_TEST_TIMEOUT = 60_000

/** Extends the running test's budget to the slow-backend one; never shortens it. */
function allowSlowBackend(): void {
  const info = test.info()
  if (info.timeout !== 0 && info.timeout < SLOW_BACKEND_TEST_TIMEOUT) {
    info.setTimeout(SLOW_BACKEND_TEST_TIMEOUT)
  }
}

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
  allowSlowBackend()
  await page.goto('/products')
  const links = page.locator('a[href^="/product/"]')
  await expect(links.first()).toBeVisible({ timeout: DISCOVERY_TIMEOUT })

  const hrefs: string[] = []
  const count = await links.count()
  for (let i = 0; i < count; i += 1) {
    const href = await links.nth(i).getAttribute('href')
    if (href && !hrefs.includes(href)) hrefs.push(href)
  }

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

/**
 * Reads the item count the header badge advertises in its accessible name.
 * The name is built from content (an sr-only run plus the visible price) since
 * the aria-label failed axe's label-content-name-mismatch; an older build still
 * carries the aria-label, so that is read first.
 */
async function headerCartCount(page: Page): Promise<number> {
  const label = await page
    .getByRole('button', { name: /עגלת קניות, \d+ פריטים/ })
    .first()
    .evaluate((el) => el.getAttribute('aria-label') ?? el.textContent ?? '')
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
/**
 * /cart IS PRERENDERED AND SHOWS THE EMPTY STATE UNTIL `/api/cart` ANSWERS.
 *
 * The page is static; `CartBootstrap` fills the store with one fetch after
 * hydration, and `CartPageView` has no loading branch: with zero items in the
 * store it draws "סל הקניות שלך ריק כרגע." under a header badge that already counts the
 * item. That fetch is a Supabase read with the server's own 10 s ceiling, so a
 * spec that asserts the line items at the 5 s default reads the empty state on
 * a slow minute and passes on the retry: run 6 (2026-10-20 21:53 UTC), first
 * attempt "element(s) not found" on the product name with the badge at 1, the
 * retry green in 16 s. checkout.spec had the same shape one run earlier.
 *
 * Every spec that puts something in the cart and then reads /cart goes through
 * here, so the budget lives in one place. The order summary only renders in
 * the non-empty branch, which makes it the marker that the read has landed.
 * A spec that EXPECTS an empty cart must not use this.
 */
export async function openCartWithItems(page: Page): Promise<Locator> {
  await page.goto('/cart')
  await expect(page.getByRole('heading', { name: 'סל הקניות' })).toBeVisible()
  const summary = page.getByRole('complementary', { name: 'סיכום הזמנה' })
  await expect(summary).toBeVisible({ timeout: DISCOVERY_TIMEOUT })
  return summary
}

export async function addOpenProductToCart(page: Page): Promise<void> {
  allowSlowBackend()
  const before = await headerCartCount(page)
  const addButton = buyButton(page)
  await expect(addButton).toBeVisible()
  await expect(addButton).toBeEnabled()
  await addButton.click()
  try {
    await expect
      .poll(async () => (await addButton.isEnabled()) && (await headerCartCount(page)) > before, {
        timeout: CART_WRITE_TIMEOUT,
      })
      .toBe(true)
  } catch {
    // A REFUSAL AND A DEAD BUTTON FAIL IDENTICALLY, AND ONE OF THEM IS NOT A BUG.
    //
    // The poll above is correct and stays: on a refusal `settle()` rolls the
    // count back, so the condition is false either way. What it cannot do is
    // say WHICH, and every caller inherited the same message -- "Timeout
    // 15000ms exceeded while waiting on the predicate" at this line -- for two
    // completely different situations (now 25000ms). STATE.md carries a whole paragraph
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
  // The offer is made only after a first purchase, and the flag is read when
  // the component mounts, so it has to be there before a reload.
  await page.evaluate(() => localStorage.setItem('ke:purchased', '1'))
  await page.reload({ waitUntil: 'domcontentloaded' })
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
 * WAIT FOR REACT TO REVEAL EVERY STREAMED SUSPENSE BOUNDARY BEFORE READING THE
 * PAGE. A route whose body sits under `<Suspense>` arrives in the same HTML
 * stream as the shell, but React parks it in `<div hidden id="S:n">` and swaps
 * it into place from an inline script that runs AFTER `domcontentloaded`, once
 * the boundary's stylesheets are in. Anything that reads the DOM between those
 * two moments sees the fallback (or nothing) and not the page.
 *
 * MEASURED 2026-10-21 on /login, production build: at `domcontentloaded` the
 * tabs existed but had no box (six hidden boundaries), and 75 to 150 ms later
 * they were painted. An axe scan launched on `domcontentloaded` sometimes ran
 * inside that window, skipped the whole hidden form, and reported the page
 * clean; the same scan a tick later reported the real 1.4:1 contrast violation
 * on the active tab. Run 7 failed it on both projects, run 8 on one. Waiting
 * for the hidden boundaries to reach zero makes the scan read the page a
 * visitor is shown, every time.
 */
export async function awaitStreamedReveal(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelectorAll('div[hidden][id^="S:"]').length === 0,
    undefined,
    { timeout: DISCOVERY_TIMEOUT },
  )
}

/**
 * THE FIXTURE CUSTOMER'S CART IS NEVER CLEARED BY THE SUITE, AND IT GROWS.
 *
 * Every money journey adds a line to e2e-customer@'s server cart and then
 * pays, and a journey that died before the pay press left its line behind.
 * Measured 2026-10-21 on the hosted project: 57 lines in that cart before a
 * single spec had run, so the first thing a "buy one coupon" journey would
 * have paid for was fifty-seven other things, and the stock check on the pay
 * step refuses that ("אין מספיק במלאי לאחד הפריטים"). The money specs empty
 * the cart right after signing in, through the page's own "רוקן עגלה" button,
 * so each journey pays for exactly the line it added.
 *
 * /cart draws the empty state until /api/cart answers (see openCartWithItems),
 * so a cart that is really empty and a cart that has not loaded look the same
 * for a moment; the clear button is waited for, and its absence after the
 * discovery budget is taken as empty.
 */
export async function emptyCart(page: Page): Promise<void> {
  allowSlowBackend()
  // The one read that fills the page is awaited by name, so "no clear button"
  // means an empty cart and not a cart that has not loaded yet.
  const cartRead = page
    .waitForResponse(
      (response) => response.url().includes('/api/cart') && response.request().method() === 'GET',
      { timeout: CART_WRITE_TIMEOUT },
    )
    .catch(() => null)
  await presetConsent(page)
  await page.goto('/cart')
  await expect(page.getByRole('heading', { name: 'סל הקניות' })).toBeVisible()
  await cartRead

  const clear = page.getByRole('button', { name: 'רוקן עגלה' })
  const hasItems = await clear
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false)
  if (!hasItems) return

  // THE EMPTY STATE IS OPTIMISTIC; THE CLEAR IS NOT.
  //
  // `clear()` in src/lib/cart/store.ts paints an empty cart and a zero badge
  // before the server action has even been sent, so the two expectations
  // that used to end this helper resolved 0.3 s after the click, the spec
  // navigated to the product page, and the browser aborted the in-flight
  // POST. Measured 2026-10-21 (run 11, admin-refund retry trace): click at
  // 132.0 s, empty text and badge 0 at 132.3 s, goto /product at 132.3 s;
  // the clear takes 1.8 s to answer when it is left alone. The add that
  // followed then read the untouched row, and the checkout showed the whole
  // history of the fixture customer, 50 coupons and 19 physical units, with
  // the physical lines opening the verified-shipping gate on a coupon
  // journey. The badge read 0 -> 70 as a success because the optimistic
  // store had persisted 0 to localStorage.
  //
  // So the click is settled by the action's HTTP answer, and the result is
  // then read back from the server with a reload rather than trusted from
  // the store. The reload is what a shopper who refreshes would see.
  const cleared = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      Boolean(response.request().headers()['next-action']) &&
      new URL(response.url()).pathname === '/cart',
    { timeout: CART_WRITE_TIMEOUT },
  )
  await clear.click()
  expect((await cleared).status(), 'the clear-cart action answered').toBe(200)

  const reread = page
    .waitForResponse(
      (response) => response.url().includes('/api/cart') && response.request().method() === 'GET',
      { timeout: CART_WRITE_TIMEOUT },
    )
    .catch(() => null)
  await page.reload()
  await reread
  await expect(page.getByText('סל הקניות שלך ריק כרגע')).toBeVisible({
    timeout: CART_WRITE_TIMEOUT,
  })
  await expect(clear, 'the cart still holds lines after the clear').toBeHidden()
  await expect.poll(() => headerCartCount(page), { timeout: CART_WRITE_TIMEOUT }).toBe(0)
}

/**
 * Records a consent decision in the context's cookie jar BEFORE a navigation,
 * so the page arrives with the banner hidden by the pre-paint snippet. For a
 * spec that only needs the banner out of the way of a click this is the cheap,
 * deterministic form (the same preset home.spec uses); the submit path, which
 * is the product behaviour, has its own test there.
 */
export async function presetConsent(page: Page, decision: 'granted' | 'denied' = 'denied') {
  const baseURL = test.info().project.use.baseURL ?? 'http://localhost:3000'
  await page.context().addCookies([
    {
      name: 'ke_consent',
      value: serializeConsent({ decision, wordingVersion: CONSENT_WORDING_VERSION }),
      domain: new URL(baseURL).hostname,
      path: '/',
    },
  ])
}

/**
 * Answers the consent banner with "לא תודה" when it is up, and waits for it to
 * go. The banner is fixed to the bottom of every page and sits OVER whatever
 * is there (a sticky buy bar, the cart's clear button at the end of a long
 * list), so a click on those retries against "subtree intercepts pointer
 * events" until the test times out. The decision is a server action that
 * redirects back, which is why the banner's absence is awaited and not just
 * the click.
 */
export async function dismissConsentBanner(page: Page): Promise<void> {
  const banner = page.locator('[data-consent-banner]')
  if (!(await banner.isVisible().catch(() => false))) return
  await banner.getByRole('button', { name: 'לא תודה' }).click()
  await expect(banner).toBeHidden({ timeout: DISCOVERY_TIMEOUT })
}

/**
 * Walks the checkout to the pay press and presses it.
 *
 * THE CHECKOUT IS A FOUR-STEP WIZARD FROM 992px UP AND ONE LONG PAGE BELOW.
 * The money specs were written against an older page with a "תשלום" heading
 * and a "מעבר לתשלום מאובטח" button on arrival; neither exists. The page is
 * headed "קופה", it opens on the personal-details step (prefilled for a
 * signed-in customer with a saved address), "המשך" advances through address
 * and review ("המשך לאישור"), and the terms checkbox and the pay button,
 * "שליחת הזמנה", are in the confirm step's body. Below 992px there is no
 * stepper and no next button: every step is on screen and the pay button is
 * simply there (src/styles/checkout-page.css, the 991px block). So this
 * presses whichever visible next button exists until the pay button is on
 * screen, then accepts the terms and pays. A step that refuses to advance
 * (a validation error) leaves the next button in place and the loop ends on
 * the pay button never appearing, which is the honest failure.
 */
export async function submitCheckout(
  page: Page,
  options: {
    /**
     * For a PHYSICAL order by a customer past the verified-shipping threshold:
     * the fixture's email and the E.164 phone on its saved address. The
     * address step then asks for a WhatsApp code, and this seeds one the
     * server accepts (see e2e/otp-seed.ts) and types it.
     */
    phoneVerification?: { email: string; phoneE164: string }
  } = {},
): Promise<void> {
  allowSlowBackend()
  await expect(page.getByRole('heading', { level: 1, name: 'קופה' })).toBeVisible({
    timeout: DISCOVERY_TIMEOUT,
  })
  const form = page.locator('form.checkout-page__grid')
  await expect(form).toBeVisible({ timeout: DISCOVERY_TIMEOUT })

  const pay = form.locator('.checkout-pay-btn')
  // By its text: the phone-verification block reuses the next button's class
  // for its own "שליחת קוד אימות" and "אימות" buttons. `.first()` because the
  // review step renders TWO visible next buttons, "המשך" in the left column's
  // nav and "המשך לאישור" under the order panel, both wired to goNext
  // (CheckoutForm.tsx, the `!isLastStep` nav and the `step === 'review'`
  // button). Measured 2026-10-21 (run 12): once the shared-customer lock let a
  // coupon journey reach review, the strict locator failed on both and the
  // three coupon money specs died on "no next button" at the step that had two.
  const next = form.locator('.checkout-nav__next:visible').filter({ hasText: /^המשך/ }).first()
  // Below 992px every step is on screen at once and the pay button is visible
  // on arrival, so the loop below never runs and the phone step was never
  // offered its code: measured 2026-10-21 (run 11), physical-purchase on
  // mobile-chrome pressed pay with the gate open and waited 45 s for a
  // navigation that could not come. Ask once here; the helper is a no-op
  // when the block is not on screen, and the loop asks again per step.
  await verifyShippingPhoneIfAsked(page, options.phoneVerification)
  for (let step = 0; step < 3 && !(await pay.isVisible()); step += 1) {
    await verifyShippingPhoneIfAsked(page, options.phoneVerification)
    await expect(next, 'no next button and no pay button on the checkout').toBeVisible()
    await next.click()
    // The step swap is synchronous state, but the inactive step is hidden by
    // CSS off a data attribute React writes on the next commit.
    await page.waitForTimeout(250)
  }
  await expect(pay, 'the pay button never came on screen').toBeVisible()

  await form.locator('input[name="accept_terms"]').check()
  await pay.click()
}

/**
 * The verified-shipping gate (F42): after five paid physical orders the
 * address step holds a "שליחת קוד אימות בוואטסאפ" button and will not advance
 * until a code is verified. The fixture customer is past the threshold. The
 * send is pressed for real (the server writes its own row and tries
 * WhatsApp, then email), a second row with a known code is seeded AFTER it so
 * it is the newest live row for this phone, and that code is typed. Without
 * `seed` the step is left as found and the caller's next press fails on the
 * gate, which is the honest outcome for a spec that did not ask for this.
 */
async function verifyShippingPhoneIfAsked(
  page: Page,
  seed: { email: string; phoneE164: string } | undefined,
): Promise<void> {
  const block = page.getByTestId('shipping-phone-verification')
  if (!seed || !(await block.isVisible().catch(() => false))) return

  await block.getByRole('button', { name: 'שליחת קוד אימות בוואטסאפ' }).click()
  const codeInput = block.locator('#co-phone-code')
  await expect(codeInput, 'the code step never appeared').toBeVisible({
    timeout: CART_WRITE_TIMEOUT,
  })

  const { seedCheckoutPhoneOtp } = await import('./otp-seed')
  const code = '424242'
  const seeded = await seedCheckoutPhoneOtp(seed.email, seed.phoneE164, code)
  if (!seeded) {
    test.skip(true, 'no service key in the test process; the shipping code cannot be seeded')
  }
  await codeInput.fill(code)
  await block.getByRole('button', { name: 'אימות' }).click()
  await expect(page.getByText('מספר הטלפון אומת')).toBeVisible({ timeout: CART_WRITE_TIMEOUT })
}

/**
 * ONE FIXTURE CUSTOMER, TWO WORKERS, AND A SERVER-SIDE CART.
 *
 * Every money journey signs in as e2e-customer@, empties that account's cart,
 * adds one product and pays for it. The chromium and mobile-chrome projects
 * run in parallel workers, so two journeys were doing that to the SAME cart
 * at once: measured 2026-10-21 (run 12), admin-refund on chromium emptied the
 * cart and added the coupon, physical-purchase on mobile-chrome emptied it
 * again and added the physical product, and admin-refund then reached a
 * checkout holding a physical line, which opened the verified-shipping gate
 * (postal code, WhatsApp code) on a coupon journey that had no business
 * seeing it. Nothing in the product was wrong; the two tests shared a shopper.
 *
 * So the journeys take turns. The lock is a file created with `wx` (atomic on
 * one machine, which is where the workers are) under test-results, holding
 * the pid and the time, and a holder that died takes it to the grave for at
 * most LOCK_STALE_MS. The time spent waiting is added to the test's own
 * budget, so a journey that waited is not punished for the one before it.
 *
 * Specs opt in by taking `test` from here instead of from @playwright/test;
 * the fixture is `auto`, so every test in such a file holds the lock for its
 * whole duration.
 */
const SHARED_CUSTOMER_LOCK = path.join(process.cwd(), 'test-results', '.shared-customer.lock')
const LOCK_STALE_MS = 5 * 60 * 1000
const LOCK_WAIT_MAX_MS = 15 * 60 * 1000

async function acquireSharedCustomer(): Promise<number> {
  const started = Date.now()
  fs.mkdirSync(path.dirname(SHARED_CUSTOMER_LOCK), { recursive: true })
  for (;;) {
    try {
      fs.writeFileSync(
        SHARED_CUSTOMER_LOCK,
        JSON.stringify({ pid: process.pid, at: new Date().toISOString() }),
        { flag: 'wx' },
      )
      return Date.now() - started
    } catch {
      try {
        const age = Date.now() - fs.statSync(SHARED_CUSTOMER_LOCK).mtimeMs
        if (age > LOCK_STALE_MS) fs.rmSync(SHARED_CUSTOMER_LOCK, { force: true })
      } catch {
        // Gone between the failed write and the stat: loop and try again.
      }
      if (Date.now() - started > LOCK_WAIT_MAX_MS) {
        throw new Error('the shared fixture customer was never released by another worker')
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
}

function releaseSharedCustomer(): void {
  try {
    const holder = JSON.parse(fs.readFileSync(SHARED_CUSTOMER_LOCK, 'utf8')) as { pid?: number }
    if (holder.pid === process.pid) fs.rmSync(SHARED_CUSTOMER_LOCK, { force: true })
  } catch {
    // Already gone.
  }
}

export const sharedCustomerTest = test.extend<{ sharedCustomer: undefined }>({
  sharedCustomer: [
    // Playwright requires a destructuring pattern here, and biome forbids an
    // empty one; `browser` is what every money journey asks for anyway.
    async ({ browser: _browser }, use, testInfo) => {
      const waited = await acquireSharedCustomer()
      if (testInfo.timeout !== 0) testInfo.setTimeout(testInfo.timeout + waited)
      try {
        await use(undefined)
      } finally {
        releaseSharedCustomer()
      }
    },
    // Its own clock. Without `timeout` the wait for the lock is charged to the
    // test's budget before `setTimeout` above can extend it: measured
    // 2026-10-21 (run 12 re-run), the fifth journey of five waited behind four
    // that took a minute each and died in "beforeEach" at 120 s without
    // having opened a page.
    { auto: true, timeout: LOCK_WAIT_MAX_MS + 60_000 },
  ],
})

/**
 * A browser context for a money journey, with ITS OWN client address.
 *
 * The journeys open their own contexts (`browser.newContext`) so a customer
 * and an admin, or a customer and a supplier, can be signed in side by side.
 * A context made that way does not inherit the project's `extraHTTPHeaders`,
 * so it carried no `x-forwarded-for` and every money login in the run, on
 * both workers, counted against the one real address: `login:<ip>` allows ten
 * an hour, the run makes thirteen (physical x2, refund x2, wallet x2 at two
 * logins each, the redeem journey at three), and the eleventh read "יותר מדי
 * ניסיונות כניסה". Measured 2026-10-21 run 12, full-purchase-redeem on
 * chromium, with the per-worker addresses of the page fixture untouched.
 *
 * Each journey now gets the worker's configured address with the last octet
 * replaced by a hash of its own title, in 100..249, so no two journeys share
 * a bucket and a retry of one cannot exhaust another's. Local only, like the
 * header itself: Vercel overwrites it.
 */
export async function newFixtureContext(
  browser: Browser,
  options: { storageState?: string } = {},
): Promise<BrowserContext> {
  const info = test.info()
  const base = (info.project.use.extraHTTPHeaders ?? {}) as Record<string, string>
  const headers = { ...base }
  const ip = headers['x-forwarded-for']
  if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    const title = info.titlePath.join(' / ')
    let hash = 0
    for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) % 100_000
    const octets = ip.split('.')
    octets[3] = String(100 + (hash % 150))
    headers['x-forwarded-for'] = octets.join('.')
  }
  return browser.newContext({
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    extraHTTPHeaders: headers,
    ...(options.storageState ? { storageState: options.storageState } : {}),
  })
}

/**
 * ONE REAL LOGIN PER ROLE PER RUN; EVERY OTHER CONTEXT REPLAYS IT.
 *
 * `login-account:<email>` allows twenty sign-ins an hour for one account, and
 * a full run signed the fixture customer in thirteen times (every money
 * journey, on both projects, plus the admin and supplier legs for theirs).
 * Two runs inside an hour, or one run after a few standalone checks, and the
 * fourteenth read "יותר מדי ניסיונות כניסה" on a correct password: measured
 * 2026-10-21, runs 12 and 13, the chromium money journeys red at
 * `waitForURL` after the login press with that sentence on the page.
 *
 * So the first journey to need a role signs in and stores the context's
 * `storageState` under test-results/.auth (which Playwright wipes per run),
 * and every later context for that role is created from it: the Supabase
 * session cookies travel, the server refreshes them as it would for any
 * returning visitor, and the limiter sees one attempt per role per run. The
 * lock in `sharedCustomerTest` already serialises the journeys, so the cache
 * is never written by two workers at once.
 *
 * `newFixtureContext` still gives each journey its own forwarded-for address
 * for the per-IP ceiling and the cart-write limiter.
 */
export type FixtureRole = 'customer' | 'supplier' | 'admin'

const AUTH_CACHE_DIR = path.join(process.cwd(), 'test-results', '.auth')
const AUTH_CACHE_MAX_AGE_MS = 50 * 60 * 1000

const ROLE_CREDENTIALS: Record<FixtureRole, { email: string; password: string }> = {
  customer: { email: E2E_CUSTOMER_EMAIL, password: E2E_CUSTOMER_PASSWORD },
  supplier: { email: E2E_SUPPLIER_EMAIL, password: E2E_SUPPLIER_PASSWORD },
  admin: { email: E2E_ADMIN_EMAIL, password: E2E_ADMIN_PASSWORD },
}

export async function newSignedInContext(
  browser: Browser,
  role: FixtureRole,
): Promise<BrowserContext> {
  const file = path.join(AUTH_CACHE_DIR, `${role}.json`)
  const fresh =
    fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < AUTH_CACHE_MAX_AGE_MS
  if (fresh) return newFixtureContext(browser, { storageState: file })

  const context = await newFixtureContext(browser)
  const page = await context.newPage()
  const { email, password } = ROLE_CREDENTIALS[role]
  await signInWithEmail(page, email, password)
  await page.close()
  fs.mkdirSync(AUTH_CACHE_DIR, { recursive: true })
  await context.storageState({ path: file })
  return context
}
