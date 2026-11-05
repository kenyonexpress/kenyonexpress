import { describe, expect, it, vi } from 'vitest'
import { isFirstPaidOrder } from './first-purchase'

vi.mock('@/lib/observability/log', () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

/**
 * S32. `isFirstPaidOrder` is the gate in front of the install invitation on
 * the order confirmation (and of the first-purchase banner above it). The
 * invitation is offered once, at the one moment it is earned, so every answer
 * that is not "an account with exactly one paid order" has to be false: a
 * guess here shows an install banner to a guest, or to a tenth-time customer.
 */

type Answer = { data?: unknown; count?: number | null; error?: { message: string } | null }

function fakeAdmin(order: Answer, paid: Answer) {
  const from = vi.fn(() => ({
    select: (_columns: string, options?: { head?: boolean }) =>
      options?.head
        ? {
            eq: () => ({
              not: async () => ({ count: paid.count ?? null, error: paid.error ?? null }),
            }),
          }
        : {
            eq: () => ({
              maybeSingle: async () => ({ data: order.data ?? null, error: order.error ?? null }),
            }),
          },
  }))
  return { from } as unknown as Parameters<typeof isFirstPaidOrder>[0]
}

describe('isFirstPaidOrder', () => {
  it('is true for an account with exactly one paid order', async () => {
    const admin = fakeAdmin({ data: { user_id: 'u1' } }, { count: 1 })
    expect(await isFirstPaidOrder(admin, 'o1')).toBe(true)
  })

  it('is false for a repeat customer', async () => {
    const admin = fakeAdmin({ data: { user_id: 'u1' } }, { count: 2 })
    expect(await isFirstPaidOrder(admin, 'o2')).toBe(false)
  })

  it('is false for a guest order, which has no account behind it', async () => {
    const admin = fakeAdmin({ data: { user_id: null } }, { count: 1 })
    expect(await isFirstPaidOrder(admin, 'o3')).toBe(false)
  })

  it('is false when the order is not found', async () => {
    const admin = fakeAdmin({ data: null }, { count: 1 })
    expect(await isFirstPaidOrder(admin, 'missing')).toBe(false)
  })

  it('is false when either read fails, rather than a guess', async () => {
    const orderFails = fakeAdmin({ error: { message: 'boom' } }, { count: 1 })
    expect(await isFirstPaidOrder(orderFails, 'o4')).toBe(false)

    const countFails = fakeAdmin({ data: { user_id: 'u1' } }, { error: { message: 'boom' } })
    expect(await isFirstPaidOrder(countFails, 'o4')).toBe(false)
  })

  it('is false before the payment has landed (no paid order yet)', async () => {
    const admin = fakeAdmin({ data: { user_id: 'u1' } }, { count: 0 })
    expect(await isFirstPaidOrder(admin, 'o5')).toBe(false)
  })
})
