import { expect, test } from '@playwright/test'

/**
 * M17-c66, home page: the RTL audit as a gate.
 *
 * An equivalent audit on `phase5/homepage-closeout` (2026-09-30, commit
 * a2423523) walked every rendered element of `/` at 380, 768 and 1440 and
 * asked the browser for its computed `direction`. Thirty-three nodes came
 * back `ltr` at each width, and all but one family were correct: the
 * discount badge ("-37%" needs its minus in front), the deal countdown
 * ("--:--:--"), and the e-mail fields. The odd one was the hero: five Hebrew
 * promo paragraphs still carried `dir="ltr"` from the Electro export, when
 * they read "SIMPLY THE BEST" and "$299". The words survived translation and
 * the attribute did too. That branch's fix never reached this one -- this
 * branch's `HeroSlider.tsx` still had all five `dir="ltr"` attributes, which
 * is the finding this item made and this spec, ported here, now pins.
 *
 * `rtl-three-widths.spec.ts` guards the document shell and sideways scroll;
 * `rtl-mobile.spec.ts` guards the 320px floor. This file guards the CONTENTS:
 * seventeen named anchors on the home page must each resolve to
 * `direction: rtl`, and every node on the page that resolves to `ltr` must be
 * on the allow-list below. A new `dir="ltr"` anywhere on the page, or a
 * stylesheet that sets `direction: ltr` on something Hebrew, fails the second
 * test by path.
 *
 * Structural assertions, not screenshots: the gate has no images to rot.
 */

/**
 * Seventeen anchors, top to bottom, chosen so each is in the DOM at every
 * width the project measures (380 / 768 / 1440 and the Pixel 5 project).
 * Hidden is fine, absent is not: `getComputedStyle` resolves `direction` on a
 * `display: none` element, so the assertion is on attachment, not visibility.
 *
 * Selectors are the page's own landmarks (aria-labels, heading ids, the live
 * template's class names) rather than Tailwind utilities, which change with
 * every geometry pass. This branch's home page is CMS-driven (`AUTHORED_CONTENT`
 * in `HomepageSections.tsx`: hero, categories, benefits, deals) and the
 * `categories` entry renders nothing of its own -- the sidebar and strip below
 * are both painted by the hero -- so there is no separate category-grid or
 * hot-coupons heading to anchor on.
 */
const ANCHORS: ReadonlyArray<readonly [label: string, selector: string]> = [
  ['site header', 'header'],
  ['logo link', 'a[aria-label="קניון אקספרס, לדף הבית"]'],
  ['cart button', 'button[aria-label^="עגלת קניות"]'],
  ['account and cart nav', 'nav[aria-label="פעולות חשבון ועגלה"]'],
  ['main landmark', 'main#main-content'],
  ['hero section', 'section[aria-label="אזור ראשי"]'],
  ['hero category sidebar', 'aside[aria-label="קטגוריות"]'],
  ['hero copy column', '.hero-copy-column'],
  ['hero headline', '.hero-copy-column h1'],
  ['hero slide dots', '[aria-label="ניווט שקופיות"]'],
  ['hero category strip', 'section[aria-label="קטגוריות מובילות"]'],
  ['benefit bar', '.benefit-bar__item'],
  ['deals grid section', 'section[aria-label="מוצרים מובילים"]'],
  ['first deal card', 'article.p_con'],
  ['first deal price row', '.p_con__footer'],
  ['newsletter form', 'footer form'],
  ['site footer', 'footer'],
]

/**
 * The only nodes on the home page that may resolve to `direction: ltr`, each
 * with the reason it is allowed. A node matching none of these fails the
 * audit by path.
 */
const LTR_ALLOWED: ReadonlyArray<readonly [reason: string, selector: string]> = [
  // "-37%": under an RTL base direction the minus lands after the number.
  ['discount badge', '.discount_per'],
  // "12:34:56" / "--:--:--": the countdown is a clock, not a sentence.
  ['deal countdown', 'output'],
  // Addresses are Latin and read left to right in every locale.
  ['e-mail field', 'input[type="email"]'],
]

/** Bounded so a failure names the first offenders rather than a wall of paths. */
const MAX_REPORTED = 12

test.describe('home page RTL', () => {
  test('body and 20 anchors resolve to direction rtl', async ({ page }) => {
    await page.goto('/')

    const html = page.locator('html')
    await expect(html).toHaveAttribute('dir', 'rtl')
    await expect(html).toHaveAttribute('lang', 'he')
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).direction), {
        message: 'body computed direction',
      })
      .toBe('rtl')

    expect(
      ANCHORS.length,
      'the anchor list is the gate; seventeen is what exists on this branch',
    ).toBe(17)

    for (const [label, selector] of ANCHORS) {
      const node = page.locator(selector).first()
      await expect(node, `${label} (${selector}) is on the page`).toBeAttached()
      const direction = await node.evaluate((el) => getComputedStyle(el).direction)
      expect(direction, `${label} (${selector}) resolves to rtl`).toBe('rtl')
    }
  })

  test('the hero promo lines are Hebrew paragraphs laid out rtl', async ({ page }) => {
    // The leak the audit found. Every hero variant paints its promo copy
    // through `.hero-copy-column p`; none of them may carry dir="ltr" or
    // resolve to it, whatever the slide's authored or CMS copy says.
    await page.goto('/')
    const lines = page.locator('.hero-copy-column p')
    await expect(lines.first()).toBeAttached()

    const leaks = await lines.evaluateAll((els) =>
      els
        .filter(
          (el) => el.getAttribute('dir') === 'ltr' || getComputedStyle(el).direction !== 'rtl',
        )
        .map(
          (el) => `"${(el.textContent ?? '').trim().slice(0, 30)}" dir=${el.getAttribute('dir')}`,
        ),
    )
    expect(leaks, 'hero paragraphs laid out ltr').toEqual([])
  })

  test('every ltr node on the page is on the allow-list', async ({ page }) => {
    await page.goto('/')
    // The deferred chrome (toaster, consent) mounts after hydration; let it.
    await page.waitForLoadState('networkidle')

    const allowed = LTR_ALLOWED.map(([, selector]) => selector).join(', ')
    const offenders = await page.evaluate(
      ({ allowed, max }) => {
        const describe = (el: Element): string => {
          const parts: string[] = []
          let node: Element | null = el
          while (node && node !== document.body && parts.length < 5) {
            let s = node.tagName.toLowerCase()
            if (node.id) s += `#${node.id}`
            else if (node.getAttribute('aria-label'))
              s += `[aria-label="${node.getAttribute('aria-label')}"]`
            else if (typeof node.className === 'string' && node.className.trim())
              s += `.${node.className.trim().split(/\s+/).slice(0, 2).join('.')}`
            parts.unshift(s)
            node = node.parentElement
          }
          const text = (el.textContent ?? '').trim().slice(0, 30)
          return `${parts.join(' > ')}${text ? ` «${text}»` : ''}`
        }
        const out: string[] = []
        for (const el of document.querySelectorAll('body *')) {
          if (getComputedStyle(el).direction !== 'ltr') continue
          if (el.matches(allowed)) continue
          out.push(describe(el))
          if (out.length >= max) break
        }
        return out
      },
      { allowed, max: MAX_REPORTED },
    )

    expect(offenders, 'ltr nodes outside the allow-list').toEqual([])
  })
})
