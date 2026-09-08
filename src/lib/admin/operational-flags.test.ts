import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listOperationalFlags } from './feature-flags'

/**
 * THE FLAGS PAGE SHOWED FOUR SWITCHES AND THE SYSTEM HAS ELEVEN.
 *
 * `KILL_SWITCHES` is a typed map with a real contract: one subsystem, one
 * variable, and a degraded path that is correct rather than broken. Four things
 * satisfy it, and the admin page listed exactly those four under the heading
 * "system flags".
 *
 * Measured 2026-09-08: seven other environment variables gate real behaviour
 * and appeared nowhere on it. The one that matters is `CARDCOM_USE_MOCK` -
 * KNOWN-ISSUES #1 records it as the launch blocker, production checkout runs
 * against the mock provider, and it is the switch that decides whether a charge
 * is real. A page called "system flags" that omits it is not incomplete, it is
 * reassuring.
 */
const ROOT = resolve(__dirname, '..', '..', '..')

/** `NodeJS.ProcessEnv` requires NODE_ENV, so a bare object literal will not do. */
const env = (extra: Record<string, string> = {}): NodeJS.ProcessEnv =>
  ({ NODE_ENV: 'test', ...extra }) as NodeJS.ProcessEnv

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      walk(full, out)
      continue
    }
    if (/\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

const SOURCE = walk(join(ROOT, 'src'))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n')

describe('the money switch is on the page', () => {
  it('lists CARDCOM_USE_MOCK', () => {
    expect(listOperationalFlags(env()).map((f) => f.envName)).toContain('CARDCOM_USE_MOCK')
  })

  it('marks it as affecting money, so it cannot be read as one toggle among six', () => {
    const mock = listOperationalFlags(env()).find((f) => f.envName === 'CARDCOM_USE_MOCK')
    expect(mock?.money).toBe(true)
  })

  it('is the only one so marked, so the badge keeps meaning something', () => {
    expect(listOperationalFlags(env()).filter((f) => f.money)).toHaveLength(1)
  })
})

describe('every env flag that gates behaviour is on one of the two tables', () => {
  /**
   * Derived from the source rather than hand-listed, so a new flag added
   * anywhere in src/ fails here until somebody decides which table it belongs
   * on. That decision is the point: a kill switch has a degraded path and an
   * operational flag does not.
   */
  const GATING = new Set(
    [...SOURCE.matchAll(/env\.([A-Z_]*(?:ENABLED|USE_MOCK|DEBUG_ROUTES)[A-Z_]*)/g)]
      .map((m) => m[1])
      .filter((name): name is string => Boolean(name)),
  )
  const listed = new Set([
    ...listOperationalFlags(env()).map((f) => f.envName),
    // The client mirror of PHONE_AUTH_ENABLED. Same decision, same row.
    'NEXT_PUBLIC_PHONE_AUTH_ENABLED',
    // Set by the workflow rather than the app, and visible in cron.yml.
    'CRON_SCHEDULER_ENABLED',
    // The checkout gate is the payment provider's own, covered by CARDCOM_USE_MOCK's row.
    'CHECKOUT_ENABLED',
  ])

  it('finds gating flags at all, so a regex change cannot empty this test', () => {
    expect(GATING.size).toBeGreaterThanOrEqual(5)
  })

  for (const flag of GATING) {
    it(`${flag} is accounted for`, () => {
      expect(
        listed.has(flag),
        `${flag} gates behaviour and is on neither table. Add it to OPERATIONAL in feature-flags.ts, or to KILL_SWITCHES if it has a correct degraded path.`,
      ).toBe(true)
    })
  }
})

describe('on is a deliberate value', () => {
  it('does not read a stray string as enabled', () => {
    // Matches kill-switches.ts: a "0" or "false" copied into an env block must
    // not turn the payment mock on.
    for (const value of ['0', 'false', 'off', '', 'TRUE ']) {
      const flags = listOperationalFlags(env({ CARDCOM_USE_MOCK: value }))
      expect(flags.find((f) => f.envName === 'CARDCOM_USE_MOCK')?.on, value).toBe(false)
    }
  })

  it('accepts the four spellings the page documents', () => {
    for (const value of ['1', 'true', 'on', 'yes']) {
      const flags = listOperationalFlags(env({ CARDCOM_USE_MOCK: value }))
      expect(flags.find((f) => f.envName === 'CARDCOM_USE_MOCK')?.on, value).toBe(true)
    }
  })
})
