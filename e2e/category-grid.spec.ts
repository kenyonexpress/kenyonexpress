import { expect, test } from '@playwright/test'

/**
 * UX07 (14.10.2026): THE CATEGORY TILE GRID UNDER THE DEALS, read off the
 * rendered page. Before (logs/ux07/before.json, the build of HEAD at 380 /
 * 768 / 1440): every card had a 25px corner (`rounded-lg` is this theme's
 * modal radius), the hover shadow was Tailwind's stock two-layer `shadow-md`,
 * and five of the thirteen live departments had no photograph. Now:
 *
 *   corner    12px (--radius-elevated), the card and the photograph's box
 *   rest      no shadow; a 1px rule
 *   hover     --shadow-card-hover, 0 4px 16px rgba(0,0,0,.12), the one Electro
 *             hover shadow; the photograph scales to 1.05 inside its box
 *   picture   a real <img> that painted (naturalWidth > 0) on every tile
 *   label     the department's Hebrew with no emoji
 *   grid      two columns on a phone, four from 768
 *
 * Structural assertions only, no screenshots, so there is no baseline to rot.
 * Hover is asserted on the desktop project only: Tailwind gates `hover:`
 * behind `(hover: hover)`, which a Pixel 5 context does not report.
 */

const TOKENS = {
  radius: '12px',
  hoverShadow: 'rgba(0, 0, 0, 0.12) 0px 4px 16px 0px',
  rest: 'none',
} as const

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u

type Page = import('@playwright/test').Page

async function preset(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
  })
}

const section = (page: Page) => page.locator('section[aria-labelledby="home-categories-title"]')
const cards = (page: Page) => page.locator('[data-category-tile]')

async function open(page: Page) {
  await preset(page)
  await page.goto('/')
  await section(page).scrollIntoViewIfNeeded()
  await expect(cards(page)).toHaveCount(8)
}

test.describe('the category tile grid', () => {
  test.beforeEach(async ({ page }) => {
    await open(page)
  })

  test('every card is a 12px-cornered, unshadowed box with a painted photograph and an emoji-free label', async ({
    page,
  }) => {
    const n = await cards(page).count()
    for (let i = 0; i < n; i++) {
      const card = cards(page).nth(i)
      const style = await card.evaluate((el) => {
        const s = getComputedStyle(el)
        const box = el.querySelector('div')
        const b = box ? getComputedStyle(box) : null
        const img = el.querySelector('img')
        return {
          radius: s.borderRadius,
          shadow: s.boxShadow,
          border: s.borderTopWidth,
          boxRadius: b?.borderRadius,
          boxOverflow: b?.overflow,
          img: img
            ? { natural: img.naturalWidth, complete: img.complete, alt: img.getAttribute('alt') }
            : null,
          label: el.querySelector('span')?.textContent ?? '',
        }
      })
      expect(style.radius, `card ${i} radius`).toBe(TOKENS.radius)
      expect(style.shadow, `card ${i} resting shadow`).toBe(TOKENS.rest)
      expect(style.border, `card ${i} border`).toBe('1px')
      expect(style.boxRadius, `card ${i} picture box radius`).toBe(TOKENS.radius)
      expect(style.boxOverflow, `card ${i} picture box clips`).toBe('hidden')
      expect(style.img, `card ${i} has an <img>`).not.toBeNull()
      expect(style.img?.alt, `card ${i} picture is decorative`).toBe('')
      expect(style.label.trim().length, `card ${i} label`).toBeGreaterThan(0)
      expect(EMOJI.test(style.label), `card ${i} label "${style.label}" carries an emoji`).toBe(
        false,
      )
    }
    // Lazy images below the fold: wait for each to paint before reading size.
    for (let i = 0; i < n; i++) {
      const img = cards(page).nth(i).locator('img')
      await img.scrollIntoViewIfNeeded()
      await expect
        .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
          message: `card ${i} picture painted`,
        })
        .toBeGreaterThan(0)
    }
  })

  test('two columns on a phone, four from 768', async ({ page }, testInfo) => {
    const columns = await section(page)
      .locator('ul')
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
    const width = page.viewportSize()?.width ?? 0
    expect(columns, `${testInfo.project.name} at ${width}`).toBe(width >= 768 ? 4 : 2)
  })

  test('hover lifts the card with the token shadow and zooms the photograph 5%', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'hover: is gated behind (hover: hover)')
    const card = cards(page).first()
    await card.hover()
    // Tailwind composes `shadow-*` with the ring/inset slots, so the computed
    // value is four transparent layers and then the token; read the last.
    await expect
      .poll(() => card.evaluate((el) => getComputedStyle(el).boxShadow), {
        message: 'hover shadow',
      })
      .toMatch(new RegExp(`${TOKENS.hoverShadow.replace(/[()]/g, '\\$&')}$`))
    await expect
      .poll(() => card.locator('img').evaluate((el) => getComputedStyle(el).scale), {
        message: 'hover zoom',
      })
      .toBe('1.05')
    // The box clips at the corner, so the zoomed picture never grows the card.
    const [box, img] = await Promise.all([
      card.locator('div').first().boundingBox(),
      card.locator('img').boundingBox(),
    ])
    expect(box && img && img.width).toBeGreaterThan(box?.width ?? 0)
    await page.mouse.move(0, 0)
    await expect
      .poll(() => card.locator('img').evaluate((el) => getComputedStyle(el).scale))
      .toBe('none')
  })
})
