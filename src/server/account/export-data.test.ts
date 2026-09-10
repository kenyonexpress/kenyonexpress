import { buildAccountExport, exportFilename } from '@/server/account/export-data'
import { describe, expect, it } from 'vitest'

/**
 * The two ways a data export goes wrong are opposite and both silent: it
 * returns somebody else's rows, or it returns nothing and calls that an answer.
 */

type Call = { table: string; columns: string; owner: string; value: unknown }

/** Records every query and answers from a fixture keyed by table. */
function client(
  fixtures: Record<string, { data?: unknown[]; error?: { message: string }; throws?: boolean }>,
) {
  const calls: Call[] = []
  const admin = {
    from(table: string) {
      let columns = ''
      const builder = {
        select(cols: string) {
          columns = cols
          return builder
        },
        eq(owner: string, value: unknown) {
          calls.push({ table, columns, owner, value })
          const fixture = fixtures[table] ?? { data: [] }
          if (fixture.throws) return Promise.reject(new Error('connection reset'))
          return Promise.resolve({ data: fixture.data ?? null, error: fixture.error ?? null })
        },
      }
      return builder
    },
  }
  return { admin: admin as never, calls }
}

describe('buildAccountExport', () => {
  it('scopes every read to the caller and to nobody else', async () => {
    const { admin, calls } = client({})
    await buildAccountExport(admin, 'user-1')

    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call.value, call.table).toBe('user-1')
    }
  })

  it('keys profiles on id and the card vault on profile_id, not on user_id', async () => {
    // Written over months by different migrations. A wrong owner column is not
    // a leak - RLS still scopes it - it is a silently empty section.
    const { admin, calls } = client({})
    await buildAccountExport(admin, 'user-1')

    expect(calls.find((c) => c.table === 'profiles')?.owner).toBe('id')
    expect(calls.find((c) => c.table === 'payment_tokens')?.owner).toBe('profile_id')
    expect(calls.find((c) => c.table === 'orders')?.owner).toBe('user_id')
    // Verified against production: the column is referrer_user_id. This line
    // first read `referrer_id`, which does not exist on the table, and the
    // section would have been empty forever while looking correct.
    expect(calls.find((c) => c.table === 'referrals')?.owner).toBe('referrer_user_id')
  })

  it('never selects the chargeable card token', async () => {
    // The right of access is not a reason to put a bearer credential in a file
    // the customer will email to themselves.
    const { admin, calls } = client({})
    await buildAccountExport(admin, 'user-1')

    const cards = calls.find((c) => c.table === 'payment_tokens')
    expect(cards?.columns).not.toBe('*')
    expect(cards?.columns).not.toMatch(/\btoken\b/)
    expect(cards?.columns).toContain('last4')
    expect(cards?.columns).toContain('brand')
  })

  it('reports a table that refused instead of calling it empty', async () => {
    // "You have no reviews" and "we could not read your reviews" must not look
    // the same in a compliance answer.
    const { admin } = client({ reviews: { error: { message: 'permission denied' } } })
    const out = await buildAccountExport(admin, 'user-1')

    expect(out.sections.reviews?.unavailable).toBe('permission denied')
    expect(out.sections.reviews?.rows).toEqual([])
  })

  it('survives a read that throws, and still returns the other sections', async () => {
    const { admin } = client({
      orders: { throws: true },
      profiles: { data: [{ id: 'user-1' }] },
    })
    const out = await buildAccountExport(admin, 'user-1')

    expect(out.sections.orders?.unavailable).toMatch(/connection reset/)
    expect(out.sections.profile?.rows).toEqual([{ id: 'user-1' }])
  })

  it('carries the rows it did read', async () => {
    const { admin } = client({ wishlists: { data: [{ product_id: 'p1' }] } })
    const out = await buildAccountExport(admin, 'user-1')
    expect(out.sections.wishlist?.rows).toEqual([{ product_id: 'p1' }])
  })

  it('names the source table for every section, so a follow-up question is possible', async () => {
    const { admin } = client({})
    const out = await buildAccountExport(admin, 'user-1')
    for (const [name, section] of Object.entries(out.sections)) {
      expect(section.source, name).toBeTruthy()
    }
  })

  it('stamps the moment and the subject', async () => {
    const { admin } = client({})
    const out = await buildAccountExport(admin, 'user-1', new Date('2026-09-10T05:00:00Z'))
    expect(out.generated_at).toBe('2026-09-10T05:00:00.000Z')
    expect(out.user_id).toBe('user-1')
  })

  it('tells the reader what is kept after deletion and what unavailable means', async () => {
    const { admin } = client({})
    const out = await buildAccountExport(admin, 'user-1')
    expect(out.notes.join(' ')).toContain('שבע שנים')
    expect(out.notes.join(' ')).toContain('unavailable')
  })

  it('does not throw when everything fails at once', async () => {
    const all = Object.fromEntries(
      ['profiles', 'orders', 'vouchers'].map((t) => [t, { throws: true }]),
    )
    await expect(buildAccountExport(client(all).admin, 'user-1')).resolves.toBeTruthy()
  })
})

describe('exportFilename', () => {
  it('is ASCII, because Content-Disposition is a header', async () => {
    const name = exportFilename(new Date('2026-09-10T05:00:00Z'))
    expect(name).toBe('kenyonexpress-my-data-2026-09-10.json')
    expect(/^[\x20-\x7e]+$/.test(name)).toBe(true)
  })
})
