import { expect, test } from '@playwright/test'

/**
 * UX08 (14.10.2026): THE DEAL OF THE DAY, read off the rendered page. Before
 * (logs/ux08/before.json, the build of HEAD at 380 / 768 / 1440): the
 * countdown was a 14px label beside a separate 4px-radius monospace chip, the
 * percentage was a 25px-radius yellow chip inline in the price row, the CTA
 * was a link to the product page, and the card and the photograph wore the
 * 25px modal radius. Now:
 *
 *   countdown  one brand-yellow full-round pill, 15px/700, at least 36 tall,
 *              label and HH:MM:SS (left to right) inside the same box, in the
 *              heading row
 *   badge      live's deals-card badge: red, white 12/700, 4px corner, pinned
 *              to the inline-end top corner of the photograph, "-NN%"
 *   CTA        a real add-to-cart button in the yellow pill, 44 tall; after
 *              the server accepts, it reads "נוסף לעגלה" with data-added,
 *              turns the sale green, and the mini-cart opens
 *   corners    12px on the card and the photograph
 *
 * Structural assertions only, no screenshots, so there is no baseline to rot.
 * The section depends on the catalogue (the deepest discount with a photo),
 * so a catalogue with no deal skips rather than fails.
 */

const TOKENS = {
  yellow: 'rgb(254, 215, 0)',
  heading: 'rgb(51, 62, 72)',
  badgeRed: 'rgb(238, 0, 0)',
  saleGreen: 'rgb(50, 134, 20)',
  white: 'rgb(255, 255, 255)',
  cardRadius: '12px',
  badgeRadius: '4px',
} as const

type Page = import('@playwright/test').Page

async function preset(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
  })
}

const section = (page: Page) => page.locator('section[aria-labelledby="deal-of-the-day-title"]')

const style = (locator: import('@playwright/test').Locator, props: string[]) =>
  locator.evaluate((el, props) => {
    const s = getComputedStyle(el)
    return Object.fromEntries(props.map((p) => [p, s.getPropertyValue(p)]))
  }, props)

test.describe('deal of the day (UX08)', () => {
  test.beforeEach(async ({ page }) => {
    await preset(page)
    await page.goto('/')
    test.skip((await section(page).count()) === 0, 'no deal in this catalogue')
    await section(page).scrollIntoViewIfNeeded()
  })

  test('the countdown is one yellow pill in the heading row, ticking HH:MM:SS', async ({
    page,
  }) => {
    const pill = section(page).locator('[data-deal-countdown]')
    await expect(pill).toHaveCount(1)
    const output = pill.locator('output')
    await expect(output).toHaveText(/^\d\d:\d\d:\d\d$/)
    await expect(output).toHaveAttribute('dir', 'ltr')
    const first = await output.textContent()
    await expect(output).not.toHaveText(first ?? '', { timeout: 3000 })

    const s = await style(pill, [
      'background-color',
      'color',
      'font-size',
      'font-weight',
      'border-top-left-radius',
      'font-family',
    ])
    expect(s['background-color']).toBe(TOKENS.yellow)
    expect(s.color).toBe(TOKENS.heading)
    expect(s['font-size']).toBe('15px')
    expect(s['font-weight']).toBe('700')
    expect(Number.parseFloat(s['border-top-left-radius'] ?? '')).toBeGreaterThanOrEqual(18)
    expect(s['font-family']).not.toMatch(/mono/i)
    const box = await pill.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(36)

    // Same row as the title where the row is wide enough (768 and 1440); the
    // phone wraps it under the title.
    const title = await section(page).locator('#deal-of-the-day-title').boundingBox()
    const width = page.viewportSize()?.width ?? 0
    if (width >= 768 && title && box) {
      expect(Math.abs(title.y + title.height / 2 - (box.y + box.height / 2))).toBeLessThanOrEqual(2)
    }
  })

  test('the discount badge wears the deals-card shape on the photograph corner', async ({
    page,
  }) => {
    const picture = section(page).locator('a[aria-label$="לעמוד המוצר"]')
    const badge = picture.locator('[data-deal-badge]')
    await expect(badge).toHaveCount(1)
    await expect(badge).toHaveText(/^-\d+%$/)
    // The ltr is on an inner span: `end-0` resolves against the element's own
    // direction, and with the ltr on the badge itself it sat on the RIGHT.
    await expect(badge.locator('span[dir="ltr"]')).toHaveText(/^-\d+%$/)

    const s = await style(badge, [
      'background-color',
      'color',
      'font-size',
      'font-weight',
      'border-top-left-radius',
      'padding-top',
      'padding-left',
    ])
    expect(s['background-color']).toBe(TOKENS.badgeRed)
    expect(s.color).toBe(TOKENS.white)
    expect(s['font-size']).toBe('12px')
    expect(s['font-weight']).toBe('700')
    expect(s['border-top-left-radius']).toBe(TOKENS.badgeRadius)
    expect(s['padding-top']).toBe('2px')
    expect(s['padding-left']).toBe('10px')

    // Inline-end in RTL is the LEFT edge of the photograph, flush with it, at
    // its top: where live's `.p_con__badge` sits on every card above.
    const pb = await picture.boundingBox()
    const bb = await badge.boundingBox()
    expect(pb && bb && Math.abs(bb.x - pb.x)).toBeLessThanOrEqual(1)
    expect(pb && bb && Math.abs(bb.y - pb.y)).toBeLessThanOrEqual(1)

    const corners = await style(picture, ['border-top-left-radius', 'overflow'])
    expect(corners['border-top-left-radius']).toBe(TOKENS.cardRadius)
    expect(corners.overflow).toBe('hidden')
    const card = await style(section(page).locator('[data-deal-of-the-day]'), [
      'border-top-left-radius',
    ])
    expect(card['border-top-left-radius']).toBe(TOKENS.cardRadius)
  })

  test('the CTA adds to the cart and confirms in place', async ({ page }) => {
    const scope = section(page)
    await expect(scope.getByRole('link', { name: 'לרכישה' })).toHaveCount(0)
    const cta = scope.getByRole('button', { name: 'הוסף לעגלה' })
    await expect(cta).toBeVisible()
    await expect(cta).toBeEnabled()
    const rest = await style(cta, ['background-color', 'color', 'min-height'])
    expect(rest['background-color']).toBe(TOKENS.yellow)
    expect(rest.color).toBe(TOKENS.heading)
    expect(Number.parseFloat(rest['min-height'] ?? '')).toBeGreaterThanOrEqual(44)
    const box = await cta.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)

    await expect(page.locator('dialog.cart-drawer[open]')).toHaveCount(0)
    await cta.click()
    // The button is the same element throughout: it reads the confirmation
    // after the server accepted, not after the click.
    const added = scope.locator('button[data-added]')
    await expect(added).toHaveCount(1, { timeout: 15_000 })
    await expect(added).toHaveText(/נוסף לעגלה/)
    await expect(added).toHaveClass(/deal-cta--added/)
    const confirmed = await style(added, ['background-color', 'color'])
    expect(confirmed['background-color']).toBe(TOKENS.saleGreen)
    expect(confirmed.color).toBe(TOKENS.white)
    // The store opens the cart drawer on every accepted add (CartDrawer mounts
    // only while `drawerOpen`); this add is no exception.
    await expect(page.locator('dialog.cart-drawer[open]')).toHaveCount(1)
    // And it reverts, so a second add does not look ignored.
    await expect(scope.locator('button[data-added]')).toHaveCount(0, { timeout: 5000 })
    await expect(cta).toHaveText(/הוסף לעגלה/)
  })
})
