import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PREVIEW_PROJECT_ID,
  PREVIEW_ENV_KEYS,
  branchEnvPayload,
  judgeDeploymentState,
  previewConfig,
  redeployBody,
  removeAlias,
  removeBranchEnv,
  selectBranchEnv,
  stableAliasFor,
  teardownPreview,
  waitForReady,
  wirePreview,
} from './vercel-preview.mjs'

const config = { token: 'tok', teamId: 'team_x', projectId: 'prj_p' }

function router(routes) {
  const calls = []
  const fetchImpl = vi.fn(async (url, init) => {
    const path = url.replace('https://api.vercel.com', '').replace(/([?&])teamId=team_x/, '')
    const key = `${init.method} ${path}`
    calls.push({ key, body: init.body ? JSON.parse(init.body) : undefined })
    const handler = routes[key]
    if (!handler)
      return {
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ error: { code: 'not_found', message: key } }),
      }
    const body = typeof handler === 'function' ? handler(calls) : handler
    return { ok: true, status: 200, text: async () => JSON.stringify(body) }
  })
  return { fetchImpl, calls }
}

describe('previewConfig', () => {
  it('is null without VERCEL_TOKEN and targets the project the GitHub app builds previews on', () => {
    expect(previewConfig({})).toBeNull()
    expect(previewConfig({ VERCEL_TOKEN: 't' }).projectId).toBe(DEFAULT_PREVIEW_PROJECT_ID)
    expect(DEFAULT_PREVIEW_PROJECT_ID).toBe('prj_keQjjnDoTb41AYmHy3ia59BKumyt')
    expect(previewConfig({ VERCEL_TOKEN: 't', VERCEL_PREVIEW_PROJECT_ID: 'prj_z' }).projectId).toBe(
      'prj_z',
    )
  })

  it('does not inherit the deploy pipeline default, which is the stale kenyonexpress-web project', () => {
    expect(
      previewConfig({ VERCEL_TOKEN: 't', VERCEL_PROJECT_ID: 'prj_oqr4NKtSaB2h3szrxnT0DknAv9Xk' })
        .projectId,
    ).toBe(DEFAULT_PREVIEW_PROJECT_ID)
  })
})

describe('branchEnvPayload', () => {
  it('scopes all three records to preview + the git branch and encrypts only the secret', () => {
    const payload = branchEnvPayload({
      gitBranch: 'feat/x',
      url: 'https://r.supabase.co',
      anonKey: 'pub',
      secretKey: 'sec',
    })
    expect(payload.map((p) => p.key)).toEqual([...PREVIEW_ENV_KEYS])
    for (const p of payload) {
      expect(p.target).toEqual(['preview'])
      expect(p.gitBranch).toBe('feat/x')
    }
    expect(payload.find((p) => p.key === 'SUPABASE_SECRET_KEY')).toMatchObject({
      type: 'encrypted',
      value: 'sec',
    })
    expect(payload.find((p) => p.key === 'NEXT_PUBLIC_SUPABASE_URL').type).toBe('plain')
  })

  it('refuses a payload with a missing piece rather than write a half environment', () => {
    expect(() => branchEnvPayload({ url: 'u', anonKey: 'a', secretKey: 's' })).toThrow(/gitBranch/)
    expect(() => branchEnvPayload({ gitBranch: 'b', url: 'u', anonKey: 'a' })).toThrow(/secretKey/)
  })
})

describe('selectBranchEnv', () => {
  it('keeps only our keys on exactly this branch; project-wide records are never candidates for deletion', () => {
    const envs = [
      { id: '1', key: 'SUPABASE_SECRET_KEY', gitBranch: 'feat/x' },
      { id: '2', key: 'SUPABASE_SECRET_KEY' },
      { id: '3', key: 'SUPABASE_SECRET_KEY', gitBranch: 'feat/other' },
      { id: '4', key: 'CRON_SECRET', gitBranch: 'feat/x' },
      { id: '5', key: 'NEXT_PUBLIC_SUPABASE_URL', gitBranch: 'feat/x' },
    ]
    expect(selectBranchEnv(envs, 'feat/x').map((e) => e.id)).toEqual(['1', '5'])
    expect(selectBranchEnv(envs, undefined)).toEqual([])
  })
})

