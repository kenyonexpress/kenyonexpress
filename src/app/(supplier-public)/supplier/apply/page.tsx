import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import { AGREEMENT_TEXT_V1 } from '@/lib/supplier-onboarding'
import { redirect } from 'next/navigation'
import SupplierApplicationForm from './SupplierApplicationForm'

export const metadata = { title: 'הגשת בקשה לספק | Kenyon Express' }
export const instant = false

export default async function SupplierApplyPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/supplier/login?redirect=/supplier/apply')
  }

  // Check if user already has a pending or approved application
  const { data: existingApp, error: existingAppError } = await supabase
    .from('supplier_applications')
    .select('id, status')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingAppError) {
    log.error('supplier_application_lookup_failed', { err: existingAppError })
  }

  if (existingApp) {
    if (existingApp.status === 'pending') {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-white rounded-xl border border-gray-200 p-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">בקשה ממתינה</h1>
            <p className="text-gray-600 mb-6">
              בקשתך להצטרפות כספק נמצאת בבדיקה. נעדכן אותך בהקדם.
            </p>
            <a
              href="/"
              className="inline-block bg-brand hover:bg-brand-primary-hover text-brand-dark px-6 py-3 rounded-lg font-semibold transition-colors"
            >
              חזרה לדף הבית
            </a>
          </div>
        </div>
      )
    }

    if (existingApp.status === 'approved') {
      redirect('/supplier')
    }

    if (existingApp.status === 'rejected') {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-white rounded-xl border border-gray-200 p-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">בקשה נדחתה</h1>
            <p className="text-gray-600 mb-6">
              בקשתך להצטרפות כספק נדחתה. לפרטים נוספים ניתן ליצור קשר בטלפון או במייל.
            </p>
            <a
              href="/"
              className="inline-block bg-brand hover:bg-brand-primary-hover text-brand-dark px-6 py-3 rounded-lg font-semibold transition-colors"
            >
              חזרה לדף הבית
            </a>
          </div>
        </div>
      )
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">הגשת בקשה להצטרפות כספק</h1>
          <p className="text-sm text-gray-600 mb-8">
            מלא את הפרטים הבאים כדי להגיש בקשה להצטרפות למערכת הספקים של Kenyon Express
          </p>

          <SupplierApplicationForm agreementText={AGREEMENT_TEXT_V1} />
        </div>
      </div>
    </div>
  )
}
