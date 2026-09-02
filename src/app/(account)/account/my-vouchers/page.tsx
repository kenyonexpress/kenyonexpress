import { permanentRedirect } from 'next/navigation'

/**
 * Inventory name for the customer coupon list. The live page is
 * `/account/coupons`. `/account/vouchers` is the older alias; this one is
 * the name operators and the storefront inventory use.
 */
export default function AccountMyVouchersPage() {
  permanentRedirect('/account/coupons')
}
