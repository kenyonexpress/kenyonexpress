'use server'

import { ALL_IN_APP_CONSENT_KEY } from '@/lib/consent-keys'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'

type ConsentOutcome = { ok: true; granted: boolean } | { ok: false; error: string }

function clientIp(forwarded: string | null): string | null {
  const first = forwarded?.split(',')[0]?.trim()
  // inet rejects anything that is not an address; store nothing rather than fail.
  return first && /^[0-9a-fA-F:.]{3,45}$/.test(first) ? first : null
}

/**
 * Records the toggle as consent evidence (migration 280, append-only) and sets
 * the matching preference row. The consent row is written first: a preference
 * without its evidence is the failure worth avoiding, the reverse is harmless.
 */
async function runSetAllInAppNotifications(granted: boolean): Promise<ConsentOutcome> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'צריך להתחבר כדי לשנות העדפות.' }

  const h = await headers()
  const { error: consentError } = await createAdminClient()
    .from('user_consents' as never)
    .insert({
      user_id: user.id,
      consent_key: ALL_IN_APP_CONSENT_KEY,
      granted,
      source: 'web',
      ip_address: clientIp(h.get('x-forwarded-for')),
      user_agent: h.get('user-agent')?.slice(0, 512) ?? null,
    } as never)
  if (consentError) {
    log.error('consent.insert_failed', { reason: consentError.message })
    return { ok: false, error: 'השמירה נכשלה. נסו שוב.' }
  }

  const { error: prefError } = await supabase.from('notification_preferences').upsert(
    {
      user_id: user.id,
      kind: 'all',
      channel: 'in_app',
      enabled: granted,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,kind,channel' },
  )
  if (prefError) {
    log.warn('consent.preference_upsert_failed', { reason: prefError.message })
  }

  revalidatePath('/account/notifications')
  return { ok: true, granted }
}

export async function setAllInAppNotifications(granted: boolean): Promise<ConsentOutcome> {
  return withActionContext('account.notifications.set_all_in_app', () =>
    runSetAllInAppNotifications(granted === true),
  )
}
