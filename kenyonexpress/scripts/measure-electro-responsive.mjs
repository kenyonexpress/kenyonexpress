import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// Four site-wide reports from electro home-v7 into ~/Downloads:
//   electro-mobile-full.md   every section at 390px: order, heights, what hides
//   electro-tablet-768.md    same walk at 768px
//   electro-animations.md    every transition/animation rule with exact durations
//   electro-colors-full.md   every color in use, as hex, by frequency
//
// Desktop only (Cloudflare blocks headless / datacenter traffic):
//   node scripts/measure-electro-responsive.mjs

const BASE = 'https://electro.madrasthemes.com'
const OUT = join(homedir(), 'Downloads')

const browser = await chromium.launch({
  headless: false,
  args: ['--disable-blink-features=AutomationControlled'],
})

async function openPage(width, height) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: 'en-US',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  })
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })
  const page = await ctx.newPage()
  console.error(`→ ${BASE}/home-v7/ @ ${width}px`)
  try {
    await page.goto(`${BASE}/home-v7/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  } catch {
    console.error('  goto timed out, continuing')
  }
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1500)
    const ok = await page.evaluate(() => !!document.querySelector('#masthead, header.site-header, .site-content'))
    if (ok) break
  }
  await page.waitForTimeout(3000)
  // trigger lazy content
  await page.evaluate(async () => {
    for (let y = 0; y <= document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 120))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(1000)
  return page
}

// Walk every meaningful block: header children, main sections, footer blocks.
const WALK = () => {
  const name = (el) => (el.tagName + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '')).toLowerCase().slice(0, 90)
  const roots = [
    document.querySelector('header.site-header, #masthead'),
    document.querySelector('#main, .site-main, #content') || document.body,
    document.querySelector('footer, #colophon'),
  ].filter(Boolean)
  const rows = []
  for (const root of roots) {
    for (const el of root.children) {
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      const hidden = cs.display === 'none' || cs.visibility === 'hidden' || r.height < 2
      rows.push({
        section: name(el),
        top: Math.round(r.top + window.scrollY),
        height: Math.round(r.height),
        display: cs.display,
        hidden,
      })
    }
  }
  rows.sort((a, b) => a.top - b.top)
  return { width: innerWidth, totalHeight: Math.round(document.body.scrollHeight), rows }
}

function sectionMd(title, data, hiddenVs) {
  const L = [`# ${title}`, '', `Source: ${BASE}/home-v7/, viewport ${data.width}px, total page height ${data.totalHeight}px, measured ${new Date().toISOString().slice(0, 10)}.`, '']
  L.push('| # | section | y | height | display | hidden here |', '|---|---|---|---|---|---|')
  let i = 0
  for (const r of data.rows) {
    i += 1
    L.push(`| ${i} | ${r.section} | ${r.top}px | ${r.height}px | ${r.display} | ${r.hidden ? 'YES' : ''} |`)
  }
  if (hiddenVs && hiddenVs.length) {
    L.push('', `## Visible at 1440px but hidden at ${data.width}px`, '')
    for (const s of hiddenVs) L.push(`- ${s}`)
  }
  return L.join('\n') + '\n'
}

// ---- 1440 baseline for the hidden-diff ----
const base = await openPage(1440, 2400)
const walk1440 = await base.evaluate(WALK)

// ---- animations + colors are viewport-independent: collect at 1440 ----
const animations = await base.evaluate(() => {
  const out = { rules: [], keyframes: [], hoverRules: [] }
  for (const sheet of document.styleSheets) {
    let rules
    try { rules = sheet.cssRules } catch { continue }
    for (const rule of rules || []) {
      if (rule.type === 7) { // keyframes
        out.keyframes.push(rule.name)
        continue
      }
      const st = rule.style
      if (!st) continue
      const tr = st.getPropertyValue('transition') || st.getPropertyValue('transition-duration')
      const an = st.getPropertyValue('animation') || st.getPropertyValue('animation-duration')
      if (tr || an) {
        out.rules.push({ selector: (rule.selectorText || '').slice(0, 120), transition: tr || '', animation: an || '' })
      }
      if (rule.selectorText && rule.selectorText.includes(':hover')) {
        const t = rule.cssText
        if (t.length < 400) out.hoverRules.push(t)
      }
      if (out.rules.length > 400 || out.hoverRules.length > 300) break
    }
  }
  return out
})

const colors = await base.evaluate(() => {
  const toHex = (rgb) => {
    const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
    if (!m) return rgb
    const hex = '#' + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('')
    return m[4] !== undefined && +m[4] < 1 ? `${hex} @ alpha ${m[4]}` : hex
  }
  const tally = new Map()
  const add = (val, prop, el) => {
    if (!val || val === 'rgba(0, 0, 0, 0)' || val === 'transparent') return
    const key = toHex(val)
    if (!tally.has(key)) tally.set(key, { count: 0, props: new Set(), example: '' })
    const t = tally.get(key)
    t.count += 1
    t.props.add(prop)
    if (!t.example) t.example = (el.tagName + '.' + String(el.className).trim().split(/\s+/)[0]).toLowerCase().slice(0, 50)
  }
  const els = document.querySelectorAll('*')
  const step = Math.max(1, Math.floor(els.length / 4000))
  for (let i = 0; i < els.length; i += step) {
    const el = els[i]
    const cs = getComputedStyle(el)
    add(cs.color, 'color', el)
    add(cs.backgroundColor, 'background', el)
    add(cs.borderTopColor !== cs.color ? cs.borderTopColor : '', 'border', el)
  }
  return [...tally.entries()]
    .map(([hex, t]) => ({ hex, count: t.count, props: [...t.props].join('/'), example: t.example }))
    .sort((a, b) => b.count - a.count)
})
await base.close()

// ---- 390 + 768 walks with hidden-diff vs 1440 ----
for (const [width, height, file, title] of [
  [390, 844, 'electro-mobile-full.md', 'electro home-v7, full section walk at 390px'],
  [768, 1024, 'electro-tablet-768.md', 'electro home-v7, full section walk at 768px'],
]) {
  const page = await openPage(width, height)
  const walk = await page.evaluate(WALK)
  const visibleHere = new Set(walk.rows.filter((r) => !r.hidden).map((r) => r.section))
  const hiddenVs = walk1440.rows.filter((r) => !r.hidden && !visibleHere.has(r.section)).map((r) => r.section)
  writeFileSync(join(OUT, file), sectionMd(title, walk, hiddenVs))
  console.error(`✓ ${join(OUT, file)}`)
  await page.close()
}

// ---- write animations report ----
{
  const L = ['# electro: transitions, animations, hover', '', `Source: ${BASE}/home-v7/ stylesheets, measured ${new Date().toISOString().slice(0, 10)}.`, '']
  L.push('## Transition / animation rules (exact durations)', '', '| selector | transition | animation |', '|---|---|---|')
  for (const r of animations.rules) L.push(`| ${r.selector.replace(/\|/g, '\\|')} | ${r.transition} | ${r.animation} |`)
  L.push('', `## @keyframes defined (${animations.keyframes.length})`, '')
  for (const k of animations.keyframes) L.push(`- ${k}`)
  L.push('', `## :hover rules (${animations.hoverRules.length})`, '')
  for (const h of animations.hoverRules) L.push('```css', h, '```')
  writeFileSync(join(OUT, 'electro-animations.md'), L.join('\n') + '\n')
  console.error(`✓ ${join(OUT, 'electro-animations.md')}`)
}

// ---- write colors report ----
{
  const L = ['# electro: every color in use', '', `Source: ${BASE}/home-v7/ computed styles (sampled site-wide), measured ${new Date().toISOString().slice(0, 10)}.`, '']
  L.push('| hex | uses | as | example element |', '|---|---|---|---|')
  for (const c of colors) L.push(`| ${c.hex} | ${c.count} | ${c.props} | ${c.example} |`)
  writeFileSync(join(OUT, 'electro-colors-full.md'), L.join('\n') + '\n')
  console.error(`✓ ${join(OUT, 'electro-colors-full.md')}`)
}

await browser.close()
console.error('Done. 4 files in ~/Downloads')
