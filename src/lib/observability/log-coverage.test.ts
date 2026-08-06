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

describe('Server Functions', () => {
  const actionModules = ALL.filter((file) => /^'use server'/.test(readFileSync(file, 'utf8')))

  it('exist to be checked', () => {
    expect(actionModules.length).toBeGreaterThan(20)
  })

  it('each export goes through withActionContext exactly once', () => {
    // The delegate pattern is one wrapper call per exported action, so the two
    // counts move together. This catches both halves of the regression: a new
    // action added without a wrapper, and a body function that was left
    // exported next to its own delegate (which is what a client would then
    // bind to, running with no context at all).
    //
    // A module that only re-exports another's actions (app/actions/auth.ts)
    // has none of either and inherits the wrapping, so it passes unremarked.
    const mismatched = actionModules
      .map((file) => ({
        file: rel(file),
        exported: readFileSync(file, 'utf8').match(/^export async function /gm)?.length ?? 0,
        wrapped: readFileSync(file, 'utf8').match(/withActionContext\(/g)?.length ?? 0,
      }))
      .filter((m) => m.exported !== m.wrapped)

    expect(mismatched).toEqual([])
  })

  it('name themselves distinctly', () => {
    // Two actions sharing a label is not a build error and not a runtime one.
    // It is only ever discovered while reading logs, at which point the two are
    // already indistinguishable.
    const labels = actionModules.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/withActionContext\(\s*'([^']+)'/g)].map(
        (match) => match[1],
      ),
    )
    const duplicates = labels.filter((label, i) => labels.indexOf(label) !== i)

    expect(duplicates).toEqual([])
    expect(labels.length).toBeGreaterThan(70)
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
