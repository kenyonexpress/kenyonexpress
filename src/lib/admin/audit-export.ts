/**
 * CSV shape of the audit log: the same filters the page takes, one row per
 * entry, and the diff flattened to `field: before → after` lines so the
 * spreadsheet answers "what changed" without opening JSON.
 */

import type { CsvColumn } from '@/lib/reports/csv'
import type { AuditAction } from '@/types/database'
import { z } from 'zod'
import { AUDIT_ACTION_LABELS, labelFor } from './labels'

export const AUDIT_EXPORT_MAX_ROWS = 5000

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const auditExportParamsSchema = z.object({
  action: z.enum(Object.keys(AUDIT_ACTION_LABELS) as [AuditAction, ...AuditAction[]]).optional(),
  entity: z.string().trim().max(40).optional(),
  actor: z.string().uuid().optional(),
  from: z.string().regex(ISO_DATE).optional(),
  to: z.string().regex(ISO_DATE).optional(),
})

export type AuditExportParams = z.infer<typeof auditExportParamsSchema>

export interface AuditExportRow {
  id: string
  createdAt: string
  action: AuditAction
  entityType: string
  entityId: string | null
  actorName: string
  actorRole: string | null
  changes: unknown
  before: unknown
  after: unknown
  requestId: string | null
}

/** `field: before → after`, one per line, for whatever both snapshots hold. */
export function flattenDiff(before: unknown, after: unknown): string {
  const b = isRecord(before) ? before : {}
  const a = isRecord(after) ? after : {}
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].sort()
  const lines: string[] = []
  for (const key of keys) {
    const was = JSON.stringify(b[key] ?? null)
    const now = JSON.stringify(a[key] ?? null)
    if (was !== now) lines.push(`${key}: ${was} → ${now}`)
  }
  return lines.join('\n')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export const AUDIT_EXPORT_COLUMNS: readonly CsvColumn<AuditExportRow>[] = [
  { header: 'תאריך', value: (r) => r.createdAt },
  { header: 'פעולה', value: (r) => labelFor(AUDIT_ACTION_LABELS, r.action) },
  { header: 'ישות', value: (r) => r.entityType },
  { header: 'מזהה', value: (r) => r.entityId ?? '' },
  { header: 'משתמש', value: (r) => r.actorName },
  { header: 'תפקיד', value: (r) => r.actorRole ?? '' },
  { header: 'הפרש', value: (r) => flattenDiff(r.before, r.after) },
  { header: 'פרטים', value: (r) => (r.changes == null ? '' : JSON.stringify(r.changes)) },
  { header: 'בקשה', value: (r) => r.requestId ?? '' },
  { header: 'מזהה רשומה', value: (r) => r.id },
]
