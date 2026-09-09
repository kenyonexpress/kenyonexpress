import 'server-only'

import { ilsColumnToAgorot } from '@/lib/account/format'
import { orFail } from '@/lib/catalogue-read'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { readWalletAccountAgorot } from '@/lib/supabase/optional-columns'
import { createClient } from '@/lib/supabase/server'
import {
  ADMIN_WALLET_LEDGER_CAP,
  type AdminWalletEntry,
  type AdminWalletView,
  buildAdminWalletView,
} from '@/lib/wallet/admin-view'

/**
 * One customer's wallet, read for an admin screen.
 *
 * THE REQUEST-SCOPED CLIENT, NOT THE ADMIN ONE, and that is the whole design.
 * Measured on production 2026-09-10:
 *
 *   wallet_accounts.wallet_accounts_owner_read : user_id = auth.uid() OR is_admin()
 *   wallet_entries.wallet_entries_select_unified : is_admin() OR (an account on
 *       the entry belongs to auth.uid())
 *   v_wallet_ledger : security_invoker=true, so it inherits both
 *
 * So an admin already has database-level permission to read any customer's
 * wallet, and a non-admin who somehow reached this function reads only their
 * own rows no matter what `userId` says. Going through the service client and
 * filtering in TypeScript would move a money-visibility rule out of the
 * database and into a line somebody can forget, and the thing they would be
 * shown is another customer's money. `src/server/queries/expiry.ts` settled
 * this for the same two tables; this follows it.
 *
 * THE BALANCE COLUMN IS PROBED, NOT NAMED. `readWalletAccountAgorot` exists
 * because 059 renames `wallet_accounts.balance_ils` to an integer
 * `balance_ils_agorot` and the hosted project is mid-lineage. Naming either one
 * makes the select 42703 on the other deployment and the screen goes blank.
 *
 * `v_wallet_ledger` still exposes decimal `*_ils`, so amounts are PARSED by
 * `ilsColumnToAgorot`, never multiplied by 100 as a float.
 */
export async function getAdminWalletView(userId: string): Promise<AdminWalletView> {
  const supabase = await createClient()

  const [{ balanceAgorot }, rows] = await Promise.all([
    readWalletAccountAgorot(
      (select, ids) =>
        supabase.from('wallet_accounts').select(select).eq('user_id', ids[0]) as never,
      userId,
    ),
    (async () => {
      // A discarded error here would render as "this customer has no wallet
      // movements", which is the exact sentence the screen this replaces got
      // wrong. It fails loudly instead.
      const data = orFail(
        await supabase
          .from('v_wallet_ledger')
          .select('id, direction, amount_ils, reason, order_id, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(ADMIN_WALLET_LEDGER_CAP),
        'admin.wallet_ledger_read_failed',
        { userId },
      )
      return data ?? []
    })(),
  ])

  const entries: AdminWalletEntry[] = rows.map((row) => ({
    id: row.id as string,
    direction: row.direction === 'credit' ? 'credit' : 'debit',
    amountAgorot: ilsColumnToAgorot(row.amount_ils),
    reason: (row.reason as string | null) ?? '',
    orderId: (row.order_id as string | null) ?? null,
    createdAt: row.created_at as string,
  }))

  return buildAdminWalletView(balanceAgorot, entries)
}

export interface WalletDriftRow {
  accountId: string
  userId: string | null
  code: string | null
  cachedAgorot: number
  ledgerAgorot: number
  driftAgorot: number
}

export type WalletDriftRead =
  | { known: true; rows: WalletDriftRow[] }
  | { known: false; reason: string }

/**
 * Every wallet account whose cached balance disagrees with its own ledger.
 *
 * `v_wallet_balance_drift` has existed since 142 and until now had exactly one
 * reader in the repo: `scripts/security-probe-views.mjs`, which checks that it
 * is not readable by anonymous callers. Nothing ever looked at what it SAYS.
 * A wallet whose cached column and append-only ledger disagree is the single
 * worst state this subsystem has, because both numbers look authoritative and
 * the customer is shown one of them; it should not be discovered by the person
 * whose money it is.
 *
 * SERVICE CLIENT, unlike `getAdminWalletView` above, and the difference is the
 * question. That one asks "this customer's wallet", which RLS can express as
 * `is_admin() OR it is yours`. This asks "every account that disagrees",
 * which is not a per-row permission at all: a caller with no drift of their own
 * would legitimately read zero rows and report the system clean. The page gate
 * (`requireSection('payments')`) is the authority here, as it is for the
 * ledger table the same page already reads this way.
 *
 * A FAILURE IS NOT A CLEAN BILL OF HEALTH. `known: false` exists so the screen
 * can say "not checked" rather than printing the reassurance that no wallet is
 * out of step, which is the one wrong answer that costs something.
 */
export async function getWalletDrift(limit = 50): Promise<WalletDriftRead> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('v_wallet_balance_drift')
    .select('account_id, user_id, code, cached_balance_ils, ledger_balance_ils, drift_ils')
    .limit(limit)

  if (error) {
    log.warn('admin.wallet_drift_read_failed', { reason: error.message })
    return { known: false, reason: error.message }
  }

  const rows = (data ?? []).map((row) => ({
    accountId: row.account_id as string,
    userId: (row.user_id as string | null) ?? null,
    code: (row.code as string | null) ?? null,
    cachedAgorot: ilsColumnToAgorot(row.cached_balance_ils),
    ledgerAgorot: ilsColumnToAgorot(row.ledger_balance_ils),
    driftAgorot: ilsColumnToAgorot(row.drift_ils),
  }))

  return { known: true, rows }
}

