import { log } from '@/lib/observability/log'
/**
 * Which money columns `public.payments` actually has in the database this
 * process is talking to.
 *
 * WHY THIS IS NEEDED, AND WHY IT IS NOT A GENERAL SCHEMA SHIM
 *
 * Migration 059 renames the money columns to integer agorot: `amount_ils` ->
 * `amount_agorot`, `wallet_applied_ils` -> `wallet_applied_agorot`. The code is
 * written post-059. **The hosted project is pre-059** and carries the shekel
 * columns, verified by probing information_schema rather than by reading the
 * generated types, which are stale for this table.
 *
 * Naming a column Postgres does not have is not a partial failure. It raises
 * 42703 and takes down the WHOLE statement, and every one of these statements
 * is on the money path:
 *
 *   - the `payments` INSERT in beginCheckout, which names both columns, so no
 *     payment row can be created at all and checkout cannot start
 *   - the webhook's payment lookup, which fails, returns `null`, and makes the
 *     route answer `{ok:true, unknown_payment:true}` with a 200 for a customer
 *     Cardcom has just charged, leaving the order open and nothing raised
 *   - the return page's reconcile read, the last chance to close that order
 *
 * The same trap has now been walked into from both directions: the comments at
 * those call sites record a previous session fixing `amount_ils` to
 * `amount_agorot` on the belief that the shekel column "no longer exists". It
 * does exist; 059 was never cut here. `lib/supabase/optional-columns.ts` says
 * the same thing about `products.price_ils` and gives the same answer, which is
 * to probe instead of guess.
 *
 * So this resolves ONCE per process, remembers the answer, and normalises
 * everything to agorot at the boundary. When 059 is cut, the probe finds the
 * agorot columns and nothing else changes.
 */

/** Postgres: undefined_column. */
const UNDEFINED_COLUMN = '42703'

export type PaymentMoneySchema = {
  /** `agorot` is post-059. `ils` is what the hosted project has today. */
  kind: 'agorot' | 'ils'
  amountColumn: string
  walletAppliedColumn: string
  /** Stored value -> integer agorot. Null when the value is absent or unreadable. */
  toAgorot(stored: unknown): number | null
  /** Integer agorot -> the value to store in this schema's column. */
  fromAgorot(agorot: number): number
}

/**
 * `Number(null)` is 0 and `Number('')` is 0, and a missing amount that reads as
 * zero would compare equal to a free order rather than to nothing. Absence is
 * kept distinct from a value all the way through.
 */
function numeric(stored: unknown): number | null {
  if (stored === null || stored === undefined || stored === '') return null
  const parsed = Number(stored)
  return Number.isFinite(parsed) ? parsed : null
}

export const AGOROT_SCHEMA: PaymentMoneySchema = {
  kind: 'agorot',
  amountColumn: 'amount_agorot',
  walletAppliedColumn: 'wallet_applied_agorot',
  toAgorot: (stored) => {
    const parsed = numeric(stored)
    return parsed === null ? null : Math.round(parsed)
  },
  fromAgorot: (agorot) => Math.round(agorot),
}

export const ILS_SCHEMA: PaymentMoneySchema = {
  kind: 'ils',
  amountColumn: 'amount_ils',
  walletAppliedColumn: 'wallet_applied_ils',
  toAgorot: (stored) => {
    const parsed = numeric(stored)
    return parsed === null ? null : Math.round(parsed * 100)
  },
  fromAgorot: (agorot) => Math.round(agorot) / 100,
}

/** The columns a `select` needs, in whichever schema this database has. */
export function paymentMoneySelect(schema: PaymentMoneySchema): string {
  return `${schema.amountColumn}, ${schema.walletAppliedColumn}`
}

/** The money half of a `payments` insert, in whichever schema this database has. */
export function paymentMoneyWrite(
  schema: PaymentMoneySchema,
  amounts: { amountAgorot: number; walletAppliedAgorot: number },
): Record<string, number> {
  return {
    [schema.amountColumn]: schema.fromAgorot(amounts.amountAgorot),
    [schema.walletAppliedColumn]: schema.fromAgorot(amounts.walletAppliedAgorot),
  }
}

/** Reads the charged amount in agorot off a row selected under `schema`. */
export function readAmountAgorot(
  schema: PaymentMoneySchema,
  row: Record<string, unknown> | null | undefined,
): number | null {
  if (!row) return null
  return schema.toAgorot(row[schema.amountColumn])
}

export type ProbeResult = { error: { code?: string; message?: string } | null }

let cached: PaymentMoneySchema | null = null
let warned = false

/**
 * Probes for the post-059 column once and remembers the answer.
 *
 * The probe is a `select` that reads no rows: 42703 is raised on planning, so
 * `limit 0` is enough to learn whether the column exists and costs nothing.
 *
 * A probe that fails for any OTHER reason resolves to the post-059 schema
 * without caching, so a transient outage does not pin the process to the wrong
 * answer for its lifetime.
 */
export async function resolvePaymentMoneySchema(
  probe: (column: string) => PromiseLike<ProbeResult>,
): Promise<PaymentMoneySchema> {
  if (cached) return cached

  let result: ProbeResult
  try {
    result = await probe(AGOROT_SCHEMA.amountColumn)
  } catch {
    return AGOROT_SCHEMA
  }

  if (!result.error) {
    cached = AGOROT_SCHEMA
    return cached
  }

  if (result.error.code !== UNDEFINED_COLUMN) return AGOROT_SCHEMA

  if (!warned) {
    warned = true
    log.warn('payments.pre_059_money_columns', {
      detail:
        'payments carries amount_ils / wallet_applied_ils. Reading and writing shekels and converting at the boundary. Apply 059 to move to agorot.',
    })
  }
  cached = ILS_SCHEMA
  return cached
}

/** Test seam. Never called by application code. */
export function __resetPaymentMoneySchemaCache(): void {
  cached = null
  warned = false
}
