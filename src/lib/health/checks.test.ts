import { describe, expect, it, vi } from 'vitest'

const from = vi.fn()
const rpc = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from, rpc }),
}))

import { type HealthReport, buildHealthAlert, runHealthChecks } from './checks'

/**
 * The rule this file exists to hold: a service nobody configured must never
 * report healthy, and must never page anybody.
 *
 * Both halves matter. Green-for-unconfigured turns "we never set this up" into
 * "it works". Paging-for-unconfigured fires every five minutes on a deployment
 * waiting for a key, and an alert that always fires is an alert nobody reads.
 */

function scriptDatabase(ok: boolean): void {
  from.mockReturnValue({
    select: () => Promise.resolve({ error: ok ? null : { message: 'boom' } }),
  })
  rpc.mockResolvedValue({ error: ok ? null : { message: 'missing function' } })
}

function byName(report: HealthReport, name: string) {
  const dependency = report.dependencies.find((d) => d.name === name)
  if (!dependency) throw new Error(`no dependency named ${name}`)
  return dependency
}

const EMPTY_ENV = {} as unknown as NodeJS.ProcessEnv

const UPSTASH_ENV = {
  UPSTASH_REDIS_REST_URL: 'https://eu1.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'tok',
} as unknown as NodeJS.ProcessEnv

describe('runHealthChecks', () => {
  it('reports an unset dependency as not_configured, never as ok', async () => {
    scriptDatabase(true)
    const report = await runHealthChecks(EMPTY_ENV)

    for (const name of ['search', 'cardcom', 'email', 'storage', 'scheduler']) {
      expect(byName(report, name).status).toBe('not_configured')
    }
    // And that is NOT an outage: nothing is down, so nothing is broken.
    expect(report.ok).toBe(true)
  })

  /**
   * WAS: "does not invent a Redis, because this system does not have one",
   * asserting that `UPSTASH` appeared nowhere in src. It does now -
   * `lib/rate-limit` is a sliding window on Upstash with the Postgres RPC as
   * its fallback - so the claim is retired rather than left standing as a
   * measurement that stopped being true.
   *
   * What survives is the shape: ONE dependency named `rate_limiter`, not a
   * `redis` row beside it. Two rows would let the report show a green limiter
   * and a red Redis, or the reverse, and neither says whether requests are
   * being counted.
   */
  it('reports the limiter as one dependency, and names the backend in use', async () => {
    scriptDatabase(true)
    const report = await runHealthChecks(EMPTY_ENV)
    expect(report.dependencies.map((d) => d.name)).not.toContain('redis')
    expect(byName(report, 'rate_limiter').detail).toContain('check_rate_limit')
    expect(byName(report, 'rate_limiter').detail).toContain('Upstash לא מוגדר')
    expect(byName(report, 'rate_limiter').status).toBe('ok')
  })

  it('names Upstash when it answers', async () => {
    scriptDatabase(true)
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ result: 'PONG' })))

    const report = await runHealthChecks(UPSTASH_ENV)

    expect(byName(report, 'rate_limiter').status).toBe('ok')
    expect(byName(report, 'rate_limiter').detail).toContain('Upstash sliding window')
    vi.unstubAllGlobals()
  })

  /**
   * The false page this avoids: Upstash unreachable while Postgres answers
   * means the limits are STILL ENFORCED, by the slower backend. `report.ok`
   * gates `/api/health` and `buildHealthAlert` pages on `down`, so calling this
   * down would wake somebody for a working limiter.
   */
  it('does not page when only Upstash is unreachable, but says so in the detail', async () => {
    scriptDatabase(true)
    vi.stubGlobal('fetch', () => Promise.reject(new Error('ECONNREFUSED')))

    const report = await runHealthChecks(UPSTASH_ENV)

    expect(byName(report, 'rate_limiter').status).toBe('ok')
    expect(report.ok).toBe(true)
    expect(buildHealthAlert(report)).toBeNull()
    expect(byName(report, 'rate_limiter').detail).toContain('Upstash לא נענה')
    vi.unstubAllGlobals()
  })

  it('is down only when BOTH backends are gone, and says the limits are open', async () => {
    scriptDatabase(false)
    vi.stubGlobal('fetch', () => Promise.reject(new Error('ECONNREFUSED')))

    const report = await runHealthChecks(UPSTASH_ENV)

    expect(byName(report, 'rate_limiter').status).toBe('down')
    expect(byName(report, 'rate_limiter').detail).toContain('נכשלים פתוח')
    vi.unstubAllGlobals()
  })

  it('a database that will not answer is down, and takes the whole report down', async () => {
    scriptDatabase(false)
    const report = await runHealthChecks(EMPTY_ENV)
    expect(byName(report, 'database').status).toBe('down')
    expect(report.ok).toBe(false)
  })

  it('treats a missing rate-limit RPC as down, not as unconfigured', async () => {
    // `checkRateLimit` fails OPEN when the RPC errors, so a broken limiter is
    // an open endpoint that nothing else would report.
    scriptDatabase(false)
    const report = await runHealthChecks(EMPTY_ENV)
    expect(byName(report, 'rate_limiter').status).toBe('down')
  })

  it('reports configured keys without calling Cardcom', async () => {
    // Cardcom has no no-op endpoint: every call creates, charges, credits or
    // looks up a deal. A five-minute probe would be traffic, not a check.
    scriptDatabase(true)
    const report = await runHealthChecks({
      CARDCOM_TERMINAL_NUMBER: '1000',
      CARDCOM_API_NAME: 'api',
    } as unknown as NodeJS.ProcessEnv)
    const cardcom = byName(report, 'cardcom')
    expect(cardcom.status).toBe('ok')
    expect(cardcom.latencyMs).toBeNull()
    expect(cardcom.detail).toContain('סנדבוקס')
  })

  it('stamps the time it was checked', async () => {
    scriptDatabase(true)
    const now = new Date('2026-08-07T10:00:00Z')
    const report = await runHealthChecks(EMPTY_ENV, now)
    expect(report.checkedAt).toBe(now.toISOString())
  })
})

describe('buildHealthAlert', () => {
  const report = (statuses: [string, 'ok' | 'down' | 'not_configured'][]): HealthReport => ({
    ok: statuses.every(([, s]) => s !== 'down'),
    checkedAt: '2026-08-07T10:00:00.000Z',
    dependencies: statuses.map(([name, status]) => ({
      name,
      status,
      latencyMs: null,
      detail: `${name} detail`,
    })),
  })

  it('says nothing when nothing is down', () => {
    expect(buildHealthAlert(report([['database', 'ok']]))).toBeNull()
  })

  it('says nothing about a dependency that was never configured', () => {
    expect(
      buildHealthAlert(
        report([
          ['database', 'ok'],
          ['cardcom', 'not_configured'],
          ['email', 'not_configured'],
        ]),
      ),
    ).toBeNull()
  })

  it('names every dependency that is down', () => {
    const alert = buildHealthAlert(
      report([
        ['database', 'down'],
        ['search', 'down'],
        ['cardcom', 'not_configured'],
      ]),
    )
    expect(alert).toContain('database')
    expect(alert).toContain('search')
    expect(alert).not.toContain('cardcom')
    expect(alert).toContain('2')
  })
})
