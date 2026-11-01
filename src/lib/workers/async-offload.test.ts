// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

const logged = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock('@/lib/observability/log', () => ({ log: logged }))

const { isOffloadConfigured, offloadConfig, offloadTask } = await import('./async-offload')
const { verifyTaskSignature } = await import('./task-signature')

const SECRET = 'cf-async-secret-0123456789abcdef'
const WORKER = 'https://ke-async-offload.example.workers.dev'
const CONFIGURED = {
  CF_ASYNC_WORKER_URL: `${WORKER}/`,
  CF_ASYNC_WORKER_SECRET: SECRET,
} as unknown as NodeJS.ProcessEnv
const TASK = { type: 'warm-urls' as const, urls: ['https://kenyonexpress.co.il/'] }

afterEach(() => {
  for (const fn of Object.values(logged)) fn.mockClear()
})

describe('offloadConfig', () => {
  it('needs both variables, an https URL and a real secret', () => {
    expect(offloadConfig({} as unknown as NodeJS.ProcessEnv)).toBeNull()
    expect(
      offloadConfig({ CF_ASYNC_WORKER_URL: WORKER } as unknown as NodeJS.ProcessEnv),
    ).toBeNull()
    expect(
      offloadConfig({
        CF_ASYNC_WORKER_URL: WORKER,
        CF_ASYNC_WORKER_SECRET: 'short',
      } as unknown as NodeJS.ProcessEnv),
    ).toBeNull()
    expect(
      offloadConfig({
        CF_ASYNC_WORKER_URL: 'http://worker.local',
        CF_ASYNC_WORKER_SECRET: SECRET,
      } as unknown as NodeJS.ProcessEnv),
    ).toBeNull()
    expect(offloadConfig(CONFIGURED)).toEqual({ url: WORKER, secret: SECRET })
    expect(isOffloadConfigured(CONFIGURED)).toBe(true)
  })
})

describe('offloadTask', () => {
  it('runs the inline fallback when the Worker is not configured', async () => {
    const inline = vi.fn().mockResolvedValue('warmed inline')
    const outcome = await offloadTask(TASK, { inline, env: {} as unknown as NodeJS.ProcessEnv })
    expect(outcome).toEqual({ transport: 'inline', outcome: 'warmed inline' })
    expect(inline).toHaveBeenCalledWith(TASK)
  })

  it('posts a signed task to the Worker and returns its acceptance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, queued: true, type: 'warm-urls' }), {
        status: 202,
      }),
    )
    const inline = vi.fn()
    const outcome = await offloadTask(TASK, {
      inline,
      env: CONFIGURED,
      fetchImpl: fetchMock,
      nowMs: 1_758_000_000_000,
    })
    expect(outcome).toEqual({
      transport: 'worker',
      accepted: { ok: true, queued: true, type: 'warm-urls' },
    })
    expect(inline).not.toHaveBeenCalled()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${WORKER}/tasks`)
    const headers = init.headers as Record<string, string>
    const verdict = await verifyTaskSignature(
      SECRET,
      headers['X-KE-Signature'] ?? null,
      init.body as string,
      {
        nowMs: 1_758_000_000_000,
      },
    )
    expect(verdict).toEqual({ ok: true })
    expect(JSON.parse(init.body as string)).toEqual(TASK)
  })

  it('falls back to inline when the Worker refuses, and says so', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 401 }))
    const inline = vi.fn().mockResolvedValue('warmed inline')
    const outcome = await offloadTask(TASK, { inline, env: CONFIGURED, fetchImpl: fetchMock })
    expect(outcome).toEqual({ transport: 'inline', outcome: 'warmed inline' })
    expect(logged.warn).toHaveBeenCalledWith('offload.worker_refused', {
      status: 401,
      type: 'warm-urls',
    })
  })

  it('falls back to inline when the Worker is unreachable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ENOTFOUND'))
    const inline = vi.fn().mockResolvedValue('ok')
    const outcome = await offloadTask(TASK, { inline, env: CONFIGURED, fetchImpl: fetchMock })
    expect(outcome).toEqual({ transport: 'inline', outcome: 'ok' })
    expect(logged.warn).toHaveBeenCalledWith(
      'offload.worker_unreachable',
      expect.objectContaining({ reason: 'ENOTFOUND' }),
    )
  })

  it('never throws: a failed inline is reported and logged', async () => {
    const inline = vi.fn().mockRejectedValue(new Error('warm exploded'))
    const outcome = await offloadTask(TASK, { inline, env: {} as unknown as NodeJS.ProcessEnv })
    expect(outcome).toEqual({ transport: 'inline', failed: 'warm exploded' })
    expect(logged.error).toHaveBeenCalledWith('offload.inline_failed', {
      type: 'warm-urls',
      reason: 'warm exploded',
    })
  })

  it('refuses an invalid task without sending it anywhere', async () => {
    const fetchMock = vi.fn()
    const inline = vi.fn()
    const outcome = await offloadTask(
      { type: 'warm-urls', urls: ['http://insecure/'] },
      {
        inline,
        env: CONFIGURED,
        fetchImpl: fetchMock,
      },
    )
    expect(outcome).toEqual({ transport: 'inline', failed: 'invalid task' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(inline).not.toHaveBeenCalled()
  })
})
