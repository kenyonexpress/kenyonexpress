import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * S16: the CSV import's insert carries the shipping fee (agorot), the
 * cancellation window and the image URLs, and rides the same optional-column
 * ladder as the form's save.
 */

const requireAdminSession = vi.fn()
const insert = vi.fn()

vi.mock('@/lib/admin/rbac', () => ({ requireAdminSession: () => requireAdminSession() }))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('@/lib/soft-delete', () => ({ excludeDeleted: (q: unknown) => q }))

// Every lookup (categories, slugs, skus) finds nothing; inserts go to the spy.
const emptyQuery = {
  select: () => emptyQuery,
  in: () => emptyQuery,
  eq: () => emptyQuery,
  // biome-ignore lint/suspicious/noThenProperty: a thenable stands in for the PostgREST builder
  then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => emptyQuery,
      insert: (row: unknown) => insert(row),
    }),
  }),
}))

import { importProductsBatch } from './product-import'

const record = {
  slug: 's16-import',
  name_he: 'מוצר ייבוא',
  kenyon_price: '199',
  platform_percent: '30',
  shipping_price_ils: '29',
  cancellation_window_days: '30',
  images: '/images/products/a.webp|https://cdn.kenyonexpress.co.il/b.avif',
}

describe('importProductsBatch (S16)', () => {
  beforeEach(() => {
    requireAdminSession.mockReset().mockResolvedValue({ userId: 'admin-1', role: 'admin' })
    insert.mockReset().mockResolvedValue({ data: null, error: null })
  })

  it('writes shipping in agorot, the window, the images, and a draft', async () => {
    const result = await importProductsBatch([{ line: 2, record }])
    expect('inserted' in result && result.inserted).toBe(1)
    expect(insert).toHaveBeenCalledTimes(1)
    const row = insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(row.shipping_price_agorot).toBe(2900)
    expect(row.cancellation_window_days).toBe(30)
    expect(row.refund_policy).toBe('statutory')
    expect(row.images).toEqual([
      '/images/products/a.webp',
      'https://cdn.kenyonexpress.co.il/b.avif',
    ])
    expect(row.status).toBe('draft')
    expect(row.platform_percent).toBe(30)
    expect(row.created_by).toBe('admin-1')
  })

  it('drops default terms on a database without the columns and retries', async () => {
    insert
      .mockResolvedValueOnce({
        data: null,
        error: {
          message: "Could not find the 'refund_policy' column of 'products' in the schema cache",
        },
      })
      .mockResolvedValueOnce({ data: null, error: null })
    const plain = { ...record, shipping_price_ils: '', cancellation_window_days: '' }
    const result = await importProductsBatch([{ line: 2, record: plain }])
    expect('inserted' in result && result.inserted).toBe(1)
    expect(insert).toHaveBeenCalledTimes(2)
    const retry = insert.mock.calls[1]?.[0] as Record<string, unknown>
    expect(retry).not.toHaveProperty('refund_policy')
  })

  it('refuses, with the migration notice, a row whose terms cannot be written', async () => {
    insert.mockResolvedValue({
      data: null,
      error: {
        message: "Could not find the 'refund_policy' column of 'products' in the schema cache",
      },
    })
    const result = await importProductsBatch([{ line: 2, record }])
    expect('inserted' in result && result.inserted).toBe(0)
    const results = ('results' in result ? result.results : undefined) ?? []
    expect(results[0]?.errors[0]).toContain('243_product_terms.sql')
    expect(insert).toHaveBeenCalledTimes(1)
  })

  it('inserts nothing for a row that fails validation', async () => {
    const bad = { ...record, cancellation_window_days: '7' }
    const result = await importProductsBatch([{ line: 2, record: bad }])
    expect('inserted' in result && result.inserted).toBe(0)
    expect(insert).not.toHaveBeenCalled()
  })

  it('requires an admin session', async () => {
    requireAdminSession.mockRejectedValue(new Error('no'))
    const result = await importProductsBatch([{ line: 2, record }])
    expect(result).toEqual({ error: 'אין הרשאה' })
    expect(insert).not.toHaveBeenCalled()
  })
})
