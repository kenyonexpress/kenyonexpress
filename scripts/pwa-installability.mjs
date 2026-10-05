#!/usr/bin/env node
/**
 * PWA installability gate, measured against a running server.
 *
 * WHY NOT LIGHTHOUSE. Lighthouse dropped the PWA category in 12.0 (this repo
 * carries 13.5; `grep -c installable node_modules/lighthouse/core/config/
 * default-config.js` is 0). Chrome's own installability check now lives in
 * the DevTools Application panel and has no headless API, so "Lighthouse PWA
 * installable" cannot be a measurement here. What CAN be measured is every
 * requirement that check reads off the wire, and that is what this does:
 *
 *   1. The document links a manifest (`<link rel="manifest">`).
 *   2. The manifest parses, has `name` and `short_name`, a `start_url` inside
 *      `scope`, a `display` that is not `browser`, and is served as JSON.
 *   3. Icons: at least one PNG of 192 or larger with purpose `any`, one of
 *      512 or larger, and one `maskable`. Each file is fetched and its IHDR
 *      read, so a manifest that names a size the file does not have fails.
 *   4. A service worker at `/sw.js`, served as JavaScript, that registers a
 *      `fetch` handler (Chrome's "offline capable" criterion) and a `push`
 *      handler.
 *   5. The offline fallback document the worker precaches answers 200.
 *   6. iOS: `apple-touch-icon` and `apple-mobile-web-app-capable` on the
 *      document, because iOS reads none of the above.
 *   7. Hebrew: `lang: he`, `dir: rtl`, and a Hebrew `name`.
 *
 * Usage: LOCAL_BASE=http://localhost:3311 node scripts/pwa-installability.mjs
 * Exit 0 when every check passes, 1 otherwise. Every check is printed either
 * way, so a failure says which wire-level requirement is missing.
 */

const BASE = (process.env.LOCAL_BASE ?? 'http://localhost:3000').replace(/\/$/, '')
const HEBREW = /[֐-׿]/

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
}

async function get(path, accept) {
  const response = await fetch(`${BASE}${path}`, {
    headers: accept ? { accept } : undefined,
    redirect: 'manual',
  })
  return response
}

/** Width and height from a PNG's IHDR chunk; null when the bytes are not PNG. */
function pngSize(bytes) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < 24 || sig.some((b, i) => bytes[i] !== b)) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

function parseSizes(sizes) {
  return String(sizes ?? '')
    .split(/\s+/)
    .map((s) => s.toLowerCase().split('x').map(Number))
    .filter(([w, h]) => Number.isFinite(w) && Number.isFinite(h))
}

