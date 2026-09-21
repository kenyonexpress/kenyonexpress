import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HIGH_VOLUME_ROUTES } from './with-request-log'

/**
 * The exemption list in `with-request-log.ts` silences the 2xx completion line
 * on the routes that are called far more often than they are interesting.
 *
 * It is a list of strings compared against another string, which is the shape
 * that rots without anyone noticing: rename `/api/search/suggest`, and nothing
 * fails, nothing warns, and the typeahead quietly starts writing one info line
 * per keystroke -- the exact bill the list exists to avoid. The reverse is just
 * as silent: delete a route and the list keeps claiming to silence it.
 *
 * So the list is checked against the handlers that actually register, read from
 * the source rather than assumed.
 */

const API = resolve(__dirname, '../../app/api')

function routeFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) found.push(...routeFiles(path))
    else if (/route\.tsx?$/.test(path)) found.push(path)
  }
  return found
}

/** Every name any route handler passes to `withRequestLog`. */
const registered = new Set<string>()
for (const file of routeFiles(API)) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(/withRequestLog\(\s*'([^']+)'/g)) {
    if (match[1]) registered.add(match[1])
  }
}

describe('HIGH_VOLUME_ROUTES', () => {
  it('found the route handlers to compare against, so an empty scan cannot pass', () => {
    expect(registered.size).toBeGreaterThan(30)
  })

  it('names only routes that really register a handler', () => {
    const orphans = [...HIGH_VOLUME_ROUTES].filter((route) => !registered.has(route))
    expect(orphans, 'listed as high volume but no handler registers that name').toEqual([])
  })

  it('stays small, because every name on it is a route with no latency record', () => {
    // Not a style rule. A route in here emits nothing at `info`, so it has no
    // p95 in the dashboard and no row in the routes table. That is a real cost
    // and it is paid three times on purpose; a list that grows is a dashboard
    // going blind one route at a time.
    expect(HIGH_VOLUME_ROUTES.size).toBeLessThanOrEqual(4)
  })
})
