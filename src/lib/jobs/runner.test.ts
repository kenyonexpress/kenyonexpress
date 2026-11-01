import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runSearchIndexJob: vi.fn(),
  isMeilisearchConfigured: vi.fn(),
  drainSearchOutbox: vi.fn(),
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/search/indexer', () => ({
  runSearchIndexJob: mocks.runSearchIndexJob,
  isMeilisearchConfigured: mocks.isMeilisearchConfigured,
}))
vi.mock('@/server/search/outbox-drain', () => ({ drainSearchOutbox: mocks.drainSearchOutbox }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ fake: true }) }))
vi.mock('@/lib/observability/log', () => ({ log: mocks.log }))

const { newJobEnvelope } = await import('./contracts')
const { runJob, runJobInline } = await import('./runner')

const PRODUCT_ID = '3e9a4f6c-1b2d-4c5e-8f7a-9b0c1d2e3f4a'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://kenyonexpress.co.il')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  for (const fn of Object.values(mocks.log)) fn.mockClear()
  mocks.runSearchIndexJob.mockReset()
  mocks.isMeilisearchConfigured.mockReset()
  mocks.drainSearchOutbox.mockReset()
})

describe('runJob', () => {
  it('drops an unparseable job and says why, so the worker acknowledges it', async () => {
    const result = await runJob({ nope: true })
    expect(result).toEqual({ status: 'dropped', reason: 'unrecognized envelope' })
    expect(mocks.log.warn).toHaveBeenCalledWith('jobs.dropped', { reason: 'unrecognized envelope' })
  })

  it('dispatches search-index to the indexer', async () => {
    mocks.runSearchIndexJob.mockResolvedValue('upserted x')
    const payload = {
      op: 'upsert' as const,
      productId: PRODUCT_ID,
      reason: 'test',
      enqueuedAt: '2026-09-17T10:00:00.000Z',
    }
    const result = await runJob(newJobEnvelope('search-index', payload))
    expect(result).toEqual({ status: 'done', outcome: 'upserted x' })
    expect(mocks.runSearchIndexJob).toHaveBeenCalledWith(payload)
  })

  it('reports a thrown handler as failed, so the worker answers 500 and QStash retries', async () => {
    mocks.runSearchIndexJob.mockRejectedValue(new Error('meili down'))
    const envelope = newJobEnvelope('search-index', {
      op: 'delete',
      productId: PRODUCT_ID,
      reason: 'test',
      enqueuedAt: '2026-09-17T10:00:00.000Z',
    })
    expect(await runJob(envelope)).toEqual({ status: 'failed', error: 'meili down' })
    expect(mocks.log.error).toHaveBeenCalledWith(
      'jobs.failed',
      expect.objectContaining({ type: 'search-index', id: envelope.id, reason: 'meili down' }),
    )
    await expect(runJobInline(envelope)).rejects.toThrow('meili down')
  })

  it('skips the outbox drain while Meilisearch is not configured, without claiming rows', async () => {
    mocks.isMeilisearchConfigured.mockReturnValue(false)
    const result = await runJob(newJobEnvelope('search-outbox-drain', {}))
    expect(result).toEqual({ status: 'done', outcome: 'skipped: meilisearch not configured' })
    expect(mocks.drainSearchOutbox).not.toHaveBeenCalled()
  })

  it('drains the outbox and fails the job when any row failed', async () => {
    mocks.isMeilisearchConfigured.mockReturnValue(true)
    mocks.drainSearchOutbox.mockResolvedValue({ claimed: 3, succeeded: 3, failed: 0, errors: [] })
    expect(await runJob(newJobEnvelope('search-outbox-drain', {}))).toEqual({
      status: 'done',
      outcome: 'drained 3/3',
    })
    mocks.drainSearchOutbox.mockResolvedValue({
      claimed: 3,
      succeeded: 2,
      failed: 1,
      errors: ['x'],
    })
    expect(await runJob(newJobEnvelope('search-outbox-drain', {}))).toEqual({
      status: 'failed',
      error: 'outbox drain: 1 of 3 failed',
    })
  })

  it('warms each path against the app URL and counts what answered', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await runJob(newJobEnvelope('cache-warm', { paths: ['/', '/products'] }))
    expect(result).toEqual({ status: 'done', outcome: 'warmed 1/2' })
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://kenyonexpress.co.il/',
      'https://kenyonexpress.co.il/products',
    ])
  })

  it('fails the warm only when nothing answered', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const result = await runJob(newJobEnvelope('cache-warm', { paths: ['/'] }))
    expect(result).toEqual({ status: 'failed', error: 'cache-warm: 0 of 1 paths answered' })
  })
})
