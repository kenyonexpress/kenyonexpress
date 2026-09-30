import { generateUnitCode, isUnitCodeShaped, isValidUnitCode } from '@/lib/coupons/unit-codes'
import { isValidVoucherCode, normalizeVoucherCode } from './code'

/**
 * The 8-digit fallback code of a purchased voucher (251).
 *
 * A voucher can be named at a counter three ways: the signed QR, the
 * 10-symbol Crockford code, and this one. It exists for the till with no
 * camera and the cashier who will not read "5 then K then V" aloud twice:
 * digits survive a phone call and a numeric keypad, and the Luhn check digit
 * (7 random digits plus one, the same shape as the printed coupon codes of
 * 182) makes a mistyped code fail locally instead of costing a lookup that
 * can only miss.
 *
 * IT DECIDES NOTHING. `redeem_voucher` (085) matches on `code` and on
 * nothing else; this module resolves an 8-digit entry to that code with a
 * service-role read and the RPC is handed what it always took. Single use,
 * membership, expiry, the idempotency replay and the audit row are all still
 * the RPC's, which is the point of not adding a second lookup key to the
 * money-path function.
 *
 * THE COLUMN MAY NOT EXIST. 251 is a pending migration. Every writer probes
 * for the column once per process (`resolveVoucherFallbackColumn`) and
 * writes it only when it is there, so a build that ships ahead of the
 * migration keeps issuing vouchers instead of raising 42703 on every coupon
 * order; every reader tolerates the same absence and answers "no fallback".
 */

export const VOUCHER_FALLBACK_CODE_LENGTH = 8

/** Digits only, for lookup. Does not validate; call isValidVoucherFallbackCode after. */
export function normalizeVoucherFallbackCode(input: string): string {
  return input.replace(/[^0-9]/g, '')
}

/** Exactly 8 ASCII digits. */
export function isVoucherFallbackCodeShaped(code: string): boolean {
  return isUnitCodeShaped(code)
}

/** Shape plus the Luhn check digit. The gate before any database read. */
export function isValidVoucherFallbackCode(code: string): boolean {
  return isValidUnitCode(code)
}

/** `1234-5678` for reading aloud. Never persisted. */
export function formatVoucherFallbackCode(code: string): string {
  const clean = normalizeVoucherFallbackCode(code)
  return clean.length === VOUCHER_FALLBACK_CODE_LENGTH
    ? `${clean.slice(0, 4)}-${clean.slice(4)}`
    : clean
}

/** One fresh code. The database's partial UNIQUE index is the arbiter of collisions. */
export function generateVoucherFallbackCode(randomDigit?: () => number): string {
  return generateUnitCode(randomDigit)
}

// ---------------------------------------------------------------------------
// the column probe
// ---------------------------------------------------------------------------

/** Postgres: undefined_column. */
const UNDEFINED_COLUMN = '42703'

export type FallbackColumnProbe = (column: string) => PromiseLike<{
  error: { code?: string; message?: string } | null
}>

type ProbeableClient = {
  from(table: string): {
    select(columns: string): {
      limit(count: number): PromiseLike<{ error: { code?: string; message?: string } | null }>
    }
  }
}

/** `select fallback_code from vouchers limit 0`: planned, so 42703 is raised without a row. */
export function voucherFallbackColumnProbe(client: ProbeableClient): FallbackColumnProbe {
  return (column: string) =>
    client
      .from('vouchers')
      .select(column)
      .limit(0)
      .then(({ error }) => ({ error }))
}

let cachedPresence: boolean | null = null

/**
 * Whether `vouchers.fallback_code` exists on this database. Asked once per
 * process. Same shape as `resolveGeneration` in lib/commerce/order-money-columns:
 * an error that is NOT a missing column answers "absent" WITHOUT caching, so a
 * transient failure cannot pin a process to the wrong answer for its lifetime,
 * and "absent" is the pre-251 behaviour.
 */
