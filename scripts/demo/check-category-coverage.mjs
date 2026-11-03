/**
 * C188: proves every master category shows at least one live demo deal.
 * For each category at 380 and 1440: the listing must link a demo-* product
 * whose card image loaded; then that deal's page must answer 200 with a
 * title, a loaded image and whole-shekel prices. Shots go to docs/C188/.
 *
 * Run: node scripts/demo/check-category-coverage.mjs [baseUrl]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const base = process.argv[2] ?? 'https://www.kenyonexpress.co.il'
const out = resolve(root, 'docs/C188')
mkdirSync(out, { recursive: true })

// Root categories in sort_order. under-99 and new are computed views
// (src/lib/category-page.ts), filled from the same rows.
const MASTERS = [
  'hot-deals',
  'under-99',
  'new',
  'restaurants-cafes',
  'beauty-health',
  'phones-computers',
  'baby-kids',
  'vacation',
  'pets',
  'professionals',
  'electronics',
  'courses',
]

const pause = (ms) => new Promise((r) => setTimeout(r, ms))

async function open(browser, width, url) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, locale: 'he-IL' })
  const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
  await page
    .getByRole('button', { name: 'אישור', exact: true })
    .click({ timeout: 3000 })
    .catch(() => {})
  return { page, status: res?.status() ?? 0 }
}

const browser = await chromium.launch()
const rows = []
for (const slug of MASTERS) {
  for (const width of [380, 1440]) {
    const { page, status } = await open(browser, width, `${base}/category/${slug}`)
    const links = await page.$$eval('a[href^="/product/"]', (as) => [
      ...new Set(as.map((a) => a.getAttribute('href'))),
    ])
    const demo = links.filter((h) => h.startsWith('/product/demo-'))
    let cardImg = false
    if (demo[0]) {
      const card = page.locator(`a[href="${demo[0]}"]`).first()
      await card.scrollIntoViewIfNeeded()
      // Lazy card images go through the optimizer, 1-2 s cold: wait for the
      // decode instead of a fixed sleep.
      cardImg = await page
        .waitForFunction(
          (href) => {
            const img = document.querySelector(`a[href="${href}"] img`)
            return img?.complete && img.naturalWidth > 0
          },
          demo[0],
          { timeout: 20_000 },
        )
        .then(() => true)
        .catch(() => false)
      await page.screenshot({ path: `${out}/${slug}-${width}.jpg`, type: 'jpeg', quality: 55 })
    }
    await page.close()

    let pdp = { status: 0, h1: '', img: false, price: '', wholeShekels: false }
    if (demo[0]) {
      const p = await open(browser, width, `${base}${demo[0]}`)
      const h1 =
        (await p.page
          .locator('h1')
          .first()
          .textContent()
          .catch(() => '')) ?? ''
      const img = await p.page
        .locator('main img')
        .first()
        .evaluate((el) => el.complete && el.naturalWidth > 0)
        .catch(() => false)
      const prices = await p.page.$$eval('main *', (els) =>
        els
          .filter((e) => e.children.length === 0 && /₪/.test(e.textContent ?? ''))
          .filter((e) => (e.textContent ?? '').trim().length < 40)
          .map((e) => (e.textContent ?? '').trim())
          .slice(0, 6),
      )
      pdp = {
        status: p.status,
        h1: h1.trim(),
        img,
        price: prices.join(' | '),
        wholeShekels: prices.length > 0 && prices.every((t) => !/\d[.,]\d{2}(?!\d)/.test(t)),
      }
      await p.page.close()
    }

    const pass =
      status === 200 &&
      demo.length > 0 &&
      cardImg &&
      pdp.status === 200 &&
      pdp.h1 !== '' &&
      pdp.img &&
      pdp.wholeShekels
    const row = {
      slug,
      width,
      status,
      products: links.length,
      demo: demo.length,
      first: demo[0] ?? null,
      cardImg,
      pdp,
      pass,
    }
    rows.push(row)
    console.log(
      `${pass ? 'PASS' : 'FAIL'} ${width} ${slug} status=${status} products=${links.length} demo=${demo.length} first=${demo[0] ?? '-'} cardImg=${cardImg} pdp=${pdp.status} img=${pdp.img} whole=${pdp.wholeShekels} h1="${pdp.h1}" price="${pdp.price}"`,
    )
    await pause(1500)
  }
}
await browser.close()
writeFileSync(`${out}/coverage.json`, `${JSON.stringify(rows, null, 2)}\n`)
const failed = rows.filter((r) => !r.pass).length
console.log(`${rows.length - failed}/${rows.length} pass`)
process.exit(failed ? 1 : 0)
