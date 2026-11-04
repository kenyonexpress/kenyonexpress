import 'server-only'
import { log } from '@/lib/observability/log'
import type { PartnerInput } from '@/lib/vouchers/partner-input'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeVoucherCode } from './code'
import { verifyVoucherQrPayload } from './qr'
import type { ScanContext } from './scan-context'

/**
 * Partner-side redemption (/partner/redeem, queue S15).
 *
 * The burn itself is `redeem_voucher_locked` (live in production since before
 * this file, captured AND FIXED in migrations/pending/255, because the live
 * body could not be called at all, see that file): it takes a per-code advisory
 * lock, calls `redeem_voucher` (the single-use UPDATE guarded on
 * `status = 'issued'`, plus the idempotency replay on `voucher_redemptions`),
 * and writes one row to `vouchers_redemption_events` for every attempt,
 * replays included, with the `input_kind` that arrived. Nothing called it until
 * now, so that table had 0 rows.
 *
 * What this module adds is the 8-digit pin. `redeem_voucher` only knows the
 * short code, so the pin is resolved to a code here, and ONLY among vouchers of
 * businesses the caller is an active member of. A pin is unique per business
 * among issued vouchers only, so a redeemed voucher's pin can be reused by a
 * later one: the issued row wins, and otherwise the newest row answers, which
 * is what makes a second redeem of the same pin say "already redeemed" rather
 * than "not found".
 *
 * Double redeem is refused by the database, not here. Two tills submitting the
 * same pin at once both resolve to the same code; the advisory lock serialises
 * them and the second UPDATE finds no issued row.
 */

export type PartnerInputKind = 'qr' | 'code' | 'pin'

export type PartnerRedeemOutcome =
  | 'success'
  | 'already_redeemed'
  | 'expired'
  | 'cancelled'
  | 'refunded'
  | 'not_found'
  | 'invalid_request'
  | 'unauthorized'
  | 'rate_limited'

const KNOWN: readonly PartnerRedeemOutcome[] = [
  'success',
  'already_redeemed',
  'expired',
  'cancelled',
  'refunded',
  'not_found',
  'invalid_request',
  'unauthorized',
  'rate_limited',
]

export interface PartnerRedeemResult {
  outcome: PartnerRedeemOutcome
  inputKind: PartnerInputKind | null
  replayed: boolean
  /** The resolved short code, when there was one to resolve. */
  code: string | null
  /** The RPC's jsonb, untouched, for the route to shape a response from. */
  raw: Record<string, unknown>
}

export function asPartnerOutcome(value: unknown): PartnerRedeemOutcome {
  // wrong_supplier never reaches the caller: the RPC already answers
  // not_found for it, and anything unrecognised collapses the same way.
  return KNOWN.includes(value as PartnerRedeemOutcome)
    ? (value as PartnerRedeemOutcome)
    : 'not_found'
}

/**
 * The pin's voucher code among the caller's businesses, or null.
 *
 * Throws on a failed read. A read that failed is not a voucher that does not
 * exist, and answering "not found" to a customer who paid would be wrong.
 */
export async function resolvePartnerPin(
  scoped: SupabaseClient,
  admin: SupabaseClient,
  userId: string,
  pin: string,
): Promise<string | null> {
  const memberships = await scoped
    .from('supplier_members')
    .select('supplier_id')
    .eq('user_id', userId)
    .eq('is_active', true)
  if (memberships.error) {
    throw new Error(`partner.pin_memberships_failed: ${memberships.error.message}`)
  }
  const supplierIds = ((memberships.data ?? []) as { supplier_id: string | null }[])
    .map((row) => row.supplier_id)
    .filter((id): id is string => Boolean(id))
  if (supplierIds.length === 0) return null

  const vouchers = await admin
    .from('vouchers')
    .select('code, status, created_at')
    .eq('partner_pin', pin)
    .in('supplier_id', supplierIds)
    .order('created_at', { ascending: false })
    .limit(20)
  if (vouchers.error) {
    throw new Error(`partner.pin_lookup_failed: ${vouchers.error.message}`)
  }
  const rows = (vouchers.data ?? []) as { code: string; status: string }[]
  const pick = rows.find((row) => row.status === 'issued') ?? rows[0]
  return pick?.code ?? null
}

