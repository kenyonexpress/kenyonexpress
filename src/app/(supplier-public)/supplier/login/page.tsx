import { createClient } from '@/lib/supabase/server'
import { getSupplierSession } from '@/lib/supplier/rbac'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

export const metadata = { title: 'כניסת ספקים' }

/**
 * The two redirects, and nothing else, behind a boundary.
 *
 * As merged, this page awaited `getSupplierSession()` and `auth.getUser()` at
 * the top of the default export, which failed the production build outright:
 *
 *   Route "/supplier/login": Uncached data was accessed outside of <Suspense>.
 *
 * That is the same shape [21] removed from every route group. The page's markup
 * does not depend on the session at all -- only the decision to leave does --
 * so the shell prerenders and this component streams in behind it. A member
 * lands in the portal, a signed-in non-member gets the denial page, and a
 * stranger sees the form that was already painted.
 *
 * It renders nothing: its whole output is the redirect, or the absence of one.
 */
async function SupplierLoginRedirect() {
  // getSupplierSession throws when the membership cannot be READ, and this is
  // the one caller for which that is not worth an error page: the page's whole
  // output is a redirect, the markup behind this boundary is already painted,
  // and the safe answer to "should this visitor skip the login form" when the
  // read failed is no. A member sees the form and signs in again; nobody is
  // shown a portal, and nobody is told they are not staff.
  const session = await getSupplierSession().catch(() => null)
  if (session) redirect('/supplier')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect('/supplier/access-denied')

  return null
}

/**
 * Supplier login landing. Real auth is the shared /login form (Google + email).
 * Members who already have a session skip straight into the portal.
 */
export default function SupplierLoginPage() {
  return (
    <main
      dir="rtl"
      className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12"
    >
      <Suspense fallback={null}>
        <SupplierLoginRedirect />
      </Suspense>
      <p className="text-sm font-semibold text-heading">KenyonExpress לספקים</p>
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
