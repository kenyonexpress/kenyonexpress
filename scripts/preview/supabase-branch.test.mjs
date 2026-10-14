import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PROJECT_REF,
  SupabaseApiError,
  branchNameForPr,
  createBranch,
  deletionRefusal,
  ensurePreviewBranch,
  githubOutputs,
  isPreviewBranchName,
  judgeBranchStatus,
  parseArgs,
  pickKeys,
  supabaseConfig,
  supabaseRequest,
  supabaseUrlForRef,
  teardownPreviewBranch,
  waitForHealthy,
} from './supabase-branch.mjs'

const config = { token: 'sbp_test', projectRef: 'abcdefghijklmnopqrst' }

function jsonFetch(status, body) {
  return vi.fn(async () => ({ ok: status < 400, status, text: async () => JSON.stringify(body) }))
}

/** A fetch that answers by (method, path) and records the calls. */
function router(routes) {
  const calls = []
  const fetchImpl = vi.fn(async (url, init) => {
    const path = url.replace('https://api.supabase.com', '')
    const key = `${init.method} ${path}`
    calls.push({ key, body: init.body ? JSON.parse(init.body) : undefined })
    const handler = routes[key]
    if (!handler)
      return {
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ message: `no route ${key}` }),
      }
    const body = typeof handler === 'function' ? handler(calls) : handler
    return { ok: true, status: 200, text: async () => JSON.stringify(body) }
  })
  return { fetchImpl, calls }
}

describe('supabaseConfig', () => {
  it('is null without the access token and defaults to the measured production ref', () => {
    expect(supabaseConfig({})).toBeNull()
    expect(supabaseConfig({ SUPABASE_ACCESS_TOKEN: ' sbp_x ' })).toEqual({
      token: 'sbp_x',
      projectRef: DEFAULT_PROJECT_REF,
    })
    expect(DEFAULT_PROJECT_REF).toBe('ixvwfbuvfxxsjiywhbbb')
    expect(
      supabaseConfig({ SUPABASE_ACCESS_TOKEN: 'x', SUPABASE_PROJECT_REF: 'other' }).projectRef,
    ).toBe('other')
  })
})

describe('branch names', () => {
  it('derives pr-<n> and rejects anything that is not a positive integer', () => {
    expect(branchNameForPr(72)).toBe('pr-72')
    expect(branchNameForPr('7')).toBe('pr-7')
    for (const bad of [0, -1, 1.5, 'abc', undefined])
      expect(() => branchNameForPr(bad)).toThrow(/positive integer/)
  })

  it('recognises only its own naming scheme', () => {
    expect(isPreviewBranchName('pr-12')).toBe(true)
    expect(isPreviewBranchName('main')).toBe(false)
    expect(isPreviewBranchName('staging')).toBe(false)
    expect(isPreviewBranchName('pr-')).toBe(false)
    expect(isPreviewBranchName(undefined)).toBe(false)
  })
})

describe('supabaseRequest', () => {
  it('puts the token in a header and never in the URL', async () => {
    const fetchImpl = jsonFetch(200, [{ id: 1 }])
    const json = await supabaseRequest(config, 'GET', '/v1/projects/x/branches', { fetchImpl })
    expect(json).toEqual([{ id: 1 }])
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.supabase.com/v1/projects/x/branches')
    expect(init.headers.authorization).toBe('Bearer sbp_test')
    expect(url).not.toContain('sbp_test')
  })

  it('throws a typed error with the status and the API message', async () => {
    const fetchImpl = jsonFetch(402, { message: 'Branching requires the Pro plan' })
    await expect(
      supabaseRequest(config, 'POST', '/v1/projects/x/branches', { fetchImpl, body: {} }),
    ).rejects.toMatchObject({
      name: 'SupabaseApiError',
      status: 402,
      message: expect.stringContaining('Pro plan'),
    })
  })

  it('survives a non-JSON error body', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 502,
      text: async () => '<html>bad gateway</html>',
    }))
    await expect(supabaseRequest(config, 'GET', '/v1/x', { fetchImpl })).rejects.toBeInstanceOf(
      SupabaseApiError,
    )
  })
})

describe('createBranch', () => {
  it('sends branch_name, the git branch, non-persistent, and with_data as asked', async () => {
    const fetchImpl = jsonFetch(200, { id: 'b1' })
    await createBranch(config, { name: 'pr-5', gitBranch: 'feat/x', withData: true }, { fetchImpl })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(`https://api.supabase.com/v1/projects/${config.projectRef}/branches`)
    expect(JSON.parse(init.body)).toEqual({
      branch_name: 'pr-5',
      git_branch: 'feat/x',
      persistent: false,
      with_data: true,
    })
  })

  it('omits git_branch when none is given and honours with_data=false', async () => {
    const fetchImpl = jsonFetch(200, { id: 'b1' })
    await createBranch(config, { name: 'pr-5', withData: false }, { fetchImpl })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      branch_name: 'pr-5',
      persistent: false,
      with_data: false,
    })
  })
})

