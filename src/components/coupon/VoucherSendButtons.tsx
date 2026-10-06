import { t } from '@/lib/i18n/messages'
import Link from 'next/link'

/**
 * The two ways a coupon leaves its owner's account, as two buttons.
 *
 * ONE MECHANISM, TWO INTENTS. Both open `/account/coupons/[id]/gift`, and both
 * end in `transferVoucher` (docs/VOUCHER-LIFECYCLE.md §7): a claim link goes to
 * the recipient's email, the coupon is held until they collect it, and the
 * sender can take it back. What differs is what the sender is doing. A GIFT
 * carries a greeting and is announced as one; a TRANSFER is the coupon and
 * nothing else, for the friend who paid you back or the account you also own.
 * The page reads `mode` and shows the right title, intro and form for each, so
 * neither button promises what the other delivers.
 *
 * Server component, two links, no JavaScript: the decision that needs a
 * deliberate act is the submit on the next page, not the choice of which page.
 */
export default function VoucherSendButtons({
  voucherId,
  buttonClassName = 'account-btn',
}: {
  voucherId: string
  buttonClassName?: string
}) {
  return (
    <span className="inline-flex flex-wrap gap-2" data-testid="voucher-send-buttons">
      <Link
        className={buttonClassName}
        href={`/account/coupons/${voucherId}/gift?mode=transfer`}
        data-testid="voucher-transfer"
      >
        {t('giftTransfer.transferCta')}
      </Link>
      <Link
        className={buttonClassName}
        href={`/account/coupons/${voucherId}/gift?mode=gift`}
        data-testid="voucher-gift"
      >
        {t('giftTransfer.giftCta')}
      </Link>
    </span>
  )
}
