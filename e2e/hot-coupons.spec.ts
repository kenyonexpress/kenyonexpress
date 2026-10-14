import { expect, test } from '@playwright/test'

/**
 * UX10 (14.10.2026): THE HOT COUPONS SECTION, read off the rendered page.
 * Before (logs/ux10/before.json, the build of HEAD at 380 / 768 / 1440): the
 * card was one `<a>` with a 128px grey image band (no deal has a photograph),
 * a 25px-radius yellow "90% הנחה" chip on it, two 159px columns on a phone
 * and four 158px columns at 768, and two different card heights at 380. Now:
 *
 *   grid     1 / 2 / 4 columns at 380 / 768 / 1440 (the deals grid's own
 *            switches), one row height
 *   ticket   an <article>: a 72px brand-yellow stub carrying the percentage
 *            over "הנחה", a dashed perforation on its inline-end edge with an
 *            18px notch bitten out of each end, 12px corners
 *   links    the title is the link to the deal; the card is not a link
 *   footer   a countdown pill when the row has a `valid_until`, and either
 *            the copy-code button (a row with a `code`, pending 270) or a
 *            "לפרטי הקופון" link, each at least 44px tall
 *
 * Structural assertions, no screenshots. The section depends on the
 * catalogue, so a catalogue with no coupon deal skips rather than fails, and
 * the two data-dependent affordances are asserted whenever a card has them
 * and skipped when none does (today: none, measured 14.10).
 */

const TOKENS = {
  yellow: 'rgb(254, 215, 0)',
  heading: 'rgb(51, 62, 72)',
  cardRadius: '12px',
  stubWidth: 72,
  notch: 18,
} as const

type Page = import('@playwright/test').Page

async function preset(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
  })
}

const section = (page: Page) => page.locator('section[aria-labelledby="hot-coupons-title"]')
const cards = (page: Page) => section(page).locator('[data-coupon-card]')

