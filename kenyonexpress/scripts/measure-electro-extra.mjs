import { writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

// Five extra measurement reports from electro.madrasthemes.com into ~/Downloads:
//   measurements-badges-sale.md       sale/percent badges on product cards
//   measurements-tabs-product.md      product page tabs (active/inactive)
//   measurements-pagination.md        shop pagination (current/hover)
//   measurements-newsletter-footer.md footer newsletter block
//   measurements-search-dropdown.md   live search suggestions dropdown
//
// Desktop only (Cloudflare blocks headless / datacenter traffic):
//   node scripts/measure-electro-extra.mjs

const BASE = 'https://electro.madrasthemes.com'
const OUT = join(homedir(), 'Downloads')

const PROPS = [
  'width',
  'height',
  'max-width',
  'min-height',
  'top',
  'left',
  'right',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'gap',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-transform',
  'color',
  'background-color',
  'border',
  'border-bottom',
  'border-radius',
  'box-shadow',
  'transition',
  'position',
  'z-index',
  'display',
  'opacity',
]

const browser = await chromium.launch({
  headless: false,
  args: ['--disable-blink-features=AutomationControlled'],
})
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 2400 },
  deviceScaleFactor: 1,
  locale: 'en-US',
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
})
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
})
const page = await ctx.newPage()

async function open(url) {
  console.error(`→ ${url}`)
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  } catch {
    console.error('  goto timed out, continuing')
  }
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1500)
    const ok = await page.evaluate(
      () => !!document.querySelector('#masthead, header.site-header, .site-content'),
    )
    if (ok) return true
  }
  console.error('  WARNING: challenge did not clear')
  return false
}

const DUMP_FN = `(sel, props) => {
  const el = typeof sel === 'string' ? document.querySelector(sel) : sel
  if (!el) return null
  const cs = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  const out = { _rect: Math.round(r.width) + ' x ' + Math.round(r.height) + ' px @ ' + Math.round(r.left) + ',' + Math.round(r.top + window.scrollY) }
  for (const p of props) {
    const v = cs.getPropertyValue(p)
    if (v && v !== 'normal' && v !== 'none' && v !== 'auto' && v !== 'rgba(0, 0, 0, 0)') out[p] = v
  }
  return out
}`
const dump = (sel) =>
  page.evaluate(`(${DUMP_FN})(${JSON.stringify(sel)}, ${JSON.stringify(PROPS)})`)
async function dumpMany(pairs) {
  const rows = []
  for (const [label, sel] of pairs) rows.push([label, await dump(sel)])
  return rows
}

function md(title, rows, extra = '') {
  const lines = [
    `# ${title}`,
    '',
    `Source: ${BASE}, measured ${new Date().toISOString().slice(0, 10)}, headed Chrome computed styles at 1440px.`,
    '',
  ]
  for (const [label, o] of rows) {
    lines.push(`## ${label}`, '')
    if (!o) {
      lines.push('_not found_', '')
      continue
    }
    lines.push('| property | value |', '|---|---|')
    for (const [k, v] of Object.entries(o))
      lines.push(`| ${k === '_rect' ? 'rect @ x,y' : k} | ${v} |`)
    lines.push('')
  }
  return lines.join('\n') + extra
}
function save(name, content) {
  writeFileSync(join(OUT, name), content)
  console.error(`✓ ${join(OUT, name)}`)
}

// ---------- 1. sale badges (home + shop) ----------
{
  await open(`${BASE}/home-v7/`)
  await page.waitForTimeout(2500)
  const rows = await dumpMany([
    ['onsale badge (home card)', 'li.product .onsale, .product .onsale'],
    ['percent badge', '.percent, [class*="percent"], .badge'],
    ['card hosting the badge', 'li.product:has(.onsale)'],
    ['new badge (if any)', '.wp-block-woocommerce li.product .new, li.product .newness'],
  ])
  await open(`${BASE}/shop/`)
  await page.waitForTimeout(2000)
  rows.push(
    ...(await dumpMany([
      ['onsale badge (shop card)', 'li.product .onsale'],
      ['sale price (ins)', 'li.product .price ins .amount, li.product .price ins'],
      ['old price (del)', 'li.product .price del .amount, li.product .price del'],
    ])),
  )
  const badgeOffset = await page.evaluate(() => {
    const b = document.querySelector('li.product .onsale')
    if (!b) return null
    const card = b.closest('li.product')
    const rb = b.getBoundingClientRect()
    const rc = card.getBoundingClientRect()
    return `top ${Math.round(rb.top - rc.top)}px, right ${Math.round(rc.right - rb.right)}px relative to card`
  })
  save(
    'measurements-badges-sale.md',
    md('Sale / discount badges', rows, `\nbadge offset inside card: ${badgeOffset}\n`),
  )
}

