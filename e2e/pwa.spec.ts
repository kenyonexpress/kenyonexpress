import { expect, test } from '@playwright/test'

/**
 * WHAT A BROWSER NEEDS BEFORE IT WILL OFFER TO INSTALL THE SITE.
 *
 * Chrome's install criteria are a served manifest with a name, a start URL
 * in scope, at least one 192px and one 512px PNG icon that actually load, and
 * a registered service worker with a fetch handler. iOS reads none of that and
 * wants an `apple-touch-icon` link. Each of those is a URL that can 404
 * without any unit test noticing, because unit tests import the modules and
 * never ask the server for them. This spec asks the server.
 */

test('the manifest is served, and every icon it names loads', async ({ page, request }) => {
  await page.goto('/')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href, 'the root layout no longer links a manifest').toBeTruthy()

  const res = await request.get(href as string)
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('manifest')

  const manifest = (await res.json()) as {
    name: string
    start_url: string
    display: string
    icons: { src: string; sizes: string; purpose?: string }[]
  }
  expect(manifest.name).toBe('קניון אקספרס')
  expect(manifest.start_url).toBe('/')
  expect(manifest.display).toBe('standalone')
  expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true)

  for (const icon of manifest.icons) {
    const img = await request.get(icon.src)
    expect(img.status(), `${icon.src} did not load`).toBe(200)
    expect(img.headers()['content-type']).toBe('image/png')
  }
})

test('the service worker is served from the scope root with a fetch handler', async ({
  request,
}) => {
  const res = await request.get('/sw.js')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('javascript')
  const body = await res.text()
  expect(body).toContain("addEventListener('fetch'")
  expect(body).toContain("addEventListener('install'")
})

test('the offline shell is a real page with a plain link home', async ({ page }) => {
  const res = await page.goto('/offline')
  expect(res?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('אין חיבור לאינטרנט')
  await expect(page.getByRole('link', { name: 'נסו שוב' })).toHaveAttribute('href', '/')
  // Reachable online, so it must tell crawlers to leave it alone.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
})

test('iOS has its icon and web-app tags', async ({ page, request }) => {
  await page.goto('/')
  const icon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')
  expect(icon).toBeTruthy()
  expect((await request.get(icon as string)).status()).toBe(200)
  // Next 16 renders `appleWebApp.capable` as the standard tag, not the
  // Apple-prefixed one it superseded; iOS 17+ reads both. Measured, not
  // assumed: the first version of this test asked for the old name and failed.
  await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute(
    'content',
    'yes',
  )
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveCount(1)
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1)
})
