import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every API route answers with a request id, and says so on one log line.
 *
 * A spot check does not hold this. The regression is a new `export async
 * function GET` written the ordinary way: it works, it answers, it is reviewed
 * and merged, and the only thing that happens is that one route stops being
 * correlatable and nobody notices for a month. So this walks the directory
 * rather than naming files.
 */

const API = resolve(__dirname, '../../app/api')

function routeFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) found.push(...routeFiles(path))
    else if (entry === 'route.ts' || entry === 'route.tsx') found.push(path)
  }
  return found
}

const ROUTES = routeFiles(API)

describe('src/app/api', () => {
  it('has routes to check, so a broken walk cannot pass as compliance', () => {
    expect(ROUTES.length).toBeGreaterThan(20)
  })

  it('wraps every handler, so every response carries x-request-id', () => {
    const offenders = ROUTES.filter((file) => {
      const text = readFileSync(file, 'utf8')
      if (text.includes('withRequestLog')) return false
      // An alias route re-exports a handler that is already wrapped; wrapping
      // it twice would mint a second id for one request.
      if (/export\s*{\s*(GET|POST|PUT|PATCH|DELETE)[^}]*}\s*from/.test(text)) return false
      return true
    }).map((file) => relative(API, file))

    expect(offenders).toEqual([])
  })

  it('exports no handler that bypasses the wrapper', () => {
    // The subtler version of the same regression: a file that DOES import
    // withRequestLog for its GET and then adds a bare POST underneath.
    const offenders = ROUTES.filter((file) =>
      /export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/.test(readFileSync(file, 'utf8')),
    ).map((file) => relative(API, file))

    expect(offenders).toEqual([])
  })
})
