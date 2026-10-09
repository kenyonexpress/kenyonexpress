import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * WHAT EVERY ROUTE'S FIRST LOAD MAY NOT CONTAIN.
 *
 * The root layout and the storefront layout render on every public page, so
 * a static import in any client component they mount is paid by every visit
 * to the site. That is the one place where a single `import` line has a
 * site-wide cost, and it is the place where one did: `SentryUserSync`
 * imported `@/lib/supabase/client` statically and shipped the Supabase
 * browser client (62.8 KB gzipped, measured 2026-09-17 with
 * scripts/route-js-report.mjs) on routes with no auth UI.
 *
 * This ratchet reads the two layouts, follows their `@/components/...`
 * imports one level into client components, and refuses a static import of
 * the packages below from any of them. A dynamic `import()` is allowed; that
 * is the fix, not the problem. It is a text test on purpose: the bundle is
 * only measurable after `pnpm build`, and `pnpm test` runs before it.
 */

const root = resolve(__dirname, '../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

const LAYOUTS = ['src/app/layout.tsx', 'src/app/(store)/layout.tsx']

/**
 * Packages that have no business on a storefront first load. Each one is a
 * capability the page does not use until the visitor does something.
 */
const NOT_ON_FIRST_LOAD = [
  '@/lib/supabase/client',
  '@supabase/ssr',
  '@supabase/supabase-js',
  'posthog-js',
  '@simplewebauthn/browser',
  'pdf-lib',
  'qrcode',
  '@dnd-kit/core',
]

function staticImports(source: string): string[] {
  return [...source.matchAll(/^import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? '')
}

function isClientComponent(source: string): boolean {
  return /^\s*'use client'/.test(source)
}

/** `@/components/x/Y` -> `src/components/x/Y.tsx`, or null if not resolvable. */
function componentPath(specifier: string): string | null {
  if (!specifier.startsWith('@/')) return null
  const base = `src/${specifier.slice(2)}`
  for (const candidate of [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`]) {
    if (existsSync(resolve(root, candidate))) return candidate
  }
  return null
}

describe('the client components every route mounts', () => {
  const mounted = new Map<string, string>()
  for (const layout of LAYOUTS) {
    for (const spec of staticImports(read(layout))) {
      const path = componentPath(spec)
      if (!path) continue
      const source = read(path)
      if (isClientComponent(source)) mounted.set(path, source)
    }
  }

  it('finds the islands it is guarding', () => {
    // If a refactor renames the layouts or moves the islands, this test must
    // go red rather than pass over an empty set.
    expect([...mounted.keys()]).toContain('src/components/observability/SentryUserSync.tsx')
    expect(mounted.size).toBeGreaterThanOrEqual(4)
  })

  it('import none of the deferred packages statically', () => {
    const offenders: string[] = []
    for (const [path, source] of mounted) {
      for (const spec of staticImports(source)) {
        if (NOT_ON_FIRST_LOAD.some((pkg) => spec === pkg || spec.startsWith(`${pkg}/`))) {
          offenders.push(`${path} -> ${spec}`)
        }
      }
    }
    expect(offenders, 'static imports that put a deferred package on every first load').toEqual([])
  })

  it('SentryUserSync loads the Supabase client with a dynamic import', () => {
    const source = mounted.get('src/components/observability/SentryUserSync.tsx') ?? ''
    expect(source).toContain("import('@/lib/supabase/client')")
    expect(source).toContain('requestIdleCallback')
  })
})