describe('redeployBody', () => {
  const project = { id: 'prj_p', name: 'kenyonexpress-prod', link: { type: 'github', repoId: 123 } }

  it('deploys through the git source with no target, so it is a preview and never touches production domains', () => {
    const body = redeployBody(project, { ref: 'feat/x', sha: 'abc', pr: 72 })
    expect(body).toEqual({
      name: 'kenyonexpress-prod',
      project: 'prj_p',
      gitSource: { type: 'github', repoId: 123, ref: 'feat/x', sha: 'abc' },
      meta: { kePreviewPr: '72', githubCommitRef: 'feat/x', githubCommitSha: 'abc' },
    })
    expect(body).not.toHaveProperty('target')
  })

  it('fails on a project without a git link', () => {
    expect(() => redeployBody({ id: 'p', name: 'n' }, { ref: 'r', sha: 's', pr: 1 })).toThrow(
      /no git link/,
    )
  })
})

describe('stableAliasFor', () => {
  it('is <project>-pr-<n>.vercel.app, lowercase, and fits the 63-char label limit', () => {
    expect(stableAliasFor('kenyonexpress-prod', 72)).toBe('kenyonexpress-prod-pr-72.vercel.app')
    expect(stableAliasFor('My Project', 3)).toBe('my-project-pr-3.vercel.app')
    const long = stableAliasFor('x'.repeat(80), 12345)
    expect(long.split('.')[0].length).toBeLessThanOrEqual(63)
    expect(long.endsWith('-pr-12345.vercel.app')).toBe(true)
    expect(() => stableAliasFor('p', 0)).toThrow(/positive integer/)
  })
})

describe('waitForReady', () => {
  it('maps states and polls until READY', async () => {
    expect(judgeDeploymentState('READY')).toBe('ready')
    expect(judgeDeploymentState('ERROR')).toBe('failed')
    expect(judgeDeploymentState('CANCELED')).toBe('failed')
    expect(judgeDeploymentState('BUILDING')).toBe('wait')
    const states = ['QUEUED', 'BUILDING', 'READY']
    let n = 0
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ id: 'dpl_1', readyState: states[n++], url: 'x.vercel.app' }),
    }))
    const d = await waitForReady(config, 'dpl_1', { fetchImpl, sleep: async () => {} })
    expect(d.readyState).toBe('READY')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('surfaces the build error message on ERROR', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          id: 'dpl_1',
          readyState: 'ERROR',
          errorMessage: 'Command "pnpm build" exited with 1',
        }),
    }))
    await expect(
      waitForReady(config, 'dpl_1', { fetchImpl, sleep: async () => {} }),
    ).rejects.toThrow(/pnpm build/)
  })
})

