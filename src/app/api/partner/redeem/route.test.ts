import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The /api/partner/redeem adapter (S15). What the domain decides is covered in
 * src/server/domain/vouchers/partner-redeem.test.ts; this covers what reaches
 * it, which bucket limits it, and what runs after it.
 */

const identityScopedClient = vi.fn()
const rateLimit = vi.fn()
const redeemForPartner = vi.fn()
const expireWalletPasses = vi.fn()
const trackServerEvent = vi.fn()
const recordRedemptionSignals = vi.fn()

vi.mock('@/lib/supabase/bearer', () => ({
  identityScopedClient: (request: unknown) => identityScopedClient(request),
}))
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  rateLimit: (name: string, id: string) => rateLimit(name, id),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ admin: true }) }))
vi.mock('@/lib/wallet/notify', () => ({
  expireWalletPasses: (codes: string[]) => expireWalletPasses(codes),
}))
vi.mock('@/server/analytics/track', () => ({
  trackServerEvent: (input: unknown) => trackServerEvent(input),
}))
vi.mock('@/server/fraud/redemption-signals', () => ({
  recordRedemptionSignals: (client: unknown, args: unknown) =>
    recordRedemptionSignals(client, args),
}))
vi.mock('@/server/domain/vouchers/partner-redeem', () => ({
  redeemForPartner: (args: unknown) => redeemForPartner(args),
}))

import { POST } from './route'

function allow(allowed: boolean) {
  return {
    allowed,
    limit: 120,
    windowSeconds: 3600,
    remaining: allowed ? 1 : 0,
    resetAtMs: Date.now() + 1000,
    backend: 'upstash' as const,
  }
}

function post(body: unknown, origin = 'http://localhost') {
  return new NextRequest('http://localhost/api/partner/redeem', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(body),
  })
}

const SUCCESS = {
  outcome: 'success',
  inputKind: 'pin',
  replayed: false,
  code: 'ABCDEFGHJK',
  raw: { remaining_amount_due_agorot: 5000, product_name: 'עיסוי' },
}

describe('POST /api/partner/redeem', () => {
  beforeEach(() => {
    identityScopedClient
      .mockReset()
      .mockResolvedValue({ client: { scoped: true }, identity: { user: { id: 'partner-1' } } })
    rateLimit.mockReset().mockResolvedValue(allow(true))
    redeemForPartner.mockReset().mockResolvedValue(SUCCESS)
    expireWalletPasses.mockReset().mockResolvedValue(undefined)
    trackServerEvent.mockReset().mockResolvedValue(undefined)
    recordRedemptionSignals.mockReset().mockResolvedValue(undefined)
  })

  it('requires an idempotency key', async () => {
    const response = await POST(post({ input: '12345678' }))
    expect(response.status).toBe(400)
    expect(redeemForPartner).not.toHaveBeenCalled()
  })

  it('refuses without a session', async () => {
    identityScopedClient.mockResolvedValue(null)
    const response = await POST(post({ input: '12345678', idempotency_key: 'key-12345' }))
    expect(response.status).toBe(401)
    expect(redeemForPartner).not.toHaveBeenCalled()
  })

  it('refuses a cross-site post before reading the session', async () => {
    const response = await POST(
      post({ input: '12345678', idempotency_key: 'key-12345' }, 'https://evil.example'),
    )
    expect(response.status).toBe(401)
    expect(identityScopedClient).not.toHaveBeenCalled()
  })

  it('shares the voucher-redeem rate-limit bucket with the supplier route', async () => {
    rateLimit.mockResolvedValue(allow(false))
    const response = await POST(post({ input: '12345678', idempotency_key: 'key-12345' }))
    expect(response.status).toBe(429)
    expect(rateLimit).toHaveBeenCalledWith('voucher-redeem', 'partner-1')
  })

  it('redeems a pin and runs the side effects once', async () => {
    const response = await POST(post({ input: '1234 5678', idempotency_key: 'key-12345' }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      outcome: 'success',
      message: 'הקופון מומש בהצלחה',
      input_kind: 'pin',
      voucher: { code: 'ABCDEFGHJK', remaining_amount_due_agorot: 5000 },
    })
    expect(redeemForPartner).toHaveBeenCalledWith(
      expect.objectContaining({
        scoped: { scoped: true },
        admin: { admin: true },
        userId: 'partner-1',
        input: { kind: 'pin', pin: '12345678' },
        idempotencyKey: 'key-12345',
      }),
    )
    expect(expireWalletPasses).toHaveBeenCalledTimes(1)
    expect(trackServerEvent).toHaveBeenCalledTimes(1)
  })

  it('a replay answers success again and runs no side effect', async () => {
    redeemForPartner.mockResolvedValue({ ...SUCCESS, replayed: true })
    const response = await POST(post({ input: '12345678', idempotency_key: 'key-12345' }))
    expect(response.status).toBe(200)
    expect((await response.json()).replayed).toBe(true)
    expect(expireWalletPasses).not.toHaveBeenCalled()
    expect(trackServerEvent).not.toHaveBeenCalled()
    expect(recordRedemptionSignals).not.toHaveBeenCalled()
  })

  it('a double redeem is a 409 with the first redemption time', async () => {
    redeemForPartner.mockResolvedValue({
      outcome: 'already_redeemed',
      inputKind: 'pin',
      replayed: false,
      code: 'ABCDEFGHJK',
      raw: { redeemed_at: '2026-11-04T10:00:00Z' },
    })
    const response = await POST(post({ input: '12345678', idempotency_key: 'key-67890' }))
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      outcome: 'already_redeemed',
      message: 'הקופון כבר מומש',
      redeemed_at: '2026-11-04T10:00:00Z',
    })
    expect(expireWalletPasses).not.toHaveBeenCalled()
  })

  it('an infrastructure failure is a 500, never a refusal the till would trust', async () => {
    redeemForPartner.mockRejectedValue(new Error('partner.redeem_rpc_failed: timeout'))
    const response = await POST(post({ input: '12345678', idempotency_key: 'key-12345' }))
    expect(response.status).toBe(500)
  })
})
