import fs from 'node:fs'
import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' })
await page.goto('https://kenyonexpress.co.il/', { waitUntil: 'networkidle', timeout: 120000 })
await page.waitForSelector('#rev_slider_6_1_wrapper', { timeout: 60000 })
await page.waitForTimeout(4000)

const fullHtml = await page.content()
fs.writeFileSync('refs/ke_live_singlefile.html', fullHtml)
console.log('wrote refs/ke_live_singlefile.html', fullHtml.length, 'bytes')

const heroMeta = await page.evaluate(() => {
  const section = document.querySelector('.elementor-element-1b49fac0')
  if (!section) return { error: 'hero not found' }
  const slides = [...section.querySelectorAll('rs-slide')].map((s) => {
    const key = s.getAttribute('data-key')
    const layers = [...s.querySelectorAll('rs-layer, span.rs-layer')].map((l) => {
      const cs = getComputedStyle(l)
      return {
        id: l.id,
        type: l.getAttribute('data-type'),
        text: (l.textContent || '').trim(),
        fontSize: cs.fontSize,
        color: cs.color,
        top: cs.top,
        left: cs.left,
        fontWeight: cs.fontWeight,
      }
    })
    return { key, layers }
  })
  const banners = [...section.querySelectorAll('.da-block, .da-inner, [class*="da-"]')].length
  return { slideCount: slides.length, slides, banners }
})

fs.writeFileSync('refs/ke_live_singlefile-hero-meta.json', JSON.stringify(heroMeta, null, 2))
console.log('slides:', heroMeta.slideCount)

await browser.close()
