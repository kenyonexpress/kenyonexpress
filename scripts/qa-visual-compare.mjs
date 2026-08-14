import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'

// Side-by-side visual QA: the local site against the electro home-v7 theme,
// at 380px and 768px, for home / product / category.
//
//   node scripts/qa-visual-compare.mjs
//
// Writes into refs/:
//   qa-mine-<page>-<width>-<date>.png     local, full page
//   qa-live-<page>-<width>-<date>.png     electro, full page
//   qa-visual-gaps-<date>.md              measured gap list, per page and width
//
// Desktop only: electro sits behind a Cloudflare managed challenge that blocks
// headless Chromium, so the live side runs headed. The local dev server must be
// running with a reachable database (pnpm dev).

const LOCAL = process.env.QA_BASE || 'http://localhost:3000'
const LIVE = 'https://electro.madrasthemes.com'
const WIDTHS = [380, 768]
const DATE = new Date().toISOString().slice(0, 10)
const OUT = resolve(import.meta.dirname, '../refs')
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  headless: false,
  args: ['--disable-blink-features=AutomationControlled'],
})

async function context(width) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 500 ? 844 : 1024 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  })
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })
  return ctx
}

async function settle(page, live) {
  if (live) {
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(1500)
      const ok = await page.evaluate(
        () => !!document.querySelector('#masthead, header.site-header, .site-content'),
      )
      if (ok) break
    }
  }
  await page.waitForTimeout(2500)
  // force lazy content, then return to the top so the shot starts at the header
  await page.evaluate(async () => {
    for (let y = 0; y <= document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 120))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(1200)
}

// Structural fingerprint of a page: the numbers a visual diff argues about.
const PROBE = () => {
  const px = (v) => Math.round(Number.parseFloat(v) || 0)
  const of = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      fontSize: px(cs.fontSize),
      fontWeight: cs.fontWeight,
      color: cs.color,
      bg: cs.backgroundColor,
      padX: `${px(cs.paddingLeft)}/${px(cs.paddingRight)}`,
      radius: px(cs.borderTopLeftRadius),
    }
  }
  const sections = []
  const main = document.querySelector('#main, .site-main, #content, main') || document.body
  for (const el of main.children) {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || r.height < 2) continue
    sections.push({ h: Math.round(r.height), top: Math.round(r.top + window.scrollY) })
  }
  const cardSel = 'li.product, .product-card, [class*="product-card"], article[class*="product"]'
  const cards = document.querySelectorAll(cardSel)
  let perRow = 0
  if (cards.length > 1) {
    const firstTop = Math.round(cards[0].getBoundingClientRect().top)
    perRow = [...cards].filter(
      (c) => Math.abs(Math.round(c.getBoundingClientRect().top) - firstTop) < 4,
    ).length
  }
  return {
    dir: document.documentElement.getAttribute('dir'),
    pageHeight: Math.round(document.body.scrollHeight),
    horizontalOverflow: document.body.scrollWidth > innerWidth + 2,
    scrollWidth: document.body.scrollWidth,
    sectionCount: sections.length,
    sectionHeights: sections.map((s) => s.h),
    header: of('header, .site-header, #masthead'),
    firstHeading: of('h1, h2'),
    card: of(cardSel),
    cardsPerRow: perRow,
    cardCount: cards.length,
    price: of('[class*="price"], .amount'),
    button: of('button, .button, .btn, [class*="add-to-cart"]'),
    footer: of('footer, #colophon, .site-footer'),
  }
}

async function shoot(ctx, url, name, width, live) {
  const page = await ctx.newPage()
  let status = 'TIMEOUT'
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    status = resp ? resp.status() : 'no-response'
  } catch (e) {
    console.error(`  nav failed ${url}: ${String(e).slice(0, 90)}`)
  }
  await settle(page, live)
  const file = `${name}-${width}-${DATE}.png`
  try {
    await page.screenshot({ path: join(OUT, file), fullPage: true })
    console.error(`  ✓ refs/${file}`)
  } catch {
    console.error(`  screenshot failed: ${file}`)
  }
  let probe = null
  try {
    probe = await page.evaluate(PROBE)
  } catch {}
  await page.close()
  return { status, file, probe }
}

