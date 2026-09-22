import { describe, expect, it } from 'vitest'
import { findRecentOrderForPhone } from './orders'

/**
 * A minimal fake covering exactly the three reads
 * `findRecentOrderForPhone` makes: `profiles`, `user_addresses`, `orders`.
 * Each resolves through a bare `await`, the same shape the real Supabase
 * builder does with no `.maybeSingle()`/`.single()` terminal.
 */
function fakeAdmin(tables: {
  profiles?: { id: string; phone: string | null }[]
  user_addresses?: { user_id: string; phone: string | null }[]
  orders?: { id: string; status: string; total_ils_agorot: number | null; created_at: string }[]
}) {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'ilike', 'in', 'is', 'order']) {
        chain[m] = () => chain
      }
      // A real Promise, not a hand-rolled `.then`: biome's noThenProperty
      // rule refuses the latter.
      chain.limit = () =>
        Promise.resolve({ data: (tables as Record<string, unknown>)[table] ?? [], error: null })
      return chain
    },
  }
}

describe('findRecentOrderForPhone', () => {
  it('returns null when no profile or address matches the phone', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only fake client
    const order = await findRecentOrderForPhone(fakeAdmin({}) as any, '972501234567')
    expect(order).toBeNull()
  })

  it('matches by profiles.phone regardless of how it was typed in', async () => {
    const admin = fakeAdmin({
      profiles: [{ id: 'user-1', phone: '050-1234567' }],
      orders: [{ id: 'order-1', status: 'paid', total_ils_agorot: 5000, created_at: '2026-09-01' }],
    })
    // biome-ignore lint/suspicious/noExplicitAny: test-only fake client
    const order = await findRecentOrderForPhone(admin as any, '972501234567')
    expect(order?.id).toBe('order-1')
  })

  it('falls back to user_addresses.phone when the profile has none matching', async () => {
    const admin = fakeAdmin({
      profiles: [{ id: 'user-1', phone: null }],
      user_addresses: [{ user_id: 'user-2', phone: '+972 50 123 4567' }],
      orders: [
        { id: 'order-2', status: 'pending', total_ils_agorot: null, created_at: '2026-09-01' },
      ],
    })
    // biome-ignore lint/suspicious/noExplicitAny: test-only fake client
    const order = await findRecentOrderForPhone(admin as any, '972501234567')
    expect(order?.id).toBe('order-2')
  })

  it('does not match a phone that only shares the same seven-digit suffix', async () => {
    // 03-1234567 and 050-1234567 share a suffix; normalising must still tell
    // them apart, the same guarantee attachPhoneToExistingAccount relies on.
    const admin = fakeAdmin({
      profiles: [{ id: 'user-1', phone: '03-1234567' }],
      orders: [{ id: 'order-1', status: 'paid', total_ils_agorot: 5000, created_at: '2026-09-01' }],
    })
    // biome-ignore lint/suspicious/noExplicitAny: test-only fake client
    const order = await findRecentOrderForPhone(admin as any, '972501234567')
    expect(order).toBeNull()
  })

  it('returns null rather than throwing when the phone is too short to suffix-match', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only fake client
    const order = await findRecentOrderForPhone(fakeAdmin({}) as any, '12345')
    expect(order).toBeNull()
  })
})
