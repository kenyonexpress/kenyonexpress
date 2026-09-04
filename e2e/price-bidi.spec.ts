import { expect, test } from '@playwright/test'

/**
 * NO RENDERED PRICE SHOWS THE SHEKEL SIGN ON THE WRONG SIDE.
 *
 * This is the assertion the unit tests cannot make. `money-format.test.ts`
 * checks the STRING -- digits before sign, wrapped in an isolate -- and a
 * string is not a layout. The defect was a bidi one: `₪99.00` is digits-after-
 * sign in the string AND sign-left-of-digits on screen, because the shekel
 * glyph is bidi class ET and joins an adjacent run of European digits into one
 * left-to-right run inside the RTL paragraph.
 *
 * So the only honest check measures geometry: take the client rect of the glyph
 * and the client rect of the first digit beside it, and require the glyph to be
 * further right. That is what a reader sees, and nothing about the source string
 * proves it.
 *
 * IT RUNS AT THREE WIDTHS because line-breaking changes bidi runs. A price that
 * sits mid-sentence at 1440 can be the last thing on a wrapped line at 380, with
 * different neighbours resolving against it.
 */

const WIDTHS = [380, 768, 1440] as const

/** Pages that render a price without needing a session or a seeded cart. */
const PAGES = ['/', '/products', '/category/hot-deals'] as const

for (const width of WIDTHS) {
  for (const path of PAGES) {
    test(`prices put the shekel sign right of the digits: ${path} at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1400 })
      await page.goto(path)
      await page.waitForLoadState('networkidle')

      const wrong = await page.evaluate(() => {
        const offenders: { text: string; shekelX: number; digitX: number }[] = []
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)

        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent ?? ''
          const shekel = text.indexOf('₪')
          if (shekel === -1) continue

          // The digit that belongs to THIS price: the nearest one to the glyph.
          // A paragraph can hold several numbers, and comparing against the
          // first digit in the node would measure the wrong pair.
          const before = text.slice(0, shekel).search(/\d(?=[^\d]*$)/)
          const afterRel = text.slice(shekel).search(/\d/)
          const digit =
            afterRel !== -1 && (before === -1 || afterRel < shekel - before)
              ? shekel + afterRel
              : before
          if (digit === -1) continue

          const rect = (start: number) => {
            const range = document.createRange()
            range.setStart(node, start)
            range.setEnd(node, start + 1)
            return range.getBoundingClientRect()
          }
          const s = rect(shekel)
          const d = rect(digit)
          // Skip anything not laid out (display:none, zero-size).
          if (s.width === 0 || d.width === 0) continue
          // Only compare within one line; a wrapped pair is not a bidi defect.
          if (Math.abs(s.y - d.y) > 2) continue

          if (s.x < d.x) {
            offenders.push({
              text: text.trim().slice(0, 60),
              shekelX: Math.round(s.x),
              digitX: Math.round(d.x),
            })
          }
        }
        return offenders
      })

      expect(
        wrong,
        `prices rendering the sign left of the digits:\n${wrong
          .map((o) => `  "${o.text}" (₪ at x=${o.shekelX}, digit at x=${o.digitX})`)
          .join('\n')}`,
      ).toEqual([])
    })
  }
}
