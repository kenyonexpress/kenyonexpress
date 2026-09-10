'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { TABLE_MISSING } from '@/lib/reviews/reviews'
import { createClient } from '@/lib/supabase/server'

/**
 * The wishlist alert toggles, read and written on the USER client: RLS (233,
 * owner-only policies) is the boundary, and the auth check here only shapes
 * the signed-out answer. An absent row is the default (drops on, restocks on,
 * digest OFF: the digest is marketing cadence and must be an explicit yes),
 * so the first save is an insert and nothing needs a row until then.
 *
 * Both actions answer "not available yet" while 233 is unapplied, the same
 * contract as push.ts holds for 179: the notifications page renders either way.
 */

export interface WishlistAlertPrefs {
  priceDrop: boolean
  backInStock: boolean
  weeklyDigest: boolean
}

export type WishlistAlertPrefsState =
  | { available: true; prefs: WishlistAlertPrefs }
  | { available: false; reason: 'signed_out' | 'not_applied' | 'error' }

const DEFAULTS: WishlistAlertPrefs = { priceDrop: true, backInStock: true, weeklyDigest: false }

async function runGetWishlistAlertPrefs(): Promise<WishlistAlertPrefsState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { available: false, reason: 'signed_out' }

  const { data, error } = await supabase
    .from('wishlist_alert_prefs' as never)
    .select('price_drop, back_in_stock, weekly_digest')
    .maybeSingle()

  if (error) {
    return { available: false, reason: error.code === TABLE_MISSING ? 'not_applied' : 'error' }
  }
  if (!data) return { available: true, prefs: DEFAULTS }
  const row = data as unknown as {
    price_drop: boolean
    back_in_stock: boolean
    weekly_digest: boolean
  }
  return {
    available: true,
    prefs: {
      priceDrop: row.price_drop,
      backInStock: row.back_in_stock,
      weeklyDigest: row.weekly_digest,
    },
  }
}

export type SavePrefsResult = { ok: true } | { ok: false; error: string }

async function runSaveWishlistAlertPrefs(prefs: WishlistAlertPrefs): Promise<SavePrefsResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'צריך להתחבר כדי לשמור העדפות.' }

  const { error } = await supabase.from('wishlist_alert_prefs' as never).upsert(
    {
      user_id: user.id,
      price_drop: prefs.priceDrop === true,
      back_in_stock: prefs.backInStock === true,
      weekly_digest: prefs.weeklyDigest === true,
    } as never,
    { onConflict: 'user_id' } as never,
  )
  if (error) {
    if (error.code === TABLE_MISSING) {
      return { ok: false, error: 'העדפות ההתראות עוד לא זמינות. נסו שוב מאוחר יותר.' }
    }
    return { ok: false, error: 'השמירה נכשלה. נסו שוב.' }
  }
  return { ok: true }
}

export async function getWishlistAlertPrefs(): Promise<WishlistAlertPrefsState> {
  return withActionContext('wishlist.alert_prefs.get', () => runGetWishlistAlertPrefs())
}

export async function saveWishlistAlertPrefs(prefs: WishlistAlertPrefs): Promise<SavePrefsResult> {
  return withActionContext('wishlist.alert_prefs.save', () => runSaveWishlistAlertPrefs(prefs))
}
