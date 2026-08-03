import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The two ways this work quietly comes undone.
 *
 * A logger is only worth having if everything uses it, and both regressions
 * here are invisible: a new `console.error` still prints, and a new route
 * handler still answers. Nothing fails, the lines simply stop being
 * correlatable -- and the reason [46] wrote a graph walk instead of a spot
 * check was exactly this, that a guard which samples the file that happened to
 * be wrong this time does not hold.
 */

const SRC = resolve(__dirname, '../..')

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path))
    else if (/\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path)) found.push(path)
  }
  return found
}

const ALL = sourceFiles(SRC)
const rel = (path: string) => relative(SRC, path)

/**
 * Both exemptions are the same fact: `log.ts` reads its request id out of
 * node:async_hooks, which cannot be in a client bundle.
 *
 * - `observability/log.ts` is the sink itself.
 * - `app/error.tsx` is a client error boundary. It runs in the browser, where
 *   there is no server request to correlate to.
 */
const ALLOWED_CONSOLE = new Set(['lib/observability/log.ts', 'app/error.tsx'])

describe('raw console in src/', () => {
  it('is confined to the sink and the client error boundary', () => {
    const offenders = ALL.filter((file) => {
      if (ALLOWED_CONSOLE.has(rel(file))) return false
      return /(^|[^.\w])console\s*\.\s*(log|info|warn|error|debug)\s*\(/.test(
        readFileSync(file, 'utf8'),
      )
    }).map(rel)

    expect(offenders).toEqual([])
  })
})

describe('the request-id storage', () => {
  it('is named by exactly one module, and that module is server-only', () => {
    const importers = ALL.filter((file) =>
      /from ['"]node:async_hooks['"]/.test(readFileSync(file, 'utf8')),
    ).map(rel)

    // More than one is not a style problem. Turbopack builds a client chunk
    // item for every `'use server'` module, and a Node built-in anywhere in
    // that graph fails the build -- which is how this arrangement was arrived
    // at in the first place.
    expect(importers).toEqual(['lib/observability/request-store.ts'])
  })

  it('is bound by callback everywhere, never by enterWith', () => {
    // `enterWith` was probed and rejected: it binds nothing when called from an
    // awaited helper, and leaks upward out of the request when it does bind.
    // See request-context.ts for the measurement.
    const users = ALL.filter((file) => /\benterWith\s*\(/.test(readFileSync(file, 'utf8'))).map(rel)

    expect(users).toEqual([])
  })

  it('is installed by instrumentation, which is what covers Server Functions', () => {
    // An action cannot import the store: see above. If this import goes, every
    // action logs `request_id: null` and nothing fails to warn you.
    const instrumentation = readFileSync(resolve(SRC, 'instrumentation.ts'), 'utf8')
    expect(instrumentation).toContain('observability/request-store')
  })
})

describe('route handlers', () => {
  const routes = ALL.filter((file) => /(^|\/)app\/api\/.*\/route\.ts$/.test(rel(file)))

  it('exist to be checked', () => {
    expect(routes.length).toBeGreaterThan(10)
  })

  it('all acquire a request id at their boundary', () => {
    const unwrapped = routes
      .filter((file) => {
        const source = readFileSync(file, 'utf8')
        // A route that only re-exports another route's handler inherits its
        // wrapper; wrapping it twice would mint nothing new and relabel the
        // route it actually ran as.
        if (/^export \{[^}]*\} from /m.test(source)) return false
        return !source.includes('withRequestLog(')
      })
      .map(rel)

    expect(unwrapped).toEqual([])
  })

  it('do not export a bare handler alongside the wrapped one', () => {
    // `export async function POST` next to `export const POST` is a duplicate
    // identifier, but `export async function GET` beside a wrapped POST is not
    // -- and that GET would run with no context at all.
    const bare = routes
      .filter((file) =>
        /^export async function (GET|POST|PUT|PATCH|DELETE)\(/m.test(readFileSync(file, 'utf8')),
      )
      .map(rel)

    expect(bare).toEqual([])
  })
})
