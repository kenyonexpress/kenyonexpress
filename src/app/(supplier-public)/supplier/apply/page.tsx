import SupplierCardCheck from '@/components/supplier-apply/SupplierCardCheck'
import SupplierApplyWizard from '@/components/supplier/SupplierApplyWizard'
import SupplierApplyChallenge from '@/components/turnstile/SupplierApplyChallenge'
import { turnstileEnabled } from '@/lib/fraud/turnstile'
import { t } from '@/lib/i18n/messages'
import { log } from '@/lib/observability/log'
import { loadCardcomEnv } from '@/lib/payments/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { cardCheckAvailable } from '@/lib/suppliers/card-verification'
import { CONTRACT_TEXT, CONTRACT_VERSION } from '@/lib/suppliers/contract'
import { TURNSTILE_PASS_COOKIE, checkTurnstilePass } from '@/lib/turnstile/verify'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'

/**
 * NOINDEX with a self-canonical, for the reason `/supplier/login` gives: the
 * proxy sends a visitor without a session to the login form, so a crawler only
 * ever sees a redirect here. The public, indexable door is `/suppliers/apply`.
 */
export const metadata: Metadata = {
  title: t('supplierJoin.title'),
  robots: { index: false, follow: true },
  alternates: { canonical: '/supplier/apply' },
}

/** Per-user content; see `(store)/suppliers/apply/page.tsx` for why not prerendered. */
export const instant = false

/**
 * S17: the business join at `/supplier/apply`.
 *
 * NOT UNDER `(supplier)`: that layout requires an existing supplier membership
 * and would redirect away every applicant. It sits beside `/supplier/login` in
 * the public group, and the proxy still requires a session, because an
 * application belongs to an account (`supplier_applications.user_id` NOT NULL).
 *
 * The wizard, the click-wrap and the action are the ones `/suppliers/apply`
 * renders; nothing is forked. What this page adds is the step after submitting:
 * the 1 ILS card check, offered only while the payment provider is the sandbox.
 */
export default async function SupplierJoinPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent('/supplier/apply')}`)

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('supplier_applications')
    .select('id, status, business_name, review_note')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const existing =
    error || !data
      ? null
      : (data as unknown as {
          id: string
          status: string
          business_name: string
          review_note: string | null
        })
  const live =
    existing && ['submitted', 'in_review', 'approved'].includes(existing.status) ? existing : null

  const sandbox = cardCheckAvailable(loadCardcomEnv())
  let verifiedLast4: string | null | undefined
  if (live && sandbox && live.status !== 'approved') {
    const { data: check, error: checkError } = await admin
      .from('supplier_application_card_checks')
      .select('card_last4')
      .eq('application_id', live.id)
      .eq('status', 'verified')
      .limit(1)
      .maybeSingle()
    // A failed read offers the button again rather than claiming a verification
    // it could not see; the action records a second check, which is harmless.
    if (checkError) {
      log.warn('supplier_join.card_check_read_failed', { reason: checkError.message })
    } else if (check) verifiedLast4 = (check as unknown as { card_last4: string | null }).card_last4
  }

  const needsChallenge =
    turnstileEnabled() &&
    !checkTurnstilePass((await cookies()).get(TURNSTILE_PASS_COOKIE)?.value, user.id)

  return (
    <div dir="rtl" className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-heading">{t('supplierJoin.title')}</h1>
      <p className="mt-2 text-sm text-body">{t('supplierJoin.intro')}</p>

      {live ? (
        <section className="mt-6 rounded-lg border border-border bg-white p-5">
          <h2 className="text-lg font-semibold text-heading">
            {t('supplierJoin.yourApplication')}
          </h2>
          <p className="mt-2 text-sm text-body">
            {live.business_name}{' '}
            {live.status === 'approved'
              ? t('supplierJoin.approved')
              : live.status === 'in_review'
                ? t('supplierJoin.inReview')
                : t('supplierJoin.received')}
          </p>
          {live.status === 'approved' ? (
            <p className="mt-3">
              <Link href="/supplier" className="account-btn">
                {t('supplierJoin.toPortal')}
              </Link>
            </p>
          ) : (
            sandbox && <SupplierCardCheck applicationId={live.id} verifiedLast4={verifiedLast4} />
          )}
        </section>
      ) : (
        <>
          {existing?.status === 'rejected' && existing.review_note && (
            <p className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
              {t('supplierJoin.rejected').replace('{note}', existing.review_note)}
            </p>
          )}
          {needsChallenge ? (
            <SupplierApplyChallenge />
          ) : (
            <SupplierApplyWizard contractText={CONTRACT_TEXT} contractVersion={CONTRACT_VERSION} />
          )}
        </>
      )}
    </div>
  )
}