describe('pickKeys', () => {
  it('prefers the new-format publishable and secret keys', () => {
    expect(
      pickKeys([
        { name: 'anon', type: 'legacy', api_key: 'eyJanon' },
        { name: 'service_role', type: 'legacy', api_key: 'eyJservice' },
        { name: 'default', type: 'publishable', api_key: 'sb_publishable_1' },
        { name: 'default', type: 'secret', api_key: 'sb_secret_1' },
      ]),
    ).toEqual({ anonKey: 'sb_publishable_1', secretKey: 'sb_secret_1' })
  })

  it('falls back to the legacy pair and fails loudly when neither pair is complete', () => {
    expect(
      pickKeys([
        { name: 'anon', type: 'legacy', api_key: 'eyJanon' },
        { name: 'service_role', type: 'legacy', api_key: 'eyJservice' },
      ]),
    ).toEqual({ anonKey: 'eyJanon', secretKey: 'eyJservice' })
    expect(() => pickKeys([{ name: 'anon', type: 'legacy', api_key: 'eyJanon' }])).toThrow(
      /incomplete/,
    )
    expect(() => pickKeys([])).toThrow(/saw none/)
  })
})

describe('supabaseUrlForRef', () => {
  it('builds the API host for a 20-letter ref and rejects anything else', () => {
    expect(supabaseUrlForRef('sjojzzppqhjxvjlvnwdb')).toBe(
      'https://sjojzzppqhjxvjlvnwdb.supabase.co',
    )
    expect(() => supabaseUrlForRef('../etc')).toThrow(/not a project ref/)
    expect(() => supabaseUrlForRef('')).toThrow()
  })
})

describe('judgeBranchStatus and waitForHealthy', () => {
  it('maps statuses to ready / failed / wait', () => {
    expect(judgeBranchStatus('ACTIVE_HEALTHY')).toBe('ready')
    expect(judgeBranchStatus('INIT_FAILED')).toBe('failed')
    expect(judgeBranchStatus('REMOVED')).toBe('failed')
    expect(judgeBranchStatus('COMING_UP')).toBe('wait')
    expect(judgeBranchStatus(undefined)).toBe('wait')
  })

  it('polls until ACTIVE_HEALTHY and returns the detail record', async () => {
    let n = 0
    const statuses = ['COMING_UP', 'COMING_UP', 'ACTIVE_HEALTHY']
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ref: 'r', status: statuses[n++] }),
    }))
    const sleep = vi.fn(async () => {})
    const detail = await waitForHealthy(config, 'b1', { fetchImpl, sleep, intervalMs: 5 })
    expect(detail.status).toBe('ACTIVE_HEALTHY')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('stops immediately on a terminal failure instead of waiting out the clock', async () => {
    const fetchImpl = jsonFetch(200, { ref: 'r', status: 'INIT_FAILED' })
    const sleep = vi.fn(async () => {})
    await expect(waitForHealthy(config, 'b1', { fetchImpl, sleep })).rejects.toThrow(/INIT_FAILED/)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('gives up after the deadline with the last status in the message', async () => {
    const fetchImpl = jsonFetch(200, { ref: 'r', status: 'COMING_UP' })
    let t = 0
    const now = () => {
      t += 60_000
      return t
    }
    await expect(
      waitForHealthy(config, 'b1', { fetchImpl, sleep: async () => {}, now, timeoutMs: 120_000 }),
    ).rejects.toThrow(/still COMING_UP after 2 minutes/)
  })
})

