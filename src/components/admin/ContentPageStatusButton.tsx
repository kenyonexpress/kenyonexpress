'use client'

import {
  type ContentPageActionState,
  setContentPageStatus,
} from '@/server/actions/admin/content-pages'
import { useActionState } from 'react'

/**
 * Publish or unpublish, without going through the editor.
 *
 * Its own form and its own action because it is its own decision: the text is
 * already right and the question is whether the public may read it. Folding it
 * into save would mean an operator cannot take a page down without also
 * re-saving whatever is currently in the body box.
 */

const INITIAL: ContentPageActionState = null

export default function ContentPageStatusButton({
  pageId,
  slug,
  status,
}: {
  pageId: string
  slug: string
  status: 'draft' | 'published'
}) {
  const [state, action, pending] = useActionState(setContentPageStatus, INITIAL)
  const next = status === 'published' ? 'draft' : 'published'
  const error = state && 'error' in state ? state.error : null

  return (
    <form action={action} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="id" value={pageId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="status" value={next} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-50"
      >
        {status === 'published' ? 'הסרה מפרסום' : 'פרסום'}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </form>
  )
}
