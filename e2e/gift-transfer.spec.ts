import fs from 'node:fs'
import path from 'node:path'
import { type Browser, type BrowserContext, type Page, expect, test } from '@playwright/test'
import {
  E2E_COUPON_SLUG,
  E2E_CUSTOMER_EMAIL,
  E2E_CUSTOMER_PASSWORD,
  E2E_SUPPLIER_EMAIL,
  E2E_SUPPLIER_PASSWORD,
  paidFlowEnabled,
  signInWithEmail,
} from './auth-session'
import { BUY_BUTTON, emptyCart, expectHebrewRtl, walkCheckoutToPayment } from './helpers'

/**
 * Gifting a coupon, and sending one on after the fact.
 *
 * Two flows, one mechanism (docs/VOUCHER-LIFECYCLE.md §7):
 *
 *   checkout gift   buyer ticks "מתנה" at /checkout, pays through the Cardcom
 *                   mock, and the confirmation AND the order page show where
 *                   the coupon went instead of its code. The recipient opens
 *                   the claim link, signs in, and the coupon is theirs.
 *   transfer        the owner sends a coupon they already hold from
 *                   /account/coupons/[id]/gift, sees it held, and takes it back.
 *
 * Requires the same fixtures as full-purchase-redeem.spec.ts
 * (scripts/seed-test-data.mjs, CARDCOM_USE_MOCK=true). Skip with
 * E2E_PAID_FLOW=0.
 *
 * THE CLAIM LINK IS IN AN EMAIL AND NOWHERE ELSE, by design: the raw token is
 * written once, into the service-role-only `notification_outbox` row. So the
 * claim leg reads that row through PostgREST with the service key from the
 * environment or `.env.local`, exactly as search.spec.ts reads the anon side.
 * Without a service key the claim leg is skipped and says so; the two UI
 * flows still run.
 */

const RECIPIENT_NAME = 'רון'

function serviceEnv(): { url: string; key: string } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL
  let key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    try {
      const raw = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
      // The quotes are part of the captured value and must go: a quoted URL
      // reads `"https://x.supabase.co"/rest/v1/...` and answers 404.
      const read = (name: string) =>
        new RegExp(`^${name}=(.+)$`, 'm')
          .exec(raw)?.[1]
          ?.trim()
          .replace(/^["']|["']$/g, '') ?? undefined
      url = url || read('NEXT_PUBLIC_SUPABASE_URL')
      key = key || read('SUPABASE_SECRET_KEY') || read('SUPABASE_SERVICE_ROLE_KEY')
    } catch {
      return null
    }
  }
  if (!url || !key || key === '[SENSITIVE]' || key.length < 20) return null
  return { url: url.replace(/\/$/, ''), key }
}

/**
 * Node's own fetch, not the Playwright `request` fixture: the fixture carries
 * the suite's baseURL and extra headers, which belong to the app under test
 * and not to PostgREST.
 */
