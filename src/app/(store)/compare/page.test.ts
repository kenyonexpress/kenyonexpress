import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `/compare` (STEP 56) is a static route the old site also had, as a YITH
 * plugin page that 192 seeded as a 410. Server pages are not rendered in
 * this suite (see overview.test.ts), so this reads the sources for the
 * things that would each fail silently:
 *
 *   1. the page is the client view and nothing else, and says noindex;
 *   2. robots.txt keeps the path out of the index;
 *   3. the legacy redirect map knows the route as live, so no 410 row can
 *      shadow it (the /wishlist finding of STEP 12), and the generator's
 *      config no longer lists it as gone;
 *   4. the pending migration that retires the production row exists and
 *      names both shadowed routes;
 *   5. the tray is mounted in the deferred store chrome, and every card
 *      carries the control beside the heart.
 */

const root = process.cwd()
const read = (rel: string) =>
  readFileSync(join(root, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('/compare', () => {
  it('renders the client view and is marked noindex', () => {
    const page = read('src/app/(store)/compare/page.tsx')
    expect(page).toContain("from '@/components/compare/ComparePageView'")
    expect(page).toContain('<ComparePageView />')
    expect(page).toMatch(/robots:\s*\{\s*index:\s*false/)
  })

  it('is disallowed for crawlers', () => {
    expect(read('src/app/robots.ts')).toContain("'/compare'")
  })

  it('is a static route the legacy redirect map knows about, with no 410 row', () => {
    const map = JSON.parse(readFileSync(join(root, 'data/legacy/redirect-map.json'), 'utf8')) as {
      $targets: { static_routes: string[] }
      redirects: { source: string }[]
      excluded: { source: string; reason: string }[]
    }
    expect(map.$targets.static_routes).toContain('/compare')
    expect(map.redirects.find((r) => r.source === '/compare')).toBeUndefined()
    expect(map.excluded.find((r) => r.source === '/compare')?.reason).toBe('source_is_live')
    // The generator's own table: a `gone` entry here would come back on the
    // next regeneration as a 410 row and take the page down again.
    const config = read('scripts/wp-import/config.mjs')
    expect(config).not.toMatch(/'\/compare':\s*\{\s*gone/)
    expect(config).toMatch(/'\/yith-compare':\s*\{\s*gone/)
  })

  it('has a pending migration that retires the production 410 rows', () => {
    const sql = readFileSync(
      join(root, 'migrations/pending/263_seo_redirects_release_compare.sql'),
      'utf8',
    )
    expect(sql).toMatch(/update public\.seo_redirects\s+set is_active = false/)
    expect(sql).toContain("'/compare'")
    expect(sql).toContain("'/wishlist'")
    expect(sql).toMatch(/and status_code = 410/)
    expect(sql).toMatch(/-- ROLLBACK:/)
  })

  it('mounts the tray in the deferred chrome and the control on every card', () => {
    expect(read('src/components/store/DeferredStoreChrome.tsx')).toContain('<CompareBar />')
    for (const card of [
      'src/components/ProductCard.tsx',
      'src/components/ProductDealCard.tsx',
      'src/components/category/CategoryProductCard.tsx',
    ]) {
      const src = read(card)
      expect(src, card).toContain("from '@/components/compare/CompareButton'")
      expect(src, card).toMatch(/<CompareButton[\s\S]*?variant="overlay"/)
    }
    const info = read('src/components/storefront/ProductInfo.tsx')
    expect(info).toMatch(/<CompareButton productId=\{productId\} variant="inline" \/>/)
  })
})
