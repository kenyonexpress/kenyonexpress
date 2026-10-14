import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Scheduling a price change. What is pinned: the amounts are stored as
 * integer agorot, a past moment and a reference at or under the price are
 * refused before anything is written, and a cancel only reports success for
 * a row that was actually still pending.
 */

const session = { userId: 'u1', role: 'admin' }
vi.mock('@/lib/admin/rbac', () => ({ requireSection: async () => session }))
const audit = vi.fn()
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: (entry: unknown) => audit(entry) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, run: () => unknown) => run(),
}))
vi.mock('@/lib/observability/log', () => ({ log: { warn: vi.fn(), error: vi.fn() } }))

const inserts: Record<string, unknown>[] = []
let insertError: { code?: string; message: string } | null = null
let cancelRow: { id: string } | null = { id: 'x' }
const cancelFilters: [string, unknown][] = []
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        inserts.push(row)
        return { error: insertError }
      },
      update: () => {
        const chain = {
          eq: (column: string, value: unknown) => {
            cancelFilters.push([column, value])
            return chain
          },
          is: (column: string, value: unknown) => {
            cancelFilters.push([column, value])
            return chain
          },
          select: () => ({ maybeSingle: async () => ({ data: cancelRow, error: null }) }),
        }
        return chain
      },
    }),
  }),
}))

const { scheduleFlashDeal, cancelFlashDeal } = await import('./flash-deals')

const PRODUCT = '00000000-0000-4000-8000-000000000001'
const future = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 16)
function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}
const valid = () => ({ product_id: PRODUCT, effective_at: future(), price_ils: '8.20' })

beforeEach(() => {
  inserts.length = 0
  cancelFilters.length = 0
  insertError = null
  cancelRow = { id: 'x' }
  audit.mockReset()
})

describe('scheduleFlashDeal', () => {
  it('stores the price as integer agorot, without float drift', async () => {
    const result = await scheduleFlashDeal({ ok: false }, form({ ...valid(), reference_ils: '10' }))
    expect(result.ok).toBe(true)
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({
      product_id: PRODUCT,
      price_agorot: 820,
      reference_agorot: 1000,
      created_by: 'u1',
    })
    expect(audit).toHaveBeenCalledTimes(1)
  })

  it('refuses a moment that has already passed, and writes nothing', async () => {
    const past = new Date(Date.now() - 3_600_000).toISOString().slice(0, 16)
    const result = await scheduleFlashDeal({ ok: false }, form({ ...valid(), effective_at: past }))
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/בעתיד/)
    expect(inserts).toEqual([])
  })

  it('refuses a "before" price that is not above the new price', async () => {
    for (const reference of ['8.20', '5']) {
      const result = await scheduleFlashDeal(
        { ok: false },
        form({ ...valid(), reference_ils: reference }),
      )
      expect(result.ok).toBe(false)
    }
    expect(inserts).toEqual([])
  })

  it('refuses a product id that is not one, a zero price and an unreadable date', async () => {
    expect((await scheduleFlashDeal({ ok: false }, form({ ...valid(), product_id: 'x' }))).ok).toBe(
      false,
    )
    expect((await scheduleFlashDeal({ ok: false }, form({ ...valid(), price_ils: '0' }))).ok).toBe(
      false,
    )
    expect(
      (await scheduleFlashDeal({ ok: false }, form({ ...valid(), effective_at: 'not-a-date!' })))
        .ok,
    ).toBe(false)
    expect(inserts).toEqual([])
  })

  it('says so when the same product already has a change at that moment', async () => {
    insertError = { code: '23505', message: 'duplicate' }
    const result = await scheduleFlashDeal({ ok: false }, form(valid()))
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/כבר קיים/)
    expect(audit).not.toHaveBeenCalled()
  })
})

describe('cancelFlashDeal', () => {
  const ID = '00000000-0000-4000-8000-0000000000aa'

  it('cancels a pending row, and only a pending one', async () => {
    expect((await cancelFlashDeal(ID)).ok).toBe(true)
    expect(cancelFilters).toEqual([
      ['id', ID],
      ['applied_at', null],
      ['cancelled_at', null],
    ])
  })

  it('does not claim a cancel for a change that already ran', async () => {
    cancelRow = null
    const result = await cancelFlashDeal(ID)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/כבר הוחל או בוטל/)
    expect(audit).not.toHaveBeenCalled()
  })

  it('refuses an id that is not one', async () => {
    expect((await cancelFlashDeal('x')).ok).toBe(false)
    expect(cancelFilters).toEqual([])
  })
})
