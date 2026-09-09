import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The undo action's half of the contract: which audit row it picks, when it
 * refuses, and that it never reverts a product edited since.
 */

let sessionResult: { userId: string; role: string } | null = { userId: 'admin-1', role: 'admin' }
vi.mock('@/lib/admin/rbac', () => ({
  requireAdminSession: async () => {
    if (!sessionResult) throw new Error('no session')
    return sessionResult
  },
}))

const auditCalls: Record<string, unknown>[] = []
vi.mock('@/lib/admin/audit', () => ({
  writeAuditLog: async (entry: Record<string, unknown>) => {
    auditCalls.push(entry)
  },
}))

vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: <T>(_name: string, run: () => T) => run(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }))
vi.mock('@/lib/observability/log', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

/** The single audit row the action reads. */
let auditRow: unknown = null
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          not: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data: auditRow, error: null }),
              }),
            }),
          }),
        }),
      }),
    }),
  }),
}))

/** Products as they are now, plus a record of what was written back. */
let currentRows: Record<string, unknown>[] = []
const updates: { id: string; values: Record<string, unknown> }[] = []
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({ in: () => Promise.resolve({ data: currentRows, error: null }) }),
      update: (values: Record<string, unknown>) => ({
        eq: (_col: string, id: string) => {
          updates.push({ id, values })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  }),
}))

const { rollbackLastBulkOperation } = await import('./bulk-rollback')

const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000002'

beforeEach(() => {
  sessionResult = { userId: 'admin-1', role: 'admin' }
  auditCalls.length = 0
  updates.length = 0
  auditRow = {
    id: 'audit-1',
    metadata: { bulk_operation: 'adjust_prices' },
    before: [{ id: A, kenyon_price: 100 }],
    after: [{ id: A, kenyon_price: 120 }],
  }
  currentRows = [{ id: A, kenyon_price: 120 }]
})

describe('rollbackLastBulkOperation', () => {
  it('restores the previous value and audits the undo', async () => {
    const result = await rollbackLastBulkOperation()

    expect(updates).toEqual([{ id: A, values: { kenyon_price: 100 } }])
    expect(result).toMatchObject({ success: expect.stringContaining('שוחזרו 1') })
    expect(auditCalls).toHaveLength(1)
    expect(auditCalls[0]).toMatchObject({ action: 'restored', entityType: 'products' })
  })

  it('does not mark its own audit row as another bulk operation', async () => {
    // Otherwise clicking undo twice would ping-pong the catalogue, because the
    // second click would find the first undo and reverse it.
    await rollbackLastBulkOperation()
    const metadata = auditCalls[0]?.metadata as Record<string, unknown>
    expect(metadata.bulk_operation).toBeUndefined()
    expect(metadata.rolled_back_from).toBe('audit-1')
  })

  it('refuses to revert a product edited since, and says so', async () => {
    currentRows = [{ id: A, kenyon_price: 99 }]

    const result = await rollbackLastBulkOperation()

    expect(updates).toEqual([])
    expect(result).toMatchObject({ success: expect.stringContaining('שונו מאז') })
  })

  it('restores only the untouched half of a mixed batch', async () => {
    auditRow = {
      id: 'audit-1',
      metadata: { bulk_operation: 'adjust_prices' },
      before: [
        { id: A, kenyon_price: 100 },
        { id: B, kenyon_price: 200 },
      ],
      after: [
        { id: A, kenyon_price: 110 },
        { id: B, kenyon_price: 220 },
      ],
    }
    currentRows = [
      { id: A, kenyon_price: 110 },
      { id: B, kenyon_price: 999 },
    ]

    await rollbackLastBulkOperation()

    expect(updates).toEqual([{ id: A, values: { kenyon_price: 100 } }])
  })

  it('names an operation recorded before before/after existed instead of reporting success', async () => {
    // Every bulk row written before 2026-09-10 has no `before`. An empty
    // success would read as "there was nothing to undo".
    auditRow = {
      id: 'audit-1',
      metadata: { bulk_operation: 'assign_category' },
      before: null,
      after: null,
    }

    const result = await rollbackLastBulkOperation()

    expect(updates).toEqual([])
    expect(result).toMatchObject({ error: expect.stringContaining('מצב קודם') })
  })

  it('says so when there is no bulk operation at all', async () => {
    auditRow = null
    expect(await rollbackLastBulkOperation()).toMatchObject({
      error: expect.stringContaining('לא נמצאה'),
    })
  })

  it('refuses without an ADMIN session, before reading anything', async () => {
    sessionResult = null
    expect(await rollbackLastBulkOperation()).toEqual({ error: 'אין הרשאה' })
    expect(updates).toEqual([])
  })
})
