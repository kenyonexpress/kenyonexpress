import { describe, expect, it, vi } from 'vitest'
import { GUEST_OWNED_TABLES, attachGuestOrders, saveGuestContact } from './guest-orders'

vi.mock('@/lib/observability/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

type Call = { table: string; op: string; payload?: unknown; eq?: [string, unknown] }

function admin(failing: string[] = []) {
  const calls: Call[] = []
  const client = {
    from: (table: string) => ({
      update: (payload: unknown) => {
        const call: Call = { table, op: 'update', payload }
        calls.push(call)
        return {
          eq: (column: string, value: unknown) => {
            call.eq = [column, value]
            return {
              select: async () =>
                failing.includes(table)
                  ? { data: null, error: { message: 'boom' } }
                  : { data: [{ id: 'r1' }, { id: 'r2' }], error: null },
            }
          },
        }
      },
      upsert: async (payload: unknown) => {
        calls.push({ table, op: 'upsert', payload })
        return { error: failing.includes(table) ? { message: 'boom' } : null }
      },
    }),
  }
  return { client: client as never, calls }
}

describe('attachGuestOrders (S07)', () => {
  it('moves every guest-owned table from the anonymous user to the account', async () => {
    const { client, calls } = admin()
    const result = await attachGuestOrders(client, { id: 'anon', is_anonymous: true }, 'acct')
    expect(result.ok).toBe(true)
    expect(calls.map((c) => c.table)).toEqual(GUEST_OWNED_TABLES.map((t) => t.table))
    for (const { table, column } of GUEST_OWNED_TABLES) {
      const call = calls.find((c) => c.table === table)
      expect(call?.payload, table).toEqual({ [column]: 'acct' })
      expect(call?.eq, table).toEqual([column, 'anon'])
    }
    expect(result.moved.orders).toBe(2)
  })

  it('never moves rows off a real account', async () => {
    const { client, calls } = admin()
    await attachGuestOrders(client, { id: 'other-account', is_anonymous: false }, 'acct')
    await attachGuestOrders(client, { id: 'other-account' }, 'acct')
    expect(calls).toHaveLength(0)
  })

  it('is a no-op when the link kept the same id', async () => {
    const { client, calls } = admin()
    await attachGuestOrders(client, { id: 'same', is_anonymous: true }, 'same')
    expect(calls).toHaveLength(0)
  })

  it('reports a failed table and still moves the rest', async () => {
    const { client, calls } = admin(['vouchers'])
    const result = await attachGuestOrders(client, { id: 'anon', is_anonymous: true }, 'acct')
    expect(result.ok).toBe(false)
    expect(calls).toHaveLength(GUEST_OWNED_TABLES.length)
    expect(result.moved.vouchers).toBeUndefined()
  })
})

describe('saveGuestContact', () => {
  it('upserts the email onto the profile and leaves blank fields alone', async () => {
    const { client, calls } = admin()
    const ok = await saveGuestContact(client, 'anon', {
      email: 'dana@example.com',
      fullName: null,
      phone: null,
    })
    expect(ok).toBe(true)
    expect(calls[0]).toEqual({
      table: 'profiles',
      op: 'upsert',
      payload: { id: 'anon', email: 'dana@example.com' },
    })
  })

  it('answers false when the write failed', async () => {
    const { client } = admin(['profiles'])
    expect(
      await saveGuestContact(client, 'anon', { email: 'a@b.co', fullName: 'x', phone: null }),
    ).toBe(false)
  })
})
