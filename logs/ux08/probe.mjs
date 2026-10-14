import { writeFileSync } from 'node:fs'
// UX08 probe: the "הדיל של היום" section (DealOfTheDay) at 380/768/1440.
// Reads the section/card rects, the countdown (markup, box, type, colour,
// live text after the first tick), the percentage badge (text, box, colour,
// radius, where it sits relative to the picture), the CTA (tag, text, box,
// colour, radius), the picture box, and the category link. Writes a crop.
import { chromium } from '@playwright/test'
const BASE = process.env.BASE ?? 'http://localhost:3346'
const TAG = process.env.TAG ?? 'before'
const browser = await chromium.launch()
const out = {}
const consent = () => {
  localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
}
const SEL = 'section[aria-labelledby="deal-of-the-day-title"]'
for (const width of [380, 768, 1440]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
  await ctx.addInitScript(consent)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const section = page.locator(SEL)
  const present = (await section.count()) > 0
  if (!present) {
    out[width] = { present: false }
    await ctx.close()
    continue
  }
  await section.scrollIntoViewIfNeeded()
  await page.waitForTimeout(1500)
  out[width] = await page.evaluate((SEL) => {
    const r = (el) => {
      if (!el) return null
      const b = el.getBoundingClientRect()
      return {
        x: +b.x.toFixed(2),
        y: +b.y.toFixed(2),
        w: +b.width.toFixed(2),
        h: +b.height.toFixed(2),
      }
    }
    const cs = (el, keys) => {
      if (!el) return null
      const s = getComputedStyle(el)
      return Object.fromEntries(keys.map((k) => [k, s[k]]))
    }
    const TYPE = [
      'fontSize',
      'fontWeight',
      'lineHeight',
      'fontFamily',
      'color',
      'backgroundColor',
      'borderRadius',
      'padding',
      'direction',
      'letterSpacing',
    ]
    const section = document.querySelector(SEL)
    const card = section.firstElementChild
    const h2 = section.querySelector('h2')
    const countdownP = section.querySelector('output')?.closest('p') ?? null
    const output = section.querySelector('output')
    const badge =
      section.querySelector('[data-deal-badge]') ??
      [...section.querySelectorAll('span')].find(
        (s) => /%/.test(s.textContent ?? '') && !s.classList.contains('sr-only'),
      ) ??
      null
    const picture = section.querySelector('a[aria-label]')
    const img = picture?.querySelector('img') ?? null
    const ctas = [...section.querySelectorAll('a, button')].filter((el) =>
      /לרכישה|לעגלה/.test(el.textContent ?? ''),
    )
    const cta = ctas[0] ?? null
    const prices = section.querySelector('p.flex') ?? null
    return {
      present: true,
      section: r(section),
      card: {
        rect: r(card),
        ...cs(card, [
          'borderRadius',
          'boxShadow',
          'borderTopWidth',
          'borderTopColor',
          'backgroundColor',
          'flexDirection',
          'gap',
          'padding',
        ]),
      },
      heading: { text: h2?.textContent, rect: r(h2), ...cs(h2, TYPE) },
      countdown: {
        html: countdownP?.outerHTML.slice(0, 600),
        rect: r(countdownP),
        label: countdownP?.querySelector('span')?.textContent,
        value: output?.textContent,
        tag: output?.tagName,
        box: r(output),
        ...cs(output, TYPE),
        ariaLive: output?.getAttribute('aria-live'),
      },
      badge: badge
        ? {
            text: badge.textContent,
            rect: r(badge),
            ...cs(badge, TYPE),
            inPictureBox: picture ? picture.contains(badge) : false,
          }
        : null,
      prices: prices ? { text: prices.textContent, rect: r(prices) } : null,
      picture: {
        rect: r(picture),
        ...cs(picture, ['borderRadius', 'overflow', 'backgroundColor', 'position']),
        img: img
          ? {
              natural: img.naturalWidth,
              rect: r(img),
              src: (img.currentSrc || img.getAttribute('src') || '').slice(0, 120),
            }
          : null,
      },
      cta: cta
        ? {
            tag: cta.tagName,
            text: cta.textContent?.trim(),
            href: cta.getAttribute('href'),
            rect: r(cta),
            ...cs(cta, [...TYPE, 'minHeight', 'transitionProperty', 'animationName']),
          }
        : null,
      ctaCount: ctas.length,
    }
  }, SEL)
  const clip = await section.boundingBox()
  await page.screenshot({
    path: `logs/ux08/${TAG}-${width}.png`,
    clip: { x: 0, y: Math.max(0, clip.y - 10), width, height: Math.min(clip.height + 20, 880) },
  })
  await ctx.close()
}
await browser.close()
writeFileSync(`logs/ux08/${TAG}.json`, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 1).slice(0, 6000))
