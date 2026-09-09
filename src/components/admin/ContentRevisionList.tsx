'use client'

import type { ContentRevision } from '@/lib/admin/content-pages'
import {
  type ContentPageActionState,
  rollbackContentPage,
} from '@/server/actions/admin/content-pages'
import { useActionState } from 'react'

/**
 * A page's history, and the one button that acts on it.
 *
 * RESTORING DOES NOT DELETE. `rollback_content_page` writes the chosen revision
 * forward as a new one, so the list only ever grows and the row an operator
 * restored from is still here afterwards. The label says "שחזור" and not
 * "ביטול" for that reason: nothing is undone, something is put back.
 *
 * The newest revision has no restore button, because restoring the state the
 * page is already in would append a revision that changes nothing - a row in
 * the history that means "somebody pressed a button".
 */

const INITIAL: ContentPageActionState = null

export default function ContentRevisionList({
  pageId,
  slug,
  revisions,
}: {
  pageId: string
  slug: string
  revisions: ContentRevision[]
}) {
  const [state, action, pending] = useActionState(rollbackContentPage, INITIAL)

  const error = state && 'error' in state ? state.error : null
  const success = state && 'success' in state ? state.success : null

  if (revisions.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        אין עדיין היסטוריה. כל שמירה מכאן ואילך תופיע ברשימה הזאת.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {error && <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      {success && (
        <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">{success}</div>
      )}

      <ul className="divide-y divide-gray-200">
        {revisions.map((revision, index) => (
          <li key={revision.revision} className="flex flex-wrap items-center gap-3 py-3">
            <span className="w-12 text-sm font-semibold text-gray-700">#{revision.revision}</span>
            <span className="text-sm text-gray-600">
              {new Date(revision.createdAt).toLocaleString('he-IL')}
            </span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {revision.status === 'published' ? 'פורסם' : 'טיוטה'}
            </span>
            {revision.actorEmail && (
              <span className="text-xs text-gray-500" dir="ltr">
                {revision.actorEmail}
              </span>
            )}
            {revision.note && <span className="text-sm text-gray-600">{revision.note}</span>}
            {index > 0 && (
              <form action={action} className="ms-auto">
                <input type="hidden" name="id" value={pageId} />
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="revision" value={revision.revision} />
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-50"
                >
                  שחזור
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
