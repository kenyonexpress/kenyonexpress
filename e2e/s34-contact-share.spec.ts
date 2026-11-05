import { type Page, expect, test } from '@playwright/test'
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

/**
 * S34: contact and share, measured in a browser.
 *
 * Every assertion reads the wa.me address the customer would actually open
 * and decodes its text, because "a WhatsApp button is visible" passes on a
 * link with the wrong number, an empty message or a message that does not say
 * which product or order it is about.
 *
 * NOTHING HERE OPENS WHATSAPP. `window.open` is replaced before the page's
 * scripts run and records its argument; anchors are read, not clicked. A test
 * run that navigated to wa.me would measure somebody else's server.
 */
const WA_CHAT = /^https:\/\/wa\.me\/\d{10,15}\?text=/
const PDP = '/product/barbecue'

const FIVE = [
  'customer_service',
  'suggestions',
  'business_partnerships',
  'site_problem',
  'supplier_join',
] as const

function textOf(href: string): string {
  return new URL(href).searchParams.get('text') ?? ''
}

async function decideConsent(page: Page, baseURL: string | undefined): Promise<void> {
  // The consent banner sits over the bottom of a phone viewport and would
  // receive the clicks meant for the share row.
  await page.context().addCookies([
    {
      name: CONSENT_COOKIE,
      value: serializeConsent({ decision: 'denied', wordingVersion: CONSENT_WORDING_VERSION }),
      domain: new URL(baseURL as string).hostname,
      path: '/',
    },
  ])
}

/** Record window.open instead of opening; optionally plant or remove navigator.share. */
async function instrument(page: Page, nativeShare: 'present' | 'absent'): Promise<void> {
  await page.addInitScript((mode) => {
    const w = window as unknown as { __opened: string[]; __shared: unknown[] }
    w.__opened = []
    w.__shared = []
    window.open = ((url?: string | URL) => {
      w.__opened.push(String(url))
      return null
    }) as typeof window.open
    if (mode === 'present') {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data: unknown) => {
          w.__shared.push(data)
        },
      })
    } else {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
    }
  }, nativeShare)
}

test.describe('S34 /contact', () => {
  test('shows the five channels at once, each a wa.me link with its own Hebrew opener', async ({
    page,
  }) => {
    await page.goto('/contact')
    const links = page.getByTestId('contact-channel-list').getByTestId('contact-channel-link')
    await expect(links).toHaveCount(5)
    for (let i = 0; i < 5; i++) await expect(links.nth(i)).toBeVisible()

    const rows = await links.evaluateAll((els) =>
      els.map((el) => ({
        key: el.getAttribute('data-channel') ?? '',
        href: el.getAttribute('href') ?? '',
        target: el.getAttribute('target'),
        rel: el.getAttribute('rel'),
      })),
    )
    expect(rows.map((row) => row.key)).toEqual([...FIVE])
    for (const row of rows) {
      expect(row.href).toMatch(WA_CHAT)
      expect(textOf(row.href)).toMatch(/[֐-׿]{2,}/)
      expect(row.target).toBe('_blank')
      expect(row.rel).toBe('noopener noreferrer')
    }
    // Five different sentences to one number unless an operator set another.
    expect(new Set(rows.map((row) => textOf(row.href))).size).toBe(5)
    const texts = rows.map((row) => textOf(row.href))
    expect(texts[0]).toContain('שירות הלקוחות')
    expect(texts[1]).toContain('הצעה')
    expect(texts[2]).toContain('שיתוף פעולה')
    expect(texts[3]).toContain('תקלה')
    expect(texts[4]).toContain('להצטרף')

    // The email form is still on the page: WhatsApp is not the only way in.
    await expect(page.getByRole('button', { name: /שליחה|שלח/ })).toBeVisible()
    await expect(page.locator('main main')).toHaveCount(0)
  })

  test('the cards fit a phone without a sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 800 })
    await page.goto('/contact')
    await expect(page.getByTestId('contact-channel-link')).toHaveCount(5)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
    for (const box of await page
      .getByTestId('contact-channel-link')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) {
      expect(box).toBeGreaterThanOrEqual(44)
    }
  })
})

