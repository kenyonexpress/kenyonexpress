import { expect, test } from '@playwright/test'

/**
 * UX13 (14.10.2026): THE SITE FOOTER'S SHAPE, read off the rendered page.
 * Measured before (logs/ux13/before.json): three columns at 1440, two closed
 * accordion rows below lg with eleven links under the first, four TEXT
 * payment badges on the desktop bar only, and a Telegram icon linking `#`.
 *
 * Now: four columns side by side from lg (contact, service, policies,
 * account), three closed `<details>` rows below it that open on a tap, the
 * payment marks drawn as images on both the desktop copyright bar and the
 * handheld dark bar, and every social icon a real external profile.
 */

type Page = import('@playwright/test').Page

async function preset(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
  })
}

test.describe('site footer (UX13)', () => {
  test.beforeEach(async ({ page }) => {
    await preset(page)
    await page.goto('/')
    await page.locator('footer').last().scrollIntoViewIfNeeded()
  })

  test('four columns from lg, three closed rows below it', async ({ page, isMobile }) => {
    const footer = page.locator('footer').last()
    const rows = footer.locator('details')
    await expect(rows).toHaveCount(3)
    await expect(rows.locator('summary')).toHaveText([
      'שירות לקוחות',
      'מדיניות ותקנון',
      'אזור אישי',
    ])
    for (const row of await rows.all()) await expect(row).not.toHaveAttribute('open', '')

    const grid = footer.locator('[data-footer-columns]')
    const columns = await grid.evaluate((el) =>
      [...el.children]
        .map((c) => c.getBoundingClientRect())
        .filter((b) => b.width > 0 && b.height > 0)
        .map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width) })),
    )
    if (isMobile) {
      // the three rows stack; the contact column is desktop-only
      expect(columns).toHaveLength(3)
      expect(new Set(columns.map((c) => c.x)).size).toBe(1)
      return
    }
    // four columns on one row, each in its own horizontal band
    expect(columns).toHaveLength(4)
    // and the links under the headings PAINT. Before UX13 they had a layout
    // box and no paint in Chromium 131+ (content-visibility on a closed
    // <details>), so a bounding-box check passed over two empty columns.
    const painted = await rows
      .locator('a')
      .evaluateAll((links) =>
        links.map((a) =>
          a.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true }),
        ),
      )
    expect(painted).toHaveLength(14)
    expect(painted.every(Boolean)).toBe(true)
    expect(new Set(columns.map((c) => c.y)).size).toBe(1)
    expect(new Set(columns.map((c) => c.x)).size).toBe(4)
    // RTL: the contact column (DOM first, the widest) sits furthest to the right
    const widest = columns.reduce((a, b) => (b.w > a.w ? b : a))
    expect(widest.x).toBe(Math.max(...columns.map((c) => c.x)))
  })

  test('a row opens on a tap and shows its links', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'from lg the rows are plain columns; the summary takes no pointer')
    const footer = page.locator('footer').last()
    const policies = footer.locator('details').nth(1)
    const links = policies.locator('a')
    await expect(links.first()).toBeHidden()
    await policies.locator('summary').click()
    await expect(policies).toHaveAttribute('open', '')
    await expect(links).toHaveCount(6)
    await expect(links.first()).toBeVisible()
    await expect(links.first()).toHaveAttribute('href', '/terms-and-conditions')
  })

  test('payment marks are images on the bar the viewport shows', async ({ page }) => {
    const footer = page.locator('footer').last()
    const lists = footer.locator('[aria-label="אמצעי תשלום"]')
    await expect(lists).toHaveCount(2)
    const visible = []
    for (const list of await lists.all()) if (await list.isVisible()) visible.push(list)
    const shown = visible[0]
    if (!shown || visible.length !== 1)
      throw new Error(`expected one visible payment list, got ${visible.length}`)
    const marks = shown.getByRole('img')
    await expect(marks).toHaveCount(5)
    await expect(marks.first()).toHaveAttribute('aria-label', 'ויזה')
    // the scheme colour resolves: a token class that matched nothing paints black
    const visaFill = await marks
      .first()
      .locator('text')
      .evaluate((el) => getComputedStyle(el).fill)
    expect(visaFill).not.toBe('rgb(0, 0, 0)')
    const mastercardFill = await marks
      .nth(1)
      .locator('circle')
      .first()
      .evaluate((el) => getComputedStyle(el).fill)
    expect(mastercardFill).not.toBe('rgb(0, 0, 0)')
  })

  test('every social icon is a real external profile', async ({ page }) => {
    const nav = page.locator('footer').last().getByRole('navigation', { name: 'רשתות חברתיות' })
    const links = nav.getByRole('link')
    await expect(links).toHaveCount(5)
    for (const link of await links.all()) {
      await expect(link).toHaveAttribute('href', /^https:\/\//)
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
    await expect(page.locator('footer a[href="#"]')).toHaveCount(0)
  })
})
