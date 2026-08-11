// Sync report: live homepage grid (refs/ke_live_singlefile.html) vs local
// rendered grid (localhost:3000) vs Supabase products table.
// Prints: products on live but missing locally, local but not on live,
// order/position mismatches, and products missing/mismatched in Supabase.
// Read-only: does NOT write to the DB.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

function loadEnvLocal() {
  const env = {}
  const raw = readFileSync(resolve('.env.local'), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

function slugFromHref(href) {
  if (!href) return null
  try {
    const path = decodeURIComponent(new URL(href, 'https://kenyonexpress.co.il').pathname)
    const m = path.match(/\/product\/([^/]+)\/?$/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

// Extract every product card in DOM order from a rendered page.
async function extractGrid(page) {
  return page.evaluate(() => {
    // live: jet-listing grid items; local: .jet-listing-grid-deals__item
    const nodes = [
      ...document.querySelectorAll('.jet-listing-grid__item, .jet-listing-grid-deals__item'),
    ]
    return nodes.map((el, i) => {
      const title = el.querySelector('h1,h2,h3,h4,h5,h6,.elementor-heading-title')
      const link =
        el.querySelector('a[href*="/product/"]') ??
        el.querySelector('h5 a, .elementor-heading-title a, a')
      const img = el.querySelector('img')
      const badge = [...el.querySelectorAll('*')]
        .map((n) =>
          n.childNodes.length === 1 && n.textContent?.trim().match(/^-\d+%$/)
            ? n.textContent.trim()
            : null,
        )
        .find(Boolean)
      const amounts = (el.textContent?.match(/₪\s*[\d,.]+|[\d,.]+\s*₪/g) ?? []).map((t) =>
        Number(t.replace(/[^\d.]/g, '')),
      )
      const r = el.getBoundingClientRect()
      return {
        position: i,
        row: Math.floor(i / 4),
        col: i % 4,
        title: title?.textContent?.trim() ?? null,
        href: link?.getAttribute('href') ?? null,
        imgSrc: img ? (img.currentSrc || img.src || '').slice(0, 80) : null,
        hasImage: !!img,
        badge: badge ?? null,
        amounts,
        box: { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width) },
      }
    })
  })
}

const env = loadEnvLocal()
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 2600 }, deviceScaleFactor: 1 })

// 1) live grid from singlefile
const livePage = await ctx.newPage()
const liveUrl = pathToFileURL(resolve('refs/ke_live_singlefile.html')).href
try {
  await livePage.goto(liveUrl, { waitUntil: 'networkidle', timeout: 120000 })
} catch {
  await livePage.goto(liveUrl, { waitUntil: 'domcontentloaded', timeout: 120000 })
}
await livePage.waitForTimeout(4000)
const liveItems = (await extractGrid(livePage)).map((it) => ({
  ...it,
  slug: slugFromHref(it.href),
}))

// 2) local rendered grid
const minePage = await ctx.newPage()
await minePage.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
await minePage.waitForTimeout(2000)
const mineItems = (await extractGrid(minePage)).map((it) => ({
  ...it,
  slug: slugFromHref(it.href),
}))

await b.close()

// 3) Supabase products
const supaUrl = env.NEXT_PUBLIC_SUPABASE_URL
const supaKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const res = await fetch(
  `${supaUrl}/rest/v1/products?select=slug,name_he,kenyon_price,full_price,images,status,deleted_at&order=created_at.desc&limit=200`,
  { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } },
)
if (!res.ok) {
  console.error(`Supabase query failed: ${res.status} ${await res.text()}`)
  process.exit(1)
}
const dbRows = await res.json()
const dbBySlug = new Map(dbRows.filter((r) => !r.deleted_at).map((r) => [r.slug, r]))

// ---- report ----
const _liveSlugs = liveItems.map((it) => it.slug)
const mineBySlug = new Map(mineItems.map((it) => [it.slug, it]))
const liveBySlug = new Map(liveItems.map((it) => [it.slug, it]))

const missingLocally = liveItems.filter((it) => it.slug && !mineBySlug.has(it.slug))
const extraLocally = mineItems.filter((it) => it.slug && !liveBySlug.has(it.slug))
const orderMismatch = liveItems
  .filter((it) => it.slug && mineBySlug.has(it.slug))
  .map((it) => ({ slug: it.slug, live: it.position, mine: mineBySlug.get(it.slug).position }))
  .filter((x) => x.live !== x.mine)
const missingInDb = liveItems.filter((it) => it.slug && !dbBySlug.has(it.slug))
const priceMismatchDb = liveItems
  .filter((it) => it.slug && dbBySlug.has(it.slug))
  .map((it) => {
    const db = dbBySlug.get(it.slug)
    const livePrice = it.amounts.length ? Math.min(...it.amounts) : null
    return { slug: it.slug, livePrice, dbPrice: Number(db.kenyon_price), dbStatus: db.status }
  })
  .filter((x) => x.livePrice != null && x.livePrice !== x.dbPrice)

const fmt = (it) =>
  `  #${String(it.position).padStart(2)} (row ${it.row}, col ${it.col})  ${it.title ?? '?'}  ` +
  `[${it.amounts.map((a) => `₪${a}`).join(' / ') || 'no price'}]${it.badge ? `  ${it.badge}` : ''}` +
  `  slug=${it.slug ?? '?'}`

console.log(`live grid items: ${liveItems.length}`)
for (const it of liveItems) console.log(fmt(it))
console.log(`\nlocal grid items: ${mineItems.length}`)
for (const it of mineItems) console.log(fmt(it))

console.log(`\n== ON LIVE BUT MISSING LOCALLY (${missingLocally.length}) ==`)
for (const it of missingLocally) console.log(fmt(it))
console.log(`\n== LOCAL BUT NOT ON LIVE (${extraLocally.length}) ==`)
for (const it of extraLocally) console.log(fmt(it))
console.log(`\n== ORDER MISMATCH (${orderMismatch.length}) ==`)
for (const x of orderMismatch) console.log(`  ${x.slug}: live #${x.live} vs mine #${x.mine}`)
console.log(`\n== ON LIVE BUT MISSING IN SUPABASE (${missingInDb.length}) ==`)
for (const it of missingInDb) console.log(fmt(it))
console.log(`\n== PRICE MISMATCH LIVE VS SUPABASE (${priceMismatchDb.length}) ==`)
for (const x of priceMismatchDb)
  console.log(`  ${x.slug}: live ₪${x.livePrice} vs db ₪${x.dbPrice} (status=${x.dbStatus})`)

console.log(
  `\nsupabase active products: ${dbRows.filter((r) => !r.deleted_at && r.status === 'active').length}`,
)
