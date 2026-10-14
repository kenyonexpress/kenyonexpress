import { expect, test } from '@playwright/test'

/**
 * COMPONENT 01, THE TOP BAR, read off the rendered page at the three widths
 * compare.mjs measures (380 / 768 / 1440).
 *
 * `TopBar.test.tsx` proves DOM order and class names; the greeting-gate test
 * proves three source files still agree. Neither can see what the browser
 * does with `dir="rtl"`, `flex-wrap` and a `:has()` rule, and those are the
 * three things this component gets wrong when it regresses:
 *
 *   - the account link drifts to the RIGHT (DOM-first is rightmost in RTL, so
 *     one reordering of the array mirrors the bar and every unit test passes);
 *   - the greeting shows on an inner page, or vanishes from home, when any of
 *     the three files in the gate is "tidied";
 *   - the wrap at 380 lands on a different row count than live's greeting row
 *     plus two rows of two.
 *
 * Structural assertions only, no screenshots, so there is no baseline to rot.
 */

const GREETING = 'ברוך הבא לעולם של קניון Express'
const INFO_LABELS = ['בפריסה ארצית', 'משלוח מהיר חינם', 'קניה בטוחה'] as const
const ACCOUNT = 'התחברות'

/**
 * The bar is the INNERMOST `dir="rtl"` block that holds the greeting span.
 * `.last()` rather than `.first()`: any RTL wrapper above the shell also
 * matches `:has()`, and the outermost one would carry every link on the page.
 */
function topBar(page: import('@playwright/test').Page) {
  return page.locator('div[dir="rtl"]:has(.topbar-greeting)').last()
}

function rowsOf(boxes: Array<{ y: number } | null>): number {
  const ys = boxes.map((b) => Math.round(b?.y ?? -1)).filter((y) => y >= 0)
  return new Set(ys).size
}

/**
 * The wrap shape per width, measured on live (UX02, 14.10.2026). Below 576
 * the container is the viewport less 30px; the four items are 96 + 145 + 116
 * + 103 wide (each `|` adds 33), so 345px of row fits two and 384px fits
 * three. From 768 the greeting and all four share one 37px row.
 */
const ROW_SHAPE = {
  375: { rows: 3, firstRow: INFO_LABELS.slice(0, 2) },
  380: { rows: 3, firstRow: INFO_LABELS.slice(0, 2) },
  414: { rows: 3, firstRow: INFO_LABELS.slice(0, 3) },
  768: { rows: 1, firstRow: [...INFO_LABELS, ACCOUNT] },
  1440: { rows: 1, firstRow: [...INFO_LABELS, ACCOUNT] },
} satisfies Record<number, { rows: number; firstRow: readonly string[] }>

/** Live's `.container` at each width: 100% below 576, 720 at 768, 1200 at 1440. */
const CONTAINER = {
  375: { x: 0, w: 375 },
  380: { x: 0, w: 380 },
  414: { x: 0, w: 414 },
  768: { x: 24, w: 720 },
  1440: { x: 120, w: 1200 },
} satisfies Record<number, { x: number; w: number }>

