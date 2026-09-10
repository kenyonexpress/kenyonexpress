import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * EVERY ROUTE GROUP THAT HAS PAGES HAS A BOUNDARY, AND EVERY BOUNDARY IS RTL
 * HEBREW.
 *
 * MEASURED 2026-09-10: five of the ten route groups had one. `(store)` did not,
 * which is the storefront - category, product, search, cart, order - so a throw
 * on a product page replaced the whole page, header and mini-cart included, with
 * the root apology. `(auth)` did not, so a customer whose password reset threw
 * was offered the storefront home page and no way back into the flow.
 *
 * WHAT AN error.tsx DOES NOT CATCH, since a boundary that is believed in is
 * worse than none: it catches throws from its segment's CHILDREN, not from the
 * layout of its own segment. An error inside `(admin)/layout.tsx` still reaches
 * `global-error.tsx`. That is why this test asks for a file per group and does
 * not claim the group is fully covered by it.
 *
 * The `dir="rtl"` requirement is on the shared component; a boundary that used
 * it renders RTL, and one that hand-rolls its own markup has to say so itself.
 */

const APP = resolve(process.cwd(), 'src/app')

const catalog = JSON.parse(
  readFileSync(resolve(process.cwd(), 'messages/he.json'), 'utf8'),
) as Record<string, unknown>

/** `errorBoundary.storeTitle` -> the Hebrew string, or undefined. */
function lookup(key: string): string | undefined {
  let node: unknown = catalog
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : undefined
}

function hasPage(dir: string): boolean {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (hasPage(full)) return true
    } else if (entry === 'page.tsx') {
      return true
    }
  }
  return false
}

/** Route groups: `(name)` directories directly under src/app. */
const groups = readdirSync(APP)
  .filter((entry) => entry.startsWith('(') && entry.endsWith(')'))
  .filter((entry) => statSync(join(APP, entry)).isDirectory())
  .sort()

describe('per-segment error boundaries', () => {
  it('finds the route groups, so a restructure cannot empty this test', () => {
    expect(groups.length).toBeGreaterThanOrEqual(8)
  })

  it('gives every route group that serves a page its own error.tsx', () => {
    const missing = groups.filter((group) => {
      const dir = join(APP, group)
      if (!hasPage(dir)) return false // (shop) and (marketing) hold no pages today
      try {
        statSync(join(dir, 'error.tsx'))
        return false
      } catch {
        return true
      }
    })
    expect(missing, 'route groups with pages and no error boundary').toEqual([])
  })

  it('keeps the root and global boundaries, which cover different failures', () => {
    // error.tsx cannot catch a throw in the root layout; global-error.tsx can,
    // and it has to ship its own <html> because the layout it replaces is the
    // one that failed.
    expect(() => statSync(join(APP, 'error.tsx'))).not.toThrow()
    const globalError = readFileSync(join(APP, 'global-error.tsx'), 'utf8')
    expect(globalError).toMatch(/<html/)
    expect(globalError).toMatch(/dir="rtl"/)
  })

  it('renders Hebrew RTL in every boundary', () => {
    const shared = readFileSync(
      resolve(process.cwd(), 'src/components/errors/SegmentErrorBoundary.tsx'),
      'utf8',
    )
    expect(shared).toMatch(/dir="rtl"/)

    for (const group of groups) {
      let source: string
      try {
        source = readFileSync(join(APP, group, 'error.tsx'), 'utf8')
      } catch {
        continue
      }
      const usesShared = source.includes('SegmentErrorBoundary')
      expect(
        usesShared || /dir="rtl"/.test(source),
        `${group}/error.tsx neither uses SegmentErrorBoundary nor sets dir="rtl" itself`,
      ).toBe(true)
      // Hebrew copy, not an English fallback nobody translated. It may be
      // inline or a catalog key, and a catalog key is checked through to the
      // Hebrew string rather than trusted for existing: `t()` is typed, so a
      // missing key does not compile, but a key holding English would.
      const keys = [...source.matchAll(/t\('([\w.]+)'\)/g)]
        .map((match) => match[1])
        .filter((key): key is string => Boolean(key))
      const fromCatalog = keys.map((key) => lookup(key))
      const hebrew = [source, ...fromCatalog].some((text) => /[֐-׿]/.test(text ?? ''))
      expect(hebrew, `${group}/error.tsx has no Hebrew copy, inline or in the catalog`).toBe(true)
    }
  })
})
