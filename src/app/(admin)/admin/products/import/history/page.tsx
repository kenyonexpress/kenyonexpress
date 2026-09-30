import ImportRunUndoButton from '@/components/admin/ImportRunUndoButton'
import { formatDateTime } from '@/lib/account/format'
import {
  IMPORT_RUN_STATUS_LABEL,
  type ImportRunStatus,
  type ImportRunSummary,
  rollbackRefusal,
} from '@/lib/admin/product-import/import-history'
import { requireAdminPage } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import { listProductImportRuns } from '@/server/queries/product-import-history'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'היסטוריית ייבוא מוצרים' }

/**
 * Every product import run, newest first, folded out of `audit_log` (see
 * `lib/admin/product-import/import-history.ts` for why the audit log and not
 * a table). Each row shows what the admin saw at the dry run, what was
 * applied, how it ended, the first row errors, and an undo for runs that
 * still have something to undo.
 *
 * Admin-only, not staff: the audit log's RLS returns nothing to a
 * content_uploader anyway, and the import itself needs an admin session.
 */

const STATUS_COLOR: Record<ImportRunStatus, string> = {
  running: 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
  partial: 'bg-amber-100 text-amber-800',
  failed: 'bg-red-100 text-red-700',
  rolled_back: 'bg-gray-100 text-gray-600',
}

const btnGhost =
  'inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50'

function RunErrors({ run }: { run: ImportRunSummary }) {
  if (run.rowErrors.length === 0 && !run.error) return null
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-gray-600">
        שגיאות ({run.rowErrors.length}
        {run.failed > run.rowErrors.length ? ` מתוך ${run.failed}` : ''})
      </summary>
      {run.error ? <p className="mt-1 text-red-700">{run.error}</p> : null}
      <ul className="mt-1 space-y-0.5">
        {run.rowErrors.slice(0, 50).map((r) => (
          <li key={`${r.line}-${r.slug ?? ''}`} className="text-gray-700">
            שורה {r.line}
            {r.slug ? (
              <>
                {' '}
                <span className="font-mono" dir="ltr">
                  {r.slug}
                </span>
              </>
            ) : null}
            : {r.errors.join(' | ')}
          </li>
        ))}
      </ul>
    </details>
  )
}

export default async function ProductImportHistoryPage() {
  await requireAdminPage()

  const supabase = await createClient()
  const { runs, error, truncated } = await listProductImportRuns(supabase)

  // actor_id points at auth.users, so PostgREST cannot embed profiles here;
  // one batched lookup. A failed lookup shows "מערכת" for everyone, and says so.
  const actorIds = [...new Set((runs ?? []).flatMap((r) => (r.actorId ? [r.actorId] : [])))]
  const { data: actors, error: actorsError } = actorIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', actorIds)
    : { data: [], error: null }
  const actorById = new Map((actors ?? []).map((a) => [a.id, a.full_name ?? a.email]))
  const now = Date.now()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">היסטוריית ייבוא מוצרים</h1>
        <Link href="/admin/products/import" className={btnGhost}>
          <ArrowRight className="h-4 w-4" aria-hidden />
          לייבוא חדש
        </Link>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          קריאת ההיסטוריה נכשלה: {error}
        </p>
      ) : null}
      {actorsError ? (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          שמות המבצעים לא נטענו: {actorsError.message}
        </p>
      ) : null}
      {truncated ? (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          מוצגות הריצות האחרונות בלבד; ריצות ישנות יותר נמצאות בלוג הפעילות.
        </p>
      ) : null}

      {runs && runs.length === 0 ? (
        <p className="rounded-xl border border-black/10 bg-white p-6 text-sm text-gray-600">
          עדיין לא בוצע ייבוא מקובץ.
        </p>
      ) : null}

      {runs && runs.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-gray-500">
                <th className="px-4 py-2 text-start font-medium">מועד</th>
                <th className="px-4 py-2 text-start font-medium">קובץ</th>
                <th className="px-4 py-2 text-start font-medium">מי</th>
                <th className="px-4 py-2 text-start font-medium">מצב</th>
                <th className="px-4 py-2 text-start font-medium">בדיקה</th>
                <th className="px-4 py-2 text-start font-medium">נוספו</th>
                <th className="px-4 py-2 text-start font-medium">עודכנו</th>
                <th className="px-4 py-2 text-start font-medium">נכשלו</th>
                <th className="px-4 py-2 text-start font-medium">סטטוס</th>
                <th className="px-4 py-2 text-start font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const refusal = rollbackRefusal(run, now)
                return (
                  <tr key={run.id} className="border-b border-black/5 align-top">
                    <td className="whitespace-nowrap px-4 py-2 text-gray-700">
                      {formatDateTime(run.startedAt)}
                    </td>
                    <td className="max-w-56 truncate px-4 py-2 text-gray-900" dir="ltr">
                      {run.fileName || '-'}
                    </td>
                    <td className="px-4 py-2 text-gray-700">
                      {(run.actorId && actorById.get(run.actorId)) || 'מערכת'}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {run.mode === 'upsert' ? 'הוספה ועדכון' : 'הוספה בלבד'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-gray-600">
                      {run.totalRows} שורות · {run.validRows} תקינות · {run.invalidRows} שגויות
                    </td>
                    <td className="px-4 py-2 text-emerald-700">{run.inserted}</td>
                    <td className="px-4 py-2 text-emerald-700">{run.updated}</td>
                    <td
                      className={`px-4 py-2 ${run.failed > 0 ? 'text-red-700' : 'text-gray-600'}`}
                    >
                      {run.failed}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[run.status]}`}
                      >
                        {IMPORT_RUN_STATUS_LABEL[run.status]}
                      </span>
                      {run.rollback ? (
                        <p className="mt-1 text-xs text-gray-500">
                          {formatDateTime(run.rollback.at)}: נמחקו {run.rollback.revertedInserts},
                          שוחזרו {run.rollback.revertedUpdates}
                          {run.rollback.skipped ? `, דולגו ${run.rollback.skipped}` : ''}
                          {run.rollback.failures ? `, נכשלו ${run.rollback.failures}` : ''}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 space-y-2">
                      {refusal === null ? (
                        <ImportRunUndoButton
                          runId={run.id}
                          label={run.fileName || run.id.slice(0, 8)}
                        />
                      ) : null}
                      <RunErrors run={run} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
