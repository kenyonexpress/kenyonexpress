import fs from 'node:fs'
import path from 'node:path'
import { type Browser, type BrowserContext, type Page, expect, test } from '@playwright/test'
import {
  CONSENT_COOKIE,
  CONSENT_WORDING_VERSION,
  serializeConsent,
} from '../src/lib/analytics/consent'
import {
  E2E_COUPON_SLUG,
  E2E_CUSTOMER_EMAIL,
  E2E_CUSTOMER_PASSWORD,
  E2E_PHYSICAL_SLUG,
  E2E_SUPPLIER_EMAIL,
  E2E_SUPPLIER_PASSWORD,
  paidFlowEnabled,
} from './auth-session'
import { BUY_BUTTON, emptyCart, expectHebrewRtl } from './helpers'

/**
 * S27: the five money journeys, in order, against a deployed preview.
 *
 *   1. guest coupon purchase   no account, mock pay, code + QR on the return page
 *   2. physical purchase       signed-in customer, shipping address, no voucher
 *   3. gift                    coupon bought as a gift, held, claimed by the recipient
 *   4. cancel                  s.14C request on the physical order, row in the DB
 *   5. redeem                  the supplier redeems the guest's code from step 1
 *
 * Run it with E2E_BASE_URL set to the preview's branch alias, which must be the
 * same host the build was given as NEXT_PUBLIC_APP_URL: the mock payment frame
 * returns to that origin, and `frame-src 'self'` blanks it on any other one.
 * VERCEL_AUTOMATION_BYPASS_SECRET gets the suite past preview protection
 * (playwright.config.ts sends it as a header). docs/S27-e2e.md has the recipe.
 *
 * The preview writes to the production database, like every E2E build here.
 * Every DB read below is the service key, from the env or `.env.local`.
 */

