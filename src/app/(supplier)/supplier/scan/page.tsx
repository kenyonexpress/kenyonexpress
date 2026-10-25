import { createAdminClient } from '@/lib/supabase/admin'
import { verifySignedJWT } from '@/lib/vouchers/qr-generation'
import { redirect } from 'next/navigation'

/**
 * Supplier scan page with camera + JWT verification.
 * F55: Uses camera, verifies JWT, marks coupon as redeemed.
 *
 * The scan screen moved to /scan, which is short enough to type on a phone at a
 * till. This page now handles JWT verification and redemption logic before
 * redirecting to the main scan interface.
 */

interface ScanPageProps {
  searchParams: Promise<{ token?: string }>
}

export default async function SupplierScanPage({ searchParams }: ScanPageProps) {
  const params = await searchParams
  const { token } = params

  // If no token provided, redirect to main scan page
  if (!token) {
    redirect('/scan')
  }

  // Verify JWT token from QR code
  const verified = verifySignedJWT(token)

  if (!verified) {
    // Invalid or expired token - redirect with error
    redirect('/scan?error=invalid_token')
  }

  const admin = createAdminClient()

  // Mark voucher as redeemed
  const { data: voucher, error } = await admin
    .from('vouchers')
    .update({
      status: 'redeemed',
      redeemed_at: new Date().toISOString(),
    })
    .eq('id', verified.voucher_id)
    .eq('status', 'issued')
    .select()
    .single()

  if (error || !voucher) {
    // Voucher already redeemed or not found
    redirect('/scan?error=already_redeemed')
  }

  // Success - redirect to main scan page with success message
  redirect(`/scan?success=redeemed&voucher_id=${verified.voucher_id}`)
}
