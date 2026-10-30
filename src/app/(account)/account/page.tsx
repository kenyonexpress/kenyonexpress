import AccountPageContent from '@/components/account/AccountPageContent'
import BusinessLocation from '@/components/account/BusinessLocation'
import { isStaffRole } from '@/lib/admin/roles'
import { createClient } from '@/lib/supabase/server'
import { isCouponPresentable } from '@/lib/vouchers/coupon-view'
import { getAccountProfile, getMyAddresses, getWalletSummary } from '@/server/queries/account'
import { getMyTier } from '@/server/queries/club'
import { getMyOrders } from '@/server/queries/orders'
import { getCustomerVouchers } from '@/server/queries/vouchers'
import { getMyWishlist } from '@/server/queries/wishlist'

export const metadata = { title: 'האזור האישי' }

export default async function AccountOverviewPage() {
  const [wallet, orders, allCoupons, tier, wishlistEntries, profile, addresses] = await Promise.all(
    [
      getWalletSummary(),
      getMyOrders(),
      getCustomerVouchers(),
      getMyTier(),
      getMyWishlist(),
      getAccountProfile(),
      getMyAddresses(),
    ],
  )

  // Filter coupons on the server side before passing to client component
  const coupons = allCoupons.filter((c) => isCouponPresentable(c))

  // Get staff status for settings tab
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let isStaff = false
  if (user) {
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    isStaff = !profileError && profileData != null && isStaffRole(profileData.role)
  }

  return (
    <>
      <AccountPageContent
        wallet={wallet}
        orders={orders}
        coupons={coupons}
        tier={tier}
        wishlistEntries={wishlistEntries}
        profile={profile}
        addresses={addresses}
        isStaff={isStaff}
      />
      <BusinessLocation />
    </>
  )
}
