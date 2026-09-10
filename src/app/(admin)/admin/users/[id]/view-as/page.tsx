import CustomerTimeline from '@/components/admin/CustomerTimeline'
import ViewAsBanner from '@/components/admin/ViewAsBanner'
import { requireSection } from '@/lib/admin/rbac'
import { VIEW_AS_COOKIE, VIEW_AS_REFUSALS, verifyViewAsGrant } from '@/lib/admin/view-as-token'
import { formatDateShort } from '@/lib/i18n/format'
import { agorot } from '@/lib/money'
import { shekels } from '@/lib/money-format'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCustomerTimeline } from '@/server/queries/admin-customer'
import { getAdminWalletView } from '@/server/queries/admin-wallet'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const metadata = { title: 'צפייה כלקוח' }

/**
 * What the customer sees, shown to an operator who wrote down why.
 *
 * =========================================================================
 * READ ONLY IS STRUCTURAL HERE, NOT PROMISED
 * =========================================================================
 *
 * There is no form on this page and no action imported into it except the one
 * that ENDS the view. The alternative -- swap `auth.uid()` and walk the real
 * storefront -- was measured and rejected: 82 call sites read
 * `supabase.auth.getUser()` directly, with no session helper to override, and
 * read-only would then have rested on all 82 continuing to be read-only. The
 * first write that slipped through would have been attributed to the CUSTOMER.
 * `lib/admin/view-as-token.ts` carries the full reasoning and
 * `docs/CUSTOMER-SUPPORT-TOOLS.md` records it as a stated deviation.
 *
 * =========================================================================
 * THE GRANT IS CHECKED EVEN THOUGH THE SECTION GATE ALREADY PASSED
 * =========================================================================
 *
 * `requireSection('users', 'write')` keeps everyone but an admin out. It does
 * not keep an admin from TYPING this URL, and an admin who typed it would read
 * the customer's whole history with no record of having done so -- which is the
 * one thing the audit requirement exists to prevent. The cookie is minted only
 * by `startCustomerViewAs`, which writes the audit row first, so holding it is
 * the evidence that the record exists.
 */
export default async function ViewAsPage(props: { params: Promise<{ id: string }> }) {
  const session = await requireSection('users', 'write')
  const { id } = await props.params

  const store = await cookies()
  const verdict = verifyViewAsGrant(store.get(VIEW_AS_COOKIE)?.value, id, session.userId)

  if (!verdict.ok) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-ink">צפייה כלקוח</h1>
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {VIEW_AS_REFUSALS[verdict.reason]}
        </p>
        <Link href={`/admin/users/${id}`} className="text-sm text-brand hover:underline">
          חזרה לדף הלקוח
        </Link>
      </div>
    )
  }

  const admin = createAdminClient()
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, email, full_name, phone, created_at')
    .eq('id', id)
    .maybeSingle()

  // A read that did not answer is not a customer who does not exist. A 404 here
  // would send an operator holding a valid grant off to look for a person who
  // is sitting in the table.
  if (profileError) throw new Error(`admin.view_as_profile_read_failed: ${profileError.message}`)
  if (!profile) notFound()

  const [timeline, walletView] = await Promise.all([
    getCustomerTimeline(id),
    getAdminWalletView(id),
  ])

  const displayName = profile.full_name ?? profile.email ?? id.slice(0, 8)

  return (
    <div className="space-y-6">
      <ViewAsBanner
        userId={id}
        displayName={displayName}
        expiresAt={verdict.expiresAt.toISOString()}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-xl border border-black/10 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">הפרטים שלי</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-black/50">שם</dt>
              <dd className="text-black/80">{profile.full_name ?? ''}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-black/50">אימייל</dt>
              <dd dir="ltr" className="text-black/80">
                {profile.email}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-black/50">טלפון</dt>
              <dd dir="ltr" className="text-black/80">
                {profile.phone ?? ''}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-black/50">הצטרפות</dt>
              <dd>{formatDateShort(profile.created_at)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-black/10 bg-white p-5 md:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">הארנק שלי</h2>
          <p className="text-2xl font-bold text-heading">
            {shekels(agorot(walletView.balanceAgorot))}
          </p>
          <p className="mt-1 text-xs text-black/50">
            זו היתרה שהלקוח רואה בחשבון שלו, מאותו מקור שהמסך שלו קורא.
          </p>
        </section>
      </div>

      <CustomerTimeline events={timeline.events} partial={timeline.partial} />
    </div>
  )
}
