import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The half-hourly "are the live Cardcom credentials here yet" check: closed to
 * strangers, silent while mock is on or the API name is a stand-in, one push
 * plus the flag when they are real, and quiet again once CHECKOUT_ENABLED has
 * been flipped. The env rules themselves are pinned in
 * lib/payments/live-readiness.test.ts.
 */

const { sendAlert, touchLaunchReadyFlag } = vi.hoisted(() => ({
  sendAlert: vi.fn(),
  touchLaunchReadyFlag: vi.fn(),
}))

vi.mock('@/lib/observability/alert', () => ({ sendAlert }))
vi.mock('@/lib/payments/live-readiness', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/payments/live-readiness')>()
  return { ...actual, touchLaunchReadyFlag }
})

import { GET } from './route'

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/cardcom-live-check', {
    headers: auth ? { authorization: auth } : {},
  })
}

describe('cardcom-live-check cron', () => {
  beforeEach(() => {
    sendAlert.mockReset().mockResolvedValue(true)
    touchLaunchReadyFlag.mockReset().mockResolvedValue('written')
    vi.stubEnv('CRON_SECRET', 's3cret')
    vi.stubEnv('CARDCOM_USE_MOCK', 'false')
    vi.stubEnv('CARDCOM_API_NAME', 'ke-prod-7731')
    vi.stubEnv('CHECKOUT_ENABLED', 'false')
    vi.stubEnv('LIVE_CHECK_NTFY_TOPIC', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects a request with no credential before reading anything', async () => {
    expect((await GET(request())).status).toBe(401)
    expect(sendAlert).not.toHaveBeenCalled()
    expect(touchLaunchReadyFlag).not.toHaveBeenCalled()
  })

  it('rejects a wrong credential', async () => {
    expect((await GET(request('Bearer wrong'))).status).toBe(401)
    expect(sendAlert).not.toHaveBeenCalled()
  })

  it('stays closed when CRON_SECRET is unset rather than opening', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await GET(request('Bearer '))).status).toBe(401)
  })

  it('pushes the launch line to kenyon-ofir-limit and touches the flag when the credentials are real', async () => {
    const response = await GET(request('Bearer s3cret'))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-request-id')).toBeTruthy()
    expect(await response.json()).toMatchObject({
      ok: true,
      status: 'ready',
      notified: true,
      flag: 'written',
      useMock: 'false',
      apiName: 'real',
      checkoutEnabled: false,
    })
    expect(sendAlert).toHaveBeenCalledTimes(1)
    expect(sendAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'CARDCOM LIVE READY — flip CHECKOUT_ENABLED=true',
        topic: 'kenyon-ofir-limit',
        priority: 'urgent',
      }),
    )
    expect(touchLaunchReadyFlag).toHaveBeenCalledTimes(1)
  })

  it('honours LIVE_CHECK_NTFY_TOPIC', async () => {
    vi.stubEnv('LIVE_CHECK_NTFY_TOPIC', 'ke-staging')
    await GET(request('Bearer s3cret'))
    expect(sendAlert).toHaveBeenCalledWith(expect.objectContaining({ topic: 'ke-staging' }))
  })

  it('does nothing while CARDCOM_USE_MOCK is still true', async () => {
    vi.stubEnv('CARDCOM_USE_MOCK', 'true')
    const response = await GET(request('Bearer s3cret'))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, status: 'not_ready', useMock: 'true' })
    expect(sendAlert).not.toHaveBeenCalled()
    expect(touchLaunchReadyFlag).not.toHaveBeenCalled()
  })

  it('does nothing while CARDCOM_USE_MOCK is unset', async () => {
    vi.stubEnv('CARDCOM_USE_MOCK', '')
    const response = await GET(request('Bearer s3cret'))
    expect(await response.json()).toMatchObject({ status: 'not_ready', useMock: 'unset' })
    expect(sendAlert).not.toHaveBeenCalled()
  })

  it.each(['pending', 'test-terminal-user', 'PLACEHOLDER'])(
    'does nothing while CARDCOM_API_NAME is the stand-in %s',
    async (name) => {
      vi.stubEnv('CARDCOM_API_NAME', name)
      const response = await GET(request('Bearer s3cret'))
      expect(await response.json()).toMatchObject({ status: 'not_ready', apiName: 'placeholder' })
      expect(sendAlert).not.toHaveBeenCalled()
      expect(touchLaunchReadyFlag).not.toHaveBeenCalled()
    },
  )

  it('goes quiet once CHECKOUT_ENABLED is true, but still touches the flag', async () => {
    vi.stubEnv('CHECKOUT_ENABLED', 'true')
    const response = await GET(request('Bearer s3cret'))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      ok: true,
      status: 'live',
      flag: 'written',
      checkoutEnabled: true,
    })
    expect(sendAlert).not.toHaveBeenCalled()
    expect(touchLaunchReadyFlag).toHaveBeenCalledTimes(1)
  })

  it('answers 200 with notified: false when no channel accepts the push, not a 500', async () => {
    sendAlert.mockResolvedValue(false)
    touchLaunchReadyFlag.mockResolvedValue('unwritable')
    const response = await GET(request('Bearer s3cret'))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      status: 'ready',
      notified: false,
      flag: 'unwritable',
    })
  })
})
