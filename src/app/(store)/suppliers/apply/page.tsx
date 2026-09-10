import SupplierApplyWizard from '@/components/supplier/SupplierApplyWizard'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { CONTRACT_TEXT, CONTRACT_VERSION } from '@/lib/suppliers/contract'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'הצטרפות כבית עסק',
  // Its own address, for the reason in coupons/[id]: the root layout's canonical
  // is `/`, and a page that inherits it claims to be the home page. This is a
  // landing page a supplier is sent to, so it should be indexed as itself.
  alternates: { canonical: '/suppliers/apply' },
}

/**
 * NOT PRERENDERED, and this is the one page in `(store)` that says so.
 *
 * The rest of the storefront is a cached, identical-for-everyone catalogue,
 * which is why the group prerenders. This page reads the session and then the
 * caller's own application, so under `cacheComponents` the build refuses it:
 * "Next.js encountered uncached or runtime data during prerendering". The three
 * offered fixes are Suspense, `"use cache"`, or blocking - and the first two
 * are wrong here. There is no useful shell to stream around a form whose whole
 * content depends on whether you already applied, and caching a per-user
 * application read is how one applicant is shown another's status.
 *
 * `(account)` and `(admin)` never hit this because their layouts are already
 * dynamic. This page is personal content living in a public group.
 */
export const instant = false

/**
 * The onboarding wizard's page shell.
 *
 * NOT UNDER `(supplier)`, AND THAT IS A BUG THE ROUTE-GUARD TEST CAUGHT. The
 * `(supplier)` layout calls `requireSupplierMember`, so a page for people who
 * are NOT yet suppliers would have redirected away every single applicant - the
 * one audience it exists for. It lives beside the public supplier directory
 * instead, where `/suppliers` answers "tell me more" and `/suppliers/apply`
 * ends in a bank account and a contract.
 *
 * REQUIRES A SESSION, and that is not a formality: `supplier_applications.user_id`
 * is NOT NULL because an application nobody can log back in to continue, and
 * nobody can be reached through, is a dead row.
 *
 * The existing application is read here so a returning applicant sees where
 * they are instead of a blank form that will be refused by the one-live-
 * application-per-business index.
 */
export default async function SupplierApplyPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent('/suppliers/apply')}`)

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('supplier_applications')
    .select('id, status, business_name, review_note, submitted_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // 42P01 / 42703 until 204 is applied. Treated as "no application yet" so the
  // page still renders and the form still explains itself; the submit action
  // is where the missing table is reported in words.
  const existing =
    error || !data
      ? null
      : (data as unknown as {
          id: string
          status: string
          business_name: string
          review_note: string | null
          submitted_at: string | null
        })

  const live =
    existing && ['submitted', 'in_review', 'approved'].includes(existing.status) ? existing : null

  return (
    <div dir="rtl" className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-heading">הצטרפות כבית עסק</h1>
      <p className="mt-2 text-sm text-body">
        מילוי הטופס אורך כמה דקות. אחרי השליחה נבדוק את הפרטים והמסמכים ונחזור אליכם.
      </p>

      {live ? (
        <section className="mt-6 rounded-lg border border-border bg-white p-5">
          <h2 className="text-lg font-semibold text-heading">הבקשה שלכם</h2>
          <p className="mt-2 text-sm text-body">
            {live.business_name}{' '}
            {live.status === 'approved'
              ? 'אושרה. ברוכים הבאים.'
              : live.status === 'in_review'
                ? 'בבדיקה אצלנו.'
                : 'התקבלה וממתינה לבדיקה.'}
          </p>
          {live.status === 'approved' && (
            <p className="mt-3">
              <Link href="/supplier" className="account-btn">
                לממשק הספק
              </Link>
            </p>
          )}
        </section>
      ) : (
        <>
          {existing?.status === 'rejected' && existing.review_note && (
            <p className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
              הבקשה הקודמת נדחתה: {existing.review_note}. אפשר לתקן ולהגיש שוב.
            </p>
          )}
          <SupplierApplyWizard contractText={CONTRACT_TEXT} contractVersion={CONTRACT_VERSION} />
        </>
      )}
    </div>
  )
}
