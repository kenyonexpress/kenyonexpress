import { getSessionWithRole } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import AdminMfaForm from './AdminMfaForm'

/**
 * NOINDEX, and the canonical is the reason rather than the crawl budget. The root
 * layout declares `alternates.canonical: '/'` and Next inherits metadata, so a
 * page that sets neither tells Google it IS the home page - measured 2026-09-10
 * on sixteen public routes, this one among them.
 */
export const metadata: Metadata = {
  title: 'אימות דו-שלבי - KenyonExpress',
  robots: { index: false, follow: true },
  // A SELF-CANONICAL BESIDE THE NOINDEX, and the pair is deliberate. Without it
  // this page inherits the root layout's canonical of '/', and noindex plus a
  // canonical pointing at ANOTHER url is a contradiction Google resolves by
  // following the canonical - which would aim the noindex at the home page. The
  // same url in both fields says exactly one thing: do not index this, and it
  // stands for nothing else.
  alternates: { canonical: '/admin-mfa' },
}

/**
 * The landing spot of enforceSuperAdminMfa (lib/admin/rbac.ts). Deliberately
 * OUTSIDE the (admin) group: the layout there calls requirePanelSession,
 * which redirects a non-aal2 super_admin right back here, and a page cannot
 * sit on both sides of that loop.
 *
 * The mode is decided here from the factor list, not from the query string:
 * the ?mode the gate appends is a hint for nothing but the URL bar, and
 * trusting it would let a stale link show the wrong ceremony.
 */
// Suspense for the same reason as the login page: the body reads the session
// off the request, which cacheComponents refuses at the page root.
export default function AdminMfaPage() {
  return (
    <Suspense fallback={null}>
      <AdminMfaBody />
    </Suspense>
  )
}

async function AdminMfaBody() {
  const session = await getSessionWithRole()
  if (!session) redirect('/login')
  // Only super_admin is forced through MFA; anyone else has no business here.
  if (session.role !== 'super_admin') redirect('/admin')

  const supabase = await createClient()
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.currentLevel === 'aal2') redirect('/admin')

  const { data: factors } = await supabase.auth.mfa.listFactors()
  const verifiedTotp = (factors?.totp ?? []).find((f) => f.status === 'verified')

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-xl font-semibold mb-2">אימות דו-שלבי</h2>
      <p className="text-sm text-gray-500 mb-6">
        חשבון מנהל-על מחייב אימות דו-שלבי לפני כניסה לפאנל הניהול.
      </p>
      <AdminMfaForm
        mode={verifiedTotp ? 'challenge' : 'enrol'}
        factorId={verifiedTotp?.id ?? null}
      />
    </div>
  )
}
