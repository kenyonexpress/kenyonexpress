import { redirect } from 'next/navigation'

/** Alias: canonical coupons UI lives at /account/coupons (ARCHITECTURE-PERSONAL-AREA P4). */
export default function AccountVouchersAliasPage() {
  redirect('/account/coupons')
}
