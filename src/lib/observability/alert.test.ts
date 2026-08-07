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
