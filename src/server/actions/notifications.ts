'use server'

import { CHANNELS, type Channel, isOptionalKind } from '@/lib/notifications/preferences'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Marking a notification read, and saving a preference.
 *
 * BOTH WRITE THROUGH THE REQUEST-SCOPED CLIENT, NOT THE SERVICE ROLE. The RLS
 * policies are `user_id = auth.uid()`, so the session is the authorisation.
 * Reaching for the admin client and filtering in TypeScript would move that
 * check into application code, where forgetting it once lets one customer mark
 * another customer's notifications read -- or switch off their mail.
 *
 * `read_at` is the only column `authenticated` may UPDATE on `notifications`;
 * the grant is `GRANT UPDATE (read_at)` and not a policy predicate, so a
 * customer cannot rewrite the title of their own notification even if a policy
 * is later loosened.
 */

export type NotificationActionState = { ok: boolean; error?: string }

/** Postgres and PostgREST for "that table is not there" -- 198 is unapplied. */
const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

async function runMarkRead(id: string | null): Promise<NotificationActionState> {
  if (id !== null && !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: 'מזהה לא תקין.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'יש להתחבר.' }

  // `null` means "all of them", which is what the "mark all read" control
  // sends. RLS narrows it to this customer either way, so the unfiltered
  // update is unfiltered only within one account.
  let query = supabase
    .from('notifications' as never)
    .update({ read_at: new Date().toISOString() } as never)
    .is('read_at', null)
  if (id) query = query.eq('id', id)

  const { error } = await query
  if (error) {
    if (MISSING_TABLE.has(error.code ?? '')) {
      // 198 unapplied. Answered as success: there is nothing to mark read, and
      // an error on a bell nobody can fill is noise.
      return { ok: true }
    }
    log.warn('notifications.mark_read_failed', { reason: error.message })
    return { ok: false, error: 'העדכון נכשל.' }
  }

  revalidatePath('/account/notifications')
  return { ok: true }
}

async function runSavePreference(
  kind: string,
  channel: string,
  enabled: boolean,
): Promise<NotificationActionState> {
  // Only an OPTIONAL kind may be written. A row for a required kind is inert --
  // `mayNotify` checks `REQUIRED_KINDS` before it reads the table -- but
  // accepting one would create a stored setting that does nothing, which is the
  // kind of thing somebody later "fixes" by making it work.
  if (!isOptionalKind(kind)) return { ok: false, error: 'סוג התראה לא ניתן לשינוי.' }
  if (!(CHANNELS as readonly string[]).includes(channel)) {
    return { ok: false, error: 'ערוץ לא מוכר.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'יש להתחבר.' }

  // `user_id` is written from the SESSION, never from the form. It also has to
  // be present for the INSERT policy's WITH CHECK to pass, which is the second
  // reason it cannot come from the client.
  const { error } = await supabase.from('notification_preferences' as never).upsert(
    {
      user_id: user.id,
      kind,
      channel: channel as Channel,
      enabled,
    } as never,
    { onConflict: 'user_id,kind,channel' },
  )

  if (error) {
    if (MISSING_TABLE.has(error.code ?? '')) {
      log.warn('notifications.preferences_absent', {
        detail: '198 is written and unapplied; the switch cannot be saved.',
      })
      return { ok: false, error: 'ההגדרות עדיין לא זמינות.' }
    }
    log.warn('notifications.preference_save_failed', { reason: error.message })
    return { ok: false, error: 'השמירה נכשלה.' }
  }

  revalidatePath('/account/notifications')
  return { ok: true }
}

export async function markNotificationRead(id: string | null): Promise<NotificationActionState> {
  return withActionContext('notifications.mark_read', () => runMarkRead(id))
}

export async function saveNotificationPreference(
  kind: string,
  channel: string,
  enabled: boolean,
): Promise<NotificationActionState> {
  return withActionContext('notifications.save_preference', () =>
    runSavePreference(kind, channel, enabled),
  )
}
