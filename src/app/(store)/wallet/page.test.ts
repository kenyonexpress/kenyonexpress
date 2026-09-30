import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `/wallet` (STEP 13) is a second door onto the account wallet, and a door
 * is only as good as its lock and its listing. Server pages are not rendered
 * in this suite (see overview.test.ts), so this reads the sources for the
 * four things that would each fail silently:
 *
 *   1. both doors render the same view, so the two paths cannot drift;
 *   2. the proxy bounces a signed-out visitor, like /account*;
 *   3. robots.txt keeps the path out of the index, like /account/;
 *   4. the legacy redirect map knows the route, so no 410 row can ever
 *      shadow it (the /wishlist finding of STEP 12).
 */

const root = process.cwd()
const read = (rel: string) =>
  readFileSync(join(root, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('/wallet', () => {
  it('renders the same WalletView as /account/wallet', () => {
    const store = read('src/app/(store)/wallet/page.tsx')
    const account = read('src/app/(account)/account/wallet/page.tsx')
    for (const page of [store, account]) {
      expect(page).toContain("from '@/components/account/WalletView'")
      expect(page).toContain('<WalletView />')
    }
    // The storefront door has no account layout around it, so the
    // request-time reads need their own boundary to keep the shell static.
    expect(store).toContain('<Suspense')
    expect(store).toContain("import '@/styles/account.css'")
  })

  it('is behind the session check in the proxy', () => {
    const proxy = read('src/proxy.ts')
    const needsAuth = proxy.slice(proxy.indexOf('const needsAuth'), proxy.indexOf('if (needsAuth'))
    expect(needsAuth).toContain("pathname === '/wallet'")
    expect(needsAuth).toContain("pathname.startsWith('/wallet/')")
  })

  it('is disallowed for crawlers and marked noindex', () => {
    expect(read('src/app/robots.ts')).toContain("'/wallet'")
    expect(read('src/app/(store)/wallet/page.tsx')).toContain('index: false')
  })

  it('is a static route the legacy redirect map knows about', () => {
    const map = JSON.parse(readFileSync(join(root, 'data/legacy/redirect-map.json'), 'utf8')) as {
      $targets: { static_routes: string[] }
      redirects: { source: string }[]
    }
    expect(map.$targets.static_routes).toContain('/wallet')
    expect(map.redirects.find((r) => r.source === '/wallet')).toBeUndefined()
  })
})