describe('wirePreview', () => {
  it('upserts env, redeploys the head, waits, aliases, and returns both URLs', async () => {
    const project = { id: 'prj_p', name: 'kenyonexpress-prod', link: { type: 'github', repoId: 9 } }
    const { fetchImpl, calls } = router({
      'GET /v9/projects/prj_p': project,
      'POST /v10/projects/prj_p/env?upsert=true': { created: [] },
      'POST /v13/deployments?forceNew=1': { id: 'dpl_new', readyState: 'QUEUED' },
      'GET /v13/deployments/dpl_new': {
        id: 'dpl_new',
        readyState: 'READY',
        url: 'kenyonexpress-prod-abc.vercel.app',
      },
      'POST /v2/deployments/dpl_new/aliases': { alias: 'kenyonexpress-prod-pr-72.vercel.app' },
    })
    const result = await wirePreview(
      config,
      {
        gitBranch: 'feat/x',
        sha: 'abc',
        pr: 72,
        url: 'https://r.supabase.co',
        anonKey: 'pub',
        secretKey: 'sec',
      },
      { fetchImpl, sleep: async () => {} },
    )
    expect(result).toEqual({
      deploymentId: 'dpl_new',
      deploymentUrl: 'https://kenyonexpress-prod-abc.vercel.app',
      aliasUrl: 'https://kenyonexpress-prod-pr-72.vercel.app',
      state: 'READY',
      envKeys: [...PREVIEW_ENV_KEYS],
    })
    expect(calls.map((c) => c.key)).toEqual([
      'GET /v9/projects/prj_p',
      'POST /v10/projects/prj_p/env?upsert=true',
      'POST /v13/deployments?forceNew=1',
      'GET /v13/deployments/dpl_new',
      'POST /v2/deployments/dpl_new/aliases',
    ])
    expect(calls[1].body).toHaveLength(3)
    expect(calls[1].body.every((e) => e.gitBranch === 'feat/x')).toBe(true)
    expect(calls[4].body).toEqual({ alias: 'kenyonexpress-prod-pr-72.vercel.app' })
  })
})

describe('teardownPreview', () => {
  it('deletes only the branch-scoped records and the stable alias, tolerating an alias that was never set', async () => {
    const { fetchImpl, calls } = router({
      'GET /v9/projects/prj_p': { id: 'prj_p', name: 'kenyonexpress-prod' },
      'GET /v10/projects/prj_p/env': {
        envs: [
          { id: 'e1', key: 'SUPABASE_SECRET_KEY', gitBranch: 'feat/x' },
          { id: 'e2', key: 'SUPABASE_SECRET_KEY', target: ['production'] },
          { id: 'e3', key: 'NEXT_PUBLIC_SUPABASE_URL', gitBranch: 'feat/x' },
        ],
      },
      'DELETE /v9/projects/prj_p/env/e1': {},
      'DELETE /v9/projects/prj_p/env/e3': {},
    })
    const result = await teardownPreview(config, { gitBranch: 'feat/x', pr: 72 }, { fetchImpl })
    expect(result).toEqual({
      removedKeys: ['SUPABASE_SECRET_KEY', 'NEXT_PUBLIC_SUPABASE_URL'],
      alias: 'kenyonexpress-prod-pr-72.vercel.app',
      aliasRemoved: false,
    })
    const deletes = calls.filter((c) => c.key.startsWith('DELETE')).map((c) => c.key)
    expect(deletes).toEqual([
      'DELETE /v9/projects/prj_p/env/e1',
      'DELETE /v9/projects/prj_p/env/e3',
      'DELETE /v2/aliases/kenyonexpress-prod-pr-72.vercel.app',
    ])
    expect(deletes).not.toContain('DELETE /v9/projects/prj_p/env/e2')
  })

  it('removeAlias returns true on success and rethrows anything but a 404', async () => {
    const ok = router({ 'DELETE /v2/aliases/a.vercel.app': { status: 'SUCCESS' } })
    expect(await removeAlias(config, 'a.vercel.app', { fetchImpl: ok.fetchImpl })).toBe(true)
    const forbidden = vi.fn(async () => ({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: { message: 'forbidden' } }),
    }))
    await expect(removeAlias(config, 'a.vercel.app', { fetchImpl: forbidden })).rejects.toThrow(
      /403/,
    )
  })

  it('removeBranchEnv with no matching records deletes nothing', async () => {
    const { fetchImpl, calls } = router({
      'GET /v10/projects/prj_p/env': { envs: [{ id: 'e2', key: 'SUPABASE_SECRET_KEY' }] },
    })
    expect(await removeBranchEnv(config, 'feat/x', { fetchImpl })).toEqual([])
    expect(calls).toHaveLength(1)
  })
})

describe('teardownPreview without a branch name', () => {
  it('refuses before any API call', async () => {
    const fetchImpl = vi.fn()
    await expect(teardownPreview(config, { pr: 1 }, { fetchImpl })).rejects.toThrow(
      /gitBranch is required/,
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
