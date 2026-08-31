import { type Agorot, agorot } from '@/lib/money'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'

/**
 * The customer's own view of the referral program.
 *
 * Everything here reads through the REQUEST-SCOPED client, so `auth.uid()` and
 * not a filter we remembered to write is what decides which rows come back.
 * `referrals_select_unified` (measured against production) allows exactly the
 * rows where the caller is one of the two parties, and `profiles_select_unified`
 * allows the caller's own profile row. The `.eq` and `.or` below are therefore
 * about which of the caller's OWN rows this screen wants, not about security.
 *
 * WHAT IS DELIBERATELY NOT SHOWN
 *
 * Who the other person is. RLS hands over the referral row, which carries the
 * counterparty's uuid, and a second read against `profiles` would turn that
 * into a name, but `profiles_select_unified` would refuse it, and going around
 * that with the service key would be inventing a disclosure the policy is there
 * to prevent. A referrer sees that a referral exists, when, and where it stands.
 * That is the whole of what is theirs to see.
 */

/** Postgres: undefined_column. A database without 098 has no `profiles.referral_code`. */
const UNDEFINED_COLUMN = '42703'

export type ReferralStatus = 'pending' | 'completed' | 'rejected' | 'flagged'

export interface ReferralRow {
  id: string
  status: ReferralStatus
  createdAt: string
  completedAt: string | null
  /** The deadline `fn_complete_referral` enforces, null when the row predates it. */
  qualifyBy: string | null
  /**
   * The bonus actually snapshotted onto the row, in integer agorot, or null
   * while it is still pending. Null is not zero: it means "the amount has not
   * been fixed yet", and the page reads the live programme terms for that case
   * rather than printing ₪0.00 next to a referral that is going to pay.
   */
  bonusAgorot: Agorot | null
}

export interface ReferralSummary {
  /** The caller's code, or null when they have not minted one yet. */
  code: string | null
  /** People the caller referred. Newest first. */
  asReferrer: ReferralRow[]
  /** The caller's own referral, if somebody referred them. */
  asReferred: ReferralRow | null
}

const STATUSES: ReadonlySet<string> = new Set(['pending', 'completed', 'rejected', 'flagged'])

function readStatus(raw: unknown): ReferralStatus {
  return STATUSES.has(String(raw)) ? (raw as ReferralStatus) : 'pending'
}

function readBonus(value: unknown): Agorot | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? agorot(Math.round(n)) : null
}

/** The columns 098 adds. `database.ts` was generated before it and names none of them. */
interface ReferralDbRow {
  id: string
  status: string
  created_at: string
  completed_at: string | null
  qualify_by: string | null
  referrer_user_id: string
  referred_user_id: string
  referrer_bonus_agorot: number | null
  referred_bonus_agorot: number | null
}

/**
 * The caller's referral code, without minting one.
 *
 * Reading and minting are separated on purpose. Minting is a write, and a page
 * render is a GET: a shopper who opens the referrals screen and closes it
 * should not have left a permanent code behind, and a crawler that reaches it
 * should not be able to mint one row per visit. The button on the page is what
 * writes, through `ensureMyReferralCode`.
 */
export async function getMyReferralCode(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('referral_code' as never)
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    if (error.code === UNDEFINED_COLUMN) {
      // A deployment without 098. Reads as "no code yet", which is the same
      // screen the customer sees before they mint one, rather than a 500.
      log.warn('referrals.code_column_missing', {
        detail: 'profiles.referral_code absent: apply supabase/migrations/098_referral_program.sql',
      })
      return null
    }
    log.warn('referrals.code_read_failed', { reason: error.message })
    return null
  }

  const code = (data as { referral_code?: string | null } | null)?.referral_code
  return code ?? null
}

/**
 * Every referral the caller is a party to, split by which side they are on.
 *
 * One query rather than two: the same RLS predicate covers both sides, and a
 * referrer who was themselves referred would otherwise pay for two round trips
 * to build one screen.
 */
export async function getMyReferrals(): Promise<{
  asReferrer: ReferralRow[]
  asReferred: ReferralRow | null
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { asReferrer: [], asReferred: null }

  const { data, error } = await supabase
    .from('referrals')
    .select(
      'id, status, created_at, completed_at, qualify_by, referrer_user_id, referred_user_id, referrer_bonus_agorot, referred_bonus_agorot' as never,
    )
    .or(`referrer_user_id.eq.${user.id},referred_user_id.eq.${user.id}`)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    // Warn and render empty rather than throw. Unlike the wallet ledger, an
    // empty referral list is not a wrong answer about money the customer
    // already holds: nothing has been credited to them here that this screen
    // would be hiding. The bonus that HAS been paid shows up in the wallet,
    // which reads its own rows and fails loudly on its own.
    log.warn('referrals.list_read_failed', { reason: error.message })
    return { asReferrer: [], asReferred: null }
  }

  const rows = (data ?? []) as unknown as ReferralDbRow[]
  const asReferrer: ReferralRow[] = []
  let asReferred: ReferralRow | null = null

  for (const row of rows) {
    const common = {
      id: row.id,
      status: readStatus(row.status),
      createdAt: row.created_at,
      completedAt: row.completed_at,
      qualifyBy: row.qualify_by,
    }
    if (row.referrer_user_id === user.id) {
      asReferrer.push({ ...common, bonusAgorot: readBonus(row.referrer_bonus_agorot) })
    } else if (row.referred_user_id === user.id) {
      asReferred = { ...common, bonusAgorot: readBonus(row.referred_bonus_agorot) }
    }
  }

  return { asReferrer, asReferred }
}

/** Code and rows together, for the one page that needs both. */
export async function getMyReferralSummary(): Promise<ReferralSummary> {
  const [code, lists] = await Promise.all([getMyReferralCode(), getMyReferrals()])
  return { code, ...lists }
}
