import { formatDate, formatIls } from '@/lib/account/format'
import { agorot } from '@/lib/money'
import { requireSupplierMember } from '@/lib/supplier/rbac'
import type { VoucherDisplayStatus } from '@/lib/supplier/voucher-status'
import { formatVoucherCode } from '@/server/domain/vouchers/code'
import { getSupplierVouchers } from '@/server/queries/supplier'

export const metadata = { title: 'הקופונים שלי' }

/**
 * Read-only. The portal never issues, cancels or edits a voucher; the only
 * write a business makes is a scan, and that goes through the redeem_voucher
 * RPC from /supplier/scan.
 *
 * The list a business needs before the customer arrives is the outstanding one,
 * which /supplier/redemptions cannot show because it filters to `redeemed`.
 */

const TONE: Record<VoucherDisplayStatus, string> = {
  active: 'bg-brand text-heading',
  redeemed: 'bg-heading text-white',
  expired: 'bg-gray-200 text-gray-600',
  cancelled: 'bg-gray-200 text-gray-600',
  refunded: 'bg-gray-200 text-gray-600',
}

export default async function SupplierVouchersPage() {
  const session = await requireSupplierMember('/supplier/vouchers')
  const rows = await getSupplierVouchers(session.supplierId)

  const active = rows.filter((r) => r.status === 'active').length

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-2xl font-bold text-heading">הקופונים שלי</h1>
        <p className="mt-1 text-sm text-gray-500">
          כל הקופונים שנרכשו לבית העסק. {active} פעילים ממתינים למימוש. היתרה נגבית מהלקוח בקופה.
        </p>
      </section>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          אין קופונים עדיין.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.voucherId}
              className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-heading">{row.productName}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${TONE[row.status]}`}
                    >
                      {row.statusLabel}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-sm tracking-wider text-gray-700" dir="ltr">
                    {formatVoucherCode(row.code)}
                  </p>
                  {row.customerName ? (
                    <p className="mt-1 text-xs text-gray-500">לקוח: {row.customerName}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-gray-400">
                    {row.status === 'redeemed'
                      ? `מומש ${formatDate(row.redeemedAt)}`
                      : `בתוקף עד ${formatDate(row.expiresAt)}`}
                  </p>
                </div>
                <div className="shrink-0 text-end">
                  <p className="text-xs text-gray-500">לגבייה בעסק</p>
                  <p className="text-lg font-extrabold text-heading" dir="ltr">
                    {formatIls(agorot(row.remainingAmountDueAgorot))}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    שולם באתר <span dir="ltr">{formatIls(agorot(row.couponPriceAgorot))}</span>
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
