import { beforeEach, describe, expect, it, vi } from 'vitest'

const warn = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: { warn: (...args: unknown[]) => warn(...args), info: () => {}, error: () => {} },
}))

const {
  CO_VIEW_QUERY,
  VIEWED_BY_VISITOR_QUERY,
  isPostHogQueryConfigured,
  postHogQueryConfig,
  queryHogql,
  rowsAs,
} = await import('./posthog-query')

const ENV = { POSTHOG_API_KEY: 'phx_test', POSTHOG_PROJECT_ID: '12345' }

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  warn.mockReset()
})

describe('postHogQueryConfig', () => {
  it('needs the personal key and a numeric project id, and rewrites the ingest host', () => {
    expect(postHogQueryConfig({})).toBeNull()
    expect(postHogQueryConfig({ POSTHOG_API_KEY: 'phx' })).toBeNull()
    expect(postHogQueryConfig({ ...ENV, POSTHOG_PROJECT_ID: 'abc' })).toBeNull()
    expect(postHogQueryConfig(ENV)).toEqual({
      host: 'https://us.posthog.com',
      projectId: '12345',
      apiKey: 'phx_test',
    })
    expect(
      postHogQueryConfig({ ...ENV, NEXT_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com/' })?.host,
    ).toBe('https://eu.posthog.com')
    expect(
      postHogQueryConfig({
        ...ENV,
        NEXT_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com',
        POSTHOG_API_HOST: 'https://ph.example.test',
      })?.host,
    ).toBe('https://ph.example.test')
    expect(isPostHogQueryConfigured(ENV)).toBe(true)
    expect(isPostHogQueryConfigured({})).toBe(false)
  })
})

describe('queryHogql', () => {
  it('is null without configuration and never calls out', async () => {
    const fetchImpl = vi.fn()
    expect(await queryHogql('SELECT 1', {}, { config: null, fetchImpl })).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('posts a HogQLQuery with bound values to the project query endpoint', async () => {
    const fetchImpl = vi.fn(async () => response(200, { columns: ['a'], results: [['x']] }))
    const config = postHogQueryConfig(ENV)
    const result = await queryHogql('SELECT {id}', { id: 'visitor-1' }, { config, fetchImpl })

    expect(result).toEqual({ columns: ['a'], results: [['x']] })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://us.posthog.com/api/projects/12345/query/')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer phx_test')
    expect(JSON.parse(init.body as string)).toEqual({
      query: { kind: 'HogQLQuery', query: 'SELECT {id}', values: { id: 'visitor-1' } },
    })
  })

  it('returns null, and says why, on a non-2xx, a malformed body and a thrown fetch', async () => {
    const config = postHogQueryConfig(ENV)
    expect(
      await queryHogql('q', {}, { config, fetchImpl: async () => response(401, {}) }),
    ).toBeNull()
    expect(warn).toHaveBeenCalledWith('recommendations.hogql_failed', { status: 401 })

    expect(
      await queryHogql('q', {}, { config, fetchImpl: async () => response(200, { nope: 1 }) }),
    ).toBeNull()
    expect(warn).toHaveBeenCalledWith('recommendations.hogql_malformed', {})

    expect(
      await queryHogql(
        'q',
        {},
        {
          config,
          fetchImpl: async () => {
            throw new Error('boom')
          },
        },
      ),
    ).toBeNull()
    expect(warn).toHaveBeenCalledWith('recommendations.hogql_threw', { reason: 'boom' })
  })
})

describe('the two statements', () => {
  it('bind every visitor-controlled value through a placeholder', () => {
    expect(VIEWED_BY_VISITOR_QUERY).toContain('distinct_id = {distinct_id}')
    expect(VIEWED_BY_VISITOR_QUERY).not.toMatch(/\$\{/)
    expect(CO_VIEW_QUERY).toContain("event = 'view_item'")
    expect(CO_VIEW_QUERY).toContain('properties.item_id')
    // A visitor-day, not a session: the fetch emitter stamps no $session_id.
    expect(CO_VIEW_QUERY).toContain("concat(distinct_id, ':', toString(toDate(timestamp)))")
  })
})

describe('rowsAs', () => {
  it('picks the two named columns and drops rows missing either', () => {
    const result = {
      columns: ['basket', 'item_id', 'extra'],
      results: [
        ['v1:2026-10-08', 'p1', 1],
        ['v1:2026-10-08', '', 2],
        [null, 'p2', 3],
        ['v2:2026-10-08', 'p3', 4],
      ],
    }
    expect(rowsAs(result, 'basket', 'item_id')).toEqual([
      { first: 'v1:2026-10-08', second: 'p1' },
      { first: 'v2:2026-10-08', second: 'p3' },
    ])
    expect(rowsAs(result, 'basket', 'missing')).toEqual([])
  })
})
