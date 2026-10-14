import { writeFileSync } from 'node:fs'
// UX12 probe: the newsletter signup at 380 / 768 / 1440. Below lg the form
// is the home-page card (NewsletterSignup, form.ke-newsletter); from lg it is
// the footer pill (FooterNewsletterForm). The probe never submits a real
// address: the local build holds live Supabase and Resend keys, so a valid
// submit would write a production row and send a mail. It reads the idle
// markup, then presses submit on an EMPTY field and on a MALFORMED one and
// records what the visitor is told: before UX12 that is the browser's own
// validation bubble (input.validationMessage, in the browser's locale) and
// no element of ours; after it is a Hebrew alert of ours, the field marked
// invalid and focused.
import { chromium } from '@playwright/test'
const BASE = process.env.BASE ?? 'http://localhost:3346'
const TAG = process.env.TAG ?? 'before'
const WIDTHS = (process.env.WIDTHS ?? '380,768,1440').split(',').map(Number)
const browser = await chromium.launch()
const out = {}
const consent = () => {
  localStorage.setItem('ke_consent', JSON.stringify({ v: 1, analytics: false, marketing: false }))
}
const rect = `(el) => {
  if (!el) return null
  const b = el.getBoundingClientRect()
  return { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) }
}`
for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    locale: 'he-IL',
  })
  await ctx.addInitScript(consent)
  const page = await ctx.newPage()
  const requests = []
  page.on('request', (req) => {
    if (req.method() === 'POST') requests.push(req.url())
  })
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const forms = page.locator('form:has(input[type="email"][name="email"])')
  const visible = []
  for (const f of await forms.all()) if (await f.isVisible()) visible.push(f)
  if (visible.length === 0) {
    out[width] = { present: false }
    await ctx.close()
    continue
  }
  const form = visible[0]
  await form.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  const read = async (phase) =>
    form.evaluate(
      (form, [rectSrc, phase]) => {
        const r = new Function(`return ${rectSrc}`)()
        const input = form.querySelector('input[type="email"]')
        const button = form.querySelector('button[type="submit"]')
        const alert = form.parentElement.querySelector('[role="alert"]')
        const status = form.parentElement.querySelector('[role="status"], output')
        const is = getComputedStyle(input)
        const as = alert ? getComputedStyle(alert) : null
        return {
          phase,
          form: {
            rect: r(form),
            className: form.className,
            noValidate: form.noValidate,
            dir: getComputedStyle(form).direction,
            state: form.dataset.state ?? null,
            ariaBusy: form.getAttribute('aria-busy'),
          },
          input: {
            rect: r(input),
            dir: is.direction,
            required: input.required,
            ariaInvalid: input.getAttribute('aria-invalid'),
            ariaDescribedby: input.getAttribute('aria-describedby'),
            describedText: (input.getAttribute('aria-describedby') ?? '')
              .split(/\s+/)
              .filter(Boolean)
              .map((id) => document.getElementById(id)?.textContent?.trim() ?? `#${id} missing`),
            placeholder: input.placeholder,
            value: input.value,
            focused: document.activeElement === input,
            validity: input.validity.valid,
            validationMessage: input.validationMessage,
            borderColor: is.borderTopColor,
            outline: is.outlineStyle === 'none' ? null : `${is.outlineWidth} ${is.outlineColor}`,
            boxShadow: is.boxShadow === 'none' ? null : is.boxShadow.slice(0, 80),
          },
          button: {
            rect: r(button),
            text: button.textContent.trim(),
            disabled: button.disabled,
          },
          alert: alert
            ? {
                rect: r(alert),
                text: alert.textContent.trim(),
                dir: as.direction,
                color: as.color,
                fontSize: as.fontSize,
                kind: alert.dataset.kind ?? null,
              }
            : null,
          status: status ? { text: status.textContent.trim() } : null,
        }
      },
      [rect, phase],
    )
  const idle = await read('idle')
  const input = form.locator('input[type="email"]')
  const button = form.locator('button[type="submit"]')
  await button.click()
  await page.waitForTimeout(400)
  const empty = await read('empty-submit')
  await input.fill('ofir@kenyon')
  await button.click()
  await page.waitForTimeout(400)
  const malformed = await read('malformed-submit')
  await input.fill('ofir@kenyonexpress.co.il')
  await page.waitForTimeout(300)
  const corrected = await read('corrected-typing')
  out[width] = {
    present: true,
    which: idle.form.className.includes('ke-newsletter') ? 'home card' : 'footer pill',
    url: page.url(),
    posts: requests,
    idle,
    empty,
    malformed,
    corrected,
  }
  await form.locator('xpath=..').screenshot({ path: `logs/ux12/${TAG}-${width}.png` })
  await ctx.close()
}
await browser.close()
writeFileSync(`logs/ux12/${TAG}.json`, JSON.stringify(out, null, 2))
for (const [w, v] of Object.entries(out)) {
  if (!v.present) {
    console.log(w, 'no visible newsletter form')
    continue
  }
  console.log(
    w,
    v.which,
    '| noValidate',
    v.idle.form.noValidate,
    '| input dir',
    v.idle.input.dir,
    '| pill',
    `${v.idle.form.rect.w}x${v.idle.form.rect.h}`,
    '| empty ->',
    v.empty.alert
      ? `alert "${v.empty.alert.text}" ${v.empty.alert.dir} ${v.empty.alert.color}`
      : 'no alert',
    '| native:',
    JSON.stringify(v.empty.input.validationMessage),
    '| aria-invalid',
    v.empty.input.ariaInvalid,
    '| focused',
    v.empty.input.focused,
    '| malformed ->',
    v.malformed.alert ? `"${v.malformed.alert.text}"` : 'no alert',
    '| corrected ->',
    v.corrected.alert ? 'alert still shown' : 'alert cleared',
    v.corrected.input.ariaInvalid,
    '| POSTs',
    v.posts.length,
  )
}
