import { describe, expect, it } from 'vitest'
import {
  decideAfterPromote,
  evaluateSmoke,
  formatDeployIncident,
  incidentPriority,
  judgeProbe,
  normalizeBase,
  pickRollbackTarget,
  probePlan,
  redactSecrets,
} from './lib.mjs'

describe('judgeProbe', () => {
  it('accepts only 200 for a page and names the status otherwise', () => {
    expect(judgeProbe({ kind: 'page', path: '/', status: 200 }).ok).toBe(true)
    expect(judgeProbe({ kind: 'page', path: '/', status: 308 })).toMatchObject({
      ok: false,
      reason: 'status-308',
    })
    expect(judgeProbe({ kind: 'page', path: '/', status: 0 })).toMatchObject({
      ok: false,
      reason: 'no-response',
    })
  })

  it('reads the health body, not just the status line', () => {
    const okBody = JSON.stringify({ ok: true, database: 'ok', latency_ms: 12 })
    expect(judgeProbe({ kind: 'health', path: '/api/health', status: 200, body: okBody }).ok).toBe(
      true,
    )
    // A 200 whose body says the database is down is still a failure.
    const down = JSON.stringify({ ok: false, database: 'down' })
    expect(
      judgeProbe({ kind: 'health', path: '/api/health', status: 200, body: down }),
    ).toMatchObject({
      ok: false,
      reason: 'health-not-ok:down',
    })
    expect(
      judgeProbe({ kind: 'health', path: '/api/health', status: 200, body: '<html>' }),
    ).toMatchObject({
      ok: false,
      reason: 'health-body-not-json',
    })
    expect(
      judgeProbe({ kind: 'health', path: '/api/health', status: 503, body: '{}' }),
    ).toMatchObject({
      ok: false,
      reason: 'status-503',
    })
  })

  it('treats a bearer-guarded cron route as healthy on 401 and broken on 404 or 200', () => {
    expect(judgeProbe({ kind: 'cron', path: '/api/cron/x', status: 401 }).ok).toBe(true)
    expect(judgeProbe({ kind: 'cron', path: '/api/cron/x', status: 404 })).toMatchObject({
      ok: false,
      reason: 'missing-from-deployment',
    })
    expect(judgeProbe({ kind: 'cron', path: '/api/cron/x', status: 200 })).toMatchObject({
      ok: false,
      reason: 'reachable-without-the-secret',
    })
  })
})

describe('evaluateSmoke', () => {
  it('is only ok when every probe is ok, and lists the failures', () => {
    const ok = evaluateSmoke([
      { kind: 'page', path: '/', status: 200 },
      { kind: 'health', path: '/api/health', status: 200, body: '{"ok":true}' },
      { kind: 'cron', path: '/api/cron/a', status: 401 },
    ])
    expect(ok.ok).toBe(true)
    expect(ok.failures).toEqual([])

    const bad = evaluateSmoke([
      { kind: 'page', path: '/', status: 200 },
      { kind: 'cron', path: '/api/cron/a', status: 404 },
    ])
    expect(bad.ok).toBe(false)
    expect(bad.failures.map((f) => f.path)).toEqual(['/api/cron/a'])
  })
})

describe('pickRollbackTarget', () => {
  const deployments = [
    { uid: 'dpl_new', readyState: 'READY', target: 'production', createdAt: 300 },
    { uid: 'dpl_prev', readyState: 'READY', target: 'production', createdAt: 200 },
    { uid: 'dpl_broken', readyState: 'ERROR', target: 'production', createdAt: 250 },
    { uid: 'dpl_old', readyState: 'READY', target: 'production', createdAt: 100 },
  ]

  it('picks the newest READY deployment that is not the one serving', () => {
    expect(pickRollbackTarget(deployments, 'dpl_new')?.uid).toBe('dpl_prev')
  })

  it('never picks an errored build, regardless of age', () => {
    expect(pickRollbackTarget(deployments, 'dpl_new').uid).not.toBe('dpl_broken')
  })

  it('skips excluded ids so two bad deploys cannot ping-pong', () => {
    expect(pickRollbackTarget(deployments, 'dpl_new', ['dpl_prev'])?.uid).toBe('dpl_old')
  })

  it('sorts itself and does not trust the API order', () => {
    const shuffled = [...deployments].reverse()
    expect(pickRollbackTarget(shuffled, 'dpl_new')?.uid).toBe('dpl_prev')
  })

  it('returns null when nothing older is READY', () => {
    expect(pickRollbackTarget([deployments[0]], 'dpl_new')).toBeNull()
    expect(pickRollbackTarget([], 'dpl_new')).toBeNull()
  })

  it('accepts `state`/`id` as well as `readyState`/`uid`', () => {
    const alt = [
      { id: 'a', state: 'READY', created: 2 },
      { id: 'b', state: 'READY', created: 1 },
    ]
    expect(pickRollbackTarget(alt, 'a')?.id).toBe('b')
  })
})

