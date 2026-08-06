import { chromium } from '@playwright/test'
import { appendFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// Guided competitor capture. Opens a headed browser; YOU browse normally
// (deal pages, add to cart, up to checkout). Every page you land on is
// documented automatically into a markdown file in ~/Downloads, routed by
// domain, plus a full-page screenshot per page:
//   groupon.com   -> competitor-groupon-coupon-page.md
//   baligam.co.il -> competitor-baligam-flow.md
//   groo.co.il    -> competitor-groo-flow.md
//   anything else -> competitor-other.md
//
// Run from the desktop terminal, then just browse. Ctrl+C when done:
//   node scripts/capture-competitors.mjs
//
// It records per page: URL, title, above-the-fold outline (headings, prices,
// old-price strikethroughs, discount badges, countdown timers, CTA buttons),
// forms, and fine-print/terms blocks. Read-only: it never clicks anything.

const OUT = join(homedir(), 'Downloads')
const FILES = [
  [/groupon\./i, 'competitor-groupon-coupon-page.md', 'Groupon deal page'],
  [/baligam\.|groo\.|walla.*coupon|coupon.*\.co\.il/i, 'competitor-israeli-coupons.md', 'Israeli coupon sites: flow to checkout'],
]
const fileFor = (url) => {
  for (const [re, name, title] of FILES) if (re.test(url)) return { name, title }
  return { name: 'competitor-other.md', title: 'Other competitor pages' }
}

const EXTRACT = () => {
  const FOLD = 900
  const vis = (el) => {
    const r = el.getBoundingClientRect()
    return r.width > 2 && r.height > 2 && r.bottom > 0
  }
  const txt = (el) => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160)
  const pos = (el) => {
    const r = el.getBoundingClientRect()
    return `${Math.round(r.left)},${Math.round(r.top + window.scrollY)} ${Math.round(r.width)}x${Math.round(r.height)}`
  }
  const out = { url: location.href, title: document.title, aboveFold: [], prices: [], timers: [], ctas: [], forms: [], terms: [] }

  for (const h of document.querySelectorAll('h1, h2, h3')) {
    if (!vis(h) || !txt(h)) continue
    const r = h.getBoundingClientRect()
    out.aboveFold.push({ tag: h.tagName, text: txt(h), pos: pos(h), aboveFold: r.top < FOLD })
  }
  const priceRe = /(₪|\$|€)\s?\d|(\d+\s?%)/
  for (const el of document.querySelectorAll('span, div, p, del, s, ins, [class*="price"], [class*="discount"], [class*="save"]')) {
    if (out.prices.length > 25) break
    if (!vis(el) || el.children.length > 2) continue
    const t = txt(el)
    if (!t || t.length > 60 || !priceRe.test(t)) continue
    const cs = getComputedStyle(el)
    out.prices.push({
      text: t, pos: pos(el),
      struck: cs.textDecorationLine.includes('line-through') || ['DEL', 'S'].includes(el.tagName),
      size: cs.fontSize, weight: cs.fontWeight, color: cs.color,
    })
  }
  for (const el of document.querySelectorAll('[class*="timer"], [class*="countdown"], [class*="count-down"], [class*="expir"], [class*="urgency"], time')) {
    if (!vis(el)) continue
    const t = txt(el)
    if (t) out.timers.push({ text: t.slice(0, 80), pos: pos(el), cls: String(el.className).slice(0, 80) })
    if (out.timers.length > 8) break
  }
  for (const el of document.querySelectorAll('button, a[class*="btn"], a[class*="buy"], input[type="submit"], [class*="cta"], [class*="add-to-cart"], [class*="checkout"]')) {
    if (out.ctas.length > 20) break
    if (!vis(el)) continue
    const t = txt(el)
    if (!t) continue
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    out.ctas.push({ text: t.slice(0, 50), pos: pos(el), bg: cs.backgroundColor, color: cs.color, size: cs.fontSize, radius: cs.borderRadius, aboveFold: r.top < FOLD })
  }
  for (const f of document.querySelectorAll('form')) {
    if (!vis(f)) continue
    const fields = [...f.querySelectorAll('input:not([type=hidden]), select, textarea')].map((i) => i.name || i.type).slice(0, 15)
    if (fields.length) out.forms.push({ action: (f.action || '').slice(0, 100), fields })
    if (out.forms.length > 6) break
  }
  for (const el of document.querySelectorAll('[class*="fine-print"], [class*="finePrint"], [class*="terms"], [class*="conditions"], [class*="tnc"], details')) {
    if (!vis(el)) continue
    const t = txt(el)
    if (t && t.length > 20) out.terms.push({ preview: t.slice(0, 200), pos: pos(el) })
    if (out.terms.length > 5) break
  }
  return out
}

