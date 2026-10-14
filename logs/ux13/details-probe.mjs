import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 600 } })
await page.setContent(`
<style>
  .a > summary::marker { content: ""; }
  .a > *:not(summary) { display: block !important; }
  .b::details-content { content-visibility: visible; display: block !important; }
</style>
<details class="a"><summary>A legacy</summary><ul><li><a href="/x">link A</a></li></ul></details>
<details class="b"><summary>B details-content</summary><ul><li><a href="/y">link B</a></li></ul></details>
`)
const r = await page.evaluate(() => {
  const rect = (sel) => {
    const b = document.querySelector(sel).getBoundingClientRect()
    return [b.width, b.height]
  }
  return {
    ua: navigator.userAgent,
    a: rect('.a a'),
    b: rect('.b a'),
    aVisible: document
      .querySelector('.a a')
      .checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true }),
    bVisible: document
      .querySelector('.b a')
      .checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true }),
  }
})
console.log(JSON.stringify(r))
await page.screenshot({ path: 'logs/ux13/details-probe.png' })
await browser.close()
