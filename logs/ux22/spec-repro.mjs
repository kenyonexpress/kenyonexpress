// UX22: the neighbour spec's exact first steps on /products at the desktop
// viewport, with the first match's state read at the moment of failure.
import { chromium, devices } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3363'
const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices['Desktop Chrome'], locale: 'he-IL' })
const page = await ctx.newPage()
await page.goto(`${BASE}/products`)
const thumbs = page.locator('.category-card__thumb img')
const count = await thumbs.count()
const state = await thumbs.first().evaluate((el) => ({
  connected: el.isConnected,
  src: el.getAttribute('src')?.slice(0, 80),
  chain: (() => {
    const out = []
    let n = el
    while (n && out.length < 8) {
      out.push(`${n.tagName?.toLowerCase()}${n.id ? `#${n.id}` : ''}${n.hidden ? '[hidden]' : ''}`)
      n = n.parentNode
    }
    return out
  })(),
  liData: el.closest('li')?.dataset ? { ...el.closest('li').dataset } : null,
}))
console.log(JSON.stringify({ count, state }))
try {
  await thumbs.first().scrollIntoViewIfNeeded({ timeout: 5000 })
  console.log('scrolled ok')
} catch (e) {
  console.log('scroll failed:', String(e).split('\n')[0])
  const after = await thumbs
    .first()
    .evaluate((el) => ({
      connected: el.isConnected,
      chain: (() => {
        const out = []
        let n = el
        while (n && out.length < 10) {
          out.push(
            `${n.tagName?.toLowerCase()}${n.id ? `#${n.id}` : ''}${n.hidden ? '[hidden]' : ''}`,
          )
          n = n.parentNode
        }
        return out
      })(),
    }))
    .catch((err) => String(err).split('\n')[0])
  console.log(JSON.stringify(after))
}
const info = await page.evaluate(() => ({
  uls: [...document.querySelectorAll('ul.category-products')].map((u) => ({
    busy: u.getAttribute('aria-busy'),
    li: u.children.length,
    hiddenAncestor: !!u.closest('[hidden]'),
  })),
  firstImgHidden: !!document.querySelector('.category-card__thumb img')?.closest('[hidden]'),
}))
console.log(JSON.stringify(info))
await browser.close()
