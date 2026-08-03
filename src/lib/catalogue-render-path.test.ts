import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The catalogue routes must not reach the cookie-reading Supabase client.
 *
 * WHY A TEST AND NOT A NOTE. `(store)/layout.tsx` already carries the warning
 * in prose -- "adding an `await` back up here silently undoes all of it, and
 * nothing fails to warn you: the page still works, it is just dynamic again".
 * That is exactly what happened: [42] cached the product page's own four
 * tables and `RelatedProducts` kept reading through `createClient()` one level
 * down, so the page still carried `x-nextjs-postponed: 1`, still answered
 * `Cache-Control: private, no-store`, and still paid one full Supabase round
 * trip on every view. Measured on a clean build before the fix: TTFB 4ms, full
 * response 268-289ms on `/product/[slug]` and 273-327ms on `/category/[slug]`,
 * against a warm keep-alive round trip to this project of 266-313ms.
 *
 * A regression here costs nothing visible. Nothing throws, nothing logs, the
 * page renders the right pixels; it just stops being cacheable. So the guard
 * walks the whole transitive import graph of each catalogue entry point rather
 * than sampling the file that happened to be wrong this time -- the lesson
 * [43] wrote down after [17]'s one-card check missed 31 broken images.
 */

const SRC = resolve(__dirname, '..')
const COOKIE_CLIENT = '@/lib/supabase/server'

/** Entry points whose whole tree has to stay cookie-free. */
const CATALOGUE_ENTRIES = [
  'app/(store)/page.tsx',
  'app/(store)/product/[slug]/page.tsx',
  'app/(store)/category/[slug]/page.tsx',
  'app/(store)/products/page.tsx',
  'app/(store)/layout.tsx',
]

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx']

function resolveModule(spec: string, fromFile: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = resolve(SRC, spec.slice(2))
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec)
  else return null // a bare package specifier: not our source

  for (const ext of EXTENSIONS) {
    if (existsSync(base + ext)) return base + ext
    const asIndex = resolve(base, `index${ext}`)
    if (existsSync(asIndex)) return asIndex
  }
  return existsSync(base) && base.match(/\.[jt]sx?$/) ? base : null
}

/** Every `from '...'` specifier in a file, static imports and re-exports alike. */
function importsOf(source: string): string[] {
  const specs: string[] = []
  const re = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: the standard exec-loop form.
  while ((m = re.exec(source)) !== null) specs.push(m[1] as string)
  return specs
}

/**
 * A `'use server'` module is where the walk stops, and that is not a loophole.
 *
 * Those modules are POST endpoints reached by a click, not code the renderer
 * runs, and a cookie read is the whole point of one -- `server/actions/cart.ts`
 * has to know whose cart it is. They enter the graph only because a client
 * component imports the action reference to bind to a button, so following
 * them would flag every page carrying an "add to cart" button, which is all of
 * them, and the guard would have to be deleted to get the suite green.
 */
function isServerAction(source: string): boolean {
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use server['"]/.test(source)
}

/** Files reachable from `entry`, and the path taken to each one. */
function reachableFrom(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>()
  const queue: Array<{ file: string; trail: string[] }> = [{ file: entry, trail: [entry] }]

  while (queue.length > 0) {
    const { file, trail } = queue.shift() as { file: string; trail: string[] }
    if (seen.has(file)) continue

    const source = readFileSync(file, 'utf8')
    // Not recorded at all, so it is neither traversed nor reported.
    if (isServerAction(source)) continue
    seen.set(file, trail)

    for (const spec of importsOf(source)) {
      const target = resolveModule(spec, file)
      if (target && !seen.has(target)) queue.push({ file: target, trail: [...trail, target] })
    }
  }
  return seen
}

describe('catalogue render path', () => {
  for (const entry of CATALOGUE_ENTRIES) {
    it(`${entry} reaches no cookie-reading Supabase client`, () => {
      const entryPath = resolve(SRC, entry)
      expect(existsSync(entryPath), `${entry} does not exist`).toBe(true)

      const offenders: string[] = []
      for (const [file, trail] of reachableFrom(entryPath)) {
        if (importsOf(readFileSync(file, 'utf8')).includes(COOKIE_CLIENT)) {
          offenders.push(trail.map((p) => p.replace(`${SRC}/`, '')).join(' -> '))
        }
      }

      // One template literal, not concatenated pieces: [20] measured that the
      // build drops the tail of every `+`-joined operand.
      expect(
        offenders,
        `These modules import ${COOKIE_CLIENT}, which makes the route dynamic and costs one Supabase round trip per view. Move the read behind \`use cache\` on \`createPublicClient\` (see lib/related-products.ts).`,
      ).toEqual([])
    })
  }

  it('walks a real graph, not an empty one', () => {
    // Without this the suite above passes vacuously if the resolver breaks.
    const reached = reachableFrom(resolve(SRC, 'app/(store)/product/[slug]/page.tsx'))
    expect(reached.size).toBeGreaterThan(20)
    expect([...reached.keys()].some((f) => f.endsWith('lib/related-products.ts'))).toBe(true)
    expect([...reached.keys()].some((f) => f.endsWith('lib/product-detail.ts'))).toBe(true)
  })
})
