import fs from 'fs'
import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' })
await page.goto('https://kenyonexpress.co.il/', { waitUntil: 'networkidle', timeout: 120000 })
await page.waitForSelector('#rev_slider_6_1_wrapper', { timeout: 60000 })
await page.waitForTimeout(3000)

const slideKeys = ['rs-18', 'rs-35', 'rs-20', 'rs-33', 'rs-19']
const slideHtmlByKey = {}

for (const key of slideKeys) {
  await page.click(`rs-bullet[data-key="${key}"]`)
  await page.waitForFunction(
    (k) => {
      const layer = document.querySelector(`rs-slide[data-key="${k}"] rs-layer[data-type="text"]`)
      if (!layer) return true
      const fs = getComputedStyle(layer).fontSize
      return fs && fs !== '16px' && fs !== '14px'
    },
    key,
    { timeout: 5000 },
  ).catch(() => {})
  await page.waitForTimeout(400)
  const html = await page.evaluate((k) => {
    const slide = document.querySelector(`rs-slide[data-key="${k}"]`)
    return slide ? slide.outerHTML : null
  }, key)
  slideHtmlByKey[key] = html
  console.log('captured', key, html?.length)
}

const heroShell = await page.evaluate(() => {
  const section = document.querySelector('.elementor-element-1b49fac0')
  if (!section) return null
  const clone = section.cloneNode(true)
  // remove all rs-slide contents - will replace
  clone.querySelectorAll('rs-slide').forEach((s) => {
    s.innerHTML = '<!--placeholder-->'
  })
  clone.querySelectorAll('script').forEach((s) => s.remove())
  return clone.outerHTML
})

let hero = heroShell
for (const [key, slideHtml] of Object.entries(slideHtmlByKey)) {
  if (!slideHtml) continue
  hero = hero.replace(
    new RegExp(`<rs-slide[^>]*data-key="${key}"[\\s\\S]*?</rs-slide>`),
    slideHtml,
  )
}

function mapImages(fragment) {
  return fragment
    .replace(/https?:\/\/kenyonexpress\.co\.il\/wp-content\/uploads\/([^"'\s)]+)/g, (_, p) => {
      const base = p.split('/').pop().split('?')[0]
      if (p.includes('2021/11') || p.includes('2020') || p.includes('slider') || /\.(gif|png|jpe?g|webp)$/i.test(base)) {
        if (['e-baby-d2', 'student-', 'maldives', 'cute-golden', 'golden-retriever'].some((x) => base.includes(x) || p.includes(x)))
          return `/images/hero/category/${base}`
        if (['tesla', 'apple', 'home-sl'].some((x) => p.includes(x)))
          return `/images/hero/side-banners/${base}`
        return `/images/hero/slider/${base}`
      }
      return `/images/hero/slider/${base}`
    })
    .replace(/\/\/kenyonexpress\.co\.il\/wp-content\/uploads\/([^"'\s)]+)/g, (_, p) => {
      const base = p.split('/').pop().split('?')[0]
      return `/images/hero/slider/${base}`
    })
}

hero = mapImages(hero)

// Extract hero CSS rules from page
const heroCss = await page.evaluate(() => {
  const selectors = [
    'vertical-menu-slider-category-with-das-inner',
    'departments-menu-v2',
    'home-vertical-nav',
    'da-block',
    'da-inner',
    'da-action',
    'da-text',
    'da-media',
    'product-categories-list',
    'rev_slider_6_1',
    'tp-bullet',
    'slider-with-catogory',
    'home-vertical-nav-el',
  ]
  const out = []
  for (const sheet of [...document.styleSheets]) {
    let rules
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }
    for (const rule of rules) {
      if (rule.type !== CSSRule.STYLE_RULE) continue
      const sel = rule.selectorText || ''
      if (selectors.some((s) => sel.includes(s))) {
        out.push(`${sel}{${rule.style.cssText}}`)
      }
    }
  }
  return out.join('\n')
})

fs.writeFileSync('refs/ke_live_singlefile-hero.html', hero)
fs.writeFileSync('refs/ke_live_singlefile-hero.css', heroCss)
console.log('hero', hero.length, 'css rules', heroCss.split('\n').length)

await browser.close()