test.describe('hot coupons (UX10)', () => {
  test.beforeEach(async ({ page }) => {
    await preset(page)
    await page.goto('/')
    test.skip((await section(page).count()) === 0, 'no coupon deal in this catalogue')
    await section(page).scrollIntoViewIfNeeded()
  })

  test('lays the tickets out 1 / 2 / 4 across at 380 / 768 / 1440, one row height', async ({
    page,
  }) => {
    for (const [width, columns] of [
      [380, 1],
      [768, 2],
      [1440, 4],
    ] as const) {
      await page.setViewportSize({ width, height: 900 })
      await section(page).scrollIntoViewIfNeeded()
      const measured = await cards(page).evaluateAll((els) => {
        const rows = new Map<number, number[]>()
        for (const el of els) {
          const r = el.getBoundingClientRect()
          const y = Math.round(r.y)
          const key = [...rows.keys()].find((k) => Math.abs(k - y) < 2) ?? y
          rows.set(key, [...(rows.get(key) ?? []), +r.height.toFixed(1)])
        }
        return [...rows.values()]
      })
      const count = await cards(page).count()
      for (const row of measured.slice(0, -1))
        expect(row, `${width}: columns`).toHaveLength(columns)
      for (const row of measured) {
        expect(new Set(row).size, `${width}: one height per row, got ${row.join('/')}`).toBe(1)
      }
      expect(measured.flat()).toHaveLength(count)
    }
  })

  test('each ticket is an article with a yellow stub, a dashed perforation and two notches', async ({
    page,
  }) => {
    const count = await cards(page).count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      const card = cards(page).nth(i)
      await expect(card).toHaveJSProperty('tagName', 'ARTICLE')
      const style = await card.evaluate((el) => {
        const s = getComputedStyle(el)
        const stub = el.querySelector('[data-coupon-stub]') as HTMLElement
        const ss = getComputedStyle(stub)
        const before = getComputedStyle(stub, '::before')
        const after = getComputedStyle(stub, '::after')
        return {
          radius: s.borderTopLeftRadius,
          overflow: s.overflow,
          stubWidth: stub.getBoundingClientRect().width,
          stubBg: ss.backgroundColor,
          stubInk: ss.color,
          perforation: ss.borderInlineEndStyle,
          notches: [before.width, after.width, before.borderRadius],
          pct: stub.querySelector('[data-coupon-badge]')?.textContent?.trim() ?? null,
        }
      })
      expect(style.radius).toBe(TOKENS.cardRadius)
      expect(style.overflow).toBe('hidden')
      expect(style.stubWidth).toBe(TOKENS.stubWidth)
      expect(style.stubBg).toBe(TOKENS.yellow)
      expect(style.stubInk).toBe(TOKENS.heading)
      expect(style.perforation).toBe('dashed')
      expect(style.notches).toEqual([`${TOKENS.notch}px`, `${TOKENS.notch}px`, '50%'])
      // The percentage reads as a plain number, no minus to land on the
      // wrong side under RTL.
      if (style.pct !== null) expect(style.pct).toMatch(/^\d{1,3}%$/)
    }
  })

  test('the title links to the deal, the card itself does not, and the footer control is 44px', async ({
    page,
  }) => {
    const count = await cards(page).count()
    for (let i = 0; i < count; i++) {
      const card = cards(page).nth(i)
      const title = card.locator('[data-coupon-title] a')
      await expect(title).toHaveCount(1)
      await expect(title).toHaveAttribute('href', /^\/coupons\/[0-9a-f-]{36}$/)
      expect(await card.evaluate((el) => el.closest('a') !== null)).toBe(false)
      // A copy button for a row with a code, a details link for the rest;
      // exactly one of the two, and never both.
      const copy = card.locator('[data-copy-code]')
      const more = card.locator('[data-coupon-more]')
      expect((await copy.count()) + (await more.count())).toBe(1)
      const control = (await copy.count()) === 1 ? copy : more
      const box = await control.boundingBox()
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    }
  })

  test('a countdown appears only where the row has a deadline, and then it ticks', async ({
    page,
  }) => {
    const count = await cards(page).count()
    let seen = 0
    for (let i = 0; i < count; i++) {
      const card = cards(page).nth(i)
      const pill = card.locator('[data-coupon-countdown]')
      const n = await pill.count()
      if (n === 0) {
        // No deadline, no urgency claim of any kind.
        await expect(card).not.toContainText(/מסתיים|נותרו/)
        continue
      }
      seen += 1
      expect(n).toBe(1)
      const urgency = await pill.getAttribute('data-urgency')
      expect(['none', 'soon', 'today', 'ended']).toContain(urgency)
      if (urgency === 'ended') {
        await expect(pill).toHaveText(/המבצע הסתיים/)
        continue
      }
      await expect(pill).toContainText('מסתיים בעוד')
      const output = pill.locator('output')
      await expect(output).toHaveAttribute('dir', 'ltr')
      await expect(output).toHaveText(/^\d\d:\d\d:\d\d$/)
      const first = await output.textContent()
      await expect(output).not.toHaveText(first ?? '', { timeout: 3000 })
    }
    test.info().annotations.push({ type: 'countdowns', description: String(seen) })
  })

  test('the copy button writes the code to the clipboard and confirms in place', async ({
    page,
    context,
    browserName,
  }) => {
    const copy = section(page).locator('[data-copy-code]')
    test.skip((await copy.count()) === 0, 'no coupon deal with a code (pending migration 270)')
    test.skip(browserName !== 'chromium', 'clipboard permissions are chromium-only')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const first = copy.first()
    const code = (await first.locator('[data-coupon-code]').textContent())?.trim() ?? ''
    expect(code).toMatch(/^[A-Z0-9]{4,16}$/)
    await expect(first.locator('[data-coupon-code]')).toHaveAttribute('dir', 'ltr')
    await first.click()
    await expect(first).toHaveAttribute('data-state', 'copied')
    await expect(first).toContainText('הקוד הועתק')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code)
    await expect(first).toHaveAttribute('data-state', 'idle', { timeout: 4000 })
  })
})
