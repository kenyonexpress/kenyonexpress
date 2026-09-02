import { describe, expect, it } from 'vitest'
import type { HealthReport } from './checks'
import { READY_CHECK_NAMES, toReadyReport } from './ready'

function report(statuses: Array<[string, 'ok' | 'down' | 'not_configured']>): HealthReport {
  return {
    ok: statuses.every(([, status]) => status !== 'down'),
    checkedAt: '2026-09-02T10:00:00.000Z',
    dependencies: statuses.map(([name, status]) => ({
      name,
      status,
      latencyMs: null,
      detail: `${name} detail that must never leak`,
    })),
  }
}

describe('toReadyReport', () => {
  it('maps the five public names and drops every detail string', () => {
    const ready = toReadyReport(
      report([
        ['database', 'ok'],
        ['rate_limiter', 'ok'],
        ['search', 'not_configured'],
        ['storage', 'not_configured'],
        ['cardcom', 'ok'],
        ['email', 'down'],
      ]),
    )

    expect(Object.keys(ready.checks).sort()).toEqual([...READY_CHECK_NAMES].sort())
    expect(ready.checks.database).toBe('ok')
    expect(ready.checks.redis).toBe('ok')
    expect(ready.checks.meilisearch).toBe('not_configured')
    expect(ready.checks.r2).toBe('not_configured')
    expect(ready.checks.cardcom).toBe('ok')
    expect(JSON.stringify(ready)).not.toContain('detail')
    expect(JSON.stringify(ready)).not.toContain('email')
  })

  it('is ready when nothing mapped is down, even if something unmapped is', () => {
    const ready = toReadyReport(
      report([
        ['database', 'ok'],
        ['rate_limiter', 'ok'],
        ['search', 'not_configured'],
        ['storage', 'not_configured'],
        ['cardcom', 'not_configured'],
        ['email', 'down'],
        ['scheduler', 'down'],
      ]),
    )
    expect(ready.ok).toBe(true)
  })

  it('is not ready when the limiter is down, reported under redis', () => {
    const ready = toReadyReport(
      report([
        ['database', 'ok'],
        ['rate_limiter', 'down'],
        ['search', 'ok'],
        ['storage', 'ok'],
        ['cardcom', 'ok'],
      ]),
    )
    expect(ready.ok).toBe(false)
    expect(ready.checks.redis).toBe('down')
  })

  it('treats a missing mapped dependency as down rather than silently ok', () => {
    const ready = toReadyReport(report([['database', 'ok']]))
    expect(ready.checks.redis).toBe('down')
    expect(ready.ok).toBe(false)
  })
})
