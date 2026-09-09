'use client'

import { formatVoucherCode } from '@/lib/admin/voucher-view'
import { agorot, formatAgorot } from '@/lib/money'
import { toJerusalemDateInput } from '@/lib/vouchers/expiry-date'
import {
  type AdminVoucherExtendState,
  type AdminVoucherLookupState,
  type AdminVoucherRedeemState,
  type AdminVoucherResendState,
  extendVoucherExpiry,
  lookupAdminVoucher,
  redeemAdminVoucher,
  resendVoucherEmail,
} from '@/server/actions/admin/vouchers'
import { useActionState } from 'react'

const LOOKUP_INITIAL: AdminVoucherLookupState = null
const REDEEM_INITIAL: AdminVoucherRedeemState = null
const RESEND_INITIAL: AdminVoucherResendState = null
const EXTEND_INITIAL: AdminVoucherExtendState = null

function ils(agorotValue: number): string {
  return formatAgorot(agorot(agorotValue))
}

export default function VoucherLookupForm({ canRedeem }: { canRedeem: boolean }) {
  const [lookup, lookupAction, lookupPending] = useActionState(lookupAdminVoucher, LOOKUP_INITIAL)
  const [redeem, redeemAction, redeemPending] = useActionState(redeemAdminVoucher, REDEEM_INITIAL)
  const [resend, resendAction, resendPending] = useActionState(resendVoucherEmail, RESEND_INITIAL)
  const [extend, extendAction, extendPending] = useActionState(extendVoucherExpiry, EXTEND_INITIAL)
  const voucher = lookup && 'voucher' in lookup ? lookup.voucher : null

  /*
    The two dates the date input is bounded by.

    `min` is tomorrow in Israel, because `extend_voucher_expiry` refuses a
    deadline that is not later than the current one and refuses one already in
    the past; letting an operator pick today only to be told no is a round trip
    they can be spared.

    `max` is the supplier's offer end, which the DB CHECK
    `vouchers_expires_within_offer` enforces anyway. Enforcing it here as well
    turns a constraint violation after typing a reason into a date picker that
    simply does not offer the wrong day. The server still refuses it: a `max`
    attribute is a convenience and not a boundary.
  */
  const minDate = voucher
    ? toJerusalemDateInput(new Date(Math.max(Date.now(), new Date(voucher.expiresAt).getTime())))
    : undefined
  const maxDate = voucher?.offerValidUntil
    ? toJerusalemDateInput(new Date(voucher.offerValidUntil))
    : undefined

  return (
    <div className="space-y-6">
      <form
        action={lookupAction}
        className="max-w-md space-y-3 rounded-xl border border-gray-200 bg-white p-5"
      >
        <label htmlFor="voucher-code" className="block text-sm font-medium text-gray-800">
          קוד שובר
        </label>
        <input
          id="voucher-code"
          name="code"
          dir="ltr"
          autoComplete="off"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
        {lookup && 'error' in lookup ? (
          <p className="text-sm text-red-600">{lookup.error}</p>
        ) : null}
        <button
          type="submit"
          disabled={lookupPending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-brand-primary-hover disabled:opacity-60"
        >
          {lookupPending ? 'בודק...' : 'איתור'}
        </button>
      </form>

      {voucher ? (
        <section className="max-w-xl space-y-4 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-gray-900">
            <span dir="ltr">{formatVoucherCode(voucher.code)}</span>
          </h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-gray-500">סטטוס</dt>
              <dd>{voucher.status}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">מוצר</dt>
              <dd>{voucher.productName ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">ספק</dt>
              <dd>{voucher.supplierName ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">תוקף</dt>
              <dd>{new Date(voucher.expiresAt).toLocaleString('he-IL')}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">שווי פנים</dt>
              <dd dir="ltr">{ils(voucher.faceValueAgorot)}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">שולם באתר</dt>
              <dd dir="ltr">{ils(voucher.couponPriceAgorot)}</dd>
            </div>
          </dl>

          {canRedeem && voucher.scannable ? (
            <form action={redeemAction} className="space-y-3 border-t border-gray-100 pt-4">
              <input type="hidden" name="code" value={voucher.code} />
              <label htmlFor="redeem-reason" className="block text-xs font-medium text-gray-700">
                סיבת מימוש ידני
              </label>
              <input
                id="redeem-reason"
                name="reason"
                required
                minLength={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
              {redeem && 'error' in redeem ? (
                <p className="text-sm text-red-600">{redeem.error}</p>
              ) : null}
              {redeem && 'success' in redeem ? (
                <p className="text-sm text-green-700">{redeem.success}</p>
              ) : null}
              <button
                type="submit"
                disabled={redeemPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {redeemPending ? 'ממש...' : 'מימוש ידני'}
              </button>
              <p className="text-xs text-gray-500">פעולה שלא ניתן לבטל. נרשמת בלוג הפעילות.</p>
            </form>
          ) : (
            <p className="text-sm text-gray-500">
              {voucher.scannable
                ? 'מימוש ידני זמין למנהלים בלבד.'
                : 'השובר אינו ניתן למימוש במצב הנוכחי.'}
            </p>
          )}

          {/*
            Deliberately NOT gated on `scannable`, unlike the redemption above.
            Redemption spends the voucher and must refuse a spent or lapsed one;
            resending is a delivery operation and changes nothing. What is
            actually mailable is the server's call -- it reads the order's
            `issued` vouchers and answers "no active vouchers" when there are
            none -- and a UI that guessed at that would hide the button in
            exactly the case where support most wants to press it.
          */}
          {canRedeem ? (
            <form action={resendAction} className="space-y-3 border-t border-gray-100 pt-4">
              <input type="hidden" name="code" value={voucher.code} />
              <label htmlFor="resend-reason" className="block text-xs font-medium text-gray-700">
                סיבת שליחה חוזרת
              </label>
              <input
                id="resend-reason"
                name="reason"
                required
                minLength={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
              {resend && 'error' in resend ? (
                <p className="text-sm text-red-600">{resend.error}</p>
              ) : null}
              {resend && 'success' in resend ? (
                <p className="text-sm text-green-700">{resend.success}</p>
              ) : null}
              <button
                type="submit"
                disabled={resendPending}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
              >
                {resendPending ? 'שולח...' : 'שליחת המייל שוב'}
              </button>
              <p className="text-xs text-gray-500">
                שולח ללקוח את שוברי ההזמנה הפעילים. לא משנה את השובר. נרשמת בלוג הפעילות.
              </p>
            </form>
          ) : null}

          {/*
            Offered for an EXPIRED voucher too, and that is the whole point.
            Nobody calls support about a coupon that still works; the request
            arrives after the customer stood at a counter and was refused. The
            server decides what is actually extendable -- and refuses a revival
            once the expiry credit has been paid, because reviving that coupon
            would hand the customer the money and the code both.
          */}
          {canRedeem && (voucher.status === 'issued' || voucher.status === 'expired') ? (
            <form action={extendAction} className="space-y-3 border-t border-gray-100 pt-4">
              <input type="hidden" name="code" value={voucher.code} />
              <label htmlFor="extend-date" className="block text-xs font-medium text-gray-700">
                תוקף חדש
              </label>
              <input
                id="extend-date"
                name="expires_on"
                type="date"
                required
                min={minDate}
                max={maxDate}
                dir="ltr"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <p className="text-xs text-gray-500">
                השובר יהיה בתוקף עד סוף היום שנבחר, לפי שעון ישראל.
                {maxDate ? ` תוקף המבצע של הספק נגמר ב-${maxDate}.` : ''}
              </p>
              <label htmlFor="extend-reason" className="block text-xs font-medium text-gray-700">
                סיבת הארכה
              </label>
              <input
                id="extend-reason"
                name="reason"
                required
                minLength={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
              {extend && 'error' in extend ? (
                <p className="text-sm text-red-600">{extend.error}</p>
              ) : null}
              {extend && 'success' in extend ? (
                <p className="text-sm text-green-700">{extend.success}</p>
              ) : null}
              <button
                type="submit"
                disabled={extendPending}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
              >
                {extendPending ? 'מאריך...' : 'הארכת תוקף'}
              </button>
              <p className="text-xs text-gray-500">
                נרשמת בלוג הפעילות, גם כשהיא נדחית. אם הסכום כבר הוחזר לארנק הלקוח, לא ניתן להחיות
                את השובר.
              </p>
            </form>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
