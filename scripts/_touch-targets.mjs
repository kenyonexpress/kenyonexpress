/**
 * MEASURES EVERY INTERACTIVE ELEMENT AGAINST THE 44px TOUCH-TARGET RULE.
 *
 * The rule is a standing project rule, and until this script it was the only
 * one of the seven UI rules with no way to check it. `--spacing-touch-min` is
 * 44px in tokens.css, which reads like enforcement and is not: a token only
 * binds where a component reaches for it, and a later utility in the same
 * className overrides it silently. SiteFooter.tsx:311 does exactly that,
 * writing `size-touch-min` and then `lg:h-10 lg:w-10`, so the social icons are
 * 40px from `lg` up and nothing failed.
 *
 * So this measures the rendered box in a real browser rather than reading
 * source. Run it against a built server, the same way compare.mjs is run:
 *
 *   PORT=3311 pnpm start &
 *   LOCAL_BASE=http://localhost:3311 node scripts/_touch-targets.mjs
 *
 * WHAT IT DELIBERATELY DOES NOT FLAG. Inline links inside running text are
 * exempt under WCAG 2.5.8, so they are marked `inlineInText` and counted apart
 * instead of padding the number. An element whose ::before or ::after is
 * absolutely positioned with a negative inset is measured at the size of that
 * overlay, because that is the box a finger actually hits: growing the hit area
 * without moving a pixel is the one fix here that the 11% parity gate cannot
 * object to.
 *
 * It prints JSON and asserts nothing. It is a probe, not a gate: turning it
 * into a gate means agreeing first on which of the current violations are
 * defects and which are deliberate, and that list does not exist yet.
 *
 * EVERY ROW RECORDS WHERE THE BROWSER LANDED, NOT WHERE IT WAS SENT.
 * Added 2026-09-08. `/checkout` is in PAGES below and it redirects to `/cart`
 * when the cart is empty, which it always is here - this probe seeds nothing.
 * So its `/checkout` rows were the CART's controls under checkout's path, and
 * the "90 violations at 380px" figure in the launch readiness document
 * inherited that.
 *
 * `response.status()` could not have revealed it either: Playwright follows the
 * redirect and reports the FINAL 200, never the 307.
 *
 * Three sibling tools already guard this in almost these words - compare.mjs
 * refuses a checkout run that did not land on /checkout, and a11y.spec.ts and
 * layout-stability.spec.ts both seed a cart and assert the URL first. This
 * probe and lighthouse-sweep.mjs were the two that did not.
 */
import { chromium } from '@playwright/test'

const BASE = process.env.LOCAL_BASE || 'http://localhost:3311'
const MIN = 44
const WIDTHS = [380, 768, 1440]
const PAGES = ['/', '/cart', '/checkout', '/products', '/account/login']

const browser = await chromium.launch()
const rows = []