describe('decideAfterPromote', () => {
  it('keeps a green that passed', () => {
    expect(decideAfterPromote({ smoke: { ok: true }, target: { uid: 'x' } })).toEqual({
      action: 'keep',
      target: null,
    })
  })
  it('rolls back a failed green when a target exists', () => {
    expect(decideAfterPromote({ smoke: { ok: false }, target: { uid: 'x' } })).toMatchObject({
      action: 'rollback',
    })
  })
  it('alerts only when nothing is left to roll back to', () => {
    expect(decideAfterPromote({ smoke: { ok: false }, target: null })).toEqual({
      action: 'alert-only',
      target: null,
    })
  })
})

describe('formatDeployIncident', () => {
  it('leads with an English title and carries identifiers only', () => {
    const text = formatDeployIncident({
      kind: 'rolled-back',
      url: 'https://kenyonexpress.vercel.app',
      deploymentId: 'dpl_bad',
      sha: 'abcdef1234567890',
      rollbackTo: { uid: 'dpl_good' },
      failures: [{ path: '/api/cron/health', status: 404, reason: 'missing-from-deployment' }],
      runUrl: 'https://github.com/x/y/actions/runs/1',
    })
    const lines = text.split('\n')
    expect(lines[0]).toBe('KE deploy: rolled back')
    expect(text).toContain('dpl_bad')
    expect(text).toContain('הוחזר אל: dpl_good')
    expect(text).toContain('commit: abcdef1')
    expect(text).not.toContain('abcdef1234567890')
    expect(text).toContain('/api/cron/health -> 404 (missing-from-deployment)')
    expect(text).toContain('ריצה: https://github.com/x/y/actions/runs/1')
  })

  it('caps the failure list at eight lines', () => {
    const failures = Array.from({ length: 12 }, (_, i) => ({
      path: `/p${i}`,
      status: 404,
      reason: 'x',
    }))
    const text = formatDeployIncident({ kind: 'smoke-failed', failures })
    expect(text).toContain('ועוד 4')
    expect(text).not.toContain('/p9')
  })

  it('redacts a bot token that leaked into a failure reason', () => {
    const text = formatDeployIncident({
      kind: 'smoke-failed',
      failures: [
        { path: '/x', status: 0, reason: 'https://api.telegram.org/bot123:ABC/sendMessage' },
      ],
    })
    expect(text).toContain('/bot[redacted]/')
    expect(text).not.toContain('123:ABC')
  })
})

describe('incidentPriority', () => {
  it('is urgent only when a human is needed now', () => {
    expect(incidentPriority('rollback-failed')).toBe('urgent')
    expect(incidentPriority('no-rollback-target')).toBe('urgent')
    expect(incidentPriority('rolled-back')).toBe('high')
    expect(incidentPriority('promoted')).toBe('default')
  })
})

describe('probePlan and normalizeBase', () => {
  it('includes the pages, the health route and every registry cron path', () => {
    const plan = probePlan([{ path: '/api/cron/a' }, { path: '/api/cron/b' }])
    expect(plan.filter((p) => p.kind === 'page').map((p) => p.path)).toContain('/')
    expect(plan.find((p) => p.kind === 'health')?.path).toBe('/api/health')
    expect(plan.filter((p) => p.kind === 'cron').map((p) => p.path)).toEqual([
      '/api/cron/a',
      '/api/cron/b',
    ])
  })

  it('normalises hosts with and without a scheme or trailing slash', () => {
    expect(normalizeBase('x.vercel.app')).toBe('https://x.vercel.app')
    expect(normalizeBase('https://x.vercel.app/')).toBe('https://x.vercel.app')
    expect(normalizeBase('  ')).toBeNull()
    expect(normalizeBase(undefined)).toBeNull()
  })
})

describe('redactSecrets', () => {
  it('strips bot tokens and bearer tokens', () => {
    expect(redactSecrets('Bearer abc.def-ghi and /bot1:2')).toBe(
      'Bearer [redacted] and /bot[redacted]',
    )
  })
})
