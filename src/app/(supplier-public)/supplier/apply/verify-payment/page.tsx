import { CardcomProvider } from '@/lib/payments/cardcom'
import { createAdminClient } from '@/lib/supabase/admin'
import { XCircle } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const metadata = { title: 'אימות תשלום | Kenyon Express' }
export const instant = false

interface Props {
  searchParams: Promise<{
    app?: string
    token?: string
    LowProfileCode?: string
    Operation?: string
  }>
}

export default async function VerifyPaymentPage({ searchParams }: Props) {
  const params = await searchParams
  const { app: applicationId, token, LowProfileCode, Operation } = params

  if (!applicationId || !token) {
    redirect('/supplier/apply')
  }

  const admin = createAdminClient()

  // SECURITY: Never trust query params for payment verification
  // Must verify with Cardcom directly
  if (Operation === '1' && LowProfileCode) {
    const cardcom = new CardcomProvider()

    try {
      // Verify the payment actually succeeded with Cardcom
      const verification = await cardcom.verifyLowProfile(LowProfileCode)

      if (verification.success && verification.transactionId) {
        // Payment verified - update status
        const { error: updateError } = await admin
          .from('supplier_agreements')
          .update({
            verification_status: 'verified',
            verification_charge_id: verification.transactionId,
          })
          .eq('application_id', applicationId)
          .eq('verification_token', token)

        if (updateError) {
          console.error('Failed to update verification status:', updateError)
        }

        // Redirect to email verification
        redirect(`/supplier/verify-email?token=${token}`)
      }
    } catch (error) {
      console.error('Cardcom verification failed:', error)
      // Fall through to failure case
    }
  }

  // Payment failed, cancelled, or verification failed
  const { error: updateError } = await admin
    .from('supplier_agreements')
    .update({
      verification_status: 'failed',
    })
    .eq('application_id', applicationId)
    .eq('verification_token', token)

  if (updateError) {
    console.error('Failed to update verification status:', updateError)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div className="mb-6 inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full">
          <XCircle className="text-red-600" size={32} />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-4">אימות התשלום נכשל</h1>

        <div className="space-y-4 text-sm text-gray-600 mb-8">
          <p>התשלום של ₪1 לאימות לא הושלם.</p>

          <p>אנא נסה שוב או צור קשר עם התמיכה לקבלת עזרה.</p>
        </div>

        <div className="flex gap-3 justify-center">
          <Link
            href="/supplier/apply"
            className="inline-block bg-brand hover:bg-brand-primary-hover text-brand-dark px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            נסה שוב
          </Link>
          <Link
            href="/"
            className="inline-block bg-gray-200 hover:bg-gray-300 text-gray-900 px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            חזרה לדף הבית
          </Link>
        </div>
      </div>
    </div>
  )
}