async function serviceGet<T>(pathAndQuery: string): Promise<T[]> {
  const env = serviceEnv()
  if (!env) return []
  const response = await fetch(`${env.url}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
  })
  if (!response.ok) {
    throw new Error(`PostgREST ${response.status} on ${pathAndQuery.split('?')[0]}`)
  }
  return (await response.json()) as T[]
}

/** The newest claim token queued for an address. Service role only. */
async function latestClaimToken(recipientEmail: string): Promise<string | null> {
  const rows = await serviceGet<{ payload: { claim_token?: string } }>(
    `notification_outbox?select=payload&kind=eq.voucher_gifted&recipient_email=eq.${encodeURIComponent(
      recipientEmail,
    )}&order=created_at.desc&limit=1`,
  )
  return rows[0]?.payload?.claim_token ?? null
}

/** `metadata.source` of every audit row written for one voucher, oldest first. */
async function auditSources(voucherId: string): Promise<string[]> {
  const rows = await serviceGet<{ metadata: { source?: string } }>(
    `audit_log?select=metadata&entity_type=eq.voucher&entity_id=eq.${voucherId}&order=created_at.asc`,
  )
  return rows.map((row) => row.metadata?.source ?? '')
}

/**
 * Buys the fixture coupon through the mock and lands on the confirmation.
 * Returns the order id from the return URL. With `gift` set, fills the gift
 * block on the step that carries it.
 */
async function buyFixtureCoupon(
  page: Page,
  gift?: { email: string; name: string; message: string },
): Promise<string> {
  await emptyCart(page)
  await page.goto(`/product/${E2E_COUPON_SLUG}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })
  const buy = page.getByRole('button', { name: BUY_BUTTON }).first()
  test.skip(!(await buy.isVisible().catch(() => false)), 'e2e-test-coupon is not purchasable')
  test.skip(await buy.isDisabled(), 'e2e-test-coupon is out of stock')
  await buy.click()
  await expect(page.getByRole('button', { name: /נוסף לסל/ }).first()).toBeVisible()

  await page.goto('/checkout')
  await walkCheckoutToPayment(page, E2E_CUSTOMER_EMAIL, {
    onStep: async (p) => {
      if (!gift) return
      const box = p.locator('input[name="gift"]')
      if (!(await box.isVisible().catch(() => false))) return
      if (!(await box.isChecked())) await box.check()
      await p.locator('#co-gift-email').fill(gift.email)
      await p.locator('#co-gift-name').fill(gift.name)
      await p.locator('#co-gift-message').fill(gift.message)
      // Left empty on purpose: empty is "send now", the default every gift had
      // before 226, and the one the outbox drain needs no clock for.
      await expect(p.locator('#co-gift-deliver-at')).toHaveValue('')
    },
  })

  await page.waitForURL(/\/checkout\/return\?.*order_id=/, { timeout: 45_000 })
  await expect(page.getByRole('heading', { name: 'התשלום הצליח!' })).toBeVisible({
    timeout: 45_000,
  })
  const orderId = new URL(page.url()).searchParams.get('order_id')
  if (!orderId) throw new Error('return URL carries no order_id')
  return orderId
}

/**
 * A Hebrew, Israel-time context with WebAuthn switched off.
 *
 * The passkey nudge (`PasskeyRegisterPrompt`) opens over the account pages
 * after a sign-in wherever `browserSupportsWebAuthn()` is true, and its overlay
 * swallows every click under it. Headless Chromium reports support, so the
 * prompt is what a transfer click lands on. Removing `PublicKeyCredential`
 * before any script runs is how a real browser without passkeys looks, and
 * the prompt then never opens; `dismissPasskeyPrompt` below stays as the
 * fallback for a page that rendered it anyway.
 */
async function newHebrewContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
  await context.addInitScript(() => {
    Object.defineProperty(window, 'PublicKeyCredential', { value: undefined, configurable: true })
  })
  return context
}

/** Clicks the nudge away if it is on screen. Remembered in localStorage per user. */
async function dismissPasskeyPrompt(page: Page): Promise<void> {
  const notNow = page.getByRole('button', { name: 'לא עכשיו' })
  await notNow.waitFor({ timeout: 4_000 }).catch(() => undefined)
  if (await notNow.isVisible().catch(() => false)) await notNow.click()
}

/** Takes back every pending gift on the account, so a run starts clean. */
async function revokeAllPending(page: Page): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await page.goto('/account/coupons')
    const manage = page.getByTestId('coupon-row-gift-manage').first()
    if (!(await manage.isVisible().catch(() => false))) return
    await manage.click()
    await page.waitForURL(/\/account\/coupons\/[0-9a-f-]+\/gift$/)
    const revoke = page.getByTestId('gift-transfer-revoke')
    if (!(await revoke.isVisible().catch(() => false))) return
    await revoke.click()
    await page.waitForURL(/\/account\/coupons$/, { timeout: 15_000 })
  }
}

