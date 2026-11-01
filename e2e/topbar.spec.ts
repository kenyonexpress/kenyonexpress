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

for (const width of [380, 768, 1440] as const) {
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

      // Row count. Measured on live: one row from 768 up, and at 380 the
      // greeting alone then the four items two-and-two -- three rows.
      const rows = rowsOf([greetingBox, ...itemBoxes, accountBox])
      if (width === 380) {
        expect(rows, 'greeting row + two rows of two items').toBe(3)
      } else {
        expect(rows, 'greeting and all four items on one 37px row').toBe(1)
      }
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
