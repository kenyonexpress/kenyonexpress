import fs from 'node:fs'
import { chromium } from '@playwright/test'

function parseSlides(html) {
  const slides = []
  for (const sm of html.matchAll(/data-key=["']?(rs-\d+)["']?[\s\S]*?<\/rs-slide>/g)) {
    const key = sm[1]
    const block = sm[0]
    const layers = []
    for (const lm of block.matchAll(
      /<(?:rs-layer|span)\b[^>]*\bid=["']?([^"'\s]+)["']?[^>]*data-type=["']?text["']?[^>]*(?:style=["']([^"']*)["']|style=([^;>\s][^>]*))?[^>]*>([\s\S]*?)<\/(?:rs-layer|span)>/gi,
    )) {
      const text = lm[4]
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      const style = lm[2] || lm[3] || ''
      if (text)
        layers.push({
          text,
          fontSize: style.match(/font-size:\s*([^;]+)/)?.[1]?.trim(),
        })
    }
    slides.push({ key, layers })
  }
  return slides
}

const refHtml = fs.readFileSync('refs/ke_live_singlefile-hero.html', 'utf8')
const refSlides = parseSlides(refHtml)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' })
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 120000 })
await page.waitForSelector('.ke-hero-exact-root', { timeout: 60000 })

const rows = []
for (const ref of refSlides) {
  await page.evaluate((k) => {
    document
      .querySelector(`.ke-hero-exact-root rs-bullet[data-key="${k}"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }, ref.key)
  await page.waitForTimeout(400)
  const built = await page.evaluate((k) => {
    const s = document.querySelector(`.ke-hero-exact-root rs-slide[data-key="${k}"]`)
    if (!s) return null
    const layers = [...s.querySelectorAll('rs-layer[data-type="text"], span[data-type="text"]')]
      .map((l) => {
        const style = l.getAttribute('style') || ''
        return {
          text: (l.textContent || '').replace(/\s+/g, ' ').trim(),
          fontSize:
            style.match(/font-size:\s*([^;]+)/)?.[1]?.trim() || getComputedStyle(l).fontSize,
        }
      })
      .filter((l) => l.text)
    return layers
  }, ref.key)

  const refText = ref.layers.map((l) => l.text).join(' | ')
  const builtText = built?.map((l) => l.text).join(' | ') || ''
  const refFonts = [...new Set(ref.layers.map((l) => l.fontSize).filter(Boolean))].join(',')
  const builtFonts = [...new Set(built?.map((l) => l.fontSize) || [])].join(',')
  const textMatch = refText === builtText
  const fontMatch = refFonts === builtFonts
  rows.push({
    key: ref.key,
    match: textMatch && fontMatch,
    textMatch,
    fontMatch,
    refText,
    builtText,
    refFonts,
    builtFonts,
  })
}

console.log(JSON.stringify(rows, null, 2))
await browser.close()
