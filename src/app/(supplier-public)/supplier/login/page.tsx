import { createClient } from '@/lib/supabase/server'
import { getSupplierSession } from '@/lib/supplier/rbac'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const metadata = { title: 'כניסת ספקים' }

/**
 * Supplier login landing. Real auth is the shared /login form (Google + email).
 * Members who already have a session skip straight into the portal.
 */
export default async function SupplierLoginPage() {
  const session = await getSupplierSession()
  if (session) redirect('/supplier')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect('/supplier/access-denied')

  return (
    <main
      dir="rtl"
      className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12"
    >
      <p className="text-sm font-semibold text-brand">KenyonExpress לספקים</p>
      <h1 className="mt-2 text-3xl font-bold text-heading">כניסה לאזור הספקים</h1>
      <p className="mt-3 text-sm leading-relaxed text-gray-600">
        סריקת קופונים, לוח מכירות ופירוט תשלומים לפי עמלת הפלטפורמה. ההתחברות זהה לחשבון Google או
        האימייל של בית העסק.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <Link
          href="/login?next=/supplier"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-heading px-4 text-sm font-bold text-white"
        >
          התחברות לספקים
        </Link>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-700"
        >
          חזרה לחנות
        </Link>
      </div>
    </main>
  )
}
