import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireSupplierRole = vi.fn()
const update = vi.fn()
const insert = vi.fn()

vi.mock('@/lib/supplier/rbac', () => ({
  requireSupplierRole: (...args: unknown[]) => requireSupplierRole(...args),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      update: (fields: unknown) => ({
        eq: () => update(fields),
      }),
    }),
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      insert: (fields: unknown) => insert(fields),
    }),
  }),
}))

vi.mock('@/lib/observability/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { submitManualDeal, updateFeedConfig } from './deals-feed'

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('updateFeedConfig', () => {
  beforeEach(() => {
    requireSupplierRole.mockReset().mockResolvedValue({ supplierId: 'sup-1' })
    update.mockReset().mockResolvedValue({ error: null })
  })

  it('saves a valid https feed with its format', async () => {
    const result = await updateFeedConfig(
      formData({ feed_url: 'https://spa.example/feed.json', feed_format: 'json' }),
    )
    expect(result.ok).toBe(true)
    expect(update).toHaveBeenCalledWith({
      feed_url: 'https://spa.example/feed.json',
      feed_format: 'json',
    })
  })

  it('rejects a non-https feed URL', async () => {
    const result = await updateFeedConfig(
      formData({ feed_url: 'http://spa.example/feed.json', feed_format: 'json' }),
    )
    expect(result.ok).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects a URL with no chosen format', async () => {
    const result = await updateFeedConfig(formData({ feed_url: 'https://spa.example/feed.json' }))
    expect(result.ok).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it('clears both fields when the URL is emptied', async () => {
    const result = await updateFeedConfig(formData({}))
    expect(result.ok).toBe(true)
    expect(update).toHaveBeenCalledWith({ feed_url: null, feed_format: null })
  })
})

describe('submitManualDeal', () => {
  beforeEach(() => {
    requireSupplierRole.mockReset().mockResolvedValue({ supplierId: 'sup-1' })
    insert.mockReset().mockResolvedValue({ error: null })
  })

  it('inserts a manual candidate with agorot conversion, scoped to source=manual', async () => {
    const result = await submitManualDeal(
      formData({ name_he: 'עיסוי', price_ils: '99.90', link_url: 'https://s.example/x' }),
    )
    expect(result.ok).toBe(true)
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        supplier_id: 'sup-1',
        source: 'manual',
        status: 'pending_review',
        name_he: 'עיסוי',
        price_agorot: 9990,
      }),
    )
  })

  it('rejects a non-positive price', async () => {
    const result = await submitManualDeal(
      formData({ name_he: 'x', price_ils: '0', link_url: 'https://s.example/x' }),
    )
    expect(result.ok).toBe(false)
    expect(insert).not.toHaveBeenCalled()
  })

  it('rejects a non-https link', async () => {
    const result = await submitManualDeal(
      formData({ name_he: 'x', price_ils: '10', link_url: 'http://s.example/x' }),
    )
    expect(result.ok).toBe(false)
  })

  it('drops a full_price that is not actually above price', async () => {
    await submitManualDeal(
      formData({
        name_he: 'x',
        price_ils: '100',
        full_price_ils: '90',
        link_url: 'https://s.example/x',
      }),
    )
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ full_price_agorot: null }))
  })
})