// ---------- 2. product tabs ----------
{
  const productUrl = await page.evaluate(() => {
    const a = document.querySelector('li.product a.woocommerce-LoopProduct-link, li.product a')
    return a ? a.href : null
  })
  await open(productUrl || `${BASE}/shop/`)
  await page.waitForTimeout(2500)
  const rows = await dumpMany([
    ['tabs container', '.woocommerce-tabs, .wc-tabs-wrapper'],
    ['tab list (ul)', '.wc-tabs, .tabs'],
    ['active tab (li)', '.wc-tabs li.active, .tabs li.active'],
    ['active tab link', '.wc-tabs li.active a, .tabs li.active a'],
    ['inactive tab link', '.wc-tabs li:not(.active) a, .tabs li:not(.active) a'],
    ['tab panel', '.woocommerce-Tabs-panel'],
    ['panel heading', '.woocommerce-Tabs-panel h2'],
    ['panel body text', '.woocommerce-Tabs-panel p'],
  ])
  try {
    await page.click('.wc-tabs li:not(.active) a', { timeout: 5000 })
    await page.waitForTimeout(800)
    rows.push(['tab after switch (new active)', await dump('.wc-tabs li.active a')])
  } catch {
    rows.push(['tab switch', null])
  }
  save('measurements-tabs-product.md', md('Product page tabs', rows))
}

// ---------- 3. pagination (shop) ----------
{
  await open(`${BASE}/shop/`)
  await page.waitForTimeout(2000)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(1000)
  const rows = await dumpMany([
    ['pagination nav', '.woocommerce-pagination, nav.pagination'],
    ['page list (ul)', '.woocommerce-pagination ul, .page-numbers'],
    ['current page', '.page-numbers .current, .page-numbers li .current'],
    ['regular page link', 'a.page-numbers'],
    ['next arrow', '.page-numbers .next, a.next'],
  ])
  try {
    await page.hover('a.page-numbers', { timeout: 4000 })
    await page.waitForTimeout(400)
    rows.push(['page link :hover', await dump('a.page-numbers')])
  } catch {}
  const gap = await page.evaluate(() => {
    const items = document.querySelectorAll('.woocommerce-pagination li, .page-numbers li')
    if (items.length < 2) return null
    const a = items[0].getBoundingClientRect()
    const b = items[1].getBoundingClientRect()
    return `${Math.round(b.left - a.right)}px`
  })
  save(
    'measurements-pagination.md',
    md('Pagination (shop)', rows, `\ngap between page items: ${gap}\n`),
  )
}

// ---------- 4. newsletter in footer ----------
{
  await open(`${BASE}/home-v7/`)
  await page.waitForTimeout(2500)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(1200)
  const rows = await dumpMany([
    ['newsletter block', '.footer-newsletter, footer .newsletter, [class*="newsletter"]'],
    [
      'newsletter title',
      '.footer-newsletter .newsletter-title, [class*="newsletter"] h5, [class*="newsletter"] h4',
    ],
    ['newsletter subtitle', '[class*="newsletter"] p, .newsletter-marketing-text'],
    ['email input', '[class*="newsletter"] input[type="email"], footer input[type="email"]'],
    ['submit button', '[class*="newsletter"] button, [class*="newsletter"] input[type="submit"]'],
    ['social icons row (if adjacent)', '.footer-social, [class*="social"]'],
  ])
  try {
    await page.click('[class*="newsletter"] input[type="email"], footer input[type="email"]', {
      timeout: 5000,
    })
    await page.waitForTimeout(400)
    rows.push([
      'email input :focus',
      await dump('[class*="newsletter"] input[type="email"], footer input[type="email"]'),
    ])
  } catch {}
  save('measurements-newsletter-footer.md', md('Footer newsletter', rows))
}

// ---------- 5. search dropdown ----------
{
  await open(`${BASE}/home-v7/`)
  await page.waitForTimeout(2500)
  const rows = await dumpMany([
    ['search form (header)', '.site-header form[role="search"], .navbar-search, form.search-form'],
    ['search input', '.site-header input[type="search"], .navbar-search input, input[name="s"]'],
    ['category select in search bar', '.site-header form select, .search-form select'],
    ['search submit button', '.site-header form [type="submit"], .search-form button'],
  ])
  try {
    const inputSel = '.site-header input[type="search"], .navbar-search input, input[name="s"]'
    await page.click(inputSel, { timeout: 6000 })
    await page.type(inputSel, 'laptop', { delay: 120 })
    await page.waitForTimeout(3000)
    rows.push(
      ...(await dumpMany([
        [
          'suggestions dropdown',
          '.autocomplete-suggestions, .search-suggestions, .dgwt-wcas-suggestions-wrapp, [class*="suggest"], [class*="autocomplete"]',
        ],
        [
          'single suggestion row',
          '.autocomplete-suggestion, .dgwt-wcas-suggestion, [class*="suggest"] li',
        ],
        ['suggestion image', '[class*="suggest"] img, .dgwt-wcas-si img'],
        ['suggestion title', '[class*="suggest"] [class*="title"], .dgwt-wcas-st'],
        ['suggestion price', '[class*="suggest"] .price, .dgwt-wcas-sp'],
        [
          'highlighted / hovered row',
          '.autocomplete-suggestion.selected, .dgwt-wcas-suggestion-focused',
        ],
      ])),
    )
  } catch {
    rows.push(['live suggestions', null])
  }
  save(
    'measurements-search-dropdown.md',
    md(
      'Search bar + live suggestions dropdown',
      rows,
      '\nIf the dropdown rows above are _not found_, the demo may not ship live search; the plain form specs above still apply.\n',
    ),
  )
}

await browser.close()
console.error('Done. 5 files in ~/Downloads')
