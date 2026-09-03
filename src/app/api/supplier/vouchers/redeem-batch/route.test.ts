import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The offline drain. The properties under test are the ones the till relies
 * on: every verdict the server already made is settled (the device may forget
 * it), an infrastructure failure is not (the device must re-send it), the
 * per-item ceiling is checked before anything burns, and order is preserved.
 */

const { identityScopedClient, checkRateLimit, verifyVoucherQrPayload, rpc } = vi.hoisted(() => ({
  identityScopedClient: vi.fn(),
  checkRateLimit: vi.fn(),
  verifyVoucherQrPayload: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/supabase/bearer', () => ({ identityScopedClient }))
vi.mock('@/lib/utils/rate-limit', () => ({ checkRateLimit }))
vi.mock('@/server/domain/vouchers/qr', () => ({ verifyVoucherQrPayload }))

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
