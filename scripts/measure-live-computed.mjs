/**
 * Regenerate the measurement baseline: refs/ke_live_computed.json and
 * refs/ke_live_<width>.png, captured from the LIVE production site.
 *
 * This file is the provenance of every token in src/styles/tokens.css. Those
 * tokens carry comments naming `refs/ke_live_computed.json` and the file was
 * not committed, so the comments pointed at nothing a reader could open. This
 * script is what makes them checkable again, and re-runnable.
 *
 * WHAT IT CAPTURES. For every element on every template at every width: the
 * fifteen properties the design brief names (color, background-color,
 * border-radius, border-width, box-shadow, font-family, font-size,
 * font-weight, line-height, letter-spacing, padding, margin, gap, width,
 * height), plus the bounding rect, the tag, the id, the class list and a
 * structural path. Nothing is sampled and nothing is rounded away.
 *
 * WHY IT IS NOT ENORMOUS. A complete dump is ~12000 elements per template per
 * width, and the overwhelming majority of them share a style: the live site
 * carries `border-radius: 0px` on 11863 elements and `"Open Sans"` on 12024.
 * So the fifteen properties are interned into a style table and each element
 * stores an integer index into it. That is lossless -- every element still has
 * every property -- and it is what keeps the file in the low megabytes rather
 * than the high tens.
 *
 * IT HITS AN EXTERNAL SITE. Run it deliberately, never in CI.
 *
 *   node scripts/measure-live-computed.mjs
 *   node scripts/measure-live-computed.mjs --templates=home,cart --widths=380
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * A GIT WORKTREE HAS NO node_modules OF ITS OWN.
 *
 * `ke-arch` and its siblings are worktrees of the main checkout, and pnpm
 * installs into the checkout, not into each worktree. A plain
 * `import '@playwright/test'` therefore dies with ERR_MODULE_NOT_FOUND here
 * while working perfectly in `kenyonexpress/`.
 *
 * `pnpm install` in the worktree is NOT the fix: pnpm's store is shared, and
 * installing from a worktree purges the main checkout's `node_modules`. A
 * `node_modules` symlink is not the fix either; Turbopack refuses one.
 *
 * So resolve the package from wherever it actually lives. The worktree's own
 * tree is tried first, so this keeps working unchanged if the worktree ever
 * does get an install.
 */
async function loadPlaywright() {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    resolve(here, '..'),
    resolve(here, '../../kenyonexpress'),
    resolve(homedir(), 'kenyonexpress-web/kenyonexpress'),
  ]
  for (const root of candidates) {
    const marker = resolve(root, 'node_modules/@playwright/test/package.json')
    if (!existsSync(marker)) continue
    const require = createRequire(pathToFileURL(resolve(root, 'noop.js')))
    const entry = require.resolve('@playwright/test')
    // CommonJS: the named exports land under `default`, so `{ chromium }` off
    // the namespace is undefined and the failure is a TypeError on `.launch`
    // rather than an import error.
    const mod = await import(pathToFileURL(entry).href)
    return mod.chromium ? mod : mod.default
  }
  throw new Error(
    `@playwright/test not found. Looked under: ${candidates.join(', ')}. ` +
      'Install it in the main checkout with `pnpm add -D @playwright/test`; ' +
      'do NOT run pnpm install from a worktree.',
  )
}

const { chromium } = await loadPlaywright()

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = resolve(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache
}

const argOf = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}

const ORIGIN = 'https://kenyonexpress.co.il'

/**
 * The seven templates the token comments cite ("cart@380", "checkout 380",
 * "the live single-product template"). `home` is first because it is the one
 * whose screenshot carries the plain `refs/ke_live_<width>.png` name.
 *
 * `seed` marks the two that redirect or render an empty panel without a cart
 * line. Live's cart does NOT redirect when empty (it renders an empty panel),
 * and live's checkout DOES redirect to /cart, so both are seeded and the
 * checkout capture is verified to have stayed on /checkout.
 */
const TEMPLATES = [
  { key: 'home', url: `${ORIGIN}/` },
  { key: 'shop', url: `${ORIGIN}/shop/` },
  { key: 'product', url: `${ORIGIN}/product/מוצר-לדוגמא/` },
  { key: 'category', url: `${ORIGIN}/product-category/hot-deals/` },
  { key: 'cart', url: `${ORIGIN}/cart/`, seed: true },
  { key: 'checkout', url: `${ORIGIN}/checkout/`, seed: true, mustStayOn: '/checkout' },
  { key: 'account', url: `${ORIGIN}/my-account/` },
]

/** WooCommerce's plain add-to-cart GET. Same id compare.mjs seeds with. */
const ATC_ID = process.env.LIVE_ATC_ID ?? '6166'

const WIDTHS = (argOf('widths', '380,768,1440') ?? '')
  .split(',')
  .map((w) => Number(w.trim()))
  .filter(Boolean)

const wanted = argOf('templates', null)
const templates = wanted
  ? TEMPLATES.filter((t) => wanted.split(',').includes(t.key))
  : TEMPLATES

