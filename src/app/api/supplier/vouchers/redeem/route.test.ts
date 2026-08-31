import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The scan endpoint, at the route level.
 *
 * `redeem-contract.test.ts` covers what the RPC decides, and it was measured
 * against production. This covers the adapter around it, which is where a
 * different class of mistake lives: which CLIENT the RPC is called through,
 * what is allowed to reach it, and what a till is told afterwards.
 *
 * The one that matters most is the client. `redeem_voucher` is SECURITY
 * DEFINER and derives the supplier from the caller's own `supplier_members`
 * row via `auth.uid()`. Called through the service-role client there is no
 * `auth.uid()` at all, so the identity requirement is enforced by a choice made
 * in one line of this file and by nothing else. Nothing tested that line.
 */

const rpc = vi.fn()
const identityScopedClient = vi.fn()
const checkRateLimit = vi.fn()
const expireWalletPasses = vi.fn()
const sendGaEvent = vi.fn()
const recordRefusedScan = vi.fn()
const adminUpdate = vi.fn()
const staffRow = vi.fn()
const membershipRow = vi.fn()

vi.mock('@/lib/supabase/bearer', () => ({
  identityScopedClient: (request: unknown) => identityScopedClient(request),
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: (key: string, limit: number, window: number) =>
    checkRateLimit(key, limit, window),
}))
vi.mock('@/lib/wallet/notify', () => ({
  expireWalletPasses: (codes: string[]) => expireWalletPasses(codes),
}))
vi.mock('@/lib/analytics/server-events', () => ({
  sendGaEvent: (name: string, payload: unknown) => sendGaEvent(name, payload),
}))
vi.mock('@/server/domain/vouchers/scan-context', () => ({
  readScanContext: () => ({ ip: '203.0.113.9', userAgent: 'till/1.0' }),
  recordRefusedScan: (args: unknown) => recordRefusedScan(args),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'voucher_redemptions') {
        return {
          update: (patch: unknown) => ({ eq: (_c: string, v: string) => adminUpdate(patch, v) }),
        }
      }
      const row = table === 'supplier_staff' ? staffRow : membershipRow
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: row(), error: null }),
      }
      return chain
    },
  }),
}))

// The QR check is NOT mocked: a signature test that trusts a stubbed verifier
// proves nothing. The real HMAC runs, against a secret stubbed for the test.
import { signVoucherQrPayload } from '@/server/domain/vouchers/qr'
import { POST } from './route'

/** A QR the platform really minted, signed with the stubbed secret. */
function mintedQr(code = 'ABCD123456'): string {
  return signVoucherQrPayload({
    c: code,
    s: 'sup-1',
    u: 'user-1',
    e: 4_102_444_800,
    k: 'k1',
  })
}

