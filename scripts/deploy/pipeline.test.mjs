/**
 * The blue-green procedure end to end against a fake Vercel and a fake site,
 * so the order of calls (preview smoke -> promote -> production smoke ->
 * rollback) is pinned before a real domain depends on it.
 */
import { describe, expect, it, vi } from 'vitest'
import { performPromote } from './promote.mjs'
import { performRollback } from './rollback.mjs'

const config = { token: 'tok', teamId: 'team_x', projectId: 'prj_x' }
const jobs = [{ path: '/api/cron/health' }]
const env = { TELEGRAM_BOT_TOKEN: '1:a', TELEGRAM_CHAT_ID: '2', NTFY_TOPIC: 'kenyon-test' }

/**
 * A fake world: two READY production deployments, a green candidate, a
 * production domain whose behaviour is a function of which deployment it
 * currently points at.
 */
function world({
  greenHealthy = true,
  blueHealthy = true,
  promoteStatus = 201,
  rollbackStatus = 200,
} = {}) {
  const state = {
    production: 'dpl_blue',
    calls: [],
    notified: [],
  }
  const deployments = {
    dpl_green: {
      id: 'dpl_green',
      uid: 'dpl_green',
      url: 'green.vercel.app',
      readyState: 'READY',
      target: 'production',
      createdAt: 300,
      meta: { githubCommitSha: 'g'.repeat(40) },
    },
    dpl_blue: {
      id: 'dpl_blue',
      uid: 'dpl_blue',
      url: 'blue.vercel.app',
      readyState: 'READY',
      target: 'production',
      createdAt: 200,
      meta: { githubCommitSha: 'b'.repeat(40) },
    },
    dpl_old: {
      id: 'dpl_old',
      uid: 'dpl_old',
      url: 'old.vercel.app',
      readyState: 'READY',
      target: 'production',
      createdAt: 100,
    },
  }
  const healthy = { dpl_green: greenHealthy, dpl_blue: blueHealthy, dpl_old: true }

  function site(deploymentId, path) {
    const ok = healthy[deploymentId]
    if (path === '/api/health')
      return { status: ok ? 200 : 503, body: JSON.stringify({ ok, database: ok ? 'ok' : 'down' }) }
    if (path.startsWith('/api/cron/')) return { status: ok ? 401 : 404, body: '' }
    return { status: 200, body: '<html>' }
  }

  const fetchImpl = vi.fn(async (rawUrl, init = {}) => {
    const url = new URL(String(rawUrl))
    state.calls.push(`${init.method ?? 'GET'} ${url.host}${url.pathname}`)
    const text = (body) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) })

    if (url.host === 'api.vercel.com') {
      if (url.pathname === '/v9/projects/prj_x')
        return text({ targets: { production: { id: state.production } } })
      if (url.pathname === '/v6/deployments')
        return text({ deployments: Object.values(deployments) })
      if (url.pathname.startsWith('/v13/deployments/')) {
        const key = decodeURIComponent(url.pathname.split('/').pop())
        const found = Object.values(deployments).find((d) => d.id === key || d.url === key)
        return found
          ? text(found)
          : { ok: false, status: 404, text: async () => '{"error":{"message":"not found"}}' }
      }
      const promote = url.pathname.match(/\/promote\/(.+)$/)
      if (promote) {
        if (promoteStatus >= 400)
          return {
            ok: false,
            status: promoteStatus,
            text: async () => '{"error":{"message":"refused"}}',
          }
        state.production = promote[1]
        return { ok: true, status: promoteStatus, text: async () => '' }
      }
      const rollback = url.pathname.match(/\/rollback\/(.+)$/)
      if (rollback) {
        if (rollbackStatus >= 400)
          return {
            ok: false,
            status: rollbackStatus,
            text: async () => '{"error":{"message":"refused"}}',
          }
        state.production = rollback[1]
        return { ok: true, status: rollbackStatus, text: async () => '' }
      }
      return { ok: false, status: 404, text: async () => '{}' }
    }
    if (url.host === 'api.telegram.org' || url.host === 'ntfy.sh') {
      state.notified.push(
        url.host === 'ntfy.sh' ? init.headers.Title : JSON.parse(init.body).text.split('\n')[0],
      )
      return { ok: true, status: 200 }
    }
    // The sites. `production.test` serves whichever deployment is promoted.
    const deploymentId =
      url.host === 'production.test'
        ? state.production
        : Object.values(deployments).find((d) => d.url === url.host)?.id
    const { status, body } = site(deploymentId, url.pathname)
    return { ok: status < 400, status, text: async () => body }
  })

  return { state, fetchImpl }
}

const base = (w) => ({
  config,
  jobs,
  env,
  productionBase: 'https://production.test',
  runUrl: 'https://gh/run/1',
  fetchImpl: w.fetchImpl,
})

