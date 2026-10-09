import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { alertMoneyFailure, sendAlert } from './alert'

describe('sendAlert', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.unstubAllEnvs()
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.unstubAllEnvs()
  })

  it('posts the body to the configured topic', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response('ok', { status: 200 })
    }) as never

    const ok = await sendAlert({ title: 'T', message: 'body' })

    expect(ok).toBe(true)
    expect(calls[0]?.url).toContain('/kenyon-ofir-limit')
    expect(calls[0]?.init.method).toBe('POST')
    expect(calls[0]?.init.body).toBe('body')
  })

  it('never throws when the alert endpoint is unreachable', async () => {
    // The property that matters most here. Every caller is already on a failure
    // branch, so an alert that throws becomes the error the customer sees.
    globalThis.fetch = (async () => {
      throw new Error('network down')
    }) as never

    await expect(sendAlert({ title: 'T', message: 'm' })).resolves.toBe(false)
    await expect(
      alertMoneyFailure({ stage: 'webhook', error: new Error('boom') }),
    ).resolves.toBeUndefined()
  })

  it('returns false rather than throwing on a non-2xx', async () => {
    globalThis.fetch = (async () => new Response('nope', { status: 500 })) as never
    expect(await sendAlert({ title: 'T', message: 'm' })).toBe(false)
  })

  it('can be switched off entirely', async () => {
    vi.stubEnv('ALERTS_ENABLED', 'false')
    let called = false
    globalThis.fetch = (async () => {
      called = true
      return new Response('ok')
    }) as never

    expect(await sendAlert({ title: 'T', message: 'm' })).toBe(false)
    expect(called, 'no request should be made when alerts are off').toBe(false)
  })

  it('carries identifiers but never an amount', async () => {
    let body = ''
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      body = String(init.body)
      return new Response('ok')
    }) as never

    await alertMoneyFailure({
      stage: 'finalize',
      orderId: 'ord-1',
      voucherId: 'vou-2',
      error: new Error('settlement failed'),
    })

    expect(body).toContain('ord-1')
    expect(body).toContain('vou-2')
    expect(body).toContain('settlement failed')
    // ntfy topics are public unless configured otherwise, so the alert is a
    // handle for looking an incident up, not a report of it.
    expect(body).not.toMatch(/₪|agorot|\d+\.\d{2}/)
  })
})

describe('sendAlert fan-out to Telegram', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.unstubAllEnvs()
  })

  it('posts to ntfy only when Telegram is not configured', async () => {
    const urls: string[] = []
    globalThis.fetch = (async (url: string) => {
      urls.push(url)
      return new Response('ok')
    }) as never

    await sendAlert({ title: 'T', message: 'm' })
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain('ntfy.sh')
  })

  it('posts to both channels when the bot is configured, title on its own line', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '1:a')
    vi.stubEnv('TELEGRAM_CHAT_ID', '9')
    const calls: { url: string; body: string }[] = []
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body) })
      return new Response('ok')
    }) as never

    await sendAlert({ title: 'KE money path: finalize', message: 'הזמנה: ord-1' })

    const telegram = calls.find((c) => c.url.includes('api.telegram.org'))
    const ntfy = calls.find((c) => c.url.includes('ntfy.sh'))
    expect(ntfy?.body).toBe('הזמנה: ord-1')
    expect(JSON.parse(telegram?.body ?? '{}').text).toBe('KE money path: finalize\nהזמנה: ord-1')
  })

  it('counts as delivered when ntfy fails but Telegram accepts', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '1:a')
    vi.stubEnv('TELEGRAM_CHAT_ID', '9')
    globalThis.fetch = (async (url: string) =>
      new Response('x', { status: url.includes('ntfy.sh') ? 500 : 200 })) as never

    expect(await sendAlert({ title: 'T', message: 'm' })).toBe(true)
  })

  it('sends to the topic override when one is given', async () => {
    const urls: string[] = []
    globalThis.fetch = (async (url: string) => {
      urls.push(url)
      return new Response('ok')
    }) as never

    await sendAlert({ title: 'T', message: 'm', topic: 'kenyon-health' })
    expect(urls[0]).toMatch(/\/kenyon-health$/)
  })
})