/**
 * One row in `vouchers_redemption_events` for an attempt that never reached
 * the RPC (bad signature, unknown pin, garbage input). The RPC writes its own
 * row for everything else. Never throws: the log is not allowed to change the
 * answer the till gets.
 */
async function recordPreRpcEvent(
  admin: SupabaseClient,
  row: {
    userId: string
    code: string
    inputKind: string
    scanMethod: 'camera' | 'manual'
    outcome: PartnerRedeemOutcome
    context: ScanContext
  },
): Promise<void> {
  try {
    const { error } = await admin.from('vouchers_redemption_events').insert({
      actor_user_id: row.userId,
      code: row.code.slice(0, 64),
      input_kind: row.inputKind,
      scan_method: row.scanMethod,
      outcome: row.outcome,
      replayed: false,
      ip_address: row.context.ip,
      user_agent: row.context.userAgent,
    })
    if (error) log.warn('partner.redeem_event_insert_failed', { reason: error.message })
  } catch (error) {
    log.warn('partner.redeem_event_insert_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
  }
}

export async function redeemForPartner(params: {
  scoped: SupabaseClient
  admin: SupabaseClient
  userId: string
  input: PartnerInput
  scanMethod: 'camera' | 'manual'
  idempotencyKey: string
  context: ScanContext
}): Promise<PartnerRedeemResult> {
  const { scoped, admin, userId, input, scanMethod, idempotencyKey, context } = params

  const refuse = async (
    outcome: PartnerRedeemOutcome,
    inputKind: PartnerInputKind | 'invalid',
    entered: string,
  ): Promise<PartnerRedeemResult> => {
    // The table's CHECK allows qr, code and pin only. Unparseable input was
    // typed into the code field, so it is logged as `code`.
    await recordPreRpcEvent(admin, {
      userId,
      code: entered || '-',
      inputKind: inputKind === 'invalid' ? 'code' : inputKind,
      scanMethod,
      outcome,
      context,
    })
    return {
      outcome,
      inputKind: inputKind === 'invalid' ? null : inputKind,
      replayed: false,
      code: null,
      raw: {},
    }
  }

  let code: string | null = null
  let inputKind: PartnerInputKind
  if (input.kind === 'token') {
    inputKind = 'qr'
    const verified = verifyVoucherQrPayload(input.token)
    if (!verified) return refuse('not_found', 'qr', 'invalid_signature')
    code = normalizeVoucherCode(verified.c)
  } else if (input.kind === 'code') {
    inputKind = 'code'
    code = normalizeVoucherCode(input.code)
  } else if (input.kind === 'pin') {
    inputKind = 'pin'
    code = await resolvePartnerPin(scoped, admin, userId, input.pin)
    if (!code) return refuse('not_found', 'pin', input.pin)
  } else {
    return refuse('invalid_request', 'invalid', 'unparseable')
  }

  // The user-scoped client, never the admin one: the RPC derives the business
  // from auth.uid(), and a service-role call has no uid at all.
  const { data, error } = await scoped.rpc('redeem_voucher_locked', {
    p_code: code,
    p_input_kind: inputKind,
    p_scan_method: scanMethod,
    p_idempotency_key: idempotencyKey,
    p_ip: context.ip,
    p_user_agent: context.userAgent,
  })
  if (error) throw new Error(`partner.redeem_rpc_failed: ${error.message}`)

  const raw = (data ?? {}) as Record<string, unknown>
  return {
    outcome: asPartnerOutcome(raw.outcome),
    inputKind,
    replayed: raw.replayed === true,
    code: (raw.code as string | undefined) ?? code,
    raw,
  }
}