async function main() {
  // 1. The document.
  const home = await get('/', 'text/html')
  check('home document answers 200', home.status === 200, `status ${home.status}`)
  const html = await home.text()
  const manifestHref = html.match(/<link[^>]+rel="manifest"[^>]+href="([^"]+)"/)?.[1]
  check(
    'document links a manifest',
    Boolean(manifestHref),
    manifestHref ?? 'no <link rel=manifest>',
  )
  check('document carries apple-touch-icon for iOS', /<link[^>]+rel="apple-touch-icon"/.test(html))
  check(
    'document declares apple-mobile-web-app-capable for iOS',
    /<meta[^>]+name="apple-mobile-web-app-capable"[^>]+content="yes"/.test(html),
  )
  check('document declares a theme-color', /<meta[^>]+name="theme-color"/.test(html))

  // 2. The manifest.
  const manifestPath = manifestHref ?? '/manifest.webmanifest'
  const manifestResponse = await get(manifestPath)
  check(
    'manifest answers 200',
    manifestResponse.status === 200,
    `status ${manifestResponse.status}`,
  )
  const manifestType = manifestResponse.headers.get('content-type') ?? ''
  check(
    'manifest is served as a manifest or JSON',
    /manifest\+json|application\/json/.test(manifestType),
    manifestType,
  )
  let manifest = null
  try {
    manifest = JSON.parse(await manifestResponse.text())
  } catch (error) {
    check('manifest parses as JSON', false, error instanceof Error ? error.message : 'parse failed')
  }
  if (manifest) {
    check('manifest parses as JSON', true)
    check(
      'manifest has a name',
      typeof manifest.name === 'string' && manifest.name.length > 0,
      manifest.name,
    )
    check(
      'manifest has a short_name of 12 characters or fewer',
      typeof manifest.short_name === 'string' &&
        manifest.short_name.length > 0 &&
        manifest.short_name.length <= 12,
      manifest.short_name,
    )
    check('manifest name is Hebrew', HEBREW.test(manifest.name ?? ''), manifest.name)
    check('manifest is lang=he dir=rtl', manifest.lang === 'he' && manifest.dir === 'rtl')
    const scope = manifest.scope ?? '/'
    const startUrl = manifest.start_url ?? ''
    check(
      'start_url is inside scope',
      typeof startUrl === 'string' && startUrl.startsWith(scope),
      `start_url ${startUrl} scope ${scope}`,
    )
    check(
      'display is standalone, minimal-ui or fullscreen',
      ['standalone', 'minimal-ui', 'fullscreen'].includes(manifest.display),
      manifest.display,
    )
    const start = await get(startUrl || '/', 'text/html')
    check('start_url answers 200', start.status === 200, `status ${start.status}`)

    // 3. Icons, measured off the files.
    const icons = Array.isArray(manifest.icons) ? manifest.icons : []
    let any192 = false
    let any512 = false
    let maskable = false
    for (const icon of icons) {
      const response = await get(icon.src)
      const bytes = new Uint8Array(await response.arrayBuffer())
      const size = pngSize(bytes)
      const declared = parseSizes(icon.sizes)
      const matches =
        response.status === 200 &&
        size !== null &&
        declared.some(([w, h]) => w === size.width && h === size.height)
      check(
        `icon ${icon.src} is a PNG of its declared size`,
        matches,
        `status ${response.status}, file ${size ? `${size.width}x${size.height}` : 'not png'}, declared ${icon.sizes}`,
      )
      if (!matches) continue
      const purpose = String(icon.purpose ?? 'any').split(/\s+/)
      if (purpose.includes('any') && size.width >= 192) any192 = true
      if (purpose.includes('any') && size.width >= 512) any512 = true
      if (purpose.includes('maskable') && size.width >= 192) maskable = true
    }
    check('an icon of 192 or larger with purpose any', any192)
    check('an icon of 512 or larger with purpose any', any512)
    check('a maskable icon', maskable)
  }

  // 4. The service worker.
  const sw = await get('/sw.js')
  check('service worker answers 200', sw.status === 200, `status ${sw.status}`)
  const swType = sw.headers.get('content-type') ?? ''
  check('service worker is served as JavaScript', /javascript/.test(swType), swType)
  const swSource = await sw.text()
  check(
    "service worker registers a 'fetch' handler (offline capable)",
    /addEventListener\(\s*['"]fetch['"]/.test(swSource),
  )
  check(
    "service worker registers a 'push' handler",
    /addEventListener\(\s*['"]push['"]/.test(swSource),
  )
  check(
    "service worker registers a 'notificationclick' handler",
    /addEventListener\(\s*['"]notificationclick['"]/.test(swSource),
  )
  const swCache = sw.headers.get('cache-control') ?? ''
  check(
    'service worker is not cached as immutable',
    !/immutable/.test(swCache),
    swCache || '(no cache-control)',
  )

  // 5. The offline fallback.
  const offlineUrl = swSource.match(/const OFFLINE_URL = '([^']+)'/)?.[1] ?? '/offline'
  const offline = await get(offlineUrl, 'text/html')
  check(
    `offline fallback ${offlineUrl} answers 200`,
    offline.status === 200,
    `status ${offline.status}`,
  )
  const offlineHtml = await offline.text()
  check('offline fallback is Hebrew', HEBREW.test(offlineHtml))

  // 6. The registrar is in the document's JavaScript.
  check(
    'document references /sw.js (registrar shipped)',
    /sw\.js/.test(html) ||
      (await (async () => {
        // The registration call lives in a client chunk, not the HTML.
        const chunks = [...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map(
          (m) => m[1],
        )
        for (const chunk of chunks.slice(0, 40)) {
          const response = await get(chunk)
          if (response.status !== 200) continue
          if (/\/sw\.js/.test(await response.text())) return true
        }
        return false
      })()),
  )

  const failed = results.filter((r) => !r.ok)
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`)
  }
  console.log(
    `\npwa installability: ${results.length - failed.length}/${results.length} checks pass against ${BASE}`,
  )
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(
    `pwa installability: could not measure: ${error instanceof Error ? error.message : error}`,
  )
  process.exit(1)
})
