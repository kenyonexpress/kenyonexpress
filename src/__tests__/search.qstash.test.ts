import { createHash, createHmac } from 'node:crypto'
import type { SearchIndexJob } from '@/lib/search/pipeline-contracts'
import { enqueueSearchIndexJob, verifyQstashSignature } from '@/lib/search/qstash'
import { afterEach, describe, expect, it, vi } from 'vitest'

const JOB: SearchIndexJob = {
  op: 'upsert',
  productId: '3e9a4f6c-1b2d-4c5e-8f7a-9b0c1d2e3f4a',
  reason: 'update:active',
  enqueuedAt: '2026-07-27T10:00:00.000Z',
}

const WORKER_URL = 'https://kenyonexpress.co.il/api/search/index-job'
const SIGNING_KEY = 'sig_key_current_0123456789abcdef'

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function makeToken(
  rawBody: string,
  key: string,
  claimOverrides: Record<string, unknown> = {},
): string {
  const nowSeconds = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(
    JSON.stringify({
      iss: 'Upstash',
      sub: WORKER_URL,
      exp: nowSeconds + 300,
      nbf: nowSeconds - 10,
      body: createHash('sha256').update(rawBody).digest('base64url'),
      ...claimOverrides,
    }),
  )
  const signature = createHmac('sha256', key).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${signature}`
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('enqueueSearchIndexJob', () => {
  it('runs inline when QSTASH_TOKEN is unset', async () => {
    vi.stubEnv('QSTASH_TOKEN', '')
    const runInline = vi.fn().mockResolvedValue('upserted x')
    const outcome = await enqueueSearchIndexJob(JOB, runInline)
    expect(outcome).toEqual({ transport: 'inline', outcome: 'upserted x' })
    expect(runInline).toHaveBeenCalledWith(JOB)
  })

  it('publishes to QStash with retries, failure callback and dedup id', async () => {
    vi.stubEnv('QSTASH_TOKEN', 'qstash-token')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://kenyonexpress.co.il')
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ messageId: 'msg_1' }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await enqueueSearchIndexJob(JOB, vi.fn())
    expect(outcome).toEqual({ transport: 'qstash', messageId: 'msg_1' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`https://qstash.upstash.io/v2/publish/${WORKER_URL}`)
    const headers = init.headers as Record<string, string>
    expect(headers['Upstash-Retries']).toBe('5')
    expect(headers['Upstash-Failure-Callback']).toBe(
      'https://kenyonexpress.co.il/api/search/index-dlq',
    )
    expect(headers['Upstash-Deduplication-Id']).toBe(`upsert:${JOB.productId}:${JOB.enqueuedAt}`)
    expect(JSON.parse(init.body as string)).toEqual(JOB)
  })

  it('throws when QStash answers non-2xx', async () => {
    vi.stubEnv('QSTASH_TOKEN', 'qstash-token')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://kenyonexpress.co.il')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 429 })))
    await expect(enqueueSearchIndexJob(JOB, vi.fn())).rejects.toThrow('qstash publish failed')
  })
})

describe('verifyQstashSignature', () => {
  const rawBody = JSON.stringify(JOB)

  it('accepts a token signed with the current key', () => {
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', SIGNING_KEY)
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', '')
    const token = makeToken(rawBody, SIGNING_KEY)
    expect(verifyQstashSignature(token, rawBody, WORKER_URL)).toBe(true)
  })

  it('accepts a token signed with the next key (rotation)', () => {
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'some-other-key')
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', SIGNING_KEY)
    const token = makeToken(rawBody, SIGNING_KEY)
    expect(verifyQstashSignature(token, rawBody, WORKER_URL)).toBe(true)
  })

  it('rejects a token signed with an unknown key', () => {
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', SIGNING_KEY)
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', '')
    expect(verifyQstashSignature(makeToken(rawBody, 'wrong-key'), rawBody, WORKER_URL)).toBe(false)
  })

  it('rejects an expired token', () => {
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', SIGNING_KEY)
    const token = makeToken(rawBody, SIGNING_KEY, { exp: Math.floor(Date.now() / 1000) - 60 })
    expect(verifyQstashSignature(token, rawBody, WORKER_URL)).toBe(false)
  })

  it('rejects a body swap (hash mismatch)', () => {
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', SIGNING_KEY)
    const token = makeToken(rawBody, SIGNING_KEY)
    expect(verifyQstashSignature(token, '{"tampered":true}', WORKER_URL)).toBe(false)
  })

  it('rejects a token minted for a different URL', () => {
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', SIGNING_KEY)
    const token = makeToken(rawBody, SIGNING_KEY, { sub: 'https://evil.example/hook' })
    expect(verifyQstashSignature(token, rawBody, WORKER_URL)).toBe(false)
  })

  it('rejects when no signature or no keys are configured', () => {
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', '')
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', '')
    expect(verifyQstashSignature(null, rawBody, WORKER_URL)).toBe(false)
    expect(verifyQstashSignature(makeToken(rawBody, SIGNING_KEY), rawBody, WORKER_URL)).toBe(false)
  })

  it('rejects garbage tokens without throwing', () => {
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', SIGNING_KEY)
    expect(verifyQstashSignature('not.a.jwt', rawBody, WORKER_URL)).toBe(false)
    expect(verifyQstashSignature('a.b', rawBody, WORKER_URL)).toBe(false)
  })
})
