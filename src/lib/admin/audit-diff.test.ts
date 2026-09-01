import { diffAuditChanges, summariseAuditDiff } from '@/lib/admin/audit-diff'
import { describe, expect, it } from 'vitest'

/**
 * The fixtures are real `audit_log.changes` payloads from production, trimmed
 * to the fields that matter for each case. The full rows carry about sixty
 * columns each, which is the whole reason this function exists.
 */

/** Production row 2026-08-31 19:33: the only real change was status. */
const STATUS_ONLY = {
  old: {
    id: '99382767-43db-4425-8577-4d475e16ff50',
    slug: 'restaurants-meat-2',
    name_he: 'בשר במסעדה',
    status: 'active',
    price_ils: 0.0,
    platform_percent: 30.0,
    tags: [],
    attributes: {},
    updated_at: '2026-08-31T14:54:35.16801+00:00',
  },
  new: {
    id: '99382767-43db-4425-8577-4d475e16ff50',
    slug: 'restaurants-meat-2',
    name_he: 'בשר במסעדה',
    status: 'draft',
    price_ils: 0.0,
    platform_percent: 30.0,
    tags: [],
    attributes: {},
    updated_at: '2026-08-31T19:33:25.637461+00:00',
  },
}

describe('diffAuditChanges', () => {
  it('reduces a sixty-field payload to the one field that moved', () => {
    const diff = diffAuditChanges(STATUS_ONLY)

    expect(diff.shape).toBe('update')
    expect(diff.changes).toEqual([
      { field: 'status', before: 'active', after: 'draft', kind: 'changed' },
    ])
  })

  it('suppresses updated_at, which differs in every single update', () => {
    // Left in, every diff would carry a noise line and a one-change edit would
    // read as two.
    const diff = diffAuditChanges(STATUS_ONLY)
    expect(diff.suppressed).toBe(1)
    expect(diff.changes.map((c) => c.field)).not.toContain('updated_at')
  })

  it('does not report equal arrays and objects as changed', () => {
    // Both sides carry `tags: []` and `attributes: {}` as distinct instances.
    // Reference equality would call every one of them a change.
    const diff = diffAuditChanges(STATUS_ONLY)
    expect(diff.changes.map((c) => c.field)).not.toContain('tags')
    expect(diff.changes.map((c) => c.field)).not.toContain('attributes')
  })

  it('reports a real array change', () => {
    const diff = diffAuditChanges({
      old: { images: ['/a.webp'] },
      new: { images: ['/a.webp', '/b.webp'] },
    })
    expect(diff.changes).toEqual([
      { field: 'images', before: ['/a.webp'], after: ['/a.webp', '/b.webp'], kind: 'changed' },
    ])
  })

  it('distinguishes added, removed and changed', () => {
    const diff = diffAuditChanges({
      old: { a: null, b: 'gone', c: 1 },
      new: { a: 'now set', b: null, c: 2 },
    })
    expect(diff.changes).toEqual([
      { field: 'a', before: null, after: 'now set', kind: 'added' },
      { field: 'b', before: 'gone', after: null, kind: 'removed' },
      { field: 'c', before: 1, after: 2, kind: 'changed' },
    ])
  })

  it('reads a create as a create and a delete as a delete', () => {
    expect(diffAuditChanges({ new: { id: 'x', status: 'active' } }).shape).toBe('create')
    expect(diffAuditChanges({ old: { id: 'x', status: 'active' } }).shape).toBe('delete')
  })

  it('returns unknown instead of throwing on a payload it does not recognise', () => {
    // A future trigger with a different shape must not break the page that
    // lists every other row.
    for (const payload of [null, undefined, 'a string', 42, [], {}, { unrelated: 1 }]) {
      expect(() => diffAuditChanges(payload)).not.toThrow()
      expect(diffAuditChanges(payload).shape).toBe('unknown')
    }
  })

  it('treats a money field that did not move as unchanged despite formatting', () => {
    // 0.00 and 0 are the same number once parsed out of jsonb.
    const diff = diffAuditChanges({ old: { price_ils: 0.0 }, new: { price_ils: 0 } })
    expect(diff.changes).toEqual([])
  })
})

describe('summariseAuditDiff', () => {
  it('names the fields rather than counting them', () => {
    expect(summariseAuditDiff(diffAuditChanges(STATUS_ONLY))).toBe('status')
  })

  it('names the first few and counts the rest', () => {
    const diff = diffAuditChanges({
      old: { a: 1, b: 1, c: 1, d: 1, e: 1 },
      new: { a: 2, b: 2, c: 2, d: 2, e: 2 },
    })
    expect(summariseAuditDiff(diff)).toBe('a, b, c, ועוד 2')
  })

  it('says so when the only differences were suppressed', () => {
    const diff = diffAuditChanges({
      old: { id: 'x', updated_at: '2026-01-01T00:00:00Z' },
      new: { id: 'x', updated_at: '2026-02-02T00:00:00Z' },
    })
    expect(diff.changes).toEqual([])
    expect(summariseAuditDiff(diff)).toBe('ללא שינוי מהותי')
  })
})
