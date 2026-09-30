import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { metadata } from './page'

/**
 * /merchant/scan is the one privileged document the service worker keeps and
 * the one page with its own manifest. Both facts are plain text in files no
 * type-checker reads, so the four surfaces that have to agree are pinned here:
 * the page, the proxy, robots and the worker.
 */

const page = readFileSync('src/app/merchant/scan/page.tsx', 'utf8')
const layout = readFileSync('src/app/merchant/layout.tsx', 'utf8')
const proxy = readFileSync('src/proxy.ts', 'utf8')
const robots = readFileSync('src/app/robots.ts', 'utf8')
const sw = readFileSync('public/sw.js', 'utf8')
const rootLayout = readFileSync('src/app/layout.tsx', 'utf8')

describe('/merchant/scan', () => {
  it('requires a supplier membership on the page AND on its layout', () => {
    expect(page).toContain("requireSupplierMember('/merchant/scan')")
    expect(layout).toContain("requireSupplierMember('/merchant/scan')")
  })

  it('carries its own manifest, which the root layout no longer pins by file', () => {
    expect(metadata.manifest).toBe('/merchant/manifest.webmanifest')
    expect(metadata.robots).toEqual({ index: false, follow: false })
    // The file convention would override the field above on every page.
    expect(() => readFileSync('src/app/manifest.ts')).toThrow()
    expect(rootLayout).toContain("manifest: '/manifest.webmanifest'")
  })

  it('is behind the session gate, and the manifest and the feed are not', () => {
    expect(proxy).toContain(
      "(pathname.startsWith('/merchant/') && pathname !== '/merchant/manifest.webmanifest')",
    )
    // A bare '/merchant' prefix would also catch /merchant.xml, the public feed.
    expect(proxy).not.toMatch(/pathname\.startsWith\('\/merchant'\)/)
  })

  it('is disallowed to crawlers', () => {
    expect(robots).toContain("'/merchant/'")
  })

  it('is the one document the worker keeps a shell of, and only the bare URL', () => {
    expect(sw).toContain("const MERCHANT_SHELL = '/merchant/scan'")
    expect(sw).toMatch(
      /function isMerchantShell\(url\) \{\s*return url\.search === '' && url\.pathname === MERCHANT_SHELL/,
    )
    // A redirected answer is the login page, and must not become the shell.
    expect(sw).toContain('!response.redirected')
    // Still network-first: no cache read before the fetch.
    expect(sw).toMatch(/isMerchantShell\(url\)\) \{\s*event\.respondWith\(\s*fetch\(request\)/)
  })
})