// Discover a real product and category slug from the local homepage.
async function discover() {
  const ctx = await context(1280)
  const page = await ctx.newPage()
  const found = { product: null, category: null }
  try {
    await page.goto(`${LOCAL}/`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(3000)
    Object.assign(
      found,
      await page.evaluate(() => ({
        product: document.querySelector('a[href*="/product/"]')?.getAttribute('href') || null,
        category: document.querySelector('a[href*="/category/"]')?.getAttribute('href') || null,
      })),
    )
  } catch {
    console.error('  local homepage unreachable, falling back to home only')
  }
  await ctx.close()
  return found
}

const local = await discover()
console.error(`local product: ${local.product ?? 'none'}, category: ${local.category ?? 'none'}`)

// The live counterparts. electro has no /category/, its listing page is /shop/.
const PAGES = [
  { key: 'home', mine: `${LOCAL}/`, live: `${LIVE}/home-v7/` },
  {
    key: 'product',
    mine: local.product ? new URL(local.product, LOCAL).href : null,
    live: `${LIVE}/shop/`, // resolved to a real product below
  },
  {
    key: 'category',
    mine: local.category ? new URL(local.category, LOCAL).href : null,
    live: `${LIVE}/shop/`,
  },
]

// Resolve one real live product URL once.
{
  const ctx = await context(1280)
  const page = await ctx.newPage()
  try {
    await page.goto(`${LIVE}/shop/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await settle(page, true)
    const href = await page.evaluate(
      () =>
        document
          .querySelector('li.product a.woocommerce-LoopProduct-link, li.product a')
          ?.getAttribute('href') || null,
    )
    if (href) PAGES[1].live = new URL(href, LIVE).href
  } catch {}
  await ctx.close()
}

const results = []
for (const width of WIDTHS) {
  console.error(`\n=== ${width}px ===`)
  const ctx = await context(width)
  for (const p of PAGES) {
    console.error(`${p.key}:`)
    const mine = p.mine ? await shoot(ctx, p.mine, `qa-mine-${p.key}`, width, false) : null
    const live = await shoot(ctx, p.live, `qa-live-${p.key}`, width, true)
    results.push({ width, key: p.key, mineUrl: p.mine, liveUrl: p.live, mine, live })
  }
  await ctx.close()
}
await browser.close()

// ---- gap list ----
const L = [
  '# פערים ויזואליים: האתר המקומי מול electro home-v7',
  '',
  `נמדד ${DATE}, ברוחבי ${WIDTHS.join('px ו-')}px, דפדפן אמיתי, מדידות computed.`,
  '',
  `מקומי: ${LOCAL}`,
  `תבנית: ${LIVE}`,
  '',
]

const fmt = (o) =>
  o ? `${o.w}x${o.h}, ${o.fontSize}px/${o.fontWeight}, ${o.color}, bg ${o.bg}` : 'חסר'
const cmp = (label, a, b, unit = '') => {
  if (a === undefined || a === null || b === undefined || b === null) return null
  const same = String(a) === String(b)
  const delta = typeof a === 'number' && typeof b === 'number' ? ` (פער ${a - b}${unit})` : ''
  return `| ${label} | ${a}${unit} | ${b}${unit} | ${same ? 'זהה' : `שונה${delta}`} |`
}

for (const r of results) {
  L.push(`## ${r.key} @ ${r.width}px`, '')
  L.push(
    `שלי: ${r.mineUrl ?? 'לא נמצא נתיב'} (HTTP ${r.mine?.status ?? 'n/a'}), צילום: ${r.mine?.file ?? 'אין'}`,
  )
  L.push(`תבנית: ${r.liveUrl} (HTTP ${r.live?.status ?? 'n/a'}), צילום: ${r.live?.file ?? 'אין'}`)
  L.push('')
  const m = r.mine?.probe
  const v = r.live?.probe
  if (!m || !v) {
    L.push('_לא ניתן להשוות: אחד הצדדים לא נטען._', '')
    continue
  }
  L.push('| מדד | שלי | תבנית | מסקנה |', '|---|---|---|---|')
  for (const row of [
    cmp('גובה עמוד', m.pageHeight, v.pageHeight, 'px'),
    cmp('מספר סקשנים', m.sectionCount, v.sectionCount),
    cmp('גלישה אופקית', m.horizontalOverflow ? 'יש' : 'אין', v.horizontalOverflow ? 'יש' : 'אין'),
    cmp('רוחב גלילה', m.scrollWidth, v.scrollWidth, 'px'),
    cmp('כרטיסים בשורה', m.cardsPerRow, v.cardsPerRow),
    cmp('מספר כרטיסים', m.cardCount, v.cardCount),
    cmp('גובה header', m.header?.h, v.header?.h, 'px'),
    cmp('גובה footer', m.footer?.h, v.footer?.h, 'px'),
    cmp('כותרת ראשית, גודל', m.firstHeading?.fontSize, v.firstHeading?.fontSize, 'px'),
    cmp('מחיר, גודל', m.price?.fontSize, v.price?.fontSize, 'px'),
    cmp('מחיר, צבע', m.price?.color, v.price?.color),
    cmp('כפתור, רקע', m.button?.bg, v.button?.bg),
    cmp('כפתור, radius', m.button?.radius, v.button?.radius, 'px'),
    cmp('כרטיס, radius', m.card?.radius, v.card?.radius, 'px'),
  ].filter(Boolean))
    L.push(row)
  L.push('')
  L.push(`כרטיס שלי: ${fmt(m.card)}`)
  L.push(`כרטיס תבנית: ${fmt(v.card)}`)
  if (m.dir !== 'rtl') L.push('', `**RTL: html dir="${m.dir}", מצופה rtl.**`)
  if (m.horizontalOverflow)
    L.push('', `**גלישה אופקית אצלי: ${m.scrollWidth}px מול viewport ${r.width}px.**`)
  L.push('')
}

const gapsFile = join(OUT, `qa-visual-gaps-${DATE}.md`)
writeFileSync(gapsFile, `${L.join('\n')}\n`)
console.error(`\n✓ ${gapsFile}`)
console.error(`כל הצילומים ב-refs/ בשם qa-<side>-<page>-<width>-${DATE}.png`)
if (!existsSync(gapsFile)) process.exitCode = 1