describe('ensurePreviewBranch', () => {
  const keys = [
    { name: 'default', type: 'publishable', api_key: 'sb_publishable_k' },
    { name: 'default', type: 'secret', api_key: 'sb_secret_k' },
  ]

  it('creates the branch when absent, waits, and returns url + keys', async () => {
    const { fetchImpl, calls } = router({
      [`GET /v1/projects/${config.projectRef}/branches`]: [
        { id: 'main-id', name: 'main', is_default: true },
      ],
      [`POST /v1/projects/${config.projectRef}/branches`]: {
        id: 'new-id',
        name: 'pr-9',
        project_ref: 'aaaaaaaaaaaaaaaaaaaa',
        with_data: true,
      },
      'GET /v1/branches/new-id': {
        ref: 'aaaaaaaaaaaaaaaaaaaa',
        status: 'ACTIVE_HEALTHY',
        db_pass: 'never-printed',
      },
      'GET /v1/projects/aaaaaaaaaaaaaaaaaaaa/api-keys?reveal=true': keys,
    })
    const result = await ensurePreviewBranch(
      config,
      { pr: 9, gitBranch: 'feat/y' },
      { fetchImpl, sleep: async () => {} },
    )
    expect(result).toMatchObject({
      id: 'new-id',
      name: 'pr-9',
      ref: 'aaaaaaaaaaaaaaaaaaaa',
      url: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',
      status: 'ACTIVE_HEALTHY',
      created: true,
      withData: true,
      anonKey: 'sb_publishable_k',
      secretKey: 'sb_secret_k',
    })
    expect(calls.map((c) => c.key)).toEqual([
      `GET /v1/projects/${config.projectRef}/branches`,
      `POST /v1/projects/${config.projectRef}/branches`,
      'GET /v1/branches/new-id',
      'GET /v1/projects/aaaaaaaaaaaaaaaaaaaa/api-keys?reveal=true',
    ])
    expect(calls[1].body.git_branch).toBe('feat/y')
  })

  it('reuses an existing pr-<n> branch on a second push and does not POST', async () => {
    const { fetchImpl, calls } = router({
      [`GET /v1/projects/${config.projectRef}/branches`]: [
        { id: 'old-id', name: 'pr-9', project_ref: 'bbbbbbbbbbbbbbbbbbbb', with_data: true },
      ],
      'GET /v1/branches/old-id': { ref: 'bbbbbbbbbbbbbbbbbbbb', status: 'ACTIVE_HEALTHY' },
      'GET /v1/projects/bbbbbbbbbbbbbbbbbbbb/api-keys?reveal=true': keys,
    })
    const result = await ensurePreviewBranch(
      config,
      { pr: 9 },
      { fetchImpl, sleep: async () => {} },
    )
    expect(result.created).toBe(false)
    expect(calls.some((c) => c.key.startsWith('POST'))).toBe(false)
  })

  it('never exposes the keys through the GitHub outputs helper', () => {
    const outputs = githubOutputs({
      name: 'pr-1',
      ref: 'r',
      url: 'u',
      status: 's',
      created: true,
      withData: false,
      anonKey: 'A',
      secretKey: 'S',
    })
    expect(JSON.stringify(outputs)).not.toMatch(/"A"|"S"/)
    expect(outputs).toEqual({
      supabase_branch: 'pr-1',
      supabase_ref: 'r',
      supabase_url: 'u',
      supabase_status: 's',
      supabase_created: 'true',
      supabase_with_data: 'false',
    })
  })
})

describe('teardown', () => {
  it('refuses the default branch, a persistent branch, and any foreign name', () => {
    expect(deletionRefusal({ name: 'main', is_default: true })).toMatch(/default/)
    expect(deletionRefusal({ name: 'staging', persistent: true })).toMatch(/persistent/)
    expect(deletionRefusal({ name: 'pr-3', persistent: false, is_default: false })).toBeNull()
    expect(deletionRefusal({ name: 'release', persistent: false })).toMatch(/not named pr-<n>/)
    expect(deletionRefusal(null)).toBeNull()
  })

  it('deletes exactly the pr-<n> branch and reports absence without error', async () => {
    const { fetchImpl, calls } = router({
      [`GET /v1/projects/${config.projectRef}/branches`]: [
        { id: 'main-id', name: 'main', is_default: true },
        { id: 'st-id', name: 'staging', persistent: true },
        { id: 'pr-id', name: 'pr-4', project_ref: 'cccccccccccccccccccc' },
      ],
      'DELETE /v1/branches/pr-id': { message: 'ok' },
    })
    expect(await teardownPreviewBranch(config, { pr: 4 }, { fetchImpl })).toEqual({
      name: 'pr-4',
      deleted: true,
      id: 'pr-id',
      ref: 'cccccccccccccccccccc',
    })
    expect(calls.filter((c) => c.key.startsWith('DELETE')).map((c) => c.key)).toEqual([
      'DELETE /v1/branches/pr-id',
    ])
    expect(await teardownPreviewBranch(config, { pr: 5 }, { fetchImpl })).toEqual({
      name: 'pr-5',
      deleted: false,
      reason: 'absent',
    })
  })

  it('throws rather than delete a branch that carries the pr name but is persistent', async () => {
    const { fetchImpl, calls } = router({
      [`GET /v1/projects/${config.projectRef}/branches`]: [
        { id: 'x', name: 'pr-6', persistent: true },
      ],
    })
    await expect(teardownPreviewBranch(config, { pr: 6 }, { fetchImpl })).rejects.toThrow(
      /refusing to delete/,
    )
    expect(calls.some((c) => c.key.startsWith('DELETE'))).toBe(false)
  })
})

describe('parseArgs', () => {
  it('reads the command, valued flags and bare flags', () => {
    expect(parseArgs(['ensure', '--pr', '72', '--git-branch', 'feat/x', '--dry'])).toEqual({
      command: 'ensure',
      flags: { pr: '72', 'git-branch': 'feat/x', dry: true },
    })
  })
})