test.describe('S34 product share row', () => {
  test('WhatsApp first, then share, then copy link', async ({ page, baseURL }) => {
    await decideConsent(page, baseURL)
    await page.goto(PDP)
    const wa = page.getByRole('button', { name: 'שתפו בוואטסאפ' })
    const share = page.getByRole('button', { name: 'שיתוף', exact: true })
    const copy = page.getByRole('button', { name: 'העתקת קישור' })
    await expect(wa).toBeVisible()
    await expect(share).toBeVisible()
    await expect(copy).toBeVisible()
    // Document order is reading order: WhatsApp is the first of the three.
    const order = await page.evaluate(() => {
      const names = ['שתפו בוואטסאפ', 'שיתוף', 'העתקת קישור']
      const buttons = [...document.querySelectorAll('button')]
      const found = names.map((name) =>
        buttons.find((b) => (b.textContent ?? '').trim() === name),
      ) as HTMLButtonElement[]
      return found.map((b, i) =>
        i === 0
          ? true
          : Boolean(
              (found[i - 1] as HTMLButtonElement).compareDocumentPosition(b) &
                Node.DOCUMENT_POSITION_FOLLOWING,
            ),
      )
    })
    expect(order).toEqual([true, true, true])
  })

  test('the WhatsApp button opens wa.me with the product name and this page address', async ({
    page,
    baseURL,
  }) => {
    await decideConsent(page, baseURL)
    await instrument(page, 'absent')
    await page.goto(PDP)
    const heading = (await page.getByRole('heading', { level: 1 }).innerText()).trim()
    await page.getByRole('button', { name: 'שתפו בוואטסאפ' }).click()
    const opened = await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened)
    expect(opened).toHaveLength(1)
    // Share, not chat: no number, the customer picks the recipient.
    const target = opened[0] as string
    expect(target).toMatch(/^https:\/\/wa\.me\/\?text=/)
    const text = textOf(target)
    expect(text).toContain(heading)
    expect(text.split('\n').at(-1)).toBe(page.url())
    // The address once, not twice (the old builder baked it into the text too).
    expect(text.split(page.url())).toHaveLength(2)
  })

  test('the share button hands the platform sheet the same text and address', async ({
    page,
    baseURL,
  }) => {
    await decideConsent(page, baseURL)
    await instrument(page, 'present')
    await page.goto(PDP)
    const heading = (await page.getByRole('heading', { level: 1 }).innerText()).trim()
    await page.getByRole('button', { name: 'שיתוף', exact: true }).click()
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared))
      .toHaveLength(1)
    const shared = (
      (await page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared)) as {
        title: string
        text: string
        url: string
      }[]
    )[0] as { title: string; text: string; url: string }
    expect(shared.url).toBe(page.url())
    expect(shared.text).toContain(heading)
    // The sheet took it: the picklist of named channels stays closed.
    await expect(page.getByRole('link', { name: 'שיתוף במייל' })).toHaveCount(0)
  })

  test('with no platform sheet the share button names the channels instead', async ({
    page,
    baseURL,
  }) => {
    await decideConsent(page, baseURL)
    await instrument(page, 'absent')
    await page.goto(PDP)
    await expect(page.getByRole('link', { name: 'שיתוף במייל' })).toHaveCount(0)
    await page.getByRole('button', { name: 'שיתוף', exact: true }).click()
    const mail = page.getByRole('link', { name: 'שיתוף במייל' })
    await expect(mail).toBeVisible()
    expect(decodeURIComponent((await mail.getAttribute('href')) ?? '')).toContain(page.url())
    await expect(page.getByRole('button', { name: 'שיתוף בטלגרם' })).toBeVisible()
  })

  test('copy link puts this page address on the clipboard and says so', async ({
    page,
    baseURL,
    context,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions are a Chromium grant')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await decideConsent(page, baseURL)
    await page.goto(PDP)
    // The toaster loads after hydration (DeferredStoreChrome); a click before
    // it mounts has nowhere to show the confirmation.
    await expect(page.locator('section[aria-live="polite"]')).toHaveCount(1)
    await page.getByRole('button', { name: 'העתקת קישור' }).click()
    await expect(page.getByText('הקישור הועתק').first()).toBeVisible()
    // Once. This group mounted two toasters and every toast rendered twice.
    await expect(page.getByText('הקישור הועתק')).toHaveCount(1)
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url())
  })
})

