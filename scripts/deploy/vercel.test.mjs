import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PROJECT_ID,
  DEFAULT_TEAM_ID,
  VercelApiError,
  currentProductionId,
  deploymentSha,
  deploymentUrl,
  getDeployment,
  listProductionDeployments,
  promoteDeployment,
  rollbackDeployment,
  vercelConfig,
  vercelRequest,
} from './vercel.mjs'

const config = { token: 'tok', teamId: 'team_x', projectId: 'prj_x' }

function jsonFetch(status, body) {
  return vi.fn(async () => ({ ok: status < 400, status, text: async () => JSON.stringify(body) }))
}

describe('vercelConfig', () => {
  it('is null without a token and fills the measured ids by default', () => {
    expect(vercelConfig({})).toBeNull()
    expect(vercelConfig({ VERCEL_TOKEN: 't' })).toEqual({
      token: 't',
      teamId: DEFAULT_TEAM_ID,
      projectId: DEFAULT_PROJECT_ID,
    })
    expect(
      vercelConfig({ VERCEL_TOKEN: 't', VERCEL_ORG_ID: 'team_y', VERCEL_PROJECT_ID: 'prj_y' }),
    ).toMatchObject({
      teamId: 'team_y',
      projectId: 'prj_y',
    })
  })
})

describe('vercelRequest', () => {
  it('sends the token in a header and the team in the query, never the token in the URL', async () => {
    const fetchImpl = jsonFetch(200, { hello: 1 })
    const json = await vercelRequest(config, 'GET', '/v9/projects/prj_x', { fetchImpl })
    expect(json).toEqual({ hello: 1 })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.vercel.com/v9/projects/prj_x?teamId=team_x')
    expect(init.headers.authorization).toBe('Bearer tok')
    expect(url).not.toContain('tok')
  })

  it('appends teamId with & when the path already has a query', async () => {
    const fetchImpl = jsonFetch(200, {})
    await vercelRequest(config, 'GET', '/v6/deployments?limit=1', { fetchImpl })
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://api.vercel.com/v6/deployments?limit=1&teamId=team_x',
    )
  })

  it('throws a typed error carrying the status and the API message', async () => {
    const fetchImpl = jsonFetch(403, { error: { code: 'forbidden', message: 'Not authorized' } })
    await expect(vercelRequest(config, 'POST', '/x', { fetchImpl })).rejects.toMatchObject({
      name: 'VercelApiError',
      status: 403,
      message: 'POST /x -> 403: Not authorized',
    })
    expect(new VercelApiError('GET', '/y', 500)).toBeInstanceOf(Error)
  })
})

describe('the four calls', () => {
  it('lists READY production deployments', async () => {
    const fetchImpl = jsonFetch(200, { deployments: [{ uid: 'a' }] })
    expect(await listProductionDeployments(config, { fetchImpl })).toEqual([{ uid: 'a' }])
    expect(fetchImpl.mock.calls[0][0]).toContain(
      '/v6/deployments?projectId=prj_x&target=production&state=READY',
    )
  })

  it('looks a deployment up by id or by host', async () => {
    const fetchImpl = jsonFetch(200, { id: 'dpl_1' })
    await getDeployment(config, 'https://ke-abc.vercel.app/some/path', { fetchImpl })
    expect(fetchImpl.mock.calls[0][0]).toContain('/v13/deployments/ke-abc.vercel.app?')
    await getDeployment(config, 'dpl_1', { fetchImpl })
    expect(fetchImpl.mock.calls[1][0]).toContain('/v13/deployments/dpl_1?')
  })

  it('promotes and rolls back through the project endpoints', async () => {
    const fetchImpl = jsonFetch(201, {})
    await promoteDeployment(config, 'dpl_g', { fetchImpl })
    expect(fetchImpl.mock.calls[0][0]).toContain('/v10/projects/prj_x/promote/dpl_g')
    expect(fetchImpl.mock.calls[0][1].method).toBe('POST')
    await rollbackDeployment(config, 'dpl_b', { fetchImpl })
    expect(fetchImpl.mock.calls[1][0]).toContain('/v9/projects/prj_x/rollback/dpl_b')
  })
})

describe('record helpers', () => {
  it('reads the current production id off the project record', () => {
    expect(currentProductionId({ targets: { production: { id: 'dpl_p' } } })).toBe('dpl_p')
    expect(currentProductionId({})).toBeNull()
  })

  it('builds an https url and reads the sha from meta', () => {
    expect(deploymentUrl({ url: 'x.vercel.app' })).toBe('https://x.vercel.app')
    expect(deploymentUrl({ alias: ['https://y.vercel.app'] })).toBe('https://y.vercel.app')
    expect(deploymentUrl({})).toBeNull()
    expect(deploymentSha({ meta: { githubCommitSha: 'abc' } })).toBe('abc')
    expect(deploymentSha({})).toBeNull()
  })
})