function request(body: unknown): NextRequest {
  return new NextRequest('https://example.test/api/supplier/vouchers/redeem', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const SUCCESS = {
  outcome: 'success',
  code: 'ABCD123456',
  product_id: 'prod-1',
  product_name: 'ארוחה זוגית',
  customer_name: 'דנה',
  face_value_agorot: 24000,
  coupon_price_agorot: 9900,
  remaining_amount_due_agorot: 14100,
  redeemed_at: '2026-08-19T09:00:00.000Z',
}

describe('supplier scan endpoint', () => {
  beforeEach(() => {
    vi.stubEnv('VOUCHER_QR_SECRET', 'test-qr-secret-value')
    rpc.mockReset().mockResolvedValue({ data: SUCCESS, error: null })
    identityScopedClient
      .mockReset()
      .mockResolvedValue({ client: { rpc }, identity: { user: { id: 'user-1' } } })
    checkRateLimit.mockReset().mockResolvedValue(true)
    expireWalletPasses.mockReset().mockResolvedValue(undefined)
    sendGaEvent.mockReset().mockResolvedValue(undefined)
    recordRefusedScan.mockReset().mockResolvedValue(undefined)
    adminUpdate.mockReset().mockResolvedValue({ error: null })
    staffRow.mockReset().mockReturnValue({ id: 'staff-1', supplier_id: 'sup-1' })
    membershipRow.mockReset().mockReturnValue({ supplier_id: 'sup-1' })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('who is allowed to burn a voucher', () => {
    it('refuses a caller with no identity, before anything else happens', async () => {
      identityScopedClient.mockResolvedValue(null)
      const response = await POST(request({ code: 'ABCD123456' }))
      expect(response.status).toBe(401)
      expect(await response.json()).toMatchObject({ outcome: 'unauthorized' })
      expect(checkRateLimit).not.toHaveBeenCalled()
      expect(rpc).not.toHaveBeenCalled()
    })

    it('calls the RPC through the caller-scoped client, never the service role', async () => {
      // The service-role client has no auth.uid(), so redeem_voucher could not
      // find the caller's supplier_members row. Switching this one line is the
      // difference between "the database enforces membership" and "nothing
      // does".
      await POST(request({ code: 'ABCD123456' }))
      expect(rpc).toHaveBeenCalledTimes(1)
      expect(identityScopedClient).toHaveBeenCalledTimes(1)
    })

    it('never sends a supplier id to the RPC, only the code and the scan metadata', async () => {
      // Anything supplier-shaped in the request body would be a claim by the
      // caller about who they are. The RPC derives that itself.
      await POST(request({ code: 'ABCD123456', supplier_id: 'sup-other' }))
      const [fn, args] = rpc.mock.calls[0] as [string, Record<string, unknown>]
      expect(fn).toBe('redeem_voucher')
      expect(Object.keys(args).sort()).toEqual([
        'p_code',
        'p_idempotency_key',
        'p_ip',
        'p_scan_method',
        'p_user_agent',
      ])
    })

    it('rate limits the burn endpoint, more tightly than lookup, per member', async () => {
      // This is the endpoint whose effect cannot be undone, so its ceiling must
      // not be the decorative one. 120/hour is a scan every thirty seconds for
      // an hour without pause.
      await POST(request({ code: 'ABCD123456' }))
      expect(checkRateLimit).toHaveBeenCalledWith('voucher-redeem:user-1', 120, 3600)
    })

    it('answers 429 without touching the voucher when the ceiling is hit', async () => {
      checkRateLimit.mockResolvedValue(false)
      const response = await POST(request({ code: 'ABCD123456' }))
      expect(response.status).toBe(429)
      expect(rpc).not.toHaveBeenCalled()
    })
  })

  describe('the QR signature, checked before the database is touched', () => {
    it('accepts a payload this deployment signed', async () => {
      const token = mintedQr()
      const response = await POST(request({ qr_payload: token, method: 'camera' }))
      expect(response.status).toBe(200)
      expect((rpc.mock.calls[0] as [string, { p_code: string }])[1].p_code).toBe('ABCD123456')
    })

    it('refuses a tampered payload and never reaches redeem_voucher', async () => {
      const token = `${mintedQr()}x`
      const response = await POST(request({ qr_payload: token, method: 'camera' }))
      expect(response.status).toBe(404)
      expect(rpc).not.toHaveBeenCalled()
    })

    it('records the refused scan, so a forged code leaves a trail', async () => {
      const token = `${mintedQr()}x`
      await POST(request({ qr_payload: token, method: 'camera' }))
      expect(recordRefusedScan).toHaveBeenCalledTimes(1)
      const [refusal] = recordRefusedScan.mock.calls[0] as [{ outcome: string }]
      expect(refusal).toMatchObject({ outcome: 'invalid_signature' })
    })

    it('answers the same 404 as an unknown code, so scanning cannot tell them apart', async () => {
      const forged = `${mintedQr()}x`
      const forgedBody = await (await POST(request({ qr_payload: forged }))).json()
      rpc.mockResolvedValue({ data: { outcome: 'not_found' }, error: null })
      const unknownBody = await (await POST(request({ code: 'ZZZZ999999' }))).json()
      expect(forgedBody.outcome).toBe(unknownBody.outcome)
      expect(forgedBody.message).toBe(unknownBody.message)
    })
  })

  describe('what the till is told', () => {
    it('returns the balance the customer still owes at the counter', async () => {
      // The whole no-Escrow model rests on this number being on the screen: the
      // customer paid coupon_price online and pays face - coupon_price here.
      const body = await (await POST(request({ code: 'ABCD123456' }))).json()
      expect(body.voucher).toMatchObject({
        face_value_agorot: 24000,
        coupon_price_agorot: 9900,
        remaining_amount_due_agorot: 14100,
      })
      expect(body.voucher.face_value_agorot - body.voucher.coupon_price_agorot).toBe(
        body.voucher.remaining_amount_due_agorot,
      )
    })

    it('maps every refusal to a status a till can branch on', async () => {
      for (const [outcome, status] of [
        ['already_redeemed', 409],
        ['expired', 409],
        ['cancelled', 409],
        ['refunded', 409],
        ['not_found', 404],
      ] as const) {
        rpc.mockResolvedValue({ data: { outcome }, error: null })
        const response = await POST(request({ code: 'ABCD123456' }))
        expect(response.status, outcome).toBe(status)
        expect((await response.json()).outcome).toBe(outcome)
      }
    })

    it('treats an outcome it does not recognise as not_found rather than as success', async () => {
      rpc.mockResolvedValue({ data: { outcome: 'something_new' }, error: null })
      const response = await POST(request({ code: 'ABCD123456' }))
      expect(response.status).toBe(404)
    })

    it('answers 500 on an infrastructure failure, which is not a refusal', async () => {
      // A refusal is a normal jsonb result. An error means the platform could
      // not decide, and telling the till "already redeemed" would be a lie that
      // costs the customer their coupon.
      rpc.mockResolvedValue({ data: null, error: { message: 'connection reset', code: '08006' } })
      const response = await POST(request({ code: 'ABCD123456' }))
      expect(response.status).toBe(500)
      expect((await response.json()).outcome).not.toBe('already_redeemed')
    })

    it('refuses a body with neither a code nor a QR payload', async () => {
      const response = await POST(request({ method: 'manual' }))
      expect(response.status).toBe(400)
      expect(rpc).not.toHaveBeenCalled()
    })
  })

  describe('the side effects, and what a replay must not repeat', () => {
    it('expires the wallet pass and reports the redemption once', async () => {
      await POST(request({ code: 'ABCD123456' }))
      expect(expireWalletPasses).toHaveBeenCalledWith(['ABCD123456'])
      expect(sendGaEvent).toHaveBeenCalledTimes(1)
    })

    it('does neither again on a replayed idempotent scan', async () => {
      // The pass was expired and the funnel step counted the first time round.
      rpc.mockResolvedValue({ data: { ...SUCCESS, replayed: true }, error: null })
      const body = await (await POST(request({ code: 'ABCD123456' }))).json()
      expect(body.replayed).toBe(true)
      expect(expireWalletPasses).not.toHaveBeenCalled()
      expect(sendGaEvent).not.toHaveBeenCalled()
    })

    it('reports what the customer PAID, not the face value', async () => {
      // Face value is the business's list price and was never our revenue.
      await POST(request({ code: 'ABCD123456' }))
      const [name, payload] = sendGaEvent.mock.calls[0] as [string, { valueAgorot: number }]
      expect(name).toBe('redeem_coupon')
      expect(payload.valueAgorot).toBe(9900)
    })

    it('still succeeds when the analytics call throws', async () => {
      sendGaEvent.mockRejectedValue(new Error('ga down'))
      expect((await POST(request({ code: 'ABCD123456' }))).status).toBe(200)
    })
  })

  describe('staff attribution, which grants nothing and must not be forgeable', () => {
    it('stamps the cashier on the redemption row', async () => {
      await POST(
        request({
          code: 'ABCD123456',
          staff_id: '11111111-1111-4111-8111-111111111111',
          idempotency_key: 'idem-1234',
        }),
      )
      expect(adminUpdate).toHaveBeenCalledWith(
        { staff_id: '11111111-1111-4111-8111-111111111111' },
        'idem-1234',
      )
    })

    it('refuses to attribute a scan to a person at another business', async () => {
      // The staff row exists, but the caller is not a member of that supplier.
      // Trusting the body here would let one business write names into another
      // business's audit trail.
      membershipRow.mockReturnValue(null)
      const response = await POST(
        request({
          code: 'ABCD123456',
          staff_id: '11111111-1111-4111-8111-111111111111',
          idempotency_key: 'idem-1234',
        }),
      )
      expect(response.status).toBe(200)
      expect(adminUpdate).not.toHaveBeenCalled()
    })

    it('does not stamp an unknown staff id', async () => {
      staffRow.mockReturnValue(null)
      await POST(
        request({
          code: 'ABCD123456',
          staff_id: '11111111-1111-4111-8111-111111111111',
          idempotency_key: 'idem-1234',
        }),
      )
      expect(adminUpdate).not.toHaveBeenCalled()
    })

    it('still redeems when the stamp fails, because a name is not the redemption', async () => {
      // A null staff_id must never be read as "the redemption did not happen".
      adminUpdate.mockResolvedValue({ error: { message: 'row locked' } })
      const response = await POST(
        request({
          code: 'ABCD123456',
          staff_id: '11111111-1111-4111-8111-111111111111',
          idempotency_key: 'idem-1234',
        }),
      )
      expect(response.status).toBe(200)
      expect((await response.json()).outcome).toBe('success')
    })
  })
})