const browser = await chromium.launch({
  headless: false,
  args: ['--disable-blink-features=AutomationControlled'],
})
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' })
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
})

let shot = 0
const seen = new Set()

async function capture(page) {
  const url = page.url()
  if (!url.startsWith('http') || seen.has(url)) return
  seen.add(url)
  await page.waitForTimeout(3500)
  let data
  try { data = await page.evaluate(EXTRACT) } catch { return }
  const { name, title } = fileFor(url)
  const file = join(OUT, name)
  if (!existsSync(file)) writeFileSync(file, `# ${title}\n\nCaptured ${new Date().toISOString().slice(0, 10)}, 1440px, guided browsing.\n`)
  shot += 1
  const png = `competitor-shot-${String(shot).padStart(2, '0')}.png`
  try { await page.screenshot({ path: join(OUT, png), fullPage: true }) } catch {}

  const L = [`\n---\n\n## ${data.title || url}\n`, `URL: ${url}`, `Screenshot: ${png}`, '']
  L.push('### Headings (position x,y w x h; aboveFold = first 900px)', '')
  for (const h of data.aboveFold) L.push(`- ${h.tag} ${h.aboveFold ? '[ABOVE FOLD] ' : ''}"${h.text}" @ ${h.pos}`)
  L.push('', '### Prices / discounts', '')
  for (const p of data.prices) L.push(`- "${p.text}" @ ${p.pos} ${p.struck ? '[STRIKETHROUGH old price] ' : ''}(${p.size} ${p.weight} ${p.color})`)
  L.push('', '### Countdown / urgency elements', '')
  for (const t of data.timers) L.push(`- "${t.text}" @ ${t.pos} (${t.cls})`)
  if (!data.timers.length) L.push('- none detected')
  L.push('', '### CTA buttons', '')
  for (const c of data.ctas) L.push(`- ${c.aboveFold ? '[ABOVE FOLD] ' : ''}"${c.text}" @ ${c.pos} bg ${c.bg}, text ${c.color} ${c.size}, radius ${c.radius}`)
  L.push('', '### Forms', '')
  for (const f of data.forms) L.push(`- ${f.action} fields: ${f.fields.join(', ')}`)
  if (!data.forms.length) L.push('- none')
  L.push('', '### Terms / fine print blocks', '')
  for (const t of data.terms) L.push(`- @ ${t.pos}: "${t.preview}"`)
  if (!data.terms.length) L.push('- none detected')
  appendFileSync(file, L.join('\n') + '\n')
  console.error(`✓ captured -> ${name} (${png})`)
}

ctx.on('page', (page) => {
  page.on('domcontentloaded', () => capture(page).catch(() => {}))
})
const first = await ctx.newPage()
first.on('domcontentloaded', () => capture(first).catch(() => {}))
await first.goto('https://www.groupon.com/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})

console.error('Browse normally: Groupon deal page, then baligam.co.il and groo.co.il flows up to checkout.')
console.error('Every page is auto-documented to ~/Downloads. Ctrl+C to finish.')
await new Promise(() => {})
