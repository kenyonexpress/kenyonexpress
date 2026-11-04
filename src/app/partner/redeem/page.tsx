import { t } from '@/lib/i18n/messages'
import { requireSupplierMember } from '@/lib/supplier/rbac'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import PartnerRedeemClient from './PartnerRedeemClient'

/**
 * /partner/redeem: the coupon partner's redeem screen (queue S15).
 *
 * A coupon partner is an active `supplier_members` row, any role. That is the
 * only authorization signal, here and inside the RPC. A visitor with no session
 * goes to the supplier login with `next` set back here; a signed-in non-member
 * goes to /supplier/access-denied.
 *
 * Camera is allowed on this path only through CAMERA_PATHS in
 * src/lib/security/frame-policy.ts.
 */

export const metadata: Metadata = {
  title: t('partnerRedeem.title'),
  robots: { index: false, follow: false },
}

async function PartnerRedeemBody() {
  const session = await requireSupplierMember('/partner/redeem')
  return <PartnerRedeemClient supplierName={session.supplierName} />
}

export default function PartnerRedeemPage() {
  return (
    <main dir="rtl" className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-xl font-bold text-gray-900">{t('partnerRedeem.title')}</h1>
      <p className="mt-1 text-sm text-gray-600">{t('partnerRedeem.intro')}</p>
      <Suspense fallback={<div className="mt-6 h-40" />}>
        <PartnerRedeemBody />
      </Suspense>
    </main>
  )
}
