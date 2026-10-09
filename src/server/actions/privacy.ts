'use server'

import { DELETE_CONFIRM_WORD, runAnonymizationCascade } from '@/lib/account/deletion'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import type { AccountActionState } from '@/lib/validations/account'
import { redirect } from 'next/navigation'

/**
 * Self-service account deletion (the erasure right on /account/privacy).
 *
 * The identity is the session and nothing from the form: the only field the
 * form contributes is the typed confirmation word, so there is no id anyone
 * can point at somebody else's account. The admin client is required because
 * the cascade touches rows RLS correctly hides from their owner (push tokens,
 * newsletter rows, the audit log), and every write in it is keyed by the
 * session's user id.
 */
async function runDeleteMyAccount(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'יש להתחבר' }

  if (formData.get('confirm') !== DELETE_CONFIRM_WORD) {
    return { error: `כדי למחוק את החשבון יש להקליד את המילה "${DELETE_CONFIRM_WORD}" בדיוק` }
  }

  // Three an hour: a real person needs one, and a stolen session must not get
  // an unthrottled destructive endpoint.
  const allowed = await checkRateLimit(`account-delete:${user.id}`, 3, 3600)
  if (!allowed) return { error: 'יותר מדי ניסיונות, נסו שוב מאוחר יותר' }

  const result = await runAnonymizationCascade(createAdminClient(), user.id)

  if (result.criticalFailed.length > 0) {
    // The PII survived; saying "deleted" here would be a lie the user cannot
    // detect. The cascade already logged each failing step by name.
    return { error: 'מחיקת החשבון נכשלה. נסו שוב, ואם זה חוזר פנו אלינו בעמוד יצירת הקשר' }
  }

  if (result.failed.length > 0) {
    log.warn('privacy.cascade_partial', { userId: user.id, failed: result.failed })
  }

  // Ends every session on every device; the ban blocks the next login.
  await supabase.auth.signOut({ scope: 'global' })
  redirect('/')
}

export async function deleteMyAccount(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  return withActionContext('privacy.delete_account', () => runDeleteMyAccount(_prev, formData))
}