test.describe('gift claim page hygiene', () => {
  test('a malformed token and an unknown one render not-found, never a claim button', async ({
    page,
  }) => {
    // The shell streams before the lookup under `cacheComponents`, so the
    // status line is a 200 and `notFound()` can only change the body (the
    // same shape /coupons/[id] had before its read moved behind `use cache`;
    // a claim-token lookup must not be cached, so the body is what is pinned).
    // What must hold: the not-found heading, and no way into a claim.
    for (const token of ['short', 'A'.repeat(43)]) {
      await page.goto(`/gift/${token}`)
      await expect(page.getByRole('heading', { name: 'הדף שחיפשתם לא נמצא' })).toBeVisible({
        timeout: 15_000,
      })
      await expect(page.getByRole('link', { name: 'התחברות וקבלת הקופון' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'קבלת הקופון לחשבון שלי' })).toHaveCount(0)
    }
  })
})

test.describe('gift and transfer @checkout @gift @money', () => {
  test.describe.configure({ timeout: 180_000 })

  test.beforeEach(() => {
    test.skip(!paidFlowEnabled(), 'paid flow credentials disabled (E2E_PAID_FLOW=0)')
  })

  test('checkout gift: held on the confirmation and the order, then claimed by the recipient', async ({
    browser,
  }) => {
    const buyer = await newHebrewContext(browser)
    const page = await buyer.newPage()
    await signInWithEmail(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD)
    await dismissPasskeyPrompt(page)

    const orderId = await buyFixtureCoupon(page, {
      email: E2E_SUPPLIER_EMAIL,
      name: RECIPIENT_NAME,
      message: 'מזל טוב, תיהנו',
    })

    // The confirmation says where the coupon went. No code, no QR: the buyer
    // promised it to somebody else and must not be able to present it.
    await expectHebrewRtl(page)
    await expect(page.getByText(new RegExp(`הקופון נשלח אל ${RECIPIENT_NAME}`))).toBeVisible()
    await expect(page.getByTestId('coupon-qr')).toHaveCount(0)

    // The order page, the fifth surface that prints a code, applies the same
    // rule and offers the gift's management page rather than a QR.
    await page.goto(`/account/orders/${orderId}`)
    await expect(page.getByRole('heading', { name: /הזמנה מתאריך/ })).toBeVisible({
      timeout: 15_000,
    })
    const held = page.getByTestId('order-voucher-gift')
    await expect(held).toHaveCount(1)
    await expect(held.getByText(new RegExp(`הקופון נשלח אל ${RECIPIENT_NAME}`))).toBeVisible()
    await expect(held.locator('img')).toHaveCount(0)
    await expect(held.locator('.coupon-card__code')).toHaveCount(0)
    const manage = page.getByTestId('order-voucher-gift-manage')
    await expect(manage).toBeVisible()
    const voucherId = /\/account\/coupons\/([0-9a-f-]+)\/gift/.exec(
      (await manage.getAttribute('href')) ?? '',
    )?.[1]
    expect(voucherId).toBeTruthy()
    await buyer.close()

    // The claim. The link lives in the outbox row, service role only.
    if (!serviceEnv()) {
      test.info().annotations.push({
        type: 'skipped-leg',
        description: 'no service key in env or .env.local; claim leg not exercised',
      })
      return
    }
    // With a key the row MUST be there: `sendOrderGifts` queued it at finalize.
    const token = await latestClaimToken(E2E_SUPPLIER_EMAIL)
    expect(token, 'voucher_gifted outbox row for the recipient').toBeTruthy()
    if (!token) return

    const recipient = await newHebrewContext(browser)
    const claim = await recipient.newPage()
    // Signed out, the page shows the gift and asks for a login, never the
    // button: ownership moves on a deliberate click by a signed-in person.
    await claim.goto(`/gift/${token}`)
    await expect(claim.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })
    await expect(claim.getByText('מזל טוב, תיהנו')).toBeVisible()
    await expect(claim.getByRole('link', { name: 'התחברות וקבלת הקופון' })).toBeVisible()
    await expect(claim.getByRole('button', { name: 'קבלת הקופון לחשבון שלי' })).toHaveCount(0)

    await signInWithEmail(claim, E2E_SUPPLIER_EMAIL, E2E_SUPPLIER_PASSWORD, `/gift/${token}`)
    await dismissPasskeyPrompt(claim)
    await claim.goto(`/gift/${token}`)
    await claim.getByRole('button', { name: 'קבלת הקופון לחשבון שלי' }).click()
    await claim.waitForURL(/\/account\/coupons$/, { timeout: 20_000 })
    await expect(claim.getByText('קופון בדיקות אוטומטיות').first()).toBeVisible({
      timeout: 15_000,
    })

    // The same link a second time is a bookmark for the claimant, and "already
    // collected" for anyone else; never a second transfer.
    await claim.goto(`/gift/${token}`)
    await expect(claim.getByText(/המתנה כבר נאספה/)).toBeVisible()
    await recipient.close()

    // The change of hands is on the record.
    if (voucherId) {
      expect(await auditSources(voucherId)).toContain('gift_claim')
    }
  })

  test('transfer from the account: the coupon is held, then taken back', async ({ browser }) => {
    const owner = await newHebrewContext(browser)
    const page = await owner.newPage()
    await signInWithEmail(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD)
    await dismissPasskeyPrompt(page)
    await revokeAllPending(page)

    // A coupon that can go. The previous test gave its coupon away, so this one
    // buys its own when the account holds none it can still present.
    await page.goto('/account/coupons')
    if (
      !(await page
        .getByTestId('coupon-row-gift-transfer')
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      await buyFixtureCoupon(page)
      await page.goto('/account/coupons')
    }
    const cta = page.getByTestId('coupon-row-gift-transfer').first()
    await expect(cta).toBeVisible({ timeout: 15_000 })
    await cta.click()
    await page.waitForURL(/\/account\/coupons\/[0-9a-f-]+\/gift$/)
    const voucherId = /\/account\/coupons\/([0-9a-f-]+)\/gift/.exec(page.url())?.[1] ?? ''
    expect(voucherId).toMatch(/^[0-9a-f-]{36}$/)
    await expectHebrewRtl(page)

    // The form: email required, name and greeting optional.
    const form = page.getByTestId('gift-transfer-form')
    await expect(form).toBeVisible()
    await form.locator('input[name="recipientEmail"]').fill(E2E_SUPPLIER_EMAIL)
    await form.locator('input[name="recipientName"]').fill(RECIPIENT_NAME)
    await form.locator('textarea[name="message"]').fill('בשבילך')
    await form.getByRole('button', { name: 'שליחת הקופון במתנה' }).click()
    await page.waitForURL(/\/account\/coupons$/, { timeout: 20_000 })

    // Held: the list shows the recipient instead of the code, and the only
    // action on the coupon's page is taking it back.
    await expect(
      page.getByText(new RegExp(`הקופון נשלח אל ${RECIPIENT_NAME}`)).first(),
    ).toBeVisible({
      timeout: 15_000,
    })
    const manage = page.locator(
      `a[data-testid="coupon-row-gift-manage"][href="/account/coupons/${voucherId}/gift"]`,
    )
    await expect(manage).toBeVisible()
    await manage.click()
    await page.waitForURL(new RegExp(`/account/coupons/${voucherId}/gift$`))
    await expect(page.getByText('הקופון נשלח וממתין לאיסוף')).toBeVisible()
    await expect(page.getByTestId('gift-transfer-form')).toHaveCount(0)

    // Revoke: the link dies, the code comes back, the coupon can be sent again.
    await page.getByTestId('gift-transfer-revoke').click()
    await page.waitForURL(/\/account\/coupons$/, { timeout: 20_000 })
    await expect(
      page.locator(
        `a[data-testid="coupon-row-gift-transfer"][href="/account/coupons/${voucherId}/gift"]`,
      ),
    ).toBeVisible({ timeout: 15_000 })
    await owner.close()

    // Both transitions are on the record, in order. Service role only.
    if (!serviceEnv()) {
      test.info().annotations.push({
        type: 'skipped-leg',
        description: 'no service key in env or .env.local; audit rows not read',
      })
      return
    }
    const sources = await auditSources(voucherId)
    const transfer = sources.lastIndexOf('voucher_transfer')
    const revoke = sources.lastIndexOf('voucher_transfer_revoke')
    expect(transfer).toBeGreaterThanOrEqual(0)
    expect(revoke).toBeGreaterThan(transfer)
  })
})
