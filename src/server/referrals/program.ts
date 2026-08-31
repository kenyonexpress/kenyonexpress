import { type Agorot, agorot } from '@/lib/money'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The referral program's terms, read from the one row that holds them.
 *
 * WHY THE ADMIN CLIENT FOR A CUSTOMER-FACING READ
 *
 * `referral_program_settings` carries a single RLS policy,
 * `referral_settings_admin_read`, gated on `is_admin()`. A shopper's own client
 * gets nothing back (not an error, an empty set), which would render as a
 * program that pays zero. So the read runs on the service key with no user
 * input reaching it: this function takes no arguments, and what it returns is
 * the same for every visitor because the terms of the program are the same for
 * every visitor. Nothing here is scoped to a person, so there is nothing here
 * to scope wrongly.
 *
 * WHY "NOT CONFIGURED" IS A FIRST-CLASS STATE AND NOT A ZERO
 *
 * 098 deliberately seeds no row: "the program stays off until a person enters
 * what it pays". Measured against production on 2026-08-31, that table has
 * **zero rows**, so this is the live state and not a hypothetical one.
 * Collapsing it to `{ referrerBonus: 0 }` would put "get ₪0.00 for a friend" in
 * front of a customer, and would let a share link go out promising a bonus that
 * `fn_claim_referral` answers `program_inactive` to. The absent row is
 * therefore returned as `null` and the page says so.
 */
export interface ReferralProgram {
  /** What the referrer is credited, in integer agorot. */
  referrerBonus: Agorot
  /** What the referred person is credited, in integer agorot. */
  referredBonus: Agorot
  /** The referred person's first order must reach this to qualify. */
  minOrder: Agorot
  /** Days from the claim in which that order has to happen. */
  qualifyWindowDays: number
  /** Whether a completed referral waits for a human before money moves. */
  requiresManualApproval: boolean
}

/** The columns 098 gives the settings row. Not in `database.ts`, which predates it. */
interface SettingsRow {
  referrer_bonus_agorot: number | null
  referred_bonus_agorot: number | null
  min_order_agorot: number | null
  qualify_window_days: number | null
  require_manual_approval: boolean | null
  is_active: boolean | null
}

/**
 * Integer agorot out of an integer column.
 *
 * `Number()` widens an `integer` column to a float type in TypeScript's eyes
 * even though Postgres can only have sent a whole number, and `agorot()`
 * refuses anything that is not a safe integer. The round is that cast and
 * nothing more. It is not covering for a decimal, because the column cannot
 * hold one.
 */
function columnAgorot(value: number | null | undefined): Agorot {
  return agorot(Math.round(Number(value ?? 0)))
}

/**
 * The live terms, or null when the program is off or unconfigured.
 *
 * The two are one answer on purpose. A caller has exactly one decision to make
 * (show the program, or say it is not running) and splitting "no row" from
 * "row with is_active false" would give it two ways to spell the same screen.
 * The distinction that does matter, for whoever has to turn it on, is in the
 * log line.
 */
export async function getReferralProgram(): Promise<ReferralProgram | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('referral_program_settings' as never)
    .select(
      'referrer_bonus_agorot, referred_bonus_agorot, min_order_agorot, qualify_window_days, require_manual_approval, is_active',
    )
    .maybeSingle()

  if (error) {
    // Not thrown. The referrals page is the only caller, and a settings table
    // that will not answer should render "the program is not running" rather
    // than take the account area down. The customer's own referral rows, which
    // are the part of that page that is theirs, read from somewhere else.
    log.warn('referrals.settings_read_failed', { reason: error.message })
    return null
  }

  const row = data as SettingsRow | null
  if (!row) {
    log.info('referrals.program_unconfigured', {
      detail: 'referral_program_settings has no row; the owner has not set what the program pays',
    })
    return null
  }
  if (!row.is_active) return null

  return {
    referrerBonus: columnAgorot(row.referrer_bonus_agorot),
    referredBonus: columnAgorot(row.referred_bonus_agorot),
    minOrder: columnAgorot(row.min_order_agorot),
    qualifyWindowDays: Number(row.qualify_window_days ?? 0),
    requiresManualApproval: row.require_manual_approval === true,
  }
}
