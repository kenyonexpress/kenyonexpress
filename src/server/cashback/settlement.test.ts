import { describe, expect, it, vi } from 'vitest'
import { settleCashback } from './settlement'

vi.mock('@/lib/observability/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

/**
 * The IO half: the reads feed the plan, the plan drives exactly the two
 * database functions finalize would have called, under the same keys, in the
 * same order per order, and a per-order failure is counted rather than
 * thrown. The plan's own rules are tested in lib/cashback/settlement.test.ts.
 */

type Scripted = { data?: unknown; error?: { message: string } | null }

/**
 * A stub routed by table, where each `from(table)` pops the next scripted
 * result for that table. `rpc` is a plain spy.
 */
function stubAdmin(script: Record<string, Scripted[]>, rpc = vi.fn()) {
  const writes: { table: string; op: string; payload: unknown }[] = []
  const admin = {
    rpc,
    from: (table: string) => {
      const next = script[table]?.shift() ?? { data: null, error: null }
      const p = Promise.resolve({ data: next.data ?? null, error: next.error ?? null })
      const c: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'not', 'gte', 'order', 'limit', 'maybeSingle'])
        c[m] = () => c
      c.insert = (payload: unknown) => {
        writes.push({ table, op: 'insert', payload })
        return c
      }
      // biome-ignore lint/suspicious/noThenProperty: the Supabase query builder IS a thenable; the stub must be awaitable like the real one
      c.then = p.then.bind(p)
      return c
    },
  }
  return { admin: admin as never, writes }
}

const NOW = new Date('2026-09-17T23:45:00Z')

describe('settleCashback', () => {
  it('posts the missing item credit and then asks the RPC about the latest order', async () => {
    const rpc = vi.fn(async (fn: string) =>
      fn === 'fn_wallet_transfer' ? { data: 'entry-1', error: null } : { data: 1500, error: null },
    )
    const { admin } = stubAdmin(
      {
        orders: [
          { data: [{ id: 'o5', user_id: 'u', paid_at: '2026-09-10T00:00:00Z' }] }, // window
          {
            data: [
              { id: 'o1', user_id: 'u', paid_at: '2026-07-01T00:00:00Z' },
              { id: 'o2', user_id: 'u', paid_at: '2026-07-02T00:00:00Z' },
              { id: 'o3', user_id: 'u', paid_at: '2026-07-03T00:00:00Z' },
              { id: 'o4', user_id: 'u', paid_at: '2026-07-04T00:00:00Z' },
              { id: 'o5', user_id: 'u', paid_at: '2026-09-10T00:00:00Z' },
            ],
          }, // history
        ],
        order_items: [
          {
            data: [
              { order_id: 'o5', cashback_amount_agorot: 250 },
              { order_id: 'o5', cashback_amount_agorot: 250 },
            ],
          },
        ],
        wallet_entries: [{ data: [] }],
        cashback_ledger: [{ data: [] }],
        wallet_accounts: [
          { data: { id: 'reserve-acct' } }, // reserve read
          { data: { id: 'user-acct' } }, // user account read
        ],
      },
      rpc,
    )

    const summary = await settleCashback(admin, NOW)

    expect(summary).toEqual({
      scanned: 1,
      itemCredited: 1,
      itemCreditedAgorot: 500,
      bonusAwarded: 1,
      bonusAwardedAgorot: 1500,
      bonusNotOwed: 0,
      deferred: 0,
      errors: 0,
    })
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      'fn_wallet_transfer',
      'fn_cashback_order_bonus',
    ])
    expect(rpc).toHaveBeenNthCalledWith(1, 'fn_wallet_transfer', {
      p_debit_account: 'reserve-acct',
      p_credit_account: 'user-acct',
      p_amount_ils: 5,
      p_reason: 'order_cashback',
      p_idempotency: 'order:o5:cashback',
      p_order_id: 'o5',
    })
    expect(rpc).toHaveBeenNthCalledWith(2, 'fn_cashback_order_bonus', { p_order_id: 'o5' })
  })

  it('touches nothing when both legs are already recorded', async () => {
    const rpc = vi.fn()
    const { admin } = stubAdmin(
      {
        orders: [
          { data: [{ id: 'o1', user_id: 'u', paid_at: '2026-09-10T00:00:00Z' }] },
          { data: [{ id: 'o1', user_id: 'u', paid_at: '2026-09-10T00:00:00Z' }] },
        ],
        order_items: [{ data: [{ order_id: 'o1', cashback_amount_agorot: 900 }] }],
        wallet_entries: [{ data: [{ idempotency_key: 'order:o1:cashback' }] }],
        cashback_ledger: [{ data: [{ idempotency_key: 'order:o1:count_bonus' }] }],
      },
      rpc,
    )
    const summary = await settleCashback(admin, NOW)
    expect(rpc).not.toHaveBeenCalled()
    expect(summary).toMatchObject({
      scanned: 1,
      itemCredited: 0,
      bonusAwarded: 0,
      deferred: 0,
      errors: 0,
    })
  })

  it('counts a per-order failure and carries on to the next order', async () => {
    const rpc = vi.fn(async (fn: string, args: { p_order_id: string }) => {
      if (fn === 'fn_cashback_order_bonus' && args.p_order_id === 'a2') {
        return { data: null, error: { message: 'deadlock detected' } }
      }
      return { data: 0, error: null }
    })
    const { admin } = stubAdmin(
      {
        orders: [
          {
            data: [
              { id: 'a2', user_id: 'a', paid_at: '2026-09-10T00:00:00Z' },
              { id: 'b1', user_id: 'b', paid_at: '2026-09-11T00:00:00Z' },
            ],
          },
          {
            data: [
              { id: 'a1', user_id: 'a', paid_at: '2026-08-01T00:00:00Z' },
              { id: 'a2', user_id: 'a', paid_at: '2026-09-10T00:00:00Z' },
              { id: 'b1', user_id: 'b', paid_at: '2026-09-11T00:00:00Z' },
            ],
          },
        ],
        order_items: [{ data: [] }],
        wallet_entries: [{ data: [] }],
        cashback_ledger: [{ data: [] }],
      },
      rpc,
    )
    const summary = await settleCashback(admin, NOW)
    expect(summary.errors).toBe(1)
    expect(summary.bonusNotOwed).toBe(1)
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('throws when a read fails, because a plan over half the rows could defer what it should credit', async () => {
    const { admin } = stubAdmin({
      orders: [
        { data: [{ id: 'o1', user_id: 'u', paid_at: '2026-09-10T00:00:00Z' }] },
        { data: [] },
      ],
      order_items: [{ error: { message: 'boom' } }],
      wallet_entries: [{ data: [] }],
      cashback_ledger: [{ data: [] }],
    })
    await expect(settleCashback(admin, NOW)).rejects.toThrow(/order_items read failed: boom/)
  })

  it('is a quiet night when the window is empty', async () => {
    const rpc = vi.fn()
    const { admin } = stubAdmin({ orders: [{ data: [] }] }, rpc)
    const summary = await settleCashback(admin, NOW)
    expect(summary.scanned).toBe(0)
    expect(rpc).not.toHaveBeenCalled()
  })
})
