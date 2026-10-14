import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The admin switch for `products.is_gift_card`. What is pinned: who may press
 * it, that the row is read on the server and judged before the write, and
 * that turning it off is never refused.
 */

const session = { userId: 'u1', role: 'admin' as string }
let admitted = true
vi.mock('@/lib/admin/rbac', () => ({
  // The real guard redirects, which in a server action is a thrown signal.
  requireAdminSession: async () => {
    if (!admitted) throw new Error('NEXT_REDIRECT')
    return session
  },
}))
const audit = vi.fn()
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: (entry: unknown) => audit(entry) }))
vi.mock('@/lib/catalogue-cache', () => ({ CATALOGUE_TAG: 'catalogue' }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, run: () => unknown) => run(),
}))
vi.mock('@/lib/observability/log', () => ({ log: { error: vi.fn(), warn: vi.fn() } }))

const row = {
  id: 'p',
  supplier_id: null as string | null,
  platform_percent: 100 as number | null,
  is_coupon_enabled: false,
  type: 'physical',
  kenyon_price: 200,
  full_price: null as number | null,
}
let found: typeof row | null = row
const updates: unknown[] = []
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: found, error: null }) }) }),
      }),
      update: (values: unknown) => {
        updates.push(values)
        return { eq: async () => ({ error: null }) }
      },
    }),
  }),
}))

const { setProductGiftCard } = await import('./product-gift-card')

const ID = '00000000-0000-4000-8000-000000000001'
function form(enable: boolean, id = ID) {
  const data = new FormData()
  data.set('product_id', id)
  data.set('enable', String(enable))
  return data
}

beforeEach(() => {
  admitted = true
  found = { ...row }
  updates.length = 0
  audit.mockReset()
})

describe('setProductGiftCard', () => {
  it('turns the flag on for a product that qualifies, and records who did it', async () => {
    expect(await setProductGiftCard(null, form(true))).toEqual({ ok: true, enabled: true })
    expect(updates).toEqual([{ is_gift_card: true }])
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'u1', entityId: ID, changes: { is_gift_card: true } }),
    )
  })

  it('refuses a product with a supplier, and writes nothing', async () => {
    found = { ...row, supplier_id: 's1' }
    const result = await setProductGiftCard(null, form(true))
    expect(result?.ok).toBe(false)
    expect(result?.error).toMatch(/ספק/)
    expect(updates).toEqual([])
    expect(audit).not.toHaveBeenCalled()
  })

  it('refuses a platform share under the whole, and a discounted price', async () => {
    found = { ...row, platform_percent: 15 }
    expect((await setProductGiftCard(null, form(true)))?.ok).toBe(false)
    found = { ...row, full_price: 400 }
    expect((await setProductGiftCard(null, form(true)))?.ok).toBe(false)
    expect(updates).toEqual([])
  })

  it('always allows turning it off, whatever the product looks like', async () => {
    found = { ...row, supplier_id: 's1', platform_percent: 15 }
    expect(await setProductGiftCard(null, form(false))).toEqual({ ok: true, enabled: false })
    expect(updates).toEqual([{ is_gift_card: false }])
  })

  it('reads and writes nothing when the admin guard turns the caller away', async () => {
    admitted = false
    await expect(setProductGiftCard(null, form(true))).rejects.toThrow('NEXT_REDIRECT')
    expect(updates).toEqual([])
    expect(audit).not.toHaveBeenCalled()
  })

  it('refuses an id that is not one, and a product that is gone', async () => {
    expect((await setProductGiftCard(null, form(true, 'x')))?.ok).toBe(false)
    found = null
    expect((await setProductGiftCard(null, form(true)))?.error).toBe('המוצר לא נמצא.')
    expect(updates).toEqual([])
  })
})
