import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const css = readFileSync('src/styles/account.css', 'utf8')
const ITEMS = [
  'סקירה',
  'הפרטים שלי',
  'ההזמנות שלי',
  'הקופונים שלי',
  'הארנק שלי',
  'כתובות',
  'אמצעי תשלום',
]
const markupFor = (EMAIL) => `
<div class="account-page"><div class="account-page__inner"><div class="account-shell">
<nav class="account-nav" id="probe-nav" aria-label="ניווט באזור האישי">
  <div class="account-nav__head">
    <p class="account-nav__name">שלום</p>
    <p class="account-nav__email">${EMAIL}</p>
  </div>
  <ul class="account-nav__list">
    ${ITEMS.map((l) => `<li><a class="account-nav__link" href="#"><span>${l}</span>${l === 'הארנק שלי' ? '<span class="account-nav__badge">₪0.00</span>' : ''}</a></li>`).join('')}
  </ul>
</nav>
<div class="account-content"></div>
</div></div></div>`

const browser = await chromium.launch()
for (const EMAIL of [
  'a@b.co',
  'kenyonexpress@gmail.com',
  'averylongcustomeraddress.with.dots@somelongprovider.co.il',
])
  for (const width of [1440, 412]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    // A real app page, so Heebo is already loaded and applied: the nav's height
    // is line boxes, and line boxes are font metrics.
    await page.goto('http://localhost:3311/', { waitUntil: 'networkidle' })
    await page.addStyleTag({ content: css })
    await page.evaluate((html) => {
      document.body.insertAdjacentHTML('beforeend', html)
    }, markupFor(EMAIL))
    const h = await page.locator('#probe-nav').evaluate((el) => el.getBoundingClientRect().height)
    console.log(`${width}px  ${EMAIL.padEnd(56)} -> ${h}px`)
    await page.close()
  }
await browser.close()
