'use client'

import { formatVoucherCode } from '@/lib/admin/voucher-view'
import { agorot, formatAgorot } from '@/lib/money'
import {
  type AdminVoucherLookupState,
  type AdminVoucherRedeemState,
  lookupAdminVoucher,
  redeemAdminVoucher,
} from '@/server/actions/admin/vouchers'
import { useActionState } from 'react'

const LOOKUP_INITIAL: AdminVoucherLookupState = null
const REDEEM_INITIAL: AdminVoucherRedeemState = null

function ils(agorotValue: number): string {
  return formatAgorot(agorot(agorotValue))
}

export default function VoucherLookupForm({ canRedeem }: { canRedeem: boolean }) {
  const [lookup, lookupAction, lookupPending] = useActionState(lookupAdminVoucher, LOOKUP_INITIAL)
  const [redeem, redeemAction, redeemPending] = useActionState(redeemAdminVoucher, REDEEM_INITIAL)
  const voucher = lookup && 'voucher' in lookup ? lookup.voucher : null

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
        </section>
      ) : null}
    </div>
  )
}
