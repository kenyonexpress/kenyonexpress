import { permanentRedirect } from 'next/navigation'

/**
 * The coupon list lives at /account/coupons. This address was the second list
 * over the same table, and it is kept only because the checkout confirmation,
 * the issue email and the coupon page all linked to it before the two were
 * merged. A permanent redirect keeps every one of those working.
 */
export default function AccountVouchersPage() {
  permanentRedirect('/account/coupons')
}
