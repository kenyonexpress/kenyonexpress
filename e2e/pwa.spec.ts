import { expect, test } from '@playwright/test'

/**
 * The installable surface, measured over HTTP against the running build:
 * the manifest and everything it points at, the service worker, the offline
 * document, the iOS tags, and the two deep-link files (404 until configured,
 * valid JSON once they are).
 */
test.describe('PWA surface', () => {
  test('manifest is served, Hebrew, standalone, and every icon it names resolves', async ({
    request,
  }) => {
    const res = await request.get('/manifest.webmanifest')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('manifest')
    const m = (await res.json()) as {
      lang: string
      dir: string
      display: string
      id: string
      icons: { src: string; purpose?: string }[]
      shortcuts: { url: string }[]
    }
    expect(m.lang).toBe('he')
    expect(m.dir).toBe('rtl')
    expect(m.display).toBe('standalone')
    expect(m.id).toBe('/')
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true)
    for (const icon of m.icons) {
      const img = await request.get(icon.src)
      expect(img.status(), icon.src).toBe(200)
      expect(img.headers()['content-type']).toContain('image/png')
    }
    for (const shortcut of m.shortcuts) {
      const page = await request.get(shortcut.url, { maxRedirects: 0 })
      expect([200, 307, 308], shortcut.url).toContain(page.status())
    }
  })

  test('service worker and offline document are real responses', async ({ request }) => {
    const sw = await request.get('/sw.js')
    expect(sw.status()).toBe(200)
    expect(sw.headers()['content-type']).toContain('javascript')
    expect(await sw.text()).toContain('/offline')

    const offline = await request.get('/offline')
    expect(offline.status()).toBe(200)
    expect(await offline.text()).toContain('אין חיבור לאינטרנט')
  })

  test('the document carries the iOS install tags and a launch image per device', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1)
    // Next 16 writes the standard `mobile-web-app-capable`, which iOS 17.4+
    // honours; older Safari reads the `apple-` prefixed one. Either counts.
    await expect(
      page.locator(
        'meta[name="mobile-web-app-capable"][content="yes"], meta[name="apple-mobile-web-app-capable"][content="yes"]',
      ),
    ).toHaveCount(1)
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveCount(1)
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1)
    const startup = page.locator('link[rel="apple-touch-startup-image"]')
    expect(await startup.count()).toBeGreaterThanOrEqual(10)
    for (const href of await startup.evaluateAll((links) =>
      links.map((l) => l.getAttribute('href') ?? ''),
    )) {
      const img = await page.request.get(href)
      expect(img.status(), href).toBe(200)
    }
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      'content',
      /viewport-fit=cover/,
    )
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1)
  })

  test('deep-link files are either absent or well formed, never a placeholder', async ({
    request,
  }) => {
    const assetlinks = await request.get('/.well-known/assetlinks.json')
    expect([200, 404]).toContain(assetlinks.status())
    if (assetlinks.status() === 200) {
      const doc = (await assetlinks.json()) as { target: { package_name: string } }[]
      expect(doc[0]?.target.package_name).toBe('co.il.kenyonexpress.app')
    }

    const aasa = await request.get('/.well-known/apple-app-site-association')
    expect([200, 404]).toContain(aasa.status())
    if (aasa.status() === 200) {
      expect(aasa.headers()['content-type']).toContain('application/json')
      const doc = (await aasa.json()) as { applinks: { details: { appIDs: string[] }[] } }
      expect(doc.applinks.details[0]?.appIDs[0]).toMatch(
        /^[A-Z0-9]{10}\.co\.il\.kenyonexpress\.app$/,
      )
    }
  })
})
