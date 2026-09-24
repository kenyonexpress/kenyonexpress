import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * QStash as the wake transport. What matters is the request that leaves for
 * Upstash (URL, bearer, dedup id, delay, failure callback), and that nothing
 * here can throw into a flow that already charged a card.
 */

const verifyQstashSignature = vi.fn()
const logWarn = vi.fn()

vi.mock('@/lib/search/qstash', () => ({
  verifyQstashSignature: (...a: unknown[]) => verifyQstashSignature(...a),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { warn: (...a: unknown[]) => logWarn(...a), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const {
  NOTIFICATIONS_DLQ_PATH,
  NOTIFICATIONS_WORKER_PATH,
  QSTASH_RETRIES,
  dlqUrl,
  isQstashConfigured,
  parseWakeMessage,
  publishDrainWake,
  verifyNotificationsSignature,
  wakeDeduplicationId,
  workerUrl,
} = await import('./qstash')

const ENV = {
  QSTASH_TOKEN: 'qs_token',
  NEXT_PUBLIC_APP_URL: 'https://shop.test/',
} as unknown as NodeJS.ProcessEnv

function fetchAnswering(status: number, body: unknown = { messageId: 'msg_1' }) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  })) as unknown as typeof fetch
}

beforeEach(() => {
  verifyQstashSignature.mockReset()
  logWarn.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('configuration', () => {
  it('isQstashConfigured needs a non-blank token', () => {
    expect(isQstashConfigured({ QSTASH_TOKEN: 'x' } as unknown as NodeJS.ProcessEnv)).toBe(true)
    expect(isQstashConfigured({ QSTASH_TOKEN: '  ' } as unknown as NodeJS.ProcessEnv)).toBe(false)
    expect(isQstashConfigured({} as unknown as NodeJS.ProcessEnv)).toBe(false)
  })

  it('reads process.env by default', () => {
    vi.stubEnv('QSTASH_TOKEN', 'from-process')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://p.test')
    expect(isQstashConfigured()).toBe(true)
    expect(workerUrl()).toBe(`https://p.test${NOTIFICATIONS_WORKER_PATH}`)
    expect(dlqUrl()).toBe(`https://p.test${NOTIFICATIONS_DLQ_PATH}`)
  })

  it('builds the worker and DLQ URLs without a double slash', () => {
    expect(workerUrl(ENV)).toBe('https://shop.test/api/cron/notifications')
    expect(dlqUrl(ENV)).toBe('https://shop.test/api/webhooks/notifications-dlq')
    expect(workerUrl({} as unknown as NodeJS.ProcessEnv)).toBeNull()
    expect(dlqUrl({ NEXT_PUBLIC_APP_URL: ' ' } as unknown as NodeJS.ProcessEnv)).toBeNull()
  })
})

describe('wakeDeduplicationId', () => {
  it('keys a retry on row and attempt, so one attempt publishes once', () => {
    expect(wakeDeduplicationId({ reason: 'retry', outbox_id: 'ob', attempt: 3 })).toBe(
      'notif:retry:ob:3',
    )
    expect(wakeDeduplicationId({ reason: 'retry', outbox_id: 'ob' })).toBe('notif:retry:ob:0')
  })

  it('keys an enqueue on the dedupe key, then the row, then a 30-second bucket', () => {
    expect(wakeDeduplicationId({ reason: 'enqueue', dedupe_key: 'k', outbox_id: 'ob' })).toBe(
      'notif:wake:k',
    )
    expect(wakeDeduplicationId({ reason: 'enqueue', outbox_id: 'ob' })).toBe('notif:wake:ob')
    expect(wakeDeduplicationId({ reason: 'manual' }, 90_000)).toBe('notif:sweep:3')
    expect(wakeDeduplicationId({ reason: 'manual' }, 119_999)).toBe('notif:sweep:3')
  })
})

describe('publishDrainWake', () => {
  it('degrades to none without a token or an app URL, and never fetches', async () => {
    const fetchImpl = fetchAnswering(200)
    expect(
      await publishDrainWake({ reason: 'manual' }, { env: {} as NodeJS.ProcessEnv, fetchImpl }),
    ).toEqual({ transport: 'none', reason: 'QSTASH_TOKEN is not set' })
    expect(
      await publishDrainWake(
        { reason: 'manual' },
        { env: { QSTASH_TOKEN: 't' } as unknown as NodeJS.ProcessEnv, fetchImpl },
      ),
    ).toEqual({ transport: 'none', reason: 'NEXT_PUBLIC_APP_URL is not set' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('POSTs the message to the worker URL with the headers QStash reads', async () => {
    const fetchImpl = fetchAnswering(200)
    const message = { reason: 'retry' as const, outbox_id: 'ob-1', attempt: 2 }

    const outcome = await publishDrainWake(message, { env: ENV, fetchImpl, delaySeconds: 119.2 })

    expect(outcome).toEqual({ transport: 'qstash', messageId: 'msg_1' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(url).toBe(
      'https://qstash.upstash.io/v2/publish/https://shop.test/api/cron/notifications',
    )
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify(message))
    expect(init.cache).toBe('no-store')
    expect(init.headers).toEqual({
      Authorization: 'Bearer qs_token',
      'Content-Type': 'application/json',
      'Upstash-Retries': String(QSTASH_RETRIES),
      'Upstash-Failure-Callback': 'https://shop.test/api/webhooks/notifications-dlq',
      'Upstash-Deduplication-Id': 'notif:retry:ob-1:2',
      'Upstash-Forward-X-Kenyon-Wake': 'retry',
      'Upstash-Delay': '120s',
    })
  })

  it('omits the delay header for zero, negative or non-finite delays', async () => {
    for (const delaySeconds of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const fetchImpl = fetchAnswering(200)
      await publishDrainWake({ reason: 'enqueue' }, { env: ENV, fetchImpl, delaySeconds })
      const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[1] as RequestInit
      expect(init.headers).not.toHaveProperty('Upstash-Delay')
    }
  })

  it('reports unknown when QStash answers 2xx with no message id', async () => {
    const fetchImpl = fetchAnswering(201, {})
    expect(await publishDrainWake({ reason: 'manual' }, { env: ENV, fetchImpl })).toEqual({
      transport: 'qstash',
      messageId: 'unknown',
    })
  })

  it('reports a refusal with the status and logs the body, bounded', async () => {
    const fetchImpl = fetchAnswering(429, 'x'.repeat(300))
    expect(await publishDrainWake({ reason: 'manual' }, { env: ENV, fetchImpl })).toEqual({
      transport: 'none',
      reason: 'qstash 429',
    })
    expect(logWarn).toHaveBeenCalledWith('notifications.wake_refused', {
      status: 429,
      detail: 'x'.repeat(200),
    })
  })

  it('reports network on a thrown fetch and never throws itself', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNRESET')
    }) as unknown as typeof fetch
    expect(await publishDrainWake({ reason: 'manual' }, { env: ENV, fetchImpl })).toEqual({
      transport: 'none',
      reason: 'network',
    })
    expect(logWarn).toHaveBeenCalledWith('notifications.wake_failed', { reason: 'ECONNRESET' })
  })

  it('uses the global fetch and process.env when nothing is injected', async () => {
    vi.stubEnv('QSTASH_TOKEN', 'qs_token')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://shop.test')
    const fetchMock = fetchAnswering(200)
    vi.stubGlobal('fetch', fetchMock)
    try {
      expect(await publishDrainWake({ reason: 'manual' })).toEqual({
        transport: 'qstash',
        messageId: 'msg_1',
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('verifyNotificationsSignature', () => {
  it('binds the signature to this deployment and this path', () => {
    verifyQstashSignature.mockReturnValue(true)
    expect(verifyNotificationsSignature('sig', '{}', NOTIFICATIONS_DLQ_PATH, ENV)).toBe(true)
    expect(verifyQstashSignature).toHaveBeenCalledWith(
      'sig',
      '{}',
      'https://shop.test/api/webhooks/notifications-dlq',
    )
  })

  it('fails closed without an app URL, without asking the verifier', () => {
    expect(
      verifyNotificationsSignature(
        'sig',
        '{}',
        NOTIFICATIONS_WORKER_PATH,
        {} as unknown as NodeJS.ProcessEnv,
      ),
    ).toBe(false)
    expect(verifyQstashSignature).not.toHaveBeenCalled()
  })
})

describe('parseWakeMessage', () => {
  const UUID = '0b6a1e1e-4c2d-4f0a-9b1e-2f3c4d5e6f70'

  it('treats blank, invalid and non-object bodies as a manual sweep', () => {
    expect(parseWakeMessage('')).toEqual({ reason: 'manual' })
    expect(parseWakeMessage('   ')).toEqual({ reason: 'manual' })
    expect(parseWakeMessage('{not json')).toEqual({ reason: 'manual' })
    expect(parseWakeMessage('null')).toEqual({ reason: 'manual' })
    expect(parseWakeMessage('"string"')).toEqual({ reason: 'manual' })
  })

  it('keeps only the known reasons and validated fields', () => {
    expect(
      parseWakeMessage(
        JSON.stringify({ reason: 'retry', outbox_id: UUID, dedupe_key: 'k', attempt: 2 }),
      ),
    ).toEqual({ reason: 'retry', outbox_id: UUID, dedupe_key: 'k', attempt: 2 })
    expect(parseWakeMessage(JSON.stringify({ reason: 'enqueue' }))).toEqual({ reason: 'enqueue' })
    expect(parseWakeMessage(JSON.stringify({ reason: 'drop-table' }))).toEqual({
      reason: 'manual',
    })
  })

  it('drops a malformed outbox id, an oversized dedupe key and a fractional attempt', () => {
    expect(
      parseWakeMessage(
        JSON.stringify({
          reason: 'retry',
          outbox_id: 'not-a-uuid',
          dedupe_key: 'k'.repeat(201),
          attempt: 1.5,
        }),
      ),
    ).toEqual({ reason: 'retry' })
  })
})
