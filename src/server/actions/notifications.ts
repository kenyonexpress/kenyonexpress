'use server'

import { type Category, isCategory, kindExclusion, muteKind } from '@/lib/notifications/categories'
import { applyCategoryFilter, applyKindExclusion } from '@/lib/notifications/kind-filter'
import {
  CHANNELS,
  type Channel,
  type PreferenceRow,
  isOptionalKind,
} from '@/lib/notifications/preferences'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Marking notifications read, saving a preference, and muting a shelf.
 *
 * ALL WRITE THROUGH THE REQUEST-SCOPED CLIENT, NOT THE SERVICE ROLE. The RLS
 * policies are `user_id = auth.uid()`, so the session is the authorisation.
 * Reaching for the admin client and filtering in TypeScript would move that
 * check into application code, where forgetting it once lets one customer mark
 * another customer's notifications read -- or switch off their mail.
 *
 * `read_at` is the only column `authenticated` may UPDATE on `notifications`;
 * the grant is `GRANT UPDATE (read_at)` and not a policy predicate, so a
 * customer cannot rewrite the title of their own notification even if a policy
 * is later loosened.
 *
 * A CATEGORY MUTE IS A PREFERENCE ROW (STEP 49). `kind = 'category:<name>'`,
 * `channel = 'in_app'`, `enabled = false`; see lib/notifications/categories.ts
 * for why that needs no migration. It is written by its own action and not by
 * `saveNotificationPreference`, whose contract is "optional outbox kinds only"
 * and whose refusal of anything else is the thing its tests pin.
 */

export type NotificationActionState = { ok: boolean; error?: string }

/** Postgres and PostgREST for "that table is not there" -- 198 is unapplied. */
const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

async function runMarkRead(
  id: string | null,
  category: Category | null = null,
): Promise<NotificationActionState> {
  if (id !== null && !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: 'מזהה לא תקין.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'יש להתחבר.' }

  // `null` means "all of them", which is what the "mark all read" control
  // sends. RLS narrows it to this customer either way, so the unfiltered
  // update is unfiltered only within one account. A category narrows it to
  // one shelf: the tab the customer is looking at.
  //
  // "ALL" IS ALL THE CUSTOMER CAN SEE. A mute hides rows without deleting
  // them and lifting it must bring them back UNREAD, so the bulk write
  // narrows by the same exclusion every reader applies (bell, badge,
  // center). Otherwise one open of the bell would quietly read everything
  // a muted shelf collected. A single id is the customer's own click on a
  // row they could see, so it needs no such narrowing.
  let query = supabase
    .from('notifications' as never)
    .update({ read_at: new Date().toISOString() } as never)
    .is('read_at', null)
  if (id) query = query.eq('id', id)
  else {
    const prefs = await supabase
      .from('notification_preferences' as never)
      .select('kind, channel, enabled')
    const prefRows = prefs.error || !prefs.data ? [] : (prefs.data as unknown as PreferenceRow[])
    if (prefRows.length) query = applyKindExclusion(query, kindExclusion(prefRows))
  }
  if (category) query = applyCategoryFilter(query, category)

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

async function runSetCategoryMute(
  category: string,
  muted: boolean,
): Promise<NotificationActionState> {
  if (!isCategory(category)) return { ok: false, error: 'קטגוריה לא מוכרת.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'יש להתחבר.' }

  // Same shape as a kind preference, same session-sourced user_id, same
  // conflict target. `enabled` is the inverse of "muted" so the stored row
  // reads like every other row in the table: false means off.
  const { error } = await supabase.from('notification_preferences' as never).upsert(
    {
      user_id: user.id,
      kind: muteKind(category),
      channel: 'in_app' satisfies Channel,
      enabled: !muted,
    } as never,
    { onConflict: 'user_id,kind,channel' },
  )

  if (error) {
    if (MISSING_TABLE.has(error.code ?? '')) {
      return { ok: false, error: 'ההגדרות עדיין לא זמינות.' }
    }
    log.warn('notifications.category_mute_failed', { reason: error.message, category })
    return { ok: false, error: 'השמירה נכשלה.' }
  }

  revalidatePath('/account/notifications')
  revalidatePath('/account')
  return { ok: true }
}

export async function markNotificationRead(id: string | null): Promise<NotificationActionState> {
  return withActionContext('notifications.mark_read', () => runMarkRead(id))
}

/**
 * The center's "mark all read" button. `null` is every shelf; a category is
 * the one tab the customer is on. Validated here and not trusted from the
 * client: an unknown name is refused rather than treated as "all".
 */
export async function markAllNotificationsRead(
  category: string | null,
): Promise<NotificationActionState> {
  if (category !== null && !isCategory(category)) {
    return { ok: false, error: 'קטגוריה לא מוכרת.' }
  }
  return withActionContext('notifications.mark_all_read', () => runMarkRead(null, category))
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

export async function setCategoryMute(
  category: string,
  muted: boolean,
): Promise<NotificationActionState> {
  return withActionContext('notifications.set_category_mute', () =>
    runSetCategoryMute(category, muted),
  )
}
