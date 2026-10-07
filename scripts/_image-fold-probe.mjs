import { chromium } from '@playwright/test'

// Usage:
//   node scripts/_image-fold-probe.mjs [--url=http://localhost:3335/] [--width=412] [--dpr=1.75] [--wait=4000]
//
// What the first viewport's images carry (loading, fetchpriority, blur, box vs
// natural size), the LCP entry and the cumulative layout shift for one page at
// one viewport, read
// off the browser's own PerformanceObserver and not off a screenshot diff.
// (`_cls-probe.mjs` is the three-run CLS attribution tool; this one is the
// STEP 35 above-the-fold image audit.) Each
// shift lists the first source element so a non-zero number names the culprit.
// The consent cookie is set first: the banner is a form, not a shift, and a
// returning visitor never sees it.
//
// --raw-images answers every /_next/image request with the raw file under
// public/. Locally the optimizer route does not exist at all (images.loader
// is 'custom', next-server.js skips the route) and every optimized image is a
// 404, so without this flag no image ever loads and the load-time shift and
// the real LCP element cannot be seen. The bytes are the originals, so sizes
// are wrong but ratios and layout are right.

const argOf = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}

const url = argOf('url', 'http://localhost:3335/')
const width = Number(argOf('width', '412'))
const dpr = Number(argOf('dpr', '1.75'))
const wait = Number(argOf('wait', '4000'))
const rawImages = process.argv.includes('--raw-images')

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width, height: Math.round(width * 2) },
  deviceScaleFactor: dpr,
  isMobile: width < 1024,
  locale: 'he-IL',
})
await context.addCookies([{ name: 'ke_consent', value: 'granted.2', url: new URL(url).origin }])
const page = await context.newPage()
if (rawImages) {
  await page.route('**/_next/image?*', (route) => {
    const target = new URL(route.request().url()).searchParams.get('url') ?? ''
    if (!target.startsWith('/')) return route.continue()
    return route.continue({ url: new URL(target, url).toString() })
  })
}
await page.addInitScript(() => {
  window.__shifts = []
  window.__lcp = null
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue
      const src = e.sources?.[0]?.node
      window.__shifts.push({
        t: Math.round(e.startTime),
        value: Number(e.value.toFixed(4)),
        node: src
          ? `${src.tagName?.toLowerCase()}${src.className ? `.${String(src.className).split(' ')[0]}` : ''}`
          : null,
      })
    }
  }).observe({ type: 'layout-shift', buffered: true })
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      window.__lcp = {
        t: Math.round(e.startTime),
        size: e.size,
        url: e.url ? e.url.slice(0, 90) : null,
        el: e.element
          ? `${e.element.tagName.toLowerCase()}${e.element.className ? `.${String(e.element.className).split(' ')[0]}` : ''}`
          : null,
        loadTime: Math.round(e.loadTime ?? 0),
        renderTime: Math.round(e.renderTime ?? 0),
      }
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true })
})
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(wait)
const result = await page.evaluate(() => ({
  cls: Number(window.__shifts.reduce((a, s) => a + s.value, 0).toFixed(4)),
  shifts: window.__shifts,
  lcp: window.__lcp,
  images: [...document.images]
    .filter((img) => img.getBoundingClientRect().top < window.innerHeight && img.width > 40)
    .map((img) => ({
      src: img.currentSrc.slice(0, 70),
      loading: img.loading,
      fetchpriority: img.getAttribute('fetchpriority'),
      blur: /data:image\/svg\+xml/.test(img.style.backgroundImage),
      box: `${Math.round(img.width)}x${Math.round(img.height)}`,
      natural: `${img.naturalWidth}x${img.naturalHeight}`,
    })),
  preloads: [...document.querySelectorAll('link[rel="preload"][as="image"]')].length,
}))
console.log(JSON.stringify({ url, width, dpr, ...result }, null, 1))
await browser.close()
