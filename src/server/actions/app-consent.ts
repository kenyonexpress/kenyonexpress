'use server'

import { isIP } from 'node:net'
import { t } from '@/lib/i18n/messages'
import {
  APP_CONSENT_WORDING_VERSION,
  type AppConsentSource,
  appConsentPreferenceRows,
} from '@/lib/notifications/app-consent'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'

/**
 * Turn "everything in the app" on or off, and record that the customer did.
 *
 * ORDER MATTERS. The consent event is written FIRST and, if it cannot be, the
 * preferences are not touched: switching notifications on with no record of the
 * customer asking is exactly the state this feature exists to prevent. The
 * event goes through `record_app_consent`, which reads the user from the
 * session (`auth.uid()`), never from an argument.
 *
 * Both writes use the request-scoped client, so RLS is the authorisation.
 */

export type AppConsentActionState = { ok: boolean; error?: string; on?: boolean }

/** 240 unapplied: the table or the function is absent. */
const NOT_APPLIED = new Set(['42P01', 'PGRST205', 'PGRST202', '42883'])

async function runSetEverythingInApp(
  enabled: boolean,
  source: AppConsentSource,
): Promise<AppConsentActionState> {
  if (source !== 'account_page' && source !== 'post_purchase') {
    return { ok: false, error: t('appConsent.badRequest') }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: t('appConsent.needLogin') }

  if (!(await checkRateLimit(`app-consent:${user.id}`, 20, 3600))) {
    return { ok: false, error: t('appConsent.rateLimited') }
  }

  const rawIp = await getClientIp()
  const userAgent = (await headers()).get('user-agent')

  const { error: consentError } = await supabase.rpc(
    'record_app_consent' as never,
    {
      p_action: enabled ? 'opt_in' : 'opt_out',
      p_source: source,
      p_wording_version: APP_CONSENT_WORDING_VERSION,
      p_ip: isIP(rawIp) ? rawIp : null,
      p_user_agent: userAgent,
    } as never,
  )

  if (consentError) {
    if (NOT_APPLIED.has(consentError.code ?? '')) {
      log.warn('app_consent.not_applied', { detail: '240 is written and unapplied.' })
      return { ok: false, error: t('appConsent.unavailable') }
    }
    log.warn('app_consent.record_failed', { reason: consentError.message })
    return { ok: false, error: t('appConsent.failed') }
  }

  const { error: prefError } = await supabase
    .from('notification_preferences' as never)
    .upsert(appConsentPreferenceRows(user.id, enabled) as never, {
      onConflict: 'user_id,kind,channel',
    })

  if (prefError) {
    // The consent is on record and the preferences did not follow. Say so: the
    // customer can press the switch again, and the log carries the reason.
    log.warn('app_consent.preferences_failed', { reason: prefError.message })
    return { ok: false, error: t('appConsent.prefsFailed') }
  }

  revalidatePath('/account/notifications')
  return { ok: true, on: enabled }
}

export async function setEverythingInApp(
  enabled: boolean,
  source: AppConsentSource = 'account_page',
): Promise<AppConsentActionState> {
  return withActionContext('app_consent.set', () => runSetEverythingInApp(enabled, source))
}
