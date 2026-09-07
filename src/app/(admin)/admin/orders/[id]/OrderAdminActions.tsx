'use client'

import { type OrderActionState, addOrderNote } from '@/server/actions/admin/orders'
import { refundOrder } from '@/server/actions/payments/refund'
import { refundOrderToWallet } from '@/server/actions/payments/refund-to-wallet'
import { AlertTriangle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useActionState, useState, useTransition } from 'react'

interface Props {
  orderId: string
  notes: string | null
  /** Empty means a card refund is currently legal, per describeRefundBlockers. */
  refundBlockers: string[]
}

const INITIAL: OrderActionState = null

/**
 * The two order actions section 4 lists that the screen did not have: a note,
 * and initiating a refund.
 *
 * The refund button is disabled when `describeRefundBlockers` found a reason,
 * and the reason is already printed above it by the page. planOrderRefund would
 * throw on the same conditions, so this only stops the admin from discovering
 * that after the click.
 */
export default function OrderAdminActions({ orderId, notes, refundBlockers }: Props) {
  const router = useRouter()
  const [noteState, noteAction, notePending] = useActionState(addOrderNote, INITIAL)
  const [pending, startTransition] = useTransition()
  const [reason, setReason] = useState('')
  const [defect, setDefect] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [refundError, setRefundError] = useState<string | null>(null)
  const [refundOk, setRefundOk] = useState<string | null>(null)
  const [walletReason, setWalletReason] = useState('')
  const [walletAmount, setWalletAmount] = useState('')
  const [walletConfirming, setWalletConfirming] = useState(false)
  const [walletError, setWalletError] = useState<string | null>(null)
  const [walletOk, setWalletOk] = useState<string | null>(null)

  const blocked = refundBlockers.length > 0

  function submitRefund() {
    setRefundError(null)
    setRefundOk(null)
    startTransition(async () => {
      const result = await refundOrder({ orderId, reason, isDefectClaim: defect })
      if (result.ok) {
        // Which of the two things happened is worth saying, because they are
        // not the same event on the statement: a cancellation never reaches the
        // clearing house, so the customer sees the charge disappear rather than
        // a separate credit landing days later, and no fee was taken.
        setRefundOk(
          result.replay
            ? 'ההזמנה כבר זוכתה קודם. לא בוצעה פעולה נוספת.'
            : result.cancelOnly
              ? `העסקה בוטלה לפני שידור לסליקה. ${result.refundedIls.toFixed(2)} ש״ח חוזרים במלואם, בלי דמי ביטול.`
              : `ההחזר יצא לביצוע: ${result.refundedIls.toFixed(2)} ש״ח לכרטיס${
                  result.feeIls > 0 ? `, אחרי ${result.feeIls.toFixed(2)} ש״ח דמי ביטול` : ''
                }.`,
        )
        setConfirming(false)
        router.refresh()
      } else {
        setRefundError(result.error)
      }
    })
  }

  /**
   * The wallet credit, which had no button on this screen even though the
   * blocked-refund notice beside it already told the admin it was the way out.
   *
   * It is NOT gated on `refundBlockers`, and that is the point: the blockers
   * are all reasons the CARD must not be touched (a voucher redeemed at the
   * counter, one that expired), and every one of them is a reason to reach for
   * this instead. A wallet credit carries no cancellation fee.
   *
   * It leaves the order and the line where they are, and it leaves a REDEEMED
   * voucher redeemed, because that one is true: the customer ate the meal. A
   * voucher still `issued` is voided with the credit. This paragraph used to
   * promise that no voucher moved at all, and that promise was what made the
   * ungated button reachable on an order holding a live coupon: the money went
   * back and the coupon stayed scannable for the balance alone.
   */
  function submitWalletRefund() {
    setWalletError(null)
    setWalletOk(null)
    const trimmed = walletAmount.trim()
    const partial = trimmed === '' ? undefined : Number(trimmed)
    if (partial !== undefined && (!Number.isFinite(partial) || partial <= 0)) {
      setWalletError('סכום לא תקין')
      return
    }
    startTransition(async () => {
      const result = await refundOrderToWallet({
        orderId,
        reason: walletReason,
        isDefectClaim: defect,
        partialAmountIls: partial,
      })
      if (result.ok) {
        setWalletOk(
          result.replay
            ? 'הזיכוי הזה כבר בוצע. לא נזקף סכום נוסף.'
            : `נזקפו ₪${result.creditedIls.toLocaleString('he-IL', { minimumFractionDigits: 2 })} לארנק הלקוח.`,
        )
        setWalletConfirming(false)
        router.refresh()
      } else {
        setWalletError(result.error)
      }
    })
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-800 mb-3">הערות</h2>

        {notes ? (
          <pre className="mb-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
            {notes}
          </pre>
        ) : (
          <p className="mb-3 text-sm text-gray-400">אין הערות</p>
        )}

        <form action={noteAction} className="space-y-2">
          <input type="hidden" name="id" value={orderId} />
          <textarea
            name="note"
            rows={3}
            placeholder="מה הוחלט ולמה"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
          />
          {noteState && 'error' in noteState && (
            <p className="text-xs text-red-600">{noteState.error}</p>
          )}
          {noteState && 'success' in noteState && (
            <p className="text-xs text-green-600">{noteState.success}</p>
          )}
          <button
            type="submit"
            disabled={notePending}
            className="bg-brand hover:bg-brand-primary-hover disabled:opacity-60 text-brand-dark text-sm font-semibold rounded-lg px-4 py-2 transition-colors"
          >
            {notePending ? 'שומר...' : 'הוספת הערה'}
          </button>
        </form>
        <p className="mt-2 text-xs text-gray-500">
          הערה נוספת לסוף הרשימה ולא דורסת קודמות, כדי שהסיבה שלפיה מישהו פעל תישמר.
        </p>
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-800 mb-3">החזר לכרטיס</h2>

        {blocked ? (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>ההחזר חסום מהסיבות שלמעלה. זיכוי לארנק הוא תנועה אחרת ואינו חסום.</span>
          </div>
        ) : (
          <div className="space-y-2">
            <label htmlFor="refund-reason" className="block text-xs font-medium text-gray-700">
              סיבת ההחזר
            </label>
            <input
              id="refund-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />

            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={defect}
                onChange={(e) => setDefect(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300"
              />
              ביטול עקב פגם או אי-התאמה (מבטל את דמי הביטול)
            </label>

            {refundError && <p className="text-xs text-red-600">{refundError}</p>}
            {refundOk && <p className="text-xs text-green-600">{refundOk}</p>}

            {confirming ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={submitRefund}
                  disabled={pending}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg px-4 py-2 transition-colors"
                >
                  {pending ? 'מבצע...' : 'אישור סופי, החזר לכרטיס'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-sm text-gray-500 hover:underline"
                >
                  ביטול
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={reason.trim().length < 3}
                className="border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 text-sm font-semibold rounded-lg px-4 py-2 transition-colors"
              >
                יזום החזר
              </button>
            )}
            <p className="text-xs text-gray-500">
              פעולה שלא ניתן לבטל. דמי הביטול הם הנמוך מבין 5% ו-100 ש״ח, ואינם נגבים בביטול עקב
              פגם.
            </p>
          </div>
        )}
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-5 md:col-span-2">
        <h2 className="font-semibold text-gray-800 mb-1">זיכוי לארנק</h2>
        <p className="mb-3 text-xs text-gray-500">
          לשובר שכבר מומש או שפג, ולזיכוי רצון טוב אחרי חלון 14 הימים. הכסף נזקף לארנק הלקוח ואין
          דמי ביטול. שובר שמומש נשאר מומש וההזמנה נשארת במצבה. שובר שעדיין פעיל מבוטל יחד עם הזיכוי,
          כדי שלא ייווצר מצב שבו הכסף חזר ללקוח והקופון עדיין ניתן למימוש בבית העסק.
        </p>

        <div className="space-y-2">
          <label htmlFor="wallet-reason" className="block text-xs font-medium text-gray-700">
            סיבת הזיכוי
          </label>
          <input
            id="wallet-reason"
            value={walletReason}
            onChange={(e) => setWalletReason(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-start focus:outline-none focus:ring-2 focus:ring-brand"
          />

          <label htmlFor="wallet-amount" className="block text-xs font-medium text-gray-700">
            סכום בשקלים (ריק = מלוא החיוב)
          </label>
          <input
            id="wallet-amount"
            inputMode="decimal"
            value={walletAmount}
            onChange={(e) => setWalletAmount(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-start focus:outline-none focus:ring-2 focus:ring-brand"
          />

          {walletError && <p className="text-xs text-red-600">{walletError}</p>}
          {walletOk && <p className="text-xs text-green-600">{walletOk}</p>}

          {walletConfirming ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={submitWalletRefund}
                disabled={pending}
                className="bg-brand hover:bg-brand-primary-hover disabled:opacity-60 text-brand-dark text-sm font-semibold rounded-lg px-4 py-2 transition-colors"
              >
                {pending ? 'מזכה...' : 'אישור סופי, זיכוי לארנק'}
              </button>
              <button
                type="button"
                onClick={() => setWalletConfirming(false)}
                className="text-sm text-gray-500 hover:underline"
              >
                ביטול
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setWalletConfirming(true)}
              disabled={walletReason.trim().length < 3}
              className="border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 text-sm font-semibold rounded-lg px-4 py-2 transition-colors"
            >
              יזום זיכוי לארנק
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