export async function resolveVoucherFallbackColumn(probe: FallbackColumnProbe): Promise<boolean> {
  if (cachedPresence !== null) return cachedPresence

  let result: { error: { code?: string } | null }
  try {
    result = await probe('fallback_code')
  } catch {
    return false
  }

  if (!result.error) {
    cachedPresence = true
    return true
  }
  if (result.error.code !== UNDEFINED_COLUMN) return false

  cachedPresence = false
  return false
}

/** Test seam. Never called by application code. */
export function __resetVoucherFallbackColumnCache(): void {
  cachedPresence = null
}

// ---------------------------------------------------------------------------
// resolving what a cashier typed
// ---------------------------------------------------------------------------

export type ResolvedVoucherCode =
  /** The entry was, or resolved to, a 10-symbol code the RPC accepts. */
  | { code: string; via: 'code' | 'fallback'; entered: string }
  /** Nothing the RPC could be handed. `entered` is what to put in the audit row. */
  | { code: null; via: 'invalid' | 'unknown_fallback'; entered: string }

/**
 * The minimum of the Supabase client the resolver needs: one row by fallback
 * code, tolerant of the column not existing. The real createAdminClient()
 * satisfies it structurally; callers pass it `as never` because the typed
 * client resolves row shapes from the select string and tsc gives up on the
 * comparison (TS2589), the same cast the issuer and the money probes use. Service role on purpose: 073 exposes a voucher to its
 * supplier only after redemption, so a supplier-scoped read could never find
 * the outstanding voucher a cashier is about to redeem. Ownership is decided
 * afterwards, by the RPC, exactly as for a 10-symbol code.
 */
export interface FallbackResolveClient {
  from(table: 'vouchers'): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        maybeSingle(): PromiseLike<{
          data: { code: string } | null
          error: { code?: string; message?: string } | null
        }>
      }
    }
  }
}

/**
 * What the till typed, turned into what `redeem_voucher` takes.
 *
 * Decided by SHAPE: ten symbols of the voucher alphabet is a code and is
 * passed through untouched (this is the pre-251 path, byte for byte); eight
 * digits is a fallback code and is looked up. A 10-digit string is a code,
 * not a fallback, because the alphabet includes the digits and the length
 * decides. Anything else is invalid without a read.
 *
 * A fallback that fails its own Luhn digit is refused BEFORE the database:
 * nine in ten random guesses stop here, which is what keeps the 10^7 space
 * honest against the scan rate limits.
 *
 * A missing column (42703) and a read error both answer `unknown_fallback`,
 * never throw: a till with a customer waiting gets "not found", the same
 * answer as a real miss, rather than a 500. Note the asymmetry with the
 * voucher READS in server/queries/vouchers.ts, which throw on failure: those
 * describe a voucher that exists, this one only translates an entry, and
 * the RPC that follows re-checks everything anyway.
 */
export async function resolveEnteredVoucherCode(
  entered: string,
  /**
   * Lazy on purpose: a ten-symbol code and anything malformed never touch the
   * database, so the service-role client (which throws without its key) is
   * only constructed on the 8-digit path.
   */
  client: () => FallbackResolveClient,
): Promise<ResolvedVoucherCode> {
  const asCode = normalizeVoucherCode(entered)
  if (isValidVoucherCode(asCode)) return { code: asCode, via: 'code', entered: asCode }

  const asDigits = normalizeVoucherFallbackCode(entered)
  if (!isVoucherFallbackCodeShaped(asDigits)) {
    return { code: null, via: 'invalid', entered: asCode.slice(0, 32) }
  }
  if (!isValidVoucherFallbackCode(asDigits)) {
    return { code: null, via: 'unknown_fallback', entered: asDigits }
  }

  try {
    const { data, error } = await client()
      .from('vouchers')
      .select('code')
      .eq('fallback_code', asDigits)
      .maybeSingle()
    if (error || !data?.code) return { code: null, via: 'unknown_fallback', entered: asDigits }
    const resolved = normalizeVoucherCode(data.code)
    if (!isValidVoucherCode(resolved)) {
      return { code: null, via: 'unknown_fallback', entered: asDigits }
    }
    return { code: resolved, via: 'fallback', entered: asDigits }
  } catch {
    return { code: null, via: 'unknown_fallback', entered: asDigits }
  }
}
