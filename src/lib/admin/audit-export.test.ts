import { toCsv } from '@/lib/reports/csv'
import { describe, expect, it } from 'vitest'
import { AUDIT_EXPORT_COLUMNS, auditExportParamsSchema, flattenDiff } from './audit-export'

describe('flattenDiff', () => {
  it('lists only the fields that moved, sorted, one per line', () => {
    expect(flattenDiff({ a: 1, b: 'x', c: null }, { a: 1, b: 'y', d: true })).toBe(
      'b: "x" → "y"\nd: null → true',
    )
  })

  it('is empty for two equal or two absent snapshots', () => {
    expect(flattenDiff(null, null)).toBe('')
    expect(flattenDiff({ a: 1 }, { a: 1 })).toBe('')
    expect(flattenDiff([1], 'nope')).toBe('')
  })
})

describe('auditExportParamsSchema', () => {
  it('takes the page filters and refuses a malformed date or actor', () => {
    expect(
      auditExportParamsSchema.safeParse({ from: '2026-09-01', action: 'updated' }).success,
    ).toBe(true)
    expect(auditExportParamsSchema.safeParse({ from: '01/09/2026' }).success).toBe(false)
    expect(auditExportParamsSchema.safeParse({ actor: 'me' }).success).toBe(false)
    expect(auditExportParamsSchema.safeParse({ action: 'exploded' }).success).toBe(false)
  })
})

describe('AUDIT_EXPORT_COLUMNS', () => {
  it('renders the diff inside one quoted cell', () => {
    const csv = toCsv(
      [
        {
          id: 'r1',
          createdAt: '2026-09-22T10:00:00Z',
          action: 'status_change',
          entityType: 'profiles',
          entityId: 'u1',
          actorName: 'דנה',
          actorRole: 'admin',
          changes: { ban: 'ban', reason: 'הונאה' },
          before: { banned_until: null },
          after: { banned_until: '2126-09-22T10:00:00Z' },
          requestId: null,
        },
      ],
      AUDIT_EXPORT_COLUMNS,
    )
    expect(csv).toContain('שינוי סטטוס')
    expect(csv).toContain('"banned_until: null → ""2126-09-22T10:00:00Z"""')
  })
})
