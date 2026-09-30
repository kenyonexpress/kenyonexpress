'use client'

import { rollbackProductImportRun } from '@/server/actions/admin/product-import'
import { Undo2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

/**
 * The per-run undo on the import history page. One server action, one
 * confirm: the rollback deletes products the run inserted and restores the
 * columns it updated, and the history row re-renders as "בוטל" on refresh.
 */
export default function ImportRunUndoButton({ runId, label }: { runId: string; label: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  function undo() {
    if (
      !window.confirm(`לבטל את הייבוא "${label}"? מוצרים שנוספו יימחקו ומוצרים שעודכנו ישוחזרו.`)
    ) {
      return
    }
    start(async () => {
      const res = await rollbackProductImportRun(runId)
      if (res.error) {
        setMessage({ tone: 'error', text: res.error })
        return
      }
      const parts = [
        `נמחקו ${res.revertedInserts ?? 0}`,
        `שוחזרו ${res.revertedUpdates ?? 0}`,
        ...(res.skipped ? [`דולגו ${res.skipped} (נערכו אחרי הייבוא)`] : []),
        ...(res.failures ? [`נכשלו ${res.failures}`] : []),
      ]
      setMessage({ tone: res.failures ? 'error' : 'ok', text: parts.join(' · ') })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={undo}
        disabled={pending || message?.tone === 'ok'}
        className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Undo2 className="h-3.5 w-3.5" aria-hidden />
        {pending ? 'מבטל...' : 'ביטול הייבוא'}
      </button>
      {message ? (
        <span className={`text-xs ${message.tone === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>
          {message.text}
        </span>
      ) : null}
    </div>
  )
}
