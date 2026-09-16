'use client'

import { BAN_REASON_MAX, type BanRecord } from '@/lib/admin/user-ban'
import { type UserActionState, banUser, unbanUser } from '@/server/actions/admin/users'
import { useActionState } from 'react'

interface Props {
  userId: string
  record: BanRecord | null
  /** false while migration 237 is unapplied: the lock still works, the record does not. */
  recordAvailable: boolean
  canWrite: boolean
}

const INITIAL: UserActionState = null

/**
 * The ban control on the user 360 page.
 *
 * Two forms, never both: a banned account shows its record and an unban
 * button, an active one shows a reason box and a ban button. The ban button
 * asks for confirmation in the browser because the effect is immediate
 * (proxy.ts re-validates the session on every request) and there is no
 * undo other than pressing the other button.
 */
export default function UserBanClient({ userId, record, recordAvailable, canWrite }: Props) {
  const [banState, banAction, banPending] = useActionState(banUser, INITIAL)
  const [unbanState, unbanAction, unbanPending] = useActionState(unbanUser, INITIAL)
  const banned = Boolean(record?.banned_at)
  const state = banned ? unbanState : banState

  return (
    <div className="space-y-2">
      {banned ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
          <p className="font-semibold">החשבון חסום</p>
          <p className="mt-1 text-red-800">
            מאז {record?.banned_at ? new Date(record.banned_at).toLocaleString('he-IL') : ''}
          </p>
          {record?.ban_reason && <p className="mt-1 whitespace-pre-line">{record.ban_reason}</p>}
        </div>
      ) : (
        <p className="text-xs text-black/50">
          {recordAvailable
            ? 'החשבון פעיל.'
            : 'רישום החסימה בפרופיל אינו זמין עד להחלת מיגרציה 237; החסימה עצמה פועלת.'}
        </p>
      )}

      {canWrite &&
        (banned ? (
          <form action={unbanAction}>
            <input type="hidden" name="user_id" value={userId} />
            <button
              type="submit"
              disabled={unbanPending}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-60"
            >
              {unbanPending ? '...' : 'הסרת החסימה'}
            </button>
          </form>
        ) : (
          <form
            action={banAction}
            className="space-y-2"
            onSubmit={(event) => {
              if (!window.confirm('לחסום את המשתמש? הכניסה תיחסם מיד, בכל המכשירים.')) {
                event.preventDefault()
              }
            }}
          >
            <input type="hidden" name="user_id" value={userId} />
            <label htmlFor="ban-reason" className="block text-xs text-black/50">
              סיבת החסימה (פנימי, לא מוצג ללקוח)
            </label>
            <textarea
              id="ban-reason"
              name="reason"
              rows={2}
              maxLength={BAN_REASON_MAX}
              className="w-full rounded-lg border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="למשל: הכחשת עסקה שלישית בחודש"
            />
            <button
              type="submit"
              disabled={banPending}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
            >
              {banPending ? '...' : 'חסימת המשתמש'}
            </button>
          </form>
        ))}

      {state && 'error' in state && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
      {state && 'success' in state && <p className="text-xs text-green-700">{state.success}</p>}
    </div>
  )
}
