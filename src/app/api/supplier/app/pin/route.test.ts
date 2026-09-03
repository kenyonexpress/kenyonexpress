import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { identityScopedClient, checkRateLimit, rpc } = vi.hoisted(() => ({
  identityScopedClient: vi.fn(),
  checkRateLimit: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/supabase/bearer', () => ({ identityScopedClient }))
vi.mock('@/lib/utils/rate-limit', () => ({ checkRateLimit }))

import { POST } from './route'

/**
 * The staff PIN check (marathon step 12; the route had no tests). Not a
 * login -- an audit-trail identifier -- but still the one place a four-digit
 * secret meets the network, so what is pinned here is the enumeration
 * posture: fifteen tries an hour, one indistinguishable answer for
 * malformed / wrong / unknown, and the supplier NEVER taken from the
 * request.
 */

function request(body: unknown): NextRequest {
  return new NextRequest('https://example.test/api/supplier/app/pin', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  identityScopedClient.mockReset()
  checkRateLimit.mockReset()
  rpc.mockReset()
  identityScopedClient.mockResolvedValue({
    client: { rpc },
    identity: { user: { id: 'member-1' } },
  })
  checkRateLimit.mockResolvedValue(true)
  rpc.mockResolvedValue({
    data: [{ staff_id: 'staff-1', display_name: 'דנה', locked: false }],
    error: null,
  })
})

describe('staff pin route', () => {
  it('answers 401 with no identity, before any rate or database work', async () => {
    identityScopedClient.mockResolvedValue(null)
    expect((await POST(request({ pin: '1234' }))).status).toBe(401)
    expect(checkRateLimit).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('caps the member at fifteen tries an hour', async () => {
    checkRateLimit.mockResolvedValue(false)
    expect((await POST(request({ pin: '1234' }))).status).toBe(429)
    expect(checkRateLimit).toHaveBeenCalledWith('staff-pin:member-1', 15, 3600)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('identifies the staff member on a correct PIN', async () => {
    const response = await POST(request({ pin: '1234' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      staff: { id: 'staff-1', display_name: 'דנה' },
    })
    // The supplier is derived from auth.uid() inside the RPC -- the request
    // contributes ONLY the pin, so a device cannot probe another business.
    expect(rpc).toHaveBeenCalledWith('verify_supplier_staff_pin', { p_pin: '1234' })
  })

  it('answers a locked account 423, distinctly, because it is not a guessing signal', async () => {
    rpc.mockResolvedValue({
      data: [{ staff_id: 'staff-1', display_name: 'דנה', locked: true }],
      error: null,
    })
    expect((await POST(request({ pin: '1234' }))).status).toBe(423)
  })

  it.each([
    ['a malformed pin', { pin: 'abcd' }],
    ['a too-short pin', { pin: '12' }],
    ['a missing body', {}],
  ])('answers %s with the same shape as a wrong pin', async (_name, body) => {
    const response = await POST(request(body))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ ok: false, error: 'invalid_pin' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('answers an RPC error and an unknown pin identically', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    const onError = await POST(request({ pin: '1234' }))
    rpc.mockResolvedValueOnce({ data: [], error: null })
    const onMiss = await POST(request({ pin: '1234' }))
    expect(onError.status).toBe(401)
    expect(onMiss.status).toBe(401)
    expect(await onError.json()).toEqual(await onMiss.json())
  })
})