describe('performPromote', () => {
  it('smokes the green, promotes it, smokes production, and reports promoted', async () => {
    const w = world()
    const result = await performPromote({ ...base(w), deploymentRef: 'dpl_green' })
    expect(result).toMatchObject({ ok: true, code: 0, stage: 'promoted' })
    expect(w.state.production).toBe('dpl_green')
    const order = w.state.calls
    expect(order.indexOf('GET green.vercel.app/api/health')).toBeLessThan(
      order.indexOf('POST api.vercel.com/v10/projects/prj_x/promote/dpl_green'),
    )
    expect(order.indexOf('POST api.vercel.com/v10/projects/prj_x/promote/dpl_green')).toBeLessThan(
      order.indexOf('GET production.test/api/health'),
    )
    expect(w.state.notified).toContain('KE deploy: promoted')
  })

  it('rejects an unhealthy green on its own URL and never touches production', async () => {
    const w = world({ greenHealthy: false })
    const result = await performPromote({ ...base(w), deploymentRef: 'dpl_green' })
    expect(result).toMatchObject({ ok: false, code: 1, stage: 'preview-smoke' })
    expect(w.state.production).toBe('dpl_blue')
    expect(w.state.calls.some((c) => c.includes('/promote/'))).toBe(false)
    expect(w.state.notified).toContain('KE deploy: preview rejected, not promoted')
  })

  it('rolls back to the blue when production fails after the promote', async () => {
    // The green passes on its own host but the production domain, once it
    // points at the green, fails. Simulated by flipping health after promote.
    const w = world()
    const original = w.fetchImpl.getMockImplementation()
    w.fetchImpl.mockImplementation(async (rawUrl, init) => {
      const url = new URL(String(rawUrl))
      if (
        url.host === 'production.test' &&
        w.state.production === 'dpl_green' &&
        url.pathname === '/api/health'
      ) {
        return { ok: false, status: 503, text: async () => '{"ok":false,"database":"down"}' }
      }
      return original(rawUrl, init)
    })
    const result = await performPromote({ ...base(w), deploymentRef: 'dpl_green' })
    expect(result).toMatchObject({ ok: false, code: 4, stage: 'rolled-back' })
    expect(w.state.production).toBe('dpl_blue')
    expect(w.state.calls).toContain('POST api.vercel.com/v9/projects/prj_x/rollback/dpl_blue')
    expect(w.state.notified).toContain('KE deploy: rolled back')
  })

  it('escalates when the rollback endpoint refuses', async () => {
    const w = world({ rollbackStatus: 500 })
    const original = w.fetchImpl.getMockImplementation()
    w.fetchImpl.mockImplementation(async (rawUrl, init) => {
      const url = new URL(String(rawUrl))
      if (url.host === 'production.test' && w.state.production === 'dpl_green') {
        return { ok: false, status: 500, text: async () => '' }
      }
      return original(rawUrl, init)
    })
    const result = await performPromote({ ...base(w), deploymentRef: 'dpl_green' })
    expect(result).toMatchObject({ ok: false, code: 5, stage: 'rollback-failed' })
    expect(w.state.notified).toContain('KE deploy: ROLLBACK FAILED')
  })

  it('refuses a deployment that is not READY and one that is already production', async () => {
    const w = world()
    expect(await performPromote({ ...base(w), deploymentRef: 'dpl_blue' })).toMatchObject({
      stage: 'already-production',
      code: 0,
    })
    const notReady = world()
    const original = notReady.fetchImpl.getMockImplementation()
    notReady.fetchImpl.mockImplementation(async (rawUrl, init) => {
      if (String(rawUrl).includes('/v13/deployments/dpl_green')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({ id: 'dpl_green', url: 'green.vercel.app', readyState: 'BUILDING' }),
        }
      }
      return original(rawUrl, init)
    })
    expect(await performPromote({ ...base(notReady), deploymentRef: 'dpl_green' })).toMatchObject({
      stage: 'not-ready',
      code: 1,
    })
  })

  it('--dry smokes the green and stops before the promote call', async () => {
    const w = world()
    const result = await performPromote({ ...base(w), deploymentRef: 'dpl_green', dry: true })
    expect(result).toMatchObject({ ok: true, dry: true })
    expect(w.state.calls.some((c) => c.includes('/promote/'))).toBe(false)
    expect(w.state.production).toBe('dpl_blue')
  })
})

describe('performRollback', () => {
  it('resolves the serving deployment from the project, rolls back to the previous READY one, and verifies it', async () => {
    const w = world()
    w.state.production = 'dpl_green'
    const result = await performRollback({ ...base(w) })
    expect(result).toMatchObject({ ok: true, code: 0 })
    expect(result.target.uid).toBe('dpl_blue')
    expect(w.state.production).toBe('dpl_blue')
    expect(w.state.calls).toContain('GET production.test/api/health')
    expect(w.state.notified).toContain('KE deploy: rolled back')
  })

  it('reports a rollback whose target also fails its smoke as ROLLBACK FAILED', async () => {
    const w = world({ blueHealthy: false })
    w.state.production = 'dpl_green'
    const result = await performRollback({ ...base(w) })
    expect(result).toMatchObject({ ok: false, code: 1 })
    expect(w.state.notified).toContain('KE deploy: ROLLBACK FAILED')
  })

  it('exits 3 and pages urgently when nothing older is READY', async () => {
    const w = world()
    w.fetchImpl.mockImplementation(async (rawUrl, init) => {
      const url = new URL(String(rawUrl))
      if (url.pathname === '/v6/deployments')
        return { ok: true, status: 200, text: async () => '{"deployments":[]}' }
      if (url.pathname === '/v9/projects/prj_x')
        return {
          ok: true,
          status: 200,
          text: async () => '{"targets":{"production":{"id":"dpl_green"}}}',
        }
      if (url.host === 'ntfy.sh') {
        w.state.notified.push(`${init.headers.Priority}:${init.headers.Title}`)
        return { ok: true, status: 200 }
      }
      return { ok: true, status: 200 }
    })
    const result = await performRollback({ ...base(w) })
    expect(result).toMatchObject({ ok: false, code: 3, target: null })
    expect(w.state.notified).toContain('urgent:KE deploy: smoke failed, nothing to roll back to')
  })

  it('--dry resolves the target and makes no rollback call', async () => {
    const w = world()
    w.state.production = 'dpl_green'
    const result = await performRollback({ ...base(w), dry: true })
    expect(result).toMatchObject({ ok: true, dry: true })
    expect(result.target.uid).toBe('dpl_blue')
    expect(w.state.calls.some((c) => c.includes('/rollback/'))).toBe(false)
    expect(w.state.notified).toEqual([])
  })
})
