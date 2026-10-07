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

// The walk is one level deep on purpose (a layout's own islands), so the
// store shell is listed beside the layout that renders it: `(store)/layout.tsx`
// imports nothing but the shell now, and its islands live in the shell.
const LAYOUTS = [
  'src/app/layout.tsx',
  'src/app/(store)/layout.tsx',
  'src/components/store/StoreShell.tsx',
]

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
  // STEP 34: the browser SDK was ~95 KB gzipped in the shared root chunk of
  // every route. It is loaded by lib/observability/sentry-browser.ts on idle
  // or on the first error, never statically from a first-load module.
  '@sentry/nextjs',
]

/**
 * Modules that are in every first load WITHOUT being layout islands: the
 * error boundaries ship with the root segment, the instrumentation file runs
 * before hydration, and the rest are the client graphs of the storefront's
 * busiest routes. Each row names the package that was measured in its chunk
 * (STEP 34, `node scripts/route-js-report.mjs`) and must stay out of it.
 * `import type` is allowed: types are erased.
 */
const MUST_NOT_IMPORT: Array<[file: string, packages: string[]]> = [
  ['instrumentation-client.ts', ['@sentry/nextjs']],
  ['src/app/error.tsx', ['@sentry/nextjs']],
  ['src/app/global-error.tsx', ['@sentry/nextjs']],
  ['src/components/observability/SentryUserSync.tsx', ['@sentry/nextjs']],
  // 61.7 KB raw / 14.5 KB gz of zod on the home route, via the tracker.
  ['src/lib/analytics/events.ts', ['zod']],
  ['src/lib/analytics/attribution.ts', ['zod']],
  ['src/lib/analytics/tracker.ts', ['zod']],
  // 40 KB raw / 11.8 KB gz of sonner on every store route, via `toast()`.
  ['src/components/cart/CartProvider.tsx', ['sonner']],
  // 242 KB raw / 63.6 KB gz of the Supabase browser client on /product.
  ['src/lib/product-live/use-product-live.ts', ['@/lib/supabase/client', '@supabase/ssr']],
  ['src/components/account/NotificationBell.tsx', ['@/lib/supabase/client', '@supabase/ssr']],
]

function staticImports(source: string): string[] {
  return [...source.matchAll(/^import\s(?!type\s)[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? '')
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

  it('SentryUserSync never loads the Supabase browser client, and defers its one call', () => {
    // Until 2026-10-01 this lazy-loaded the browser client to read the session
    // cookie. The cookie is HttpOnly since STEP 18, so the id now comes from
    // the `currentUserId` server action; the 62.8 KB gzipped bundle must not
    // come back on any route, statically or dynamically.
    const source = mounted.get('src/components/observability/SentryUserSync.tsx') ?? ''
    expect(source).not.toContain('@/lib/supabase/client')
    expect(source).toContain('currentUserId')
    expect(source).toContain('requestIdleCallback')
  })
})

describe('the modules every first load carries without being a layout island', () => {
  it.each(MUST_NOT_IMPORT)('%s does not statically import %j', (file, packages) => {
    const source = read(file)
    const offenders = staticImports(source).filter((spec) =>
      packages.some((pkg) => spec === pkg || spec.startsWith(`${pkg}/`)),
    )
    expect(offenders, `${file} must load these lazily, not on first paint`).toEqual([])
  })

  it('the loader imports the named subset, never the package namespace', () => {
    // `import('@sentry/nextjs')` keeps every export alive: measured at 549 KB
    // raw with replay and feedback inside, against ~250 KB through the subset.
    const loader = read('src/lib/observability/sentry-browser.ts')
    expect(loader).not.toContain("import('@sentry/nextjs')")
    expect(loader).toContain("import('./sentry-browser-sdk')")
    const subset = read('src/lib/observability/sentry-browser-sdk.ts')
    expect(subset).not.toMatch(/export \* from/)
  })

  it('the boundaries still report, through the loader', () => {
    for (const file of ['src/app/error.tsx', 'src/app/global-error.tsx']) {
      const source = read(file)
      expect(source).toContain("from '@/lib/observability/sentry-browser'")
      expect(source).toContain('Sentry.captureException(error)')
    }
  })
})