/** The wallet account the cashback reserve pays out of. */
export const CASHBACK_RESERVE_CODE = 'platform:cashback_reserve'

export interface CashbackPaidSummary {
  entries: number
  totalAgorot: number
}

/**
 * Cashback actually paid, counted from `wallet_entries` and not from
 * `cashback_ledger`.
 *
 * The two are not the same set and the console must not imply they are.
 * `cashback_ledger` arrives with migration 177, which is still pending, so it
 * holds zero rows; meanwhile the reserve account has already paid real credits
 * (two of them on production as of 2026-09-10, 90 agorot each, both tagged
 * `order_cashback`). A console whose only sentence is "no ledger entries yet"
 * reads as "no cashback has ever been paid", and that is false today and stays
 * false after 177 lands, because 177 starts recording from then on and does
 * not backfill what the wallet already moved.
 */
export async function getCashbackPaid(): Promise<CashbackPaidSummary | null> {
  const admin = createAdminClient()

  const { data: reserve, error: reserveError } = await admin
    .from('wallet_accounts')
    .select('id')
    .eq('code', CASHBACK_RESERVE_CODE)
    .maybeSingle()

  if (reserveError || !reserve) {
    if (reserveError) {
      log.warn('admin.cashback_reserve_read_failed', { reason: reserveError.message })
    }
    return null
  }

  // `amount_ils_agorot` alone, with no decimal fallback, and the reason is that
  // a fallback here would be decoration: PostgREST 42703s on the whole select
  // when a named column is absent, so the branch that reads `amount_ils`
  // instead could never run. It is GENERATED ALWAYS from the numeric column
  // (verified present on production 2026-09-10), which is the same number with
  // no float in the path. `src/server/queries/expiry.ts` reads it the same way.
  const { data, error } = await admin
    .from('wallet_entries')
    .select('amount_ils_agorot')
    .eq('debit_account', reserve.id)
    .limit(1000)

  if (error) {
    log.warn('admin.cashback_paid_read_failed', { reason: error.message })
    return null
  }

  const rows = (data ?? []) as Array<{ amount_ils_agorot: number | string | null }>

  let totalAgorot = 0
  for (const row of rows) {
    const parsed = Number(row.amount_ils_agorot ?? 0)
    totalAgorot += Number.isFinite(parsed) ? Math.round(parsed) : 0
  }

  return { entries: rows.length, totalAgorot }
}