for (const width of [375, 380, 414, 768, 1440] as const) {
  test.describe(`top bar at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test('home shows the greeting, the four items, and one account link on the left', async ({
      page,
    }) => {
      await page.goto('/')
      const bar = topBar(page)
      await expect(bar).toBeVisible()

      await expect(bar.getByText(GREETING)).toBeVisible()
      for (const label of INFO_LABELS) {
        await expect(bar.getByText(label, { exact: true })).toBeVisible()
      }

      // Exactly one anchor in the bar, and it is the account entry point.
      const links = bar.locator('a')
      await expect(links).toHaveCount(1)
      const account = bar.getByRole('link', { name: ACCOUNT })
      await expect(account).toHaveAttribute('href', '/login')

      // LEFTMOST. Live's `ul#menu-top-bar-right` puts התחברות last, and in an
      // RTL flex row last is hard against the inline-end, on the left. This
      // is the assertion the mirrored array passed the unit tests on.
      const accountBox = await account.boundingBox()
      const itemBoxes = await Promise.all(
        INFO_LABELS.map((label) => bar.getByText(label, { exact: true }).boundingBox()),
      )
      expect(accountBox).not.toBeNull()
      for (const [i, box] of itemBoxes.entries()) {
        expect(box, `${INFO_LABELS[i]} has a box`).not.toBeNull()
        // Items on the same row must sit to the right of the account link.
        // Items on an earlier row (380 wraps) are exempt: compare only peers.
        if (box && accountBox && Math.round(box.y) === Math.round(accountBox.y)) {
          expect(box.x, `${INFO_LABELS[i]} sits to the right of התחברות`).toBeGreaterThan(
            accountBox.x + accountBox.width - 1,
          )
        }
      }

      // The greeting starts at the container's inline-start, i.e. the right
      // edge, above or beside the items, never below them.
      const greetingBox = await bar.getByText(GREETING).boundingBox()
      expect(greetingBox).not.toBeNull()
      if (greetingBox && accountBox) {
        expect(greetingBox.y).toBeLessThanOrEqual(accountBox.y)
        expect(greetingBox.x + greetingBox.width).toBeGreaterThan(accountBox.x + accountBox.width)
      }

      // Row count and the wrap shape. Measured on live: one row from 768 up;
      // below 576 the greeting alone, then the items wrap at the row width:
      // two-and-two at 375/380, three-and-one at 414. The 414 shape is the
      // one the 14.864px type got wrong (UX02).
      const shape = ROW_SHAPE[width]
      const rows = rowsOf([greetingBox, ...itemBoxes, accountBox])
      expect(rows, `${shape.rows} row(s) at ${width}`).toBe(shape.rows)
      const firstRowY = Math.round(itemBoxes[0]?.y ?? -1)
      const onFirstRow = [...INFO_LABELS, ACCOUNT].filter((label, i) => {
        const box = label === ACCOUNT ? accountBox : itemBoxes[i]
        return box != null && Math.round(box.y) === firstRowY
      })
      expect(onFirstRow, `items on the first items row at ${width}`).toEqual(shape.firstRow)
    })

    test('type is live’s 13.006px and the bar sits in Bootstrap’s container', async ({ page }) => {
      await page.goto('/')
      const bar = topBar(page)
      const account = bar.getByRole('link', { name: ACCOUNT })
      const fontSize = await account.evaluate((el) =>
        Number.parseFloat(getComputedStyle(el).fontSize),
      )
      // .929em off live's 14px body. Off our 16px body it rendered 14.864.
      expect(fontSize).toBeCloseTo(13.006, 1)

      const icon = account.locator('svg')
      const iconBox = await icon.boundingBox()
      expect(iconBox?.width, 'live `i{font-size:1rem}` is a 16px glyph').toBe(16)
      expect(iconBox?.height).toBe(16)

      const container = await bar.locator('.topbar-container').boundingBox()
      expect(container).not.toBeNull()
      if (container) {
        expect(Math.round(container.x), `container x at ${width}`).toBe(CONTAINER[width].x)
        expect(Math.round(container.width), `container width at ${width}`).toBe(CONTAINER[width].w)
      }
    })

    test('hovering the account link darkens it to live’s #29323a', async ({ page }) => {
      await page.goto('/')
      const account = topBar(page).getByRole('link', { name: ACCOUNT })
      const rest = await account.evaluate((el) => getComputedStyle(el).color)
      expect(rest).toBe('rgb(51, 62, 72)')
      await account.hover()
      // Tailwind wraps `hover:` in `@media (hover: hover)`, so the Pixel 5
      // project (a touch device, `hover: none`) must KEEP the rest colour:
      // that is the no-stuck-hover-after-tap guarantee, asserted rather
      // than skipped.
      const canHover = await page.evaluate(() => matchMedia('(hover: hover)').matches)
      await expect
        .poll(() => account.evaluate((el) => getComputedStyle(el).color))
        .toBe(canHover ? 'rgb(41, 50, 58)' : 'rgb(51, 62, 72)')
      // A colour change, not an opacity fade: the icon must stay fully opaque.
      expect(await account.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
    })

    test('an inner page keeps the four items and drops the greeting', async ({ page }) => {
      await page.goto('/cart')
      const bar = topBar(page)
      await expect(bar).toBeVisible()

      // `toBeHidden` rather than `toHaveCount(0)`: the span IS in the DOM on
      // every route, that is the design; the `:has()` gate hides it here.
      await expect(bar.getByText(GREETING)).toBeHidden()
      for (const label of [...INFO_LABELS, ACCOUNT]) {
        await expect(bar.getByText(label, { exact: true })).toBeVisible()
      }
      await expect(bar.locator('a')).toHaveCount(1)
    })

    test('the bar sits above the masthead and reads right to left', async ({ page }) => {
      await page.goto('/')
      const bar = topBar(page)
      await expect(bar).toHaveAttribute('dir', 'rtl')
      const direction = await bar.evaluate((el) => getComputedStyle(el).direction)
      expect(direction).toBe('rtl')

      const barBox = await bar.boundingBox()
      const headerBox = await page.locator('header').first().boundingBox()
      expect(barBox).not.toBeNull()
      expect(headerBox).not.toBeNull()
      if (barBox && headerBox) {
        expect(
          barBox.y + barBox.height,
          'top bar ends where the masthead begins',
        ).toBeLessThanOrEqual(headerBox.y + 1)
      }
    })
  })
}
