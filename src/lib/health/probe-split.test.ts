import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runHealthChecks } from './checks'
import { READY_CHECK_NAMES, toReadyReport } from './ready'

/**
 * WHICH READINESS CHECKS ACTUALLY CONTACT SOMETHING, PINNED.
 *
 * `/api/ready` publishes five names under one `ok` vocabulary, and three of
 * them are reached while two are only read out of `process.env`. That split is
 * deliberate and argued in `checks.ts` - Cardcom has no side-effect-free
 * endpoint, and probing R2 from an unauthenticated route would hand any caller
 * an outbound request - but it is invisible in the response.
 *
 * It stopped being hypothetical on 2026-09-08. The Cloudflare ACCOUNT API,
 * authenticated as the owner with no R2 keys involved, answered
 * `403 code 10042 "Please enable R2 through the Cloudflare Dashboard"`. So on
 * this account, the moment the four R2 variables are set, `r2` reports `ok`
 * while every upload fails. The two states this check cannot distinguish are
 * the two states the project is actually in.
 *
 * These tests do not try to make the config-only checks probe. They pin the
 * split so it cannot drift silently, and they pin the thing that would be a
 * real bug: an unconfigured dependency turning `/api/ready` into a permanent
 * 503.
 */

const CHECKS_SRC = readFileSync(resolve(process.cwd(), 'src/lib/health/checks.ts'), 'utf8')

/** Named here rather than derived, so a check that changes side is a failure. */
const PROBED = ['database', 'redis', 'meilisearch']
const CONFIG_ONLY = ['r2', 'cardcom']

describe('the probe / configuration split', () => {
  it('covers every name /api/ready publishes, with no overlap', () => {
    expect([...PROBED, ...CONFIG_ONLY].sort()).toEqual([...READY_CHECK_NAMES].sort())
  })

  it.each(CONFIG_ONLY)('%s is documented as configuration-only in checks.ts', (name) => {
    // Cardcom has carried this note since the file was written; storage gained
    // it on 2026-09-08. An undocumented config-only check is the one that gets
    // read as a reachability result.
    const fn = name === 'r2' ? 'checkStorage' : 'checkCardcom'
    const before = CHECKS_SRC.slice(0, CHECKS_SRC.indexOf(`function ${fn}(`))
    const docblock = before.slice(before.lastIndexOf('/**'))
    expect(docblock.toLowerCase()).toContain('configuration-only')
  })

  it('does not claim a vendor name where nothing was contacted', async () => {
    const report = await runHealthChecks(
      {
        NODE_ENV: 'test',
        R2_ACCOUNT_ID: 'a',
        R2_ACCESS_KEY_ID: 'b',
        R2_SECRET_ACCESS_KEY: 'c',
        R2_BUCKET: 'd',
      } as NodeJS.ProcessEnv,
      new Date(),
    )
    const storage = report.dependencies.find((d) => d.name === 'storage')
    expect(storage?.status).toBe('ok')
    // The old string was the bare vendor name, which reads as "R2 is working".
    expect(storage?.detail).not.toBe('Cloudflare R2')
    expect(storage?.detail).toContain('לא נבדקה')
  })
})

describe('an unfinished deployment is not an unhealthy one', () => {
  it('keeps /api/ready at 200 when nothing optional is configured', () => {
    // The real bug this guards: if `not_configured` were folded into `down`,
    // a load balancer gated on /api/ready would never bring the app up, and
    // R2 has been unconfigured on this account for the whole project.
    const report = toReadyReport({
      ok: true,
      checkedAt: new Date().toISOString(),
      dependencies: [
        { name: 'database', status: 'ok', latencyMs: 1, detail: '' },
        { name: 'rate_limiter', status: 'ok', latencyMs: 1, detail: '' },
        { name: 'search', status: 'not_configured', latencyMs: null, detail: '' },
        { name: 'storage', status: 'not_configured', latencyMs: null, detail: '' },
        { name: 'cardcom', status: 'not_configured', latencyMs: null, detail: '' },
      ],
    })
    expect(report.ok).toBe(true)
    expect(report.checks.r2).toBe('not_configured')
  })

  it('is not ok when something that was reached is down', () => {
    const report = toReadyReport({
      ok: false,
      checkedAt: new Date().toISOString(),
      dependencies: [
        { name: 'database', status: 'down', latencyMs: null, detail: '' },
        { name: 'rate_limiter', status: 'ok', latencyMs: 1, detail: '' },
        { name: 'search', status: 'ok', latencyMs: 1, detail: '' },
        { name: 'storage', status: 'ok', latencyMs: null, detail: '' },
        { name: 'cardcom', status: 'ok', latencyMs: null, detail: '' },
      ],
    })
    expect(report.ok).toBe(false)
  })
})