/**
 * The fifteen properties, in the order the brief names them. Kept as one array
 * so the interned style rows are positional and the JSON does not repeat
 * fifteen key names twelve thousand times.
 */
const PROPS = [
  'color',
  'background-color',
  'border-radius',
  'border-width',
  'box-shadow',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'padding',
  'margin',
  'gap',
  'width',
  'height',
]

/**
 * Runs in the page. Returns interned styles plus one row per element.
 *
 * The shorthands (`border-radius`, `padding`, `margin`, `border-width`) are
 * read back from their longhands rather than through `getPropertyValue` on the
 * shorthand, which returns '' in Chromium whenever the four sides differ. That
 * is the whole point of capturing them: a 22px pill radius is
 * `0 22px 22px 0` on the live search field, and the shorthand read returns
 * nothing for it.
 */
const COLLECT = (props) => {
  const shorthand = {
    'border-radius': [
      'border-top-left-radius',
      'border-top-right-radius',
      'border-bottom-right-radius',
      'border-bottom-left-radius',
    ],
    'border-width': [
      'border-top-width',
      'border-right-width',
      'border-bottom-width',
      'border-left-width',
    ],
    padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
    margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  }
  const collapse = (parts) => {
    const [t, r, b, l] = parts
    if (t === r && r === b && b === l) return t
    if (t === b && r === l) return `${t} ${r}`
    if (r === l) return `${t} ${r} ${b}`
    return `${t} ${r} ${b} ${l}`
  }

  const table = []
  const seen = new Map()
  const elements = []

  const pathOf = (el) => {
    const steps = []
    for (let n = el; n && n.nodeType === 1 && steps.length < 12; n = n.parentElement) {
      const tag = n.tagName.toLowerCase()
      if (n.id) {
        steps.unshift(`${tag}#${n.id}`)
        break
      }
      const parent = n.parentElement
      if (!parent) {
        steps.unshift(tag)
        break
      }
      const siblings = [...parent.children].filter((c) => c.tagName === n.tagName)
      steps.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(n) + 1})` : tag)
    }
    return steps.join(' > ')
  }

  for (const el of document.querySelectorAll('*')) {
    const tag = el.tagName.toLowerCase()
    if (tag === 'script' || tag === 'style' || tag === 'meta' || tag === 'link') continue
    const cs = getComputedStyle(el)
    const row = props.map((p) =>
      shorthand[p] ? collapse(shorthand[p].map((k) => cs.getPropertyValue(k))) : cs.getPropertyValue(p),
    )
    const key = row.join('|')
    let index = seen.get(key)
    if (index === undefined) {
      index = table.length
      table.push(row)
      seen.set(key, index)
    }
    const r = el.getBoundingClientRect()
    elements.push({
      t: tag,
      i: el.id || undefined,
      c: el.className && typeof el.className === 'string' ? el.className : undefined,
      p: pathOf(el),
      s: index,
      // Rounded to 2dp: the source values are already sub-pixel and the token
      // layer quotes them to 4dp (25.004, 32.0051), so 2dp on a RECT is the
      // resolution of the box and not of the type. Type sizes live in the
      // style table above, untouched.
      r: [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 100) / 100),
      // Text content is what makes a selector identifiable when the class list
      // is a WordPress hash. First 60 chars only.
      x: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60) || undefined,
    })
  }
  return {
    table,
    elements,
    document: {
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      bodyScrollHeight: document.body.scrollHeight,
    },
  }
}

/**
 * The same settle sequence compare.mjs uses, and for the same measured
 * reasons: a `domcontentloaded` fallback fires before stylesheets apply, lazy
 * images below the fold are never requested by a fullPage capture, an image
 * inside a display:none subtree returns a decode() promise that never settles,
 * and the Revolution Slider keeps advancing unless it is driven through its
 * own API. A dump taken without these is a dump of a page mid-load.
 */
async function settle(page) {
  await page
    .waitForFunction(
      () => {
        if (document.readyState !== 'complete') return false
        const sheets = [...document.styleSheets]
        if (sheets.length === 0) return false
        return sheets.some((s) => {
          try {
            return (s.cssRules?.length ?? 0) > 0
          } catch {
            return true
          }
        })
      },
      { timeout: 30000 },
    )
    .catch(() => console.log('    WARNING: styles never confirmed'))
  await page.evaluate(() => document.fonts?.ready).catch(() => {})

  const sweep = page
    .evaluate(async () => {
      const step = window.innerHeight
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      const DECODE_TIMEOUT_MS = 2000
      const decodeAll = () =>
        Promise.all(
          [...document.images].map((img) =>
            img.decode
              ? Promise.race([
                  img.decode().catch(() => {}),
                  new Promise((r) => setTimeout(r, DECODE_TIMEOUT_MS)),
                ])
              : Promise.resolve(),
          ),
        )
      let previous = 0
      for (let s = 0; s < 4; s += 1) {
        const height = document.body.scrollHeight
        if (height <= previous) break
        for (let y = 0; y < height; y += step) {
          window.scrollTo(0, y)
          await sleep(120)
        }
        previous = height
      }
      await sleep(300)
      await decodeAll()
      const rendered = (img) => {
        if (img.getBoundingClientRect().width > 0) return true
        for (let n = img; n && n !== document.documentElement; n = n.parentElement) {
          if (getComputedStyle(n).display === 'none') return false
        }
        return true
      }
      const pending = () => [...document.images].filter((i) => !i.complete && rendered(i)).length
      for (let a = 0; a < 4 && pending() > 0; a += 1) {
        for (let y = 0; y < document.body.scrollHeight; y += step) {
          window.scrollTo(0, y)
          await sleep(120)
        }
        await sleep(500)
        await decodeAll()
      }
      window.__pending = pending()
      window.scrollTo(0, 0)
      await sleep(400)
    })
    .catch(() => {})
  const timedOut = Symbol('sweep')
  const outcome = await Promise.race([
    sweep.then(() => null),
    new Promise((r) => setTimeout(() => r(timedOut), 90000)),
  ])
  if (outcome === timedOut) console.log('    WARNING: sweep did not finish in 90s')

  // Freeze the hero through the slider's own API. A synthetic click on
  // `rs-bullet` is not how the engine changes slide; pause, show slide 1,
  // pause again, because revshowslide restarts the autoplay timer on its way
  // in. Without this the reference is on an arbitrary slide.
  await page
    .evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      const apis = Object.keys(window)
        .filter((k) => /^revapi\d+$/.test(k))
        .map((k) => window[k])
        .filter((a) => a && typeof a.revpause === 'function')
      for (const a of apis) try { a.revpause() } catch {}
      for (const a of apis) try { a.revshowslide(1) } catch {}
      await sleep(900)
      for (const a of apis) try { a.revpause() } catch {}
    })
    .catch(() => {})
  await page.waitForTimeout(1200)

  return page.evaluate(() => window.__pending ?? 0).catch(() => 0)
}

async function goto(page, url) {
  let last = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
      return
    } catch (idleError) {
      last = idleError
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
        return
      } catch (domError) {
        last = domError
        console.log(`    retry ${attempt}/3: ${String(domError.message).split('\n')[0]}`)
        await page.waitForTimeout(3000 * attempt)
      }
    }
  }
  throw last
}

if (!existsSync('refs')) mkdirSync('refs', { recursive: true })

const browser = await chromium.launch()
const out = {
  meta: {
    origin: ORIGIN,
    capturedAt: new Date().toISOString(),
    widths: WIDTHS,
    templates: templates.map((t) => t.key),
    properties: PROPS,
    note:
      'styles[] is an interned table; every element carries s = index into it, ' +
      'so each element has all fifteen properties with no repetition. ' +
      'r = [x, y, width, height] from getBoundingClientRect at that width.',
  },
  captures: {},
}

for (const width of WIDTHS) {
  const context = await browser.newContext({
    viewport: { width, height: 2600 },
    deviceScaleFactor: 1,
  })

  // Seed once per context, so both cart and checkout see the line.
  if (templates.some((t) => t.seed)) {
    const seeder = await context.newPage()
    try {
      await seeder.goto(`${ORIGIN}/?add-to-cart=${ATC_ID}&quantity=1`, {
        waitUntil: 'commit',
        timeout: 60000,
      })
      await seeder.waitForTimeout(3000)
      console.log(`[${width}] cart seeded with product ${ATC_ID}`)
    } catch (error) {
      console.log(`[${width}] WARNING: cart seed failed: ${String(error.message).split('\n')[0]}`)
    } finally {
      await seeder.close()
    }
  }

  for (const template of templates) {
    const page = await context.newPage()
    const label = `${template.key}@${width}`
    try {
      await goto(page, template.url)
      const pending = await settle(page)

      const landed = new URL(page.url()).pathname
      if (template.mustStayOn && !landed.includes(template.mustStayOn)) {
        console.log(`[${label}] SKIPPED: redirected to ${landed} (the cart did not stick)`)
        await page.close()
        continue
      }

      const shot =
        template.key === 'home' ? `refs/ke_live_${width}.png` : `refs/ke_live_${template.key}_${width}.png`
      await page.screenshot({ path: shot, fullPage: true })

      const data = await page.evaluate(COLLECT, PROPS)
      out.captures[label] = {
        url: template.url,
        landedPath: landed,
        width,
        template: template.key,
        screenshot: shot,
        pendingImages: pending,
        document: data.document,
        styles: data.table,
        elements: data.elements,
      }
      console.log(
        `[${label}] ${data.elements.length} elements, ${data.table.length} distinct styles, ` +
          `body ${data.document.bodyScrollHeight}px, ${pending} pending image(s) -> ${shot}`,
      )
    } catch (error) {
      console.log(`[${label}] FAILED: ${String(error.message).split('\n')[0]}`)
    } finally {
      await page.close()
    }
  }
  await context.close()
}

await browser.close()

const target = 'refs/ke_live_computed.json'
writeFileSync(target, JSON.stringify(out))
const { size } = await import('node:fs').then((fs) => fs.statSync(target))
console.log(`\n${target} written, ${(size / 1024 / 1024).toFixed(2)} MB`)
console.log(`captures: ${Object.keys(out.captures).length}`)
