import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParsedCandidate } from './types'

const selectResult = vi.fn()
const insert = vi.fn()
const update = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => selectResult(),
          }),
        }),
      }),
      insert: (fields: unknown) => insert(fields),
      update: (fields: unknown) => ({
        eq: () => update(fields),
      }),
    }),
  }),
}))

vi.mock('@/lib/observability/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { ingestCandidates } from './ingest'

const CANDIDATE: ParsedCandidate = {
  externalRef: 'ref-1',
  nameHe: 'עיסוי',
  priceAgorot: 9900,
  fullPriceAgorot: 15000,
  discountPercent: 34,
  linkUrl: 'https://supplier.example/deal',
  imageUrl: null,
  categoryText: 'ספא',
  rawPayload: {},
}

describe('ingestCandidates', () => {
  beforeEach(() => {
    selectResult.mockReset()
    insert.mockReset().mockResolvedValue({ error: null })
    update.mockReset().mockResolvedValue({ error: null })
  })

  it('inserts a brand new candidate', async () => {
    selectResult.mockResolvedValue({ data: null, error: null })
    const outcome = await ingestCandidates('supplier-1', [CANDIDATE])
    expect(outcome).toEqual({ inserted: 1, updated: 0, skippedDecided: 0, failed: 0 })
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ supplier_id: 'supplier-1', external_ref: 'ref-1', source: 'feed' }),
    )
  })

  it('updates an existing pending_review row instead of duplicating it', async () => {
    selectResult.mockResolvedValue({ data: { id: 'row-1', status: 'pending_review' }, error: null })
    const outcome = await ingestCandidates('supplier-1', [CANDIDATE])
    expect(outcome).toEqual({ inserted: 0, updated: 1, skippedDecided: 0, failed: 0 })
    expect(insert).not.toHaveBeenCalled()
  })

  it('never touches a row an admin already approved', async () => {
    selectResult.mockResolvedValue({ data: { id: 'row-1', status: 'approved' }, error: null })
    const outcome = await ingestCandidates('supplier-1', [CANDIDATE])
    expect(outcome).toEqual({ inserted: 0, updated: 0, skippedDecided: 1, failed: 0 })
    expect(insert).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('never touches a row an admin already rejected', async () => {
    selectResult.mockResolvedValue({ data: { id: 'row-1', status: 'rejected' }, error: null })
    const outcome = await ingestCandidates('supplier-1', [CANDIDATE])
    expect(outcome.skippedDecided).toBe(1)
  })

  it('counts a failed insert without throwing', async () => {
    selectResult.mockResolvedValue({ data: null, error: null })
    insert.mockResolvedValue({ error: { message: 'boom' } })
    const outcome = await ingestCandidates('supplier-1', [CANDIDATE])
    expect(outcome.failed).toBe(1)
  })

  it('stops cleanly when the table does not exist yet (pending migration)', async () => {
    selectResult.mockResolvedValue({ data: null, error: { code: '42P01', message: 'missing' } })
    const outcome = await ingestCandidates('supplier-1', [CANDIDATE])
    expect(outcome).toEqual({ inserted: 0, updated: 0, skippedDecided: 0, failed: 0 })
    expect(insert).not.toHaveBeenCalled()
  })

  it('processes every candidate in the batch, one at a time', async () => {
    selectResult.mockResolvedValue({ data: null, error: null })
    const two = [CANDIDATE, { ...CANDIDATE, externalRef: 'ref-2' }]
    const outcome = await ingestCandidates('supplier-1', two)
    expect(outcome.inserted).toBe(2)
    expect(insert).toHaveBeenCalledTimes(2)
  })
})