for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    locale: 'he-IL',
  })
  const page = await ctx.newPage()
  for (const path of PAGES) {
    let status = 0
    try {
      const r = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 })
      status = r ? r.status() : 0
    } catch (e) {
      rows.push({ width, path, error: String(e).slice(0, 120) })
      continue
    }
    // Where the browser actually ended up, after any redirect.
    const landed = page.url()
    const finalPath = landed.startsWith(BASE) ? landed.slice(BASE.length) || '/' : landed
    const redirected = finalPath !== path
    if (redirected) {
      console.error(`  ${width}px  ${path}  ->  MEASURED ${finalPath}, NOT ${path}`)
    }
    if (status >= 400) {
      rows.push({ width, path, finalPath, redirected, status })
      continue
    }
    await page.waitForTimeout(600)

    const found = await page.evaluate((MIN) => {
      const SEL =
        'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch], summary, [tabindex]:not([tabindex="-1"])'
      const out = []
      // Every hit-area overlay, so collisions between them can be found. An
      // overlay that reaches 44px by extending past its control sits ABOVE
      // whatever is beside it, and the later element in the DOM wins the
      // overlap - so a control can measure 44x44 and still be untappable
      // because its neighbour's overlay covers it. Measuring elements one at a
      // time cannot see that, which is why this list exists.
      const overlays = []
      for (const el of document.querySelectorAll(SEL)) {
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue
        if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') continue
        // skip elements inside a hidden/offscreen container
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        // inline links inside running text are exempt from 2.5.8
        const inlineInText = cs.display.startsWith('inline') && el.closest('p, li, .prose, footer')
        // widen by any ::before/::after overlay that has been given a negative inset
        let w = r.width
        let h = r.height
        for (const pseudo of ['::before', '::after']) {
          const ps = getComputedStyle(el, pseudo)
          if (ps.content === 'none' || ps.position !== 'absolute') continue
          // The used width/height of the overlay IS the hit box, whatever the
          // insets say. Reading them directly covers both the negative-inset
          // idiom and the centred `.hit-44` overlay, which has no negative
          // inset at all and which an inset-only heuristic scored as absent.
          const pw = Number.parseFloat(ps.width)
          const ph = Number.parseFloat(ps.height)
          if (!Number.isNaN(pw)) w = Math.max(w, pw)
          if (!Number.isNaN(ph)) h = Math.max(h, ph)
        }
        // Record the overlay's own rect when it is bigger than the control.
        if (w > r.width + 0.5 || h > r.height + 0.5) {
          overlays.push({
            id: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}`,
            label: (el.getAttribute('aria-label') || el.textContent || '')
              .trim()
              .replace(/\s+/g, ' ')
              .slice(0, 30),
            left: r.left + r.width / 2 - w / 2,
            top: r.top + r.height / 2 - h / 2,
            right: r.left + r.width / 2 + w / 2,
            bottom: r.top + r.height / 2 + h / 2,
          })
        }
        if (w >= MIN && h >= MIN) continue
        const label = (el.getAttribute('aria-label') || el.textContent || '')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 40)
        const tag = el.tagName.toLowerCase()
        const idPart = el.id ? `#${el.id}` : ''
        const classPart =
          typeof el.className === 'string' && el.className
            ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
            : ''
        const id = `${tag}${idPart}${classPart}`
        out.push({
          id,
          label,
          w: Math.round(w * 10) / 10,
          h: Math.round(h * 10) / 10,
          inlineInText: !!inlineInText,
          href: el.getAttribute('href') || undefined,
        })
      }
      return { violations: out, overlays }
    }, MIN)

    // Pairwise, on the overlays only. The list is small (a handful per page),
    // so the quadratic scan costs nothing and needs no spatial index.
    const collisions = []
    for (let i = 0; i < found.overlays.length; i++) {
      for (let j = i + 1; j < found.overlays.length; j++) {
        const a = found.overlays[i]
        const b = found.overlays[j]
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (overlapX > 0.5 && overlapY > 0.5) {
          collisions.push({
            a: `${a.id} ${a.label}`,
            b: `${b.id} ${b.label}`,
            overlapPx: Math.round(Math.min(overlapX, overlapY) * 10) / 10,
          })
        }
      }
    }
    if (collisions.length) {
      console.error(`  ${width}px  ${path}  ${collisions.length} overlapping hit area(s):`)
      for (const c of collisions) {
        console.error(`    ${c.a}  vs  ${c.b}   ${c.overlapPx}px - the later one wins`)
      }
    }
    rows.push({
      width,
      path,
      finalPath,
      redirected,
      status,
      violations: found.violations,
      overlayCollisions: collisions,
    })
  }
  await ctx.close()
}
await browser.close()
console.log(JSON.stringify(rows, null, 2))

const bounced = rows.filter((r) => r.redirected)
if (bounced.length) {
  console.error(`\n${bounced.length} row(s) redirected; their violations belong to the FINAL path:`)
  for (const r of bounced) console.error(`  ${r.width}px  ${r.path}  ->  ${r.finalPath}`)
  console.error('Do not total these under the requested path. See the header note.')
}