test.describe('S34 ask about a product', () => {
  test('the question link is a wa.me chat naming the product and the page, and says who answers', async ({
    page,
  }) => {
    await page.goto(PDP)
    const heading = (await page.getByRole('heading', { level: 1 }).innerText()).trim()
    const block = page.getByTestId('product-question')
    const link = block.getByTestId('product-question-link')
    await expect(link).toHaveAttribute('href', WA_CHAT)
    // The address is appended after mount.
    await expect
      .poll(async () => textOf((await link.getAttribute('href')) ?? 'https://wa.me/0'))
      .toContain(page.url())
    const text = textOf((await link.getAttribute('href')) as string)
    expect(text).toContain(heading)
    const via = await block.getAttribute('data-via')
    expect(['supplier', 'customer_service']).toContain(via)
    await expect(block.getByTestId('product-question-note')).toContainText(
      via === 'supplier' ? 'ישירות לבית העסק' : 'שירות הלקוחות',
    )
    await expect(link).toHaveAttribute('target', '_blank')
  })

  test('the supplier block asks the same destination as the question link', async ({ page }) => {
    await page.goto(PDP)
    const ask = page.getByTestId('ask-business').first()
    test.skip((await ask.count()) === 0, 'this product renders no supplier block')
    await expect(ask).toHaveAttribute('href', WA_CHAT)
    const question = page.getByTestId('product-question')
    expect(await ask.getAttribute('data-via')).toBe(await question.getAttribute('data-via'))
    const number = (href: string | null) => new URL(href ?? '').pathname
    expect(number(await ask.getAttribute('href'))).toBe(
      number(await question.getByTestId('product-question-link').getAttribute('href')),
    )
  })
})

test.describe('S34 order contact', () => {
  test.skip(!paidFlowEnabled(), 'E2E_PAID_FLOW=0 or no customer fixture')

  test('the order page opens a chat that already names the order, the items and the amount', async ({
    page,
  }) => {
    await signInWithEmail(page, E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD, '/account/orders')
    // The list streams in behind the account frame; count() does not wait.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const first = page.locator('a[href^="/account/orders/"]').first()
    await first.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
    test.skip((await first.count()) === 0, 'the E2E customer has no orders yet')
    const href = (await first.getAttribute('href')) as string
    const orderId = href.split('/').at(-1) as string
    await page.goto(href)

    const link = page.getByTestId('order-contact-link')
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', WA_CHAT)
    await expect(link).toHaveAttribute('target', '_blank')
    const lines = textOf((await link.getAttribute('href')) as string).split('\n')
    expect(lines[0]).toContain(orderId.slice(0, 8).toUpperCase())
    // The full id never leaves the account: eight characters are enough for
    // support to find the order and too few to be the key to it.
    expect(lines.join('\n')).not.toContain(orderId)
    expect(lines.some((line) => line.startsWith('פריטים: '))).toBe(true)
    const paid = lines.find((line) => line.startsWith('סכום ששולם באתר: '))
    // `shekels()` output: digits, two agorot places, the sign, inside a
    // left-to-right isolate so the number does not flip in a Hebrew line.
    if (paid) expect(paid).toMatch(/\d[\d,]*\.\d{2}\s₪/)
  })
})
