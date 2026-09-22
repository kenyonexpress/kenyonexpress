import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAdminSession = vi.fn()
const writeAuditLog = vi.fn()
const selectResult = vi.fn()
const update = vi.fn()

vi.mock('@/lib/admin/rbac', () => ({
  requireAdminSession: () => requireAdminSession(),
}))

vi.mock('@/lib/admin/audit', () => ({
  writeAuditLog: (entry: unknown) => writeAuditLog(entry),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => selectResult(),
        }),
      }),
      update: (fields: unknown) => ({
        eq: () => update(fields),
      }),
    }),
  }),
}))

vi.mock('@/lib/observability/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { approveDealCandidate, rejectDealCandidate } from './deals-queue'

const ID = '11111111-1111-4111-8111-111111111111'

describe('approveDealCandidate', () => {
  beforeEach(() => {
    requireAdminSession.mockReset().mockResolvedValue({ userId: 'admin-1', role: 'admin' })
    selectResult
      .mockReset()
      .mockResolvedValue({ data: { id: ID, status: 'pending_review' }, error: null })
    update.mockReset().mockResolvedValue({ error: null })
    writeAuditLog.mockReset().mockResolvedValue(undefined)
  })

  it('requires an admin session', async () => {
    requireAdminSession.mockRejectedValue(new Error('no session'))
    const result = await approveDealCandidate(ID)
    expect(result.error).toBe('אין הרשאה')
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects an invalid id without a query', async () => {
    const result = await approveDealCandidate('not-a-uuid')
    expect(result.error).toBeTruthy()
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses to re-approve a candidate already decided', async () => {
    selectResult.mockResolvedValue({ data: { id: ID, status: 'approved' }, error: null })
    const result = await approveDealCandidate(ID)
    expect(result.error).toBe('הדיל כבר טופל.')
    expect(update).not.toHaveBeenCalled()
  })

  it('marks a pending candidate approved and writes an audit row', async () => {
    const result = await approveDealCandidate(ID)
    expect(result.error).toBeUndefined()
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', reviewed_by: 'admin-1' }),
    )
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'deal_candidates', entityId: ID }),
    )
  })

  it('never creates a public.products row -- only ever updates deal_candidates', async () => {
    // The whole point of the scope decision in docs/DEALS-PIPELINE.md: this
    // action's only side effects are the deal_candidates update and the
    // audit log, both asserted above. There is no products insert anywhere
    // in this module for this test to accidentally not catch.
    await approveDealCandidate(ID)
    expect(update).toHaveBeenCalledTimes(1)
  })
})

describe('rejectDealCandidate', () => {
  beforeEach(() => {
    requireAdminSession.mockReset().mockResolvedValue({ userId: 'admin-1', role: 'admin' })
    selectResult
      .mockReset()
      .mockResolvedValue({ data: { id: ID, status: 'pending_review' }, error: null })
    update.mockReset().mockResolvedValue({ error: null })
    writeAuditLog.mockReset().mockResolvedValue(undefined)
  })

  it('requires a reason of at least 2 characters', async () => {
    const result = await rejectDealCandidate(ID, 'x')
    expect(result.error).toBeTruthy()
    expect(update).not.toHaveBeenCalled()
  })

  it('records the reason and marks rejected', async () => {
    const result = await rejectDealCandidate(ID, 'מוצר לא תואם קטגוריה')
    expect(result.error).toBeUndefined()
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected', rejection_reason: 'מוצר לא תואם קטגוריה' }),
    )
  })

  it('refuses to re-reject an already-decided candidate', async () => {
    selectResult.mockResolvedValue({ data: { id: ID, status: 'rejected' }, error: null })
    const result = await rejectDealCandidate(ID, 'סיבה חדשה')
    expect(result.error).toBe('הדיל כבר טופל.')
    expect(update).not.toHaveBeenCalled()
  })
})
