'use client'

import { formatDateShort, formatNumber } from '@/lib/i18n/format'
import {
  type ResendEmailState,
  type ViewAsState,
  type WalletCreditState,
  creditCustomerWallet,
  resendTransactionalEmail,
  startCustomerViewAs,
} from '@/server/actions/admin/customer'
import type { CustomerEmailRow } from '@/server/queries/admin-customer'
import { useActionState } from 'react'

/**
 * The three write tools, and the button that opens the read-only view.
 *
 * EVERY FORM CARRIES A REQUIRED REASON FIELD and the server refuses without
 * one. `required` on the input is a courtesy that saves a round trip; the
 * refusal is in `server/actions/admin/customer.ts` and is the boundary.
 *
 * `canCredit` and `canViewAs` are separate props because they are separate
 * permissions: a manual credit is `payments:write` and impersonation is
 * `users:write`. A single `isAdmin` flag would have made the page lie to a
 * support operator about which of the two they can do.
 */

const CREDIT_INITIAL: WalletCreditState = null
const RESEND_INITIAL: ResendEmailState = null
const VIEW_AS_INITIAL: ViewAsState = null

const FIELD =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-start focus:outline-none focus:ring-2 focus:ring-brand'
const BUTTON =
  'rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-brand-primary-hover disabled:opacity-60'

function Result({ state }: { state: { error: string } | { success: string } | null }) {
  if (!state) return null
  if ('error' in state) return <p className="text-sm text-red-600">{state.error}</p>
  return <p className="text-sm text-emerald-700">{state.success}</p>
}

export default function CustomerSupportTools({
  userId,
  emails,
  canCredit,
  canViewAs,
  maxCreditIls,
}: {
  userId: string
  emails: readonly CustomerEmailRow[]
  canCredit: boolean
  canViewAs: boolean
  maxCreditIls: number
}) {
  const [credit, creditAction, creditPending] = useActionState(creditCustomerWallet, CREDIT_INITIAL)
  const [resend, resendAction, resendPending] = useActionState(
    resendTransactionalEmail,
    RESEND_INITIAL,
  )
  const [viewAs, viewAsAction, viewAsPending] = useActionState(startCustomerViewAs, VIEW_AS_INITIAL)

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {canCredit && (
        <form
          action={creditAction}
          className="space-y-3 rounded-xl border border-black/10 bg-white p-5"
        >
          <h2 className="text-sm font-semibold text-gray-800">זיכוי ידני לארנק</h2>
          <input type="hidden" name="user_id" value={userId} />

          <label htmlFor="credit-amount" className="block text-xs text-black/50">
            סכום בשקלים
          </label>
          <input
            id="credit-amount"
            name="amount_ils"
            type="number"
            min="0.01"
            max={maxCreditIls}
            step="0.01"
            required
            dir="ltr"
            className={FIELD}
          />

          <label htmlFor="credit-reason" className="block text-xs text-black/50">
            סיבה (חובה)
          </label>
          <textarea
            id="credit-reason"
            name="reason"
            rows={2}
            minLength={3}
            required
            className={FIELD}
          />

          <p className="text-xs text-black/40">
            הזיכוי נרשם ביומן עם שם המבצע והסיבה, ותקרת הזיכוי היא ₪{formatNumber(maxCreditIls)}.
          </p>

          <Result state={credit} />
          <button type="submit" disabled={creditPending} className={BUTTON}>
            {creditPending ? 'מזכה...' : 'זיכוי'}
          </button>
        </form>
      )}

      <form
        action={resendAction}
        className="space-y-3 rounded-xl border border-black/10 bg-white p-5"
      >
        <h2 className="text-sm font-semibold text-gray-800">שליחה חוזרת של מייל</h2>

        {emails.length === 0 ? (
          /* Not a disabled control with no explanation. The outbox is empty for
             this customer, which is a fact about them and not about the tool. */
          <p className="text-xs text-black/40">לא נשלחו ללקוח הזה מיילים דרך התור.</p>
        ) : (
          <>
            <label htmlFor="resend-outbox" className="block text-xs text-black/50">
              המייל לשליחה
            </label>
            <select id="resend-outbox" name="outbox_id" required className={FIELD}>
              {emails.map((mail) => (
                <option key={mail.id} value={mail.id}>
                  {mail.kind} · {mail.statusHe} · {formatDateShort(mail.createdAt)}
                </option>
              ))}
            </select>

            <label htmlFor="resend-reason" className="block text-xs text-black/50">
              סיבה (חובה)
            </label>
            <textarea
              id="resend-reason"
              name="reason"
              rows={2}
              minLength={3}
              required
              className={FIELD}
            />

            {/* "Queued", not "sent". The outbox is drained by the notifications
                cron, so the mail leaves on that pass and not on this press. */}
            <p className="text-xs text-black/40">
              המייל נכנס לתור ונשלח בריצת ה-cron הבאה. כתובת חסומה לא תקבל אותו.
            </p>

            <Result state={resend} />
            <button type="submit" disabled={resendPending} className={BUTTON}>
              {resendPending ? 'שולח...' : 'שליחה חוזרת'}
            </button>
          </>
        )}
      </form>

      {canViewAs && (
        <form
          action={viewAsAction}
          className="space-y-3 rounded-xl border border-black/10 bg-white p-5"
        >
          <h2 className="text-sm font-semibold text-gray-800">צפייה כלקוח</h2>
          <input type="hidden" name="user_id" value={userId} />

          <label htmlFor="view-as-reason" className="block text-xs text-black/50">
            סיבה (חובה)
          </label>
          <textarea
            id="view-as-reason"
            name="reason"
            rows={2}
            minLength={3}
            required
            className={FIELD}
          />

          <p className="text-xs text-black/40">
            מצב קריאה בלבד, לחצי שעה, ונרשם ביומן לפני הפתיחה. אי אפשר לבצע פעולות בשם הלקוח.
          </p>

          <Result state={viewAs} />
          <button type="submit" disabled={viewAsPending} className={BUTTON}>
            {viewAsPending ? 'פותח...' : 'צפייה כלקוח'}
          </button>
        </form>
      )}
    </div>
  )
}
