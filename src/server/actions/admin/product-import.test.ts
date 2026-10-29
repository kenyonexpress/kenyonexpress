// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const upsert = vi.fn()
const removed: { table: string; ids: string[] }[] = []

vi.mock('server-only', () => ({}))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: vi.fn() }))
vi.mock('@/lib/admin/rbac', () => ({
  requireAdminSession: async () => ({ userId: 'u1', role: 'admin' }),
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_n: string, fn: () => unknown) => fn(),
}))
vi.mock('./products', () => ({ upsertProductNoRedirect: (f: FormData) => upsert(f) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      delete: () => ({
        in: (_c: string, ids: string[]) => {
          removed.push({ table, ids })
          return { select: async () => ({ data: ids.map((id) => ({ id })) }) }
        },
      }),
    }),
  }),
}))

import { importProductsCsv } from './product-import'

const csv = [
  'slug,name_he,type,kenyon_price,platform_percent',
  'a,א,physical,10,15',
  'b,ב,physical,20,15',
  'c,ג,physical,30,15',
].join('\n')

function form(mode: string) {
  const f = new FormData()
  f.set('file', new File([csv], 'p.csv', { type: 'text/csv' }))
  f.set('mode', mode)
  return f
}

describe('importProductsCsv commit', () => {
  beforeEach(() => {
    upsert.mockReset()
    removed.length = 0
  })

  it('imports every row without redirecting', async () => {
    upsert
      .mockResolvedValueOnce({ success: 'created', id: '1' })
      .mockResolvedValueOnce({ success: 'created', id: '2' })
      .mockResolvedValueOnce({ success: 'created', id: '3' })
    const res = await importProductsCsv(null, form('commit'))
    expect(res).toMatchObject({ imported: 3 })
    expect(removed).toHaveLength(0)
  })

  it('rolls back created rows when a later row fails', async () => {
    upsert
      .mockResolvedValueOnce({ success: 'created', id: '1' })
      .mockResolvedValueOnce({ success: 'created', id: '2' })
      .mockResolvedValueOnce({ error: 'slug exists' })
    const res = await importProductsCsv(null, form('commit'))
    expect(res).toMatchObject({ rolledBack: 2, failures: [{ error: 'slug exists' }] })
    expect(removed.find((r) => r.table === 'products')?.ids).toEqual(['1', '2'])
  })

  it('preview writes nothing', async () => {
    const res = await importProductsCsv(null, form('preview'))
    expect(res).toMatchObject({ dryRun: true })
    expect(upsert).not.toHaveBeenCalled()
  })
})
