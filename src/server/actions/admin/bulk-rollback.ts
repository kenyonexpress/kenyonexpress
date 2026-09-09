'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import {
  BULK_OPERATION_LABELS,
  type BulkOperationKind,
  type BulkSnapshotRow,
  describeRollback,
  planRollback,
} from '@/lib/admin/bulk-rollback'
import { requireAdminSession } from '@/lib/admin/rbac'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath, updateTag } from 'next/cache'

export type BulkRollbackState = { error: string } | { success: string } | null

/** The audit rows an undo can read: bulk product operations, newest first. */
const ROLLBACK_SELECT = 'id, created_at, metadata, before, after, changes'

function isBulkKind(value: unknown): value is BulkOperationKind {
  return value === 'assign_category' || value === 'adjust_prices' || value === 'update_status'
}

function asRows(value: unknown): BulkSnapshotRow[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (row): row is BulkSnapshotRow =>
      typeof row === 'object' && row !== null && typeof (row as { id?: unknown }).id === 'string',
  )
}

/**
 * Undoes the most recent bulk product operation.
 *
 * =========================================================================
 * IT READS THE AUDIT LOG, WHICH IS WHY THERE IS NO NEW TABLE
 * =========================================================================
 *
 * `audit_log` has carried `before` and `after` jsonb columns since 169
 * (verified against production 2026-09-10) and `writeAuditLog` never wrote
 * either. Adding a `bulk_operations` table instead would have been a migration
 * sitting in `migrations/pending/` waiting for approval, and a feature that
 * ships dead. The ledger that already exists is append-only, already audited,
 * and already holds one row per operation.
 *
 * =========================================================================
 * PARTIAL BY DESIGN
 * =========================================================================
 *
 * `planRollback` refuses any product whose current value no longer matches what
 * the bulk operation left there, because reverting it would silently throw away
 * a later hand edit. The result says how many were restored and how many were
 * skipped and why. A partial undo that names what it did not touch is worth
 * more than a complete one nobody can trust.
 *
 * =========================================================================
 * THE UNDO IS ITSELF AUDITED
 * =========================================================================
 *
 * With its own `before`/`after`, so undoing an undo is the ordinary case rather
 * than a special one, and so the ledger never contains a state change with no
 * row behind it (V2 principle 2).
 *
 * It does NOT delete or amend the original row. An append-only ledger that
 * erases the thing being undone cannot answer "what happened here", which is
 * the only question it exists for.
 */
async function runRollbackLastBulkOperation(): Promise<BulkRollbackState> {
  // ADMIN TIER, not `requireStaffSession`, and `uploader-prohibitions.test.ts`
  // caught the first draft using the weaker one. A single undo can revert a
  // bulk PRICE change, and `content_uploader` is the role that may load
  // catalogue copy and never touch money -- `canSeeMoney` is false for it and
  // `applyUploaderPolicy` exists to strip pricing out of its writes. A guard
  // that admits it here would hand it every price in one click, through the
  // one door nobody thought to check.
  let session: Awaited<ReturnType<typeof requireAdminSession>>
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  // The service client, like every other `audit_log` read: RLS blocks
  // `authenticated` from the table entirely (011), which is deliberate.
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('audit_log')
    .select(ROLLBACK_SELECT)
    .eq('entity_type', 'products')
    .not('metadata->>bulk_operation', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    log.error('admin.bulk_rollback_read_failed', { reason: error.message })
    return { error: 'לא ניתן לקרוא את יומן הפעולות.' }
  }
  if (!data) {
    return { error: 'לא נמצאה פעולה קבוצתית לשחזור.' }
  }

  const row = data as unknown as {
    id: string
    metadata: { bulk_operation?: unknown; rolled_back_from?: unknown } | null
    before: unknown
    after: unknown
  }

  const kind = row.metadata?.bulk_operation
  if (!isBulkKind(kind)) {
    return { error: 'הפעולה האחרונה אינה ניתנת לשחזור.' }
  }

  // An operation recorded before this shipped has no `before`, and there is
  // nothing to restore from. Said plainly rather than reported as an empty
  // success, which would read as "there was nothing to undo".
  const before = asRows(row.before)
  const after = asRows(row.after)
  if (before.length === 0) {
    return {
      error: `הפעולה האחרונה (${BULK_OPERATION_LABELS[kind]}) נרשמה בלי מצב קודם ולכן אינה ניתנת לשחזור.`,
    }
  }

  const columns = [...new Set(after.flatMap((entry) => Object.keys(entry)))].filter(
    (column) => column !== 'id',
  )
  if (columns.length === 0) {
    return { error: 'הפעולה האחרונה לא רשמה אילו עמודות השתנו.' }
  }

  const supabase = await createClient()
  const ids = before.map((entry) => entry.id)
  const { data: currentRows, error: currentError } = await supabase
    .from('products')
    .select(['id', ...columns].join(', '))
    .in('id', ids)

  if (currentError) {
    log.error('admin.bulk_rollback_current_failed', { reason: currentError.message })
    return { error: currentError.message }
  }

  const plan = planRollback(before, after, asRows(currentRows))

  // One statement per product rather than one bulk update: each row is being
  // restored to a DIFFERENT value, which is exactly what a single `.in()`
  // update cannot express.
  const restored: BulkSnapshotRow[] = []
  const wasBefore: BulkSnapshotRow[] = []
  for (const patch of plan.restore) {
    const { id, ...values } = patch
    const { error: updateError } = await supabase.from('products').update(values).eq('id', id)
    if (updateError) {
      log.error('admin.bulk_rollback_update_failed', { productId: id, reason: updateError.message })
      return { error: updateError.message }
    }
    restored.push(patch)
    wasBefore.push({
      id,
      ...Object.fromEntries(columns.map((c) => [c, after.find((a) => a.id === id)?.[c] ?? null])),
    })
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'restored',
    entityType: 'products',
    changes: {
      rolled_back_audit_id: row.id,
      kind,
      restored: restored.length,
      skipped: plan.skipped,
    },
    // No `bulk_operation` key, so an undo is not itself the next undo's target
    // and clicking twice cannot ping-pong the catalogue.
    metadata: { rolled_back_from: row.id },
    before: wasBefore,
    after: restored,
  })

  revalidatePath('/admin/products')
  updateTag(CATALOGUE_TAG)
  return { success: `${BULK_OPERATION_LABELS[kind]}: ${describeRollback(plan)}` }
}

export async function rollbackLastBulkOperation(): Promise<BulkRollbackState> {
  return withActionContext('admin.bulk.rollback', () => runRollbackLastBulkOperation())
}
