import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Auth gate for the stranded-payments finalizer. This route asks Cardcom about
 * real charges and calls finalizeOrder, which moves money state; it is the
 * last route that may run for an anonymous caller.
 */

const {
  createAdminClient,
  getPaymentProvider,
  loadCardcomEnv,
  finalizeOrder,
  capturePaymentAlarm,
} = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPaymentProvider: vi.fn(),
  loadCardcomEnv: vi.fn(),
  finalizeOrder: vi.fn(),
  capturePaymentAlarm: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/payments', () => ({ getPaymentProvider, loadCardcomEnv }))
vi.mock('@/server/payments/finalize', () => ({ finalizeOrder }))
vi.mock('@/lib/observability/sentry', () => ({ capturePaymentAlarm }))

import { GET } from './route'

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/stranded-payments', {
    headers: auth ? { authorization: auth } : {},
  })
}

describe('stranded-payments cron auth', () => {
  beforeEach(() => {
    createAdminClient.mockReset()
    getPaymentProvider.mockReset()
    finalizeOrder.mockReset()
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects a request with no credential before touching anything', async () => {
    expect((await GET(request())).status).toBe(401)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(getPaymentProvider).not.toHaveBeenCalled()
    expect(finalizeOrder).not.toHaveBeenCalled()
  })

  it('rejects a wrong credential', async () => {
    expect((await GET(request('Bearer wrong'))).status).toBe(401)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('stays closed when CRON_SECRET is unset rather than opening', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await GET(request('Bearer '))).status).toBe(401)
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})
