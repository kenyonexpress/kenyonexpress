// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import worker, {
  type Env,
  consumeBatch,
  handleTaskRequest,
  retryDelaySeconds,
  runTask,
} from '../../../infra/cloudflare/workers/async-offload/src/index'
import type { OffloadTask } from './task-contracts'
import { SIGNATURE_HEADER, signTask } from './task-signature'

/**
 * The Worker's handlers, exercised directly. The Cloudflare runtime is not
 * here; what is here is every decision the Worker makes: who it lets in, what
 * it queues, and when it acks or retries.
 */

const SECRET = 'cf-async-secret-0123456789abcdef'
const TASK: OffloadTask = { type: 'warm-urls', urls: ['https://kenyonexpress.co.il/'] }

function env() {
  const sent: OffloadTask[] = []
  const e: Env = {
    TASK_SECRET: SECRET,
    ASYNC_QUEUE: {
      send: async (body) => {
        sent.push(body)
      },
    },
  }
  return { e, sent }
}

async function signedRequest(body: string, secret = SECRET): Promise<Request> {
  return new Request('https://worker.test/tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [SIGNATURE_HEADER]: await signTask(secret, body),
    },
    body,
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('handleTaskRequest', () => {
  it('queues a signed, valid task and answers 202', async () => {
    const { e, sent } = env()
    const res = await handleTaskRequest(await signedRequest(JSON.stringify(TASK)), e)
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ ok: true, queued: true, type: 'warm-urls' })
    expect(sent).toEqual([TASK])
  })

  it('refuses an unsigned or wrongly signed request with 401 and queues nothing', async () => {
    const { e, sent } = env()
    const unsigned = new Request('https://worker.test/tasks', {
      method: 'POST',
      body: JSON.stringify(TASK),
    })
    expect((await handleTaskRequest(unsigned, e)).status).toBe(401)
    const wrong = await signedRequest(JSON.stringify(TASK), 'some-other-secret-0123456789')
    expect((await handleTaskRequest(wrong, e)).status).toBe(401)
    expect(sent).toEqual([])
  })

  it('refuses a task that does not match the shared schema', async () => {
    const { e, sent } = env()
    const res = await handleTaskRequest(await signedRequest(JSON.stringify({ type: 'nope' })), e)
    expect(res.status).toBe(400)
    expect(sent).toEqual([])
    const bad = await handleTaskRequest(await signedRequest('not json'), e)
    expect(bad.status).toBe(400)
  })

  it('answers health without auth and 404 elsewhere', async () => {
    const { e } = env()
    expect((await handleTaskRequest(new Request('https://worker.test/health'), e)).status).toBe(200)
    expect((await handleTaskRequest(new Request('https://worker.test/other'), e)).status).toBe(404)
    expect(
      (await handleTaskRequest(new Request('https://worker.test/tasks', { method: 'GET' }), e))
        .status,
    ).toBe(405)
  })

  it('is what the Worker exports', () => {
    expect(worker.fetch).toBe(handleTaskRequest)
    expect(worker.queue).toBe(consumeBatch)
  })
})

describe('runTask', () => {
  it('warms every URL and counts failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await runTask({
      type: 'warm-urls',
      urls: ['https://kenyonexpress.co.il/', 'https://kenyonexpress.co.il/products'],
    })
    expect(result).toEqual({ total: 2, failed: 1 })
  })

  it('treats a receiver 4xx as delivered and a 5xx as failed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 400 }))
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockRejectedValueOnce(new Error('timeout'))
    vi.stubGlobal('fetch', fetchMock)
    const result = await runTask({
      type: 'webhook-fanout',
      targets: [
        { url: 'https://a.example/hook', body: '{}' },
        { url: 'https://b.example/hook', body: '{}' },
        { url: 'https://c.example/hook', body: '{}' },
      ],
    })
    expect(result).toEqual({ total: 3, failed: 2 })
  })
})

describe('consumeBatch', () => {
  function message(body: unknown, attempts = 1) {
    return {
      id: 'm',
      attempts,
      body: body as OffloadTask,
      ack: vi.fn(),
      retry: vi.fn(),
    }
  }

  it('acks a task that fully succeeded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })))
    const m = message(TASK)
    await consumeBatch({ queue: 'ke-async-tasks', messages: [m] })
    expect(m.ack).toHaveBeenCalled()
    expect(m.retry).not.toHaveBeenCalled()
  })

  it('retries with backoff when any part failed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 502 })))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = message(TASK, 3)
    await consumeBatch({ queue: 'ke-async-tasks', messages: [m] })
    expect(m.ack).not.toHaveBeenCalled()
    expect(m.retry).toHaveBeenCalledWith({ delaySeconds: 120 })
  })

  it('acks (drops) a body that does not parse, so the DLQ holds only real failures', async () => {
    const m = message({ type: 'nope' })
    await consumeBatch({ queue: 'ke-async-tasks', messages: [m] })
    expect(m.ack).toHaveBeenCalled()
    expect(m.retry).not.toHaveBeenCalled()
  })
})

describe('retryDelaySeconds', () => {
  it('doubles from thirty seconds and caps at ten minutes', () => {
    expect([1, 2, 3, 4, 5, 6].map(retryDelaySeconds)).toEqual([30, 60, 120, 240, 480, 600])
  })
})
