import { type BulkSnapshotRow, describeRollback, planRollback } from '@/lib/admin/bulk-rollback'
import { describe, expect, it } from 'vitest'

const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000002'
const C = 'cccccccc-0000-4000-8000-000000000003'

function row(id: string, fields: Record<string, string | number | null>): BulkSnapshotRow {
  return { id, ...fields }
}

describe('planRollback', () => {
  it('restores a row nobody has touched since', () => {
    const plan = planRollback(
      [row(A, { kenyon_price: 100 })],
      [row(A, { kenyon_price: 120 })],
      [row(A, { kenyon_price: 120 })],
    )
    expect(plan.restore).toEqual([{ id: A, kenyon_price: 100 }])
    expect(plan.skipped).toEqual([])
  })

  it('REFUSES to revert a row edited after the bulk operation', () => {
    // The rule the whole module exists for. Someone bulk-adjusted to 120, an
    // operator then hand-fixed it to 99, and undo must not throw that away.
    const plan = planRollback(
      [row(A, { kenyon_price: 100 })],
      [row(A, { kenyon_price: 120 })],
      [row(A, { kenyon_price: 99 })],
    )
    expect(plan.restore).toEqual([])
    expect(plan.skipped).toEqual([{ id: A, reason: 'changed_since' }])
  })

  it('skips a product that no longer exists rather than resurrecting it', () => {
    const plan = planRollback([row(A, { kenyon_price: 100 })], [row(A, { kenyon_price: 120 })], [])
    expect(plan.restore).toEqual([])
    expect(plan.skipped).toEqual([{ id: A, reason: 'missing' }])
  })

  it('treats null and undefined as the same absence', () => {
    // A snapshot round-trips through JSONB: `JSON.stringify` drops undefined
    // and Postgres hands back null. Strict equality would skip every product
    // whose category was empty, which is the commonest row in a bulk assign.
    const plan = planRollback(
      [row(A, { category_id: null })],
      [{ id: A, category_id: undefined }],
      [row(A, { category_id: null })],
    )
    expect(plan.restore).toEqual([{ id: A, category_id: null }])
    expect(plan.skipped).toEqual([])
  })

  it('restores a null, so clearing a category can be undone', () => {
    const plan = planRollback(
      [row(A, { category_id: null })],
      [row(A, { category_id: 'cat-1' })],
      [row(A, { category_id: 'cat-1' })],
    )
    expect(plan.restore).toEqual([{ id: A, category_id: null }])
  })

  it('leaves a product the operation itself skipped entirely alone', () => {
    // No `after` entry means the bulk op refused this row (a price it could not
    // scale). Nothing to undo, and it is not a conflict either, so it is
    // neither restored nor reported as skipped.
    const plan = planRollback(
      [row(A, { kenyon_price: 100 }), row(B, { kenyon_price: 50 })],
      [row(A, { kenyon_price: 120 })],
      [row(A, { kenyon_price: 120 }), row(B, { kenyon_price: 50 })],
    )
    expect(plan.restore).toEqual([{ id: A, kenyon_price: 100 }])
    expect(plan.skipped).toEqual([])
  })

  it('is partial rather than all-or-nothing, and names what it left', () => {
    const plan = planRollback(
      [row(A, { kenyon_price: 100 }), row(B, { kenyon_price: 200 }), row(C, { kenyon_price: 300 })],
      [row(A, { kenyon_price: 110 }), row(B, { kenyon_price: 220 }), row(C, { kenyon_price: 330 })],
      [row(A, { kenyon_price: 110 }), row(B, { kenyon_price: 999 })],
    )
    expect(plan.restore).toEqual([{ id: A, kenyon_price: 100 }])
    expect(plan.skipped).toEqual([
      { id: B, reason: 'changed_since' },
      { id: C, reason: 'missing' },
    ])
  })

  it('compares every audited column, not just the first', () => {
    // A percentage adjustment writes kenyon_price AND full_price. A row where
    // only full_price moved since must not be restored.
    const plan = planRollback(
      [row(A, { kenyon_price: 100, full_price: 200 })],
      [row(A, { kenyon_price: 110, full_price: 220 })],
      [row(A, { kenyon_price: 110, full_price: 250 })],
    )
    expect(plan.restore).toEqual([])
    expect(plan.skipped).toEqual([{ id: A, reason: 'changed_since' }])
  })
})

describe('describeRollback', () => {
  it('says nothing happened when nothing did', () => {
    expect(describeRollback({ restore: [], skipped: [] })).toContain('לא היה מה לשחזר')
  })

  it('counts both kinds of skip separately', () => {
    const text = describeRollback({
      restore: [{ id: A }],
      skipped: [
        { id: B, reason: 'changed_since' },
        { id: C, reason: 'missing' },
      ],
    })
    expect(text).toContain('1')
    expect(text).toContain('שונו מאז')
    expect(text).toContain('כבר לא קיימים')
  })
})