function serviceEnv(): { url: string; key: string } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL
  let key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || key === '[SENSITIVE]') {
    try {
      const raw = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
      const read = (name: string) =>
        new RegExp(`^${name}=(.+)$`, 'm')
          .exec(raw)?.[1]
          ?.trim()
          .replace(/^["']|["']$/g, '') ?? undefined
      url = read('NEXT_PUBLIC_SUPABASE_URL') ?? url
      key = read('SUPABASE_SECRET_KEY') || read('SUPABASE_SERVICE_ROLE_KEY') || key
    } catch {
      return null
    }
  }
  if (!url || !key || key === '[SENSITIVE]' || key.length < 20) return null
  return { url: url.replace(/\/$/, ''), key }
}

async function serviceGet<T>(pathAndQuery: string): Promise<T[]> {
  const env = serviceEnv()
  if (!env) throw new Error('S27 needs the service key in the env or .env.local')
  const response = await fetch(`${env.url}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
  })
  if (!response.ok) {
    throw new Error(`PostgREST ${response.status} on ${pathAndQuery.split('?')[0]}`)
  }
  return (await response.json()) as T[]
}

type OrderRow = {
  id: string
  status: string
  user_id: string | null
  address_id: string | null
  total_ils_agorot: number
  gift_recipient_email: string | null
}

async function readOrder(orderId: string): Promise<OrderRow | undefined> {
  const rows = await serviceGet<OrderRow>(
    `orders?select=id,status,user_id,address_id,total_ils_agorot,gift_recipient_email&id=eq.${orderId}`,
  )
  return rows[0]
}

async function readVouchers(orderId: string): Promise<{ id: string; status: string }[]> {
  return serviceGet(`vouchers?select=id,status&order_id=eq.${orderId}`)
}

/** Hebrew, Israel time, consent decided before the first request, no passkey nudge. */
async function newContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
  await context.addInitScript(() => {
    Object.defineProperty(window, 'PublicKeyCredential', { value: undefined, configurable: true })
  })
  const base = new URL(test.info().project.use.baseURL ?? 'http://localhost:3000')
  await context.addCookies([
    {
      name: CONSENT_COOKIE,
      value: serializeConsent({ decision: 'denied', wordingVersion: CONSENT_WORDING_VERSION }),
      domain: base.hostname,
      path: '/',
    },
  ])
  return context
}

async function addToCart(page: Page, slug: string): Promise<void> {
  await page.goto(`/product/${slug}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
  const buy = page.getByRole('button', { name: BUY_BUTTON }).first()
  await expect(buy).toBeEnabled({ timeout: 15_000 })
  await buy.click()
  await expect(page.getByRole('button', { name: /נוסף לסל/ }).first()).toBeVisible({
    timeout: 15_000,
  })
}

/**
 * Waits for the Turnstile token before "pay" is pressed.
 *
 * Measured on the first S27 run: the helper pressed pay while the widget was
 * still solving, the field went up empty, and the action answered "אימות
 * האבטחה נכשל" with the widget showing success a second later. A shopper
 * cannot click that fast; a script can. No widget (no site key) means no wait.
 */
async function waitForTurnstile(page: Page): Promise<void> {
  // Keyed on the widget's container, not on the hidden field: the field only
  // exists once Cloudflare's script has rendered, and the second S27 run read
  // "no field, no widget" a moment before it appeared, then posted no token.
  if ((await page.locator('[data-sitekey]').count()) === 0) return
  const field = page.locator('input[name="cf-turnstile-response"]')
  await expect
    .poll(
      async () =>
        (
          (await field
            .first()
            .inputValue()
            .catch(() => '')) ?? ''
        ).length,
      {
        timeout: 30_000,
      },
    )
    .toBeGreaterThan(0)
}

type Cookies = Parameters<BrowserContext['addCookies']>[0]
const sessions = new Map<string, Cookies>()

/**
 * Password sign-in that waits for the Turnstile token, once per role per run.
 *
 * `signInWithEmail` presses "כניסה" as soon as the field is filled. Against a
 * build with a Turnstile key pair that posts an empty token and the action
 * refuses; local runs have no key pair, so the shared helper never met it.
 * The `login` limiter allows 10 an hour per address, so a role signs in once
 * and later journeys replay its cookies.
 */
async function signIn(page: Page, email: string, password: string, next = '/account') {
  const cached = sessions.get(email)
  if (cached) {
    await page.context().addCookies(cached)
    await page.goto(next)
    if (!new URL(page.url()).pathname.startsWith('/login')) return
    await page.context().clearCookies()
  }
  await page.goto(`/login?next=${encodeURIComponent(next)}`)
  await expect(page.getByRole('heading', { name: 'כניסה לחשבון' })).toBeVisible({
    timeout: 15_000,
  })
  await page.getByLabel('אימייל', { exact: true }).fill(email)
  await page.getByLabel('סיסמה', { exact: true }).fill(password)
  await waitForTurnstile(page)
  await page.getByRole('button', { name: 'כניסה', exact: true }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })
  sessions.set(email, await page.context().cookies())
}

/**
 * Fills the single-page checkout and presses pay, with the Turnstile token
 * checked LAST, after the terms box: run 10 posted an empty token from the gift
 * journey after the same wait had passed earlier in the walk. The shared
 * `walkCheckoutToPayment` checks terms and clicks in one go, so the wait has to
 * sit here instead.
 */
async function payNow(
  page: Page,
  email: string,
  fill?: (page: Page) => Promise<void>,
): Promise<void> {
  await expect(page.getByRole('heading', { name: 'קופה' })).toBeVisible({ timeout: 15_000 })
  // The Suspense shell carries its own terms box until the form streams in
  // (run 12 found two). One left means the real form is the one on screen.
  const terms = page.locator('input[name="accept_terms"]')
  await expect(terms).toHaveCount(1, { timeout: 20_000 })
  const firstName = page.locator('#co-first-name')
  if (await firstName.isVisible().catch(() => false)) {
    await firstName.fill('בדיקה')
    await page.locator('#co-last-name').fill('אוטומטית')
    await page.locator('#co-phone').fill('0521234567')
    await page.locator('#co-email').fill(email)
  }
  const city = page.locator('#co-city')
  if (await city.isVisible().catch(() => false)) {
    await city.fill('תל אביב')
    await page.locator('#co-street').fill('אלנבי')
    await page.locator('#co-number').fill('1')
  }
  if (fill) await fill(page)
  await expect(terms).toBeVisible({ timeout: 10_000 })
  await terms.check()
  await waitForTurnstile(page)
  await page.getByRole('button', { name: 'שליחת הזמנה', exact: true }).click()
}

/** Lands on the confirmation and returns the order id from its URL. */
async function waitForPaidReturn(page: Page): Promise<string> {
  await page.waitForURL(/\/checkout\/return\?.*order_id=/, { timeout: 60_000 })
  await expect(page.getByRole('heading', { name: 'התשלום הצליח!' })).toBeVisible({
    timeout: 45_000,
  })
  await expectHebrewRtl(page)
  const orderId = new URL(page.url()).searchParams.get('order_id')
  if (!orderId) throw new Error('return URL carries no order_id')
  return orderId
}

const shared: {
  guestVoucherCode?: string
  guestOrderId?: string
  physicalOrderId?: string
} = {}

test.describe
  .serial('S27 preview money journeys @money @s27', () => {
    test.describe.configure({ timeout: 180_000 })

    test.beforeAll(() => {
      test.skip(!paidFlowEnabled(), 'paid flow credentials disabled (E2E_PAID_FLOW=0)')
      test.skip(!serviceEnv(), 'no service key: the DB half of every journey cannot be checked')
    })

    test('1. guest buys a coupon without an account and gets a code and a QR', async ({
      browser,
    }) => {
      const context = await newContext(browser)
      const page = await context.newPage()
      const guestEmail = `e2e-guest+s27-${Date.now()}@kenyonexpress.co.il`
      await addToCart(page, E2E_COUPON_SLUG)
      await page.goto('/checkout')
      await expect(page.getByText('קופון בדיקות אוטומטיות').first()).toBeVisible({
        timeout: 15_000,
      })
      // A coupon cart asks for no address, ever.
      await expect(page.locator('#co-city')).toHaveCount(0)
      await payNow(page, guestEmail)

      const orderId = await waitForPaidReturn(page)
      await expect(page.getByTestId('coupon-code').first()).toBeVisible()
      await expect(page.getByTestId('coupon-qr').first()).toBeVisible()
      const code = ((await page.getByTestId('coupon-code').first().textContent()) ?? '')
        .replace(/[^0-9A-Za-z]/g, '')
        .toUpperCase()
      expect(code).toHaveLength(10)

      const order = await readOrder(orderId)
      expect(order?.status).toBe('paid')
      expect(order?.total_ils_agorot).toBe(4000)
      expect(Number.isInteger(order?.total_ils_agorot)).toBe(true)
      expect(order?.address_id).toBeNull()
      const vouchers = await readVouchers(orderId)
      expect(vouchers).toHaveLength(1)
      expect(vouchers[0]?.status).toBe('issued')

      shared.guestVoucherCode = code
      shared.guestOrderId = orderId
      await context.close()
    })

    test('2. signed-in customer buys a physical product with a shipping address', async ({
      browser,
    }) => {
      const context = await newContext(browser)
      const page = await context.newPage()
      await signIn(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD)
      await emptyCart(page)

      await addToCart(page, E2E_PHYSICAL_SLUG)
      await page.goto('/checkout')
      await expect(page.getByText('מוצר פיזי לבדיקות אוטומטיות').first()).toBeVisible({
        timeout: 15_000,
      })
      await payNow(page, E2E_CUSTOMER_EMAIL)

      const orderId = await waitForPaidReturn(page)
      await expect(page.getByTestId('coupon-code')).toHaveCount(0)
      await expect(page.getByTestId('coupon-qr')).toHaveCount(0)

      const order = await readOrder(orderId)
      expect(order?.status).toBe('paid')
      expect(order?.total_ils_agorot).toBe(10_000)
      expect(order?.address_id, 'a physical order carries its shipping address').toBeTruthy()
      expect(await readVouchers(orderId)).toHaveLength(0)
      const addresses = await serviceGet<{ city: string | null; street: string | null }>(
        `user_addresses?select=city,street&id=eq.${order?.address_id}`,
      )
      expect(addresses[0]?.city, 'the shipping address has a city').toBeTruthy()

      await page.goto(`/account/orders/${orderId}`)
      await expect(page.getByText('מוצר פיזי לבדיקות אוטומטיות').first()).toBeVisible({
        timeout: 15_000,
      })
      shared.physicalOrderId = orderId
      await context.close()
    })

    test('3. a coupon bought as a gift is held for the recipient, who claims it', async ({
      browser,
    }) => {
      const buyer = await newContext(browser)
      const page = await buyer.newPage()
      await signIn(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD)
      await emptyCart(page)
      await addToCart(page, E2E_COUPON_SLUG)
      await page.goto('/checkout')
      const message = `S27 מתנה ${Date.now()}`
      await payNow(page, E2E_CUSTOMER_EMAIL, async (p) => {
        const box = p.locator('input[name="gift"]')
        await expect(box).toBeVisible({ timeout: 10_000 })
        if (!(await box.isChecked())) await box.check()
        await p.locator('#co-gift-email').fill(E2E_SUPPLIER_EMAIL)
        await p.locator('#co-gift-name').fill('רון')
        await p.locator('#co-gift-message').fill(message)
      })
      const orderId = await waitForPaidReturn(page)
      await expect(page.getByText(/הקופון נשלח אל רון/)).toBeVisible()
      await expect(page.getByTestId('coupon-qr')).toHaveCount(0)
      const giftOrder = await readOrder(orderId)
      expect(giftOrder?.gift_recipient_email).toBe(E2E_SUPPLIER_EMAIL)
      // A coupon carries no shipping address, even for a customer who has one saved.
      expect(giftOrder?.address_id).toBeNull()
      await buyer.close()

      // The claim link is only ever in the outbox row (service role).
      let token: string | null = null
      for (let i = 0; i < 10 && !token; i += 1) {
        const rows = await serviceGet<{ payload: { claim_token?: string; message?: string } }>(
          `notification_outbox?select=payload&kind=eq.voucher_gifted&recipient_email=eq.${encodeURIComponent(
            E2E_SUPPLIER_EMAIL,
          )}&order=created_at.desc&limit=1`,
        )
        token = rows[0]?.payload?.claim_token ?? null
        if (!token) await new Promise((r) => setTimeout(r, 1500))
      }
      expect(token, 'voucher_gifted outbox row for the recipient').toBeTruthy()

      const recipient = await newContext(browser)
      const claim = await recipient.newPage()
      await claim.goto(`/gift/${token}`)
      await expect(claim.getByText(message)).toBeVisible({ timeout: 15_000 })
      await signIn(claim, E2E_SUPPLIER_EMAIL, E2E_SUPPLIER_PASSWORD, `/gift/${token}`)
      await claim.goto(`/gift/${token}`)
      await claim.getByRole('button', { name: 'קבלת הקופון לחשבון שלי' }).click()
      await claim.waitForURL(/\/account\/coupons$/, { timeout: 20_000 })

      // A claim does not re-own the row: the buyer's voucher is closed as
      // `transferred` and a new one is issued to the recipient, linked both ways.
      type V = {
        id: string
        status: string
        status_reason: string | null
        user_id: string
        transferred_from_voucher_id: string | null
      }
      const vouchers = await serviceGet<V>(
        `vouchers?select=id,status,status_reason,user_id,transferred_from_voucher_id&order_id=eq.${orderId}&order=created_at.asc`,
      )
      expect(vouchers).toHaveLength(2)
      const [original, claimed] = vouchers
      expect(original?.status).toBe('transferred')
      expect(original?.status_reason).toBe('gift_claim')
      expect(claimed?.status).toBe('issued')
      expect(claimed?.transferred_from_voucher_id).toBe(original?.id)
      expect(claimed?.user_id).not.toBe(original?.user_id)
      await recipient.close()
    })

    test('4. the customer cancels the physical order under s.14C', async ({ browser }) => {
      test.skip(!shared.physicalOrderId, 'journey 2 did not produce an order')
      const orderId = shared.physicalOrderId as string
      const context = await newContext(browser)
      const page = await context.newPage()
      await signIn(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD)
      await page.goto(`/account/orders/${orderId}`)

      const cancellation = page.getByTestId('cancellation-request')
      await expect(cancellation).toBeVisible({ timeout: 15_000 })
      await cancellation.getByRole('button', { name: 'בקשת ביטול או החזר על ההזמנה' }).click()
      await cancellation.getByLabel('הסיבה').selectOption('changed_mind')

      // The fee is min(5%, ₪100) of ₪100: 500 agorot, integer, refund 9,500.
      const preview = page.getByTestId('cancellation-fee-preview')
      await expect(preview).toHaveAttribute('data-fee-agorot', '500')
      await expect(preview).toHaveAttribute('data-refund-agorot', '9500')

      await cancellation.getByLabel('פירוט').fill('בדיקת S27: התחרטתי על ההזמנה')
      await cancellation.getByRole('button', { name: 'שליחת הבקשה' }).click()
      await expect(cancellation.getByText('הבקשה נשלחה. נבדוק אותה ונחזור אליכם.')).toBeVisible({
        timeout: 20_000,
      })

      const requests = await serviceGet<{ reason_code: string; status: string }>(
        `refund_requests?select=reason_code,status&order_id=eq.${orderId}`,
      )
      expect(requests).toHaveLength(1)
      expect(requests[0]?.reason_code).toBe('changed_mind')
      await context.close()
    })

    test('5. the supplier redeems the guest coupon from journey 1', async ({ browser }) => {
      test.skip(!shared.guestVoucherCode, 'journey 1 did not produce a code')
      const context = await newContext(browser)
      const page = await context.newPage()
      await signIn(page, E2E_SUPPLIER_EMAIL, E2E_SUPPLIER_PASSWORD, '/supplier/scan')
      await page.goto('/supplier/scan')
      await expect(page.getByRole('heading', { name: 'סריקת שובר' })).toBeVisible({
        timeout: 15_000,
      })
      await expectHebrewRtl(page)

      await page.getByLabel('הקלדת קוד ידנית').fill(shared.guestVoucherCode as string)
      await page.getByRole('button', { name: 'בדוק שובר' }).click()
      const confirm = page.getByRole('button', { name: /אשר ומַמֵש|אשר וממש/ })
      await expect(confirm).toBeVisible({ timeout: 15_000 })
      await confirm.click()
      await expect(page.getByText('השובר מומש בהצלחה')).toBeVisible({ timeout: 20_000 })

      const vouchers = await readVouchers(shared.guestOrderId as string)
      expect(vouchers[0]?.status).toBe('redeemed')
      await context.close()
    })
  })
