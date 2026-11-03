/**
 * C198: proves no demo deal (products.is_demo = true) reaches a public page.
 *
 * Input: a JSON array of demo slugs (read from the DB with
 *   supabase db query --linked "select slug, name_he from products where is_demo"
 * ). The slug prefix is NOT the test: 30 real products also start with demo-.
 *
 * At 380 and 1440 it opens home, every master category and a search per
 * demo-deal keyword, collects every /product/<slug> link and every JSON-LD
 * block, and counts demo slugs in them. It also reads /sitemap.xml and
 * /api/search, and asks a demo PDP for its status (must be 404).
 *
 * Run: node scripts/demo/check-demo-hidden.mjs <baseUrl> <demo-slugs.json>
 */
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const base = process.argv[2] ?? 'http://localhost:3311'
const demo = JSON.parse(readFileSync(process.argv[3], 'utf8'))
const demoSlugs = new Set(demo.map((d) => d.slug))

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
// One word from each of five demo deals' names, so search would surface them.
const QUERIES = ['iPhone', 'קפה', 'ספא', 'צימר', 'מחשב']

function demoIn(text) {
  const hits = new Set()
  for (const slug of demoSlugs) {
    if (
      text.includes(`/product/${slug}"`) ||
      text.includes(`/product/${slug}<`) ||
      text.includes(`/product/${encodeURIComponent(slug)}"`)
    )
      hits.add(slug)
  }
  return [...hits]
}

const browser = await chromium.launch()
const rows = []
let failures = 0

async function check(label, url, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, locale: 'he-IL' })
  const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(800)
  const links = await page.$$eval('a[href^="/product/"]', (as) => [
    ...new Set(as.map((a) => decodeURIComponent(a.getAttribute('href').slice(9).split(/[?#]/)[0]))),
  ])
  const ld = await page.$$eval('script[type="application/ld+json"]', (ss) =>
    ss.map((s) => s.textContent ?? '').join('\n'),
  )
  const demoLinks = links.filter((s) => demoSlugs.has(s))
  const demoLd = [...demoSlugs].filter(
    (s) => ld.includes(`/product/${s}"`) || ld.includes(`/product/${encodeURIComponent(s)}"`),
  )
  const status = res?.status() ?? 0
  const ok = status === 200 && demoLinks.length === 0 && demoLd.length === 0
  if (!ok) failures++
  rows.push({
    label,
    width,
    status,
    productLinks: links.length,
    demoLinks: demoLinks.length,
    demoJsonLd: demoLd.length,
    ok,
  })
  await page.close()
}

for (const width of [380, 1440]) {
  await check('home', `${base}/`, width)
  for (const slug of MASTERS) await check(`category/${slug}`, `${base}/category/${slug}`, width)
  for (const q of QUERIES)
    await check(`search?q=${q}`, `${base}/search?q=${encodeURIComponent(q)}`, width)
}

for (const r of rows) {
  console.log(
    `${r.ok ? 'PASS' : 'FAIL'} ${String(r.width).padStart(4)} ${r.label.padEnd(28)} status=${r.status} links=${r.productLinks} demo_links=${r.demoLinks} demo_jsonld=${r.demoJsonLd}`,
  )
}

const sitemap = await (await fetch(`${base}/sitemap.xml`)).text()
const sitemapLocs = (sitemap.match(/<loc>/g) ?? []).length
const sitemapDemo = demoIn(sitemap.replaceAll('</loc>', '"'))
console.log(`sitemap.xml locs=${sitemapLocs} demo=${sitemapDemo.length}`)
if (sitemapDemo.length) failures++

let apiDemo = 0
for (const q of QUERIES) {
  const body = await (await fetch(`${base}/api/search?q=${encodeURIComponent(q)}`)).json()
  const hits = (body.results ?? []).filter((r) => demoSlugs.has(r.slug)).length
  console.log(`api/search q=${q} results=${(body.results ?? []).length} demo=${hits}`)
  apiDemo += hits
}
if (apiDemo) failures++

const sample = demo[0].slug
const pdp = await fetch(`${base}/product/${encodeURIComponent(sample)}`)
console.log(`demo PDP /product/${sample} status=${pdp.status}`)
if (pdp.status !== 404) failures++

await browser.close()
const pages = rows.length
console.log(
  `TOTAL pages=${pages} pass=${rows.filter((r) => r.ok).length} demo_links=${rows.reduce((a, r) => a + r.demoLinks, 0)} demo_jsonld=${rows.reduce((a, r) => a + r.demoJsonLd, 0)} failures=${failures}`,
)
process.exit(failures ? 1 : 0)
