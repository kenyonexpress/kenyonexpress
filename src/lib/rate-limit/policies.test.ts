import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  RATE_LIMIT_POLICIES,
  type RateLimitPolicyName,
  legacyRedisKey,
  policy,
  postgresKey,
  redisKey,
} from './policies'

const DEFAULT_LIMIT = 10
const DEFAULT_WINDOW_SECONDS = 3600

describe('the policy table', () => {
  it('states a positive integer limit and window for every row', () => {
    for (const [name, p] of Object.entries(RATE_LIMIT_POLICIES)) {
      expect(Number.isInteger(p.limit), `${name}.limit`).toBe(true)
      expect(p.limit, `${name}.limit`).toBeGreaterThan(0)
      expect(Number.isInteger(p.windowSeconds), `${name}.windowSeconds`).toBe(true)
      expect(p.windowSeconds, `${name}.windowSeconds`).toBeGreaterThan(0)
      expect(p.reason.length, `${name}.reason`).toBeGreaterThan(10)
    }
  })

  /**
   * Two policies sharing a counter is the failure this guards. `reset` and
   * `reset-address` are the live near-miss: they differ by a suffix, and if the
   * key were `reset:` + identifier for both, a password-reset request for
   * `a@b.com` would spend the per-IP budget as well, halving a limit that reads
   * as two independent ones.
   */
  it('gives no policy a name that prefixes another at a segment boundary', () => {
    const names = Object.keys(RATE_LIMIT_POLICIES)
    for (const name of names) {
      for (const other of names) {
        if (name === other) continue
        expect(other.startsWith(`${name}:`), `${other} would collide with ${name}`).toBe(false)
      }
    }
  })
})

describe('key construction', () => {
  it('builds the same Redis key from the split form and the composed form', () => {
    for (const name of Object.keys(RATE_LIMIT_POLICIES) as RateLimitPolicyName[]) {
      const identifier = '203.0.113.5'
      expect(redisKey(name, identifier)).toBe(legacyRedisKey(postgresKey(name, identifier)))
    }
  })

  it('keeps the Postgres key byte-identical to what the call sites already write', () => {
    // These rows exist in production right now. A fallback that keyed them
    // differently would count in a brand new bucket at exactly the moment
    // Upstash is down, which is the moment the limit matters most.
    expect(postgresKey('phone-otp-number', '+972500000000')).toBe('phone-otp-number:+972500000000')
    expect(postgresKey('cart_write', 'user:abc')).toBe('cart_write:user:abc')
    expect(postgresKey('begin_checkout', 'user:abc')).toBe('begin_checkout:user:abc')
  })

  it('namespaces and versions the Redis key', () => {
    expect(redisKey('login', '203.0.113.5')).toBe('rl:v1:login:203.0.113.5')
  })
})

/**
 * THE INVENTORY. Every `checkRateLimit` call in the tree is read out of the
 * source and matched against the table.
 *
 * WHY STATICALLY AND NOT BY CALLING IT. A unit test can only cover the call
 * sites somebody remembered to write a unit test for, and the numbers that were
 * wrong before this table existed were wrong precisely where nobody was
 * looking. Reading the source finds the twenty-eighth call site as reliably as
 * the first, and it fails on the commit that ADDS a limit the table does not
 * know about rather than on the deploy that needs it.
 */
type CallSite = { file: string; name: string; limit: number; windowSeconds: number }

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') sourceFiles(full, found)
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      found.push(full)
    }
  }
  return found
}

/**
 * One call site passes a module constant rather than a literal
 * (`RATE_LIMIT_PER_MINUTE` in the analytics beacon). Resolving it from the same
 * file is three lines and keeps the scan honest; skipping non-literals would
 * let anyone hide a limit from this test by naming it.
 */
function resolveNumber(token: string | undefined, source: string): number | null {
  if (token === undefined) return null
  if (/^\d+$/.test(token)) return Number(token)
  const declared = new RegExp(`const\\s+${token}\\s*=\\s*(\\d+)`).exec(source)
  return declared ? Number(declared[1]) : Number.NaN
}

function scanCallSites(): CallSite[] {
  const root = join(process.cwd(), 'src')
  const pattern =
    /checkRateLimit\(\s*`([A-Za-z0-9_-]+):[\s\S]*?`\s*(?:,\s*([A-Za-z0-9_]+)\s*,\s*([A-Za-z0-9_]+)\s*)?,?\s*\)/g
  const sites: CallSite[] = []
  for (const file of sourceFiles(root)) {
    const source = readFileSync(file, 'utf8')
    if (!source.includes('checkRateLimit(')) continue
    for (const match of source.matchAll(pattern)) {
      sites.push({
        file: relative(process.cwd(), file),
        name: match[1] as string,
        limit: resolveNumber(match[2], source) ?? DEFAULT_LIMIT,
        windowSeconds: resolveNumber(match[3], source) ?? DEFAULT_WINDOW_SECONDS,
      })
    }
  }
  return sites
}

describe('the table against the call sites', () => {
  const sites = scanCallSites()

  it('finds the call sites at all, so a broken scan cannot pass silently', () => {
    // 28 on 2026-08-21. The assertion is a floor, not an equality: adding a
    // limit should not fail this test, only fail the one below if the table
    // does not know about it.
    expect(sites.length).toBeGreaterThanOrEqual(28)
  })

  it('knows every key prefix in use', () => {
    const unknown = sites.filter((s) => !(s.name in RATE_LIMIT_POLICIES))
    expect(unknown.map((s) => `${s.name} (${s.file})`)).toEqual([])
  })

  it('agrees with every call site on the limit and the window', () => {
    const disagreements = sites
      .filter((s) => s.name in RATE_LIMIT_POLICIES)
      .filter((s) => {
        const p = policy(s.name as RateLimitPolicyName)
        return p.limit !== s.limit || p.windowSeconds !== s.windowSeconds
      })
      .map((s) => {
        const p = policy(s.name as RateLimitPolicyName)
        return `${s.file}: ${s.name} is ${s.limit}/${s.windowSeconds}s, table says ${p.limit}/${p.windowSeconds}s`
      })
    expect(disagreements).toEqual([])
  })

  it('has no row in the table that no call site uses', () => {
    const used = new Set(sites.map((s) => s.name))
    const orphans = Object.keys(RATE_LIMIT_POLICIES).filter((name) => !used.has(name))
    expect(orphans).toEqual([])
  })
})
