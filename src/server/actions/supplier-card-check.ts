'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { getPaymentProvider, loadCardcomEnv } from '@/lib/payments'
import { siteUrl } from '@/lib/site-url'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  CARD_CHECK_AGOROT,
  cardCheckAvailable,
  runCardCheck,
} from '@/lib/suppliers/card-verification'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/**
 * Runs the 1 ILS card check for the caller's own application and records it in
 * `supplier_application_card_checks` (257). See `lib/suppliers/card-verification.ts`
 * for why it is sandbox-only.
 */

export type CardCheckState = { ok: boolean; message?: string; error?: string }

const inputSchema = z.object({ application_id: z.string().uuid() })

async function runStartCardCheck(
  _prev: CardCheckState,
  formData: FormData,
): Promise<CardCheckState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'יש להתחבר' }

  // Refused before anything is read: the page hides the button outside the
  // sandbox, and the page hiding it is not the server refusing it.
  if (!cardCheckAvailable(loadCardcomEnv())) {
    return { ok: false, error: 'אימות כרטיס אינו זמין כרגע. נציג יחזור אליכם.' }
  }

  if (!(await checkRateLimit(`supplier-card-check:${user.id}`, 5, 3600))) {
    return { ok: false, error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.' }
  }

  const parsed = inputSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, error: 'הבקשה לא נמצאה' }

  const admin = createAdminClient()
  const { data: app, error: appError } = await admin
    .from('supplier_applications')
    .select('id, user_id, status')
    .eq('id', parsed.data.application_id)
    .maybeSingle()
  if (appError) {
    log.error('supplier_card_check.application_read_failed', { reason: appError.message })
    return { ok: false, error: 'לא ניתן לטעון את הבקשה כרגע' }
  }
  const row = app as unknown as { id: string; user_id: string; status: string } | null
  // Ownership on the service-role client, which does not consult RLS. One
  // sentence for "missing" and "not yours" so the answer cannot confirm an id.
  if (!row || row.user_id !== user.id) return { ok: false, error: 'הבקשה לא נמצאה' }
  if (!['submitted', 'in_review'].includes(row.status)) {
    return { ok: false, error: 'הבקשה כבר הוכרעה.' }
  }

  const site = siteUrl()
  const outcome = await runCardCheck(getPaymentProvider(), {
    applicationId: row.id,
    attemptId: crypto.randomUUID(),
    successRedirectUrl: `${site}/supplier/apply`,
    failedRedirectUrl: `${site}/supplier/apply`,
    webhookUrl: `${site}/supplier/apply`,
  })

  if (outcome.status === 'unavailable') {
    return { ok: false, error: 'אימות כרטיס אינו זמין כרגע. נציג יחזור אליכם.' }
  }

  const { error: insertError } = await admin.from('supplier_application_card_checks').insert({
    application_id: row.id,
    user_id: user.id,
    amount_agorot: CARD_CHECK_AGOROT,
    provider: 'mock',
    status: outcome.status,
    low_profile_id: outcome.lowProfileId,
    transaction_id: outcome.transactionId,
    void_transaction_id: outcome.status === 'verified' ? outcome.voidTransactionId : null,
    card_last4: outcome.status === 'verified' ? outcome.last4 : null,
    failure_code: outcome.status === 'failed' ? outcome.failureCode : null,
  } as never)
  if (insertError) {
    log.error('supplier_card_check.record_failed', {
      applicationId: row.id,
      status: outcome.status,
      reason: insertError.message,
    })
  }

  if (outcome.status === 'failed') {
    if (outcome.failureCode === 'VOID_FAILED') {
      // A shekel was taken and not given back. Loud, with the id to void by hand.
      log.error('supplier_card_check.void_failed', {
        applicationId: row.id,
        transactionId: outcome.transactionId,
      })
    }
    return { ok: false, error: 'אימות הכרטיס נכשל. בדקו את פרטי הכרטיס ונסו שוב.' }
  }

  revalidatePath('/supplier/apply')
  return { ok: true, message: 'הכרטיס אומת. החיוב של ₪1 בוטל מיד ולא יופיע בחשבון.' }
}

export async function startSupplierCardCheck(
  prev: CardCheckState,
  formData: FormData,
): Promise<CardCheckState> {
  return withActionContext('supplier_card_check.start', () => runStartCardCheck(prev, formData))
}
