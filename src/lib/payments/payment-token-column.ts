import { log } from '@/lib/observability/log'
import type { ProbeResult } from '@/lib/payments/payment-money-columns'

/**
 * Does `public.payments` have `token_id` in the database this process is
 * talking to?
 *
 * MEASURED AGAINST PRODUCTION ON 2026-09-09, and this is not a hypothetical.
 * `information_schema.columns` for `public.payments` returns exactly twenty
 * columns and `token_id` is not among them:
 *
 *   id, order_id, kind, status, amount_ils, currency, wallet_applied_ils,
 *   idempotency_key, cardcom_low_profile_id, cardcom_transaction_id,
 *   raw_response, failure_code, failure_message, succeeded_at, failed_at,
 *   created_at, updated_at, cardcom_account_id, refund_of_payment_id,
 *   amount_ils_agorot
 *
 * `supabase/migrations/026_commerce.sql` declares the column, which is why the
 * generated types were believed to have it and why nobody looked. They do not
 * have it either, and production is a different lineage from the file chain -
 * the same discovery `payment-money-columns.ts` records for 059.
 *
 * WHAT THAT COST. On 2026-09-07, `52fe21ed4` added `token_id: token.id` to the
 * `payments` INSERT on the SAVED-CARD charge path. Naming a column Postgres
 * does not have raises 42703 and takes down the whole statement, so since that
 * commit **every attempt to pay with a saved card fails in production** with
 * "יצירת תשלום נכשלה" before Cardcom is ever called. The hosted-page path,
 * which inserts no `token_id`, is unaffected - which is exactly why this never
 * showed up as "checkout is down".
 *
 * So the column is written when it exists and omitted when it does not, and the
 * charge goes through either way. The FK is a useful record and not a reason to
 * refuse a customer's money.
 */

/** Postgres: undefined_column. */
const UNDEFINED_COLUMN = '42703'

let cached: boolean | null = null
let warned = false

/**
 * Probes once per process and remembers the answer, like the money-column
 * probe beside it. `limit 0` is enough: 42703 is raised at planning time.
 *
 * A probe that fails for any other reason answers "present" WITHOUT caching, so
 * a transient outage cannot pin the process to the degraded answer for its
 * lifetime - and answering "present" is the safe direction here, because on a
 * database that does have the column, omitting it silently loses the link
 * between a charge and the card it rode on.
 */
export async function paymentsHaveTokenColumn(
  probe: (column: string) => PromiseLike<ProbeResult>,
): Promise<boolean> {
  if (cached !== null) return cached

  let result: ProbeResult
  try {
    result = await probe('token_id')
  } catch {
    return true
  }

  if (!result.error) {
    cached = true
    return cached
  }
  if (result.error.code !== UNDEFINED_COLUMN) return true

  if (!warned) {
    warned = true
    log.warn('payments.no_token_id_column', {
      detail:
        'public.payments has no token_id. Saved-card charges are recorded without the link to the card. Apply migrations/pending/202 to add it.',
    })
  }
  cached = false
  return cached
}

/** The `token_id` half of a `payments` insert, empty when the column is absent. */
export function paymentTokenWrite(present: boolean, tokenId: string): Record<string, string> {
  return present ? { token_id: tokenId } : {}
}

/** Test seam. Never called by application code. */
export function __resetPaymentTokenColumnCache(): void {
  cached = null
  warned = false
}
