import {
  dbChangePayloadSchema,
  jobForChange,
  searchIndexJobSchema,
} from '@/lib/search/pipeline-contracts'
import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-07-27T10:00:00.000Z')
const PRODUCT_ID = '3e9a4f6c-1b2d-4c5e-8f7a-9b0c1d2e3f4a'

function change(overrides: Record<string, unknown> = {}) {
  return {
    type: 'UPDATE',
    table: 'products',
    schema: 'public',
    record: { id: PRODUCT_ID, status: 'active', deleted_at: null },
    old_record: null,
    ...overrides,
  }
}

describe('dbChangePayloadSchema', () => {
  it('accepts a Supabase webhook payload and passes unknown keys through', () => {
    const result = dbChangePayloadSchema.safeParse({ ...change(), extra: 'kept' })
    expect(result.success).toBe(true)
  })

  it('rejects unknown event types', () => {
    expect(dbChangePayloadSchema.safeParse(change({ type: 'TRUNCATE' })).success).toBe(false)
  })

  it('rejects a payload without a table', () => {
    expect(dbChangePayloadSchema.safeParse(change({ table: undefined })).success).toBe(false)
  })
})

describe('searchIndexJobSchema', () => {
  it('accepts a well-formed job', () => {
    const result = searchIndexJobSchema.safeParse({
      op: 'upsert',
      productId: PRODUCT_ID,
      reason: 'update:active',
      enqueuedAt: NOW.toISOString(),
    })
    expect(result.success).toBe(true)
  })

  it('rejects a non-uuid product id', () => {
    const result = searchIndexJobSchema.safeParse({
      op: 'delete',
      productId: 'not-a-uuid',
      reason: 'x',
      enqueuedAt: NOW.toISOString(),
    })
    expect(result.success).toBe(false)
  })

  it('rejects unknown operations', () => {
    const result = searchIndexJobSchema.safeParse({
      op: 'reindex-all',
      productId: PRODUCT_ID,
      reason: 'x',
      enqueuedAt: NOW.toISOString(),
    })
    expect(result.success).toBe(false)
  })
})

describe('jobForChange', () => {
  it('upserts an active product on INSERT and UPDATE', () => {
    for (const type of ['INSERT', 'UPDATE'] as const) {
      const parsed = dbChangePayloadSchema.parse(change({ type }))
      const job = jobForChange(parsed, NOW)
      expect(job).toEqual({
        op: 'upsert',
        productId: PRODUCT_ID,
        reason: `${type.toLowerCase()}:active`,
        enqueuedAt: NOW.toISOString(),
      })
    }
  })

  it('deletes on DELETE, reading the old record', () => {
    const parsed = dbChangePayloadSchema.parse(
      change({ type: 'DELETE', record: null, old_record: { id: PRODUCT_ID, status: 'active' } }),
    )
    expect(jobForChange(parsed, NOW)?.op).toBe('delete')
  })

  it('deletes when the product is soft-deleted', () => {
    const parsed = dbChangePayloadSchema.parse(
      change({ record: { id: PRODUCT_ID, status: 'active', deleted_at: NOW.toISOString() } }),
    )
    expect(jobForChange(parsed, NOW)?.op).toBe('delete')
  })

  it.each(['draft', 'paused', 'archived'])('deletes when status is %s', (status) => {
    const parsed = dbChangePayloadSchema.parse(
      change({ record: { id: PRODUCT_ID, status, deleted_at: null } }),
    )
    expect(jobForChange(parsed, NOW)?.op).toBe('delete')
  })

  it('ignores changes to other tables', () => {
    const parsed = dbChangePayloadSchema.parse(change({ table: 'orders' }))
    expect(jobForChange(parsed, NOW)).toBeNull()
  })

  it('ignores a record without a valid product id', () => {
    const parsed = dbChangePayloadSchema.parse(change({ record: { id: 'nope' } }))
    expect(jobForChange(parsed, NOW)).toBeNull()
  })
})
