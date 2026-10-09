import { afterEach, describe, expect, it, vi } from 'vitest'
import { newJobEnvelope } from './contracts'
import { JOB_RETRIES, isQstashConfigured, publishJob } from './queue'

const APP = 'https://kenyonexpress.co.il'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('publishJob', () => {
  it('runs inline when QSTASH_TOKEN is unset', async () => {
    const envelope = newJobEnvelope('cache-warm', { paths: ['/'] })
    const runInline = vi.fn().mockResolvedValue('warmed 1/1')
    const outcome = await publishJob(envelope, runInline, {
      env: {} as unknown as NodeJS.ProcessEnv,
    })
    expect(outcome).toEqual({ transport: 'inline', outcome: 'warmed 1/1' })
    expect(runInline).toHaveBeenCalledWith(envelope)
    expect(isQstashConfigured({} as unknown as NodeJS.ProcessEnv)).toBe(false)
  })

  it('publishes to the worker with retries, the failure callback and the envelope id as dedup', async () => {
    const envelope = newJobEnvelope('search-outbox-drain', {})
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ messageId: 'msg_9' }), { status: 201 }))
    const env = {
      QSTASH_TOKEN: 'tok',
      NEXT_PUBLIC_APP_URL: `${APP}/`,
    } as unknown as NodeJS.ProcessEnv

    const runInline = vi.fn()
    const outcome = await publishJob(envelope, runInline, { env, fetchImpl: fetchMock })
    expect(outcome).toEqual({ transport: 'qstash', messageId: 'msg_9' })
    expect(runInline).not.toHaveBeenCalled()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`https://qstash.upstash.io/v2/publish/${APP}/api/jobs/run`)
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok')
    expect(headers['Upstash-Retries']).toBe(String(JOB_RETRIES))
    expect(headers['Upstash-Failure-Callback']).toBe(`${APP}/api/jobs/dlq`)
    expect(headers['Upstash-Deduplication-Id']).toBe(envelope.id)
    expect(headers['Upstash-Delay']).toBeUndefined()
    expect(JSON.parse(init.body as string)).toEqual(envelope)
  })

  it('passes a delay through as whole seconds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }))
    const env = { QSTASH_TOKEN: 'tok', NEXT_PUBLIC_APP_URL: APP } as unknown as NodeJS.ProcessEnv
    await publishJob(newJobEnvelope('search-outbox-drain', {}), vi.fn(), {
      env,
      fetchImpl: fetchMock,
      delaySeconds: 2.2,
    })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['Upstash-Delay']).toBe('3s')
  })

  it('throws when QStash answers non-2xx, so the producer knows the job is not queued', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 429 }))
    const env = { QSTASH_TOKEN: 'tok', NEXT_PUBLIC_APP_URL: APP } as unknown as NodeJS.ProcessEnv
    await expect(
      publishJob(newJobEnvelope('search-outbox-drain', {}), vi.fn(), { env, fetchImpl: fetchMock }),
    ).rejects.toThrow(/qstash publish failed: 429/)
  })

  it('refuses to publish without an app URL rather than guessing a worker address', async () => {
    const env = { QSTASH_TOKEN: 'tok' } as unknown as NodeJS.ProcessEnv
    await expect(
      publishJob(newJobEnvelope('search-outbox-drain', {}), vi.fn(), { env, fetchImpl: vi.fn() }),
    ).rejects.toThrow(/NEXT_PUBLIC_APP_URL/)
  })
})
