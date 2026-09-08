import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The offline drain. The properties under test are the ones the till relies
 * on: every verdict the server already made is settled (the device may forget
 * it), an infrastructure failure is not (the device must re-send it), the
 * per-item ceiling is checked before anything burns, and order is preserved.
 */

const { identityScopedClient, checkRateLimit, verifyVoucherQrPayload, canVerifyVoucherQr, rpc } =
  vi.hoisted(() => ({
    identityScopedClient: vi.fn(),
    checkRateLimit: vi.fn(),
    verifyVoucherQrPayload: vi.fn(),
    canVerifyVoucherQr: vi.fn(),
    rpc: vi.fn(),
  }))

vi.mock('@/lib/supabase/bearer', () => ({ identityScopedClient }))
vi.mock('@/lib/utils/rate-limit', () => ({ checkRateLimit }))
vi.mock('@/server/domain/vouchers/qr', () => ({
  verifyVoucherQrPayload,
  canVerifyVoucherQr,
  VoucherQrSecretMissingError: class extends Error {},
}))

import { POST } from './route'

const CODE_A = 'ABCDE12345'
const CODE_B = 'FGHJK67890'

function request(body: unknown): NextRequest {
  return new NextRequest('https://example.test/api/supplier/vouchers/redeem-batch', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function item(key: string, code: string = CODE_A) {
  return { code, idempotency_key: key }
}

describe('redeem-batch route', () => {
  beforeEach(() => {
    identityScopedClient.mockReset()
    checkRateLimit.mockReset()
    verifyVoucherQrPayload.mockReset()
    canVerifyVoucherQr.mockReset()
    canVerifyVoucherQr.mockReturnValue(true)
    rpc.mockReset()
    identityScopedClient.mockResolvedValue({
      client: { rpc },
      identity: { user: { id: 'member-1' } },
    })
    checkRateLimit.mockResolvedValue(true)
    rpc.mockResolvedValue({
      data: { outcome: 'success', replayed: false, code: CODE_A },
      error: null,
    })
  })

  describe('the gate', () => {
    it('answers 401 with no identity, before any rate or database work', async () => {
      identityScopedClient.mockResolvedValue(null)
      const response = await POST(request({ items: [item('key-0001')] }))
      expect(response.status).toBe(401)
      expect(checkRateLimit).not.toHaveBeenCalled()
      expect(rpc).not.toHaveBeenCalled()
    })

    it('answers 429 when the drain allowance is spent', async () => {
      checkRateLimit.mockImplementation((key: string) =>
        Promise.resolve(!key.startsWith('voucher-redeem-batch:')),
      )
      const response = await POST(request({ items: [item('key-0001')] }))
      expect(response.status).toBe(429)
      expect(rpc).not.toHaveBeenCalled()
    })

    it('answers 400 for an item without an idempotency key, because it cannot be replayed safely', async () => {
      const response = await POST(request({ items: [{ code: CODE_A }] }))
      expect(response.status).toBe(400)
      expect(rpc).not.toHaveBeenCalled()
    })

    it('answers 400 for an empty batch and for one past the 50-item bound', async () => {
      expect((await POST(request({ items: [] }))).status).toBe(400)
      const oversized = Array.from({ length: 51 }, (_, i) =>
        item(`key-${String(i).padStart(4, '0')}`),
      )
      expect((await POST(request({ items: oversized }))).status).toBe(400)
    })

    it('refuses the whole batch BEFORE burning anything when the shared scan ceiling is hit', async () => {
      // The per-item ceiling shares `voucher-redeem:<user>` with the
      // single-scan route. When it refuses, the batch must be untouched, not
      // half-burned: the queue keeps every item and nothing is settled.
      checkRateLimit.mockImplementation((key: string) =>
        Promise.resolve(!key.startsWith('voucher-redeem:')),
      )
      const response = await POST(request({ items: [item('key-0001'), item('key-0002', CODE_B)] }))
      expect(response.status).toBe(429)
      expect(await response.json()).toMatchObject({ ok: false, settled: [] })
      expect(rpc).not.toHaveBeenCalled()
    })
  })

  describe('a clean drain', () => {
    it('redeems through redeem_voucher with the normalized code and the device key', async () => {
      await POST(request({ items: [{ code: 'abcde-12345', idempotency_key: 'key-0001' }] }))
      expect(rpc).toHaveBeenCalledWith(
        'redeem_voucher',
        expect.objectContaining({
          p_code: CODE_A,
          p_idempotency_key: 'key-0001',
          p_scan_method: 'camera',
        }),
      )
    })

    it('reports the outcome in Hebrew and settles the key', async () => {
      const body = await (await POST(request({ items: [item('key-0001')] }))).json()
      expect(body.ok).toBe(true)
      expect(body.results).toEqual([
        {
          idempotency_key: 'key-0001',
          outcome: 'success',
          replayed: false,
          code: CODE_A,
          message: 'מומש',
        },
      ])
      expect(body.settled).toEqual(['key-0001'])
    })

    it('passes a replay through as such, so a resent queue burns nothing twice', async () => {
      rpc.mockResolvedValue({
        data: { outcome: 'already_redeemed', replayed: true, code: CODE_A },
        error: null,
      })
      const body = await (await POST(request({ items: [item('key-0001')] }))).json()
      expect(body.results[0]).toMatchObject({ outcome: 'already_redeemed', replayed: true })
      expect(body.settled).toEqual(['key-0001'])
    })

    it('keeps the batch order, one result per item', async () => {
      rpc
        .mockResolvedValueOnce({
          data: { outcome: 'success', replayed: false, code: CODE_A },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { outcome: 'already_redeemed', replayed: true, code: CODE_A },
          error: null,
        })
      const body = await (
        await POST(request({ items: [item('key-0001'), item('key-0002')] }))
      ).json()
      expect(body.results.map((r: { outcome: string }) => r.outcome)).toEqual([
        'success',
        'already_redeemed',
      ])
    })
  })

  describe('verdicts that must not be retried', () => {
    it('settles a bad QR signature without touching the database', async () => {
      verifyVoucherQrPayload.mockReturnValue(null)
      const body = await (
        await POST(request({ items: [{ qr_payload: 'tampered', idempotency_key: 'key-0001' }] }))
      ).json()
      expect(body.results[0]).toMatchObject({ outcome: 'invalid_signature', code: null })
      expect(body.settled).toEqual(['key-0001'])
      expect(rpc).not.toHaveBeenCalled()
    })

    it('settles an item that names no voucher at all as not_found', async () => {
      const body = await (await POST(request({ items: [{ idempotency_key: 'key-0001' }] }))).json()
      expect(body.results[0]).toMatchObject({ outcome: 'not_found' })
      expect(body.settled).toEqual(['key-0001'])
      expect(rpc).not.toHaveBeenCalled()
    })
  })

  describe('the one retryable outcome', () => {
    it('keeps an RPC failure OUT of settled, so the till re-sends that item', async () => {
      rpc
        .mockResolvedValueOnce({ data: null, error: { message: 'connection reset' } })
        .mockResolvedValueOnce({
          data: { outcome: 'success', replayed: false, code: CODE_B },
          error: null,
        })
      const body = await (
        await POST(request({ items: [item('key-0001'), item('key-0002', CODE_B)] }))
      ).json()
      expect(body.ok).toBe(true)
      expect(body.results.map((r: { outcome: string }) => r.outcome)).toEqual(['error', 'success'])
      // The failed item stays queued; the good one is cleared.
      expect(body.settled).toEqual(['key-0002'])
    })
  })
})

/**
 * A server that cannot verify signatures is not a queue full of forgeries.
 *
 * `drainQueue` deletes every item the server settles, and an `invalid_signature`
 * is settled - correctly, since a signature does not become valid later. But a
 * MISSING SECRET does become valid later, the moment an operator sets one, and
 * the items in the queue are redemptions a customer has already paid for. So
 * the whole batch is refused before the loop, exactly as the ceiling is.
 */
describe('when this server has no signing secret', () => {
  const qrItem = (key: string) => ({ qr_payload: 'KEV1.body.mac', idempotency_key: key })

  beforeEach(() => {
    canVerifyVoucherQr.mockReturnValue(false)
  })

  it('answers 503 and settles nothing', async () => {
    const response = await POST(request({ items: [qrItem('key-9001'), qrItem('key-9002')] }))
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.ok).toBe(false)
    expect(body.error).toBe('qr_verification_unavailable')
    expect(body.settled).toEqual([])
  })

  it('never reports the items as invalid_signature, which the till would delete', async () => {
    const response = await POST(request({ items: [qrItem('key-9001')] }))
    const body = await response.json()
    expect(JSON.stringify(body)).not.toContain('invalid_signature')
    expect(body.results ?? []).toEqual([])
  })

  // Asserted on THIS batch's keys rather than on the bare call count: the
  // logging path resolves after the response, so a count leaks across tests.
  it('redeems nothing and does not even compute a signature', async () => {
    await POST(request({ items: [qrItem('key-9001')] }))
    const redeemed = rpc.mock.calls.filter((call) => JSON.stringify(call).includes('key-9001'))
    expect(redeemed).toEqual([])
    expect(verifyVoucherQrPayload).not.toHaveBeenCalled()
  })

  // Manually keyed items carry no signature, so a missing secret is irrelevant
  // to them and refusing them would be an outage invented out of nothing.
  it('still drains a batch of hand-typed codes', async () => {
    const response = await POST(request({ items: [item('key-9003')] }))
    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalled()
  })
})
