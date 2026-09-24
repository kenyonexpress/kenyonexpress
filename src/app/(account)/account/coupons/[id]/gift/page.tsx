import VoucherTransferForm from '@/components/gifts/VoucherTransferForm'
import VoucherTransferRevoke from '@/components/gifts/VoucherTransferRevoke'
import { giftHeldCopy } from '@/lib/gifts/held-copy'
import { transferEligibility } from '@/lib/gifts/transfer'
import { t } from '@/lib/i18n/messages'
import { formatCouponDate } from '@/lib/vouchers/coupon-view'
import { getCustomerVoucher } from '@/server/queries/vouchers'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

/**
 * Sending on a coupon the customer owns.
 *
 * One page, three states, decided by the same rule the action enforces
 * (`transferEligibility`): the form for a coupon that can go; the held view
 * with a revoke button while a link is out and unclaimed; and a plain refusal
 * for anything redeemed, expired or void. The read is RLS-scoped, so a
 * voucher id that is not this customer's is a 404 here exactly as a made-up
 * one is.
 */
export const metadata: Metadata = { title: t('giftTransfer.title') }

type Props = { params: Promise<{ id: string }> }

export default function VoucherGiftPage(props: Props) {
  return (
    <>
      <h1 className="account-title">{t('giftTransfer.title')}</h1>
      <section className="account-card">
        <Suspense fallback={<p className="account-empty">…</p>}>
          <VoucherGiftBody {...props} />
        </Suspense>
      </section>
    </>
  )
}

async function VoucherGiftBody({ params }: Props) {
  const { id } = await params
  const voucher = await getCustomerVoucher(id)
  if (!voucher) notFound()

  const productName = voucher.product?.name_he ?? t('giftTransfer.coupon')

  if (voucher.gift) {
    const held = giftHeldCopy(voucher.gift)
    return (
      <div className="account-row">
        <div className="account-row__main">
          <p className="account-row__title">{productName}</p>
          <p className="account-row__title">{t('giftTransfer.heldTitle')}</p>
          <p className="account-row__meta">{held.headline}</p>
          <p className="account-row__meta">{held.explanation}</p>
        </div>
        <div className="account-row__actions">
          <VoucherTransferRevoke voucherId={voucher.id} />
          <Link className="account-btn" href="/account/coupons">
            {t('giftTransfer.back')}
          </Link>
        </div>
      </div>
    )
  }

  const eligible = transferEligibility({ status: voucher.status, expires_at: voucher.expires_at })
  if (!eligible.ok) {
    return (
      <div className="account-row">
        <div className="account-row__main">
          <p className="account-row__title">{productName}</p>
          <p className="account-row__meta" data-testid="gift-transfer-refused">
            {t('giftTransfer.notEligible')}
          </p>
        </div>
        <div className="account-row__actions">
          <Link className="account-btn" href="/account/coupons">
            {t('giftTransfer.back')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="account-row">
      <div className="account-row__main">
        <p className="account-row__title">{productName}</p>
        <p className="account-row__meta">
          {t('giftTransfer.validUntil')} {formatCouponDate(voucher.expires_at)}
        </p>
        <p className="account-row__meta">{t('giftTransfer.intro')}</p>
        <VoucherTransferForm voucherId={voucher.id} />
      </div>
    </div>
  )
}
