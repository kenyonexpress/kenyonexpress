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
    if (status >= 400) {
      rows.push({ width, path, status })
      continue
    }
    await page.waitForTimeout(600)

    const found = await page.evaluate((MIN) => {
      const SEL =
        'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch], summary, [tabindex]:not([tabindex="-1"])'
      const out = []
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
      return out
    }, MIN)

    rows.push({ width, path, status, violations: found })
  }
  await ctx.close()
}
await browser.close()
console.log(JSON.stringify(rows, null, 2))
