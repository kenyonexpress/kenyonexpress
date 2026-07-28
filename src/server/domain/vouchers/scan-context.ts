import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The who-and-from-where of a scan attempt, and the one way to record an
 * attempt that never reached the database.
 *
 * Migration 085 added ip_address and user_agent to voucher_redemptions because
 * the table is described as "what a dispute is settled with" and could not say
 * where a redemption came from. Every path that can refuse a scan must fill
 * them, including the paths that refuse it before any voucher is looked up.
 *
 * Authoritative document: ARCHITECTURE-VOUCHER-REDEMPTION.md section 7.1.
 */

export interface ScanContext {
  /** Client address as the edge reported it, or null when there is none to read. */
  ip: string | null
  /** Client UA, truncated. Diagnostic only; never a decision input. */
  userAgent: string | null
}

const MAX_USER_AGENT = 512

/**
 * Reads the client address from the proxy headers.
 *
 * X-Forwarded-For is a client-appendable list and the leftmost entry is
 * whatever the original client claimed, so this is evidence and not proof. It
 * is recorded on that basis: no authorization decision reads it, and the DB
 * treats an unparseable value as NULL rather than failing the scan
 * (public.voucher_scan_ip).
 */
export function readScanContext(headers: Headers): ScanContext {
  const forwarded = headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || headers.get('x-real-ip')?.trim() || null

  const ua = headers.get('user-agent')?.trim() ?? null

  return {
    ip: ip && ip.length > 0 ? ip : null,
    userAgent: ua && ua.length > 0 ? ua.slice(0, MAX_USER_AGENT) : null,
  }
}

/** Outcomes log_voucher_scan will accept. It cannot be made to record a success. */
export type PreDbScanOutcome = 'invalid_signature' | 'invalid_request' | 'not_found'

/**
 * Records an attempt that was refused before redeem_voucher() could run: a QR
 * whose HMAC did not verify, a malformed code, a token naming a voucher that is
 * not this supplier's.
 *
 * `client` decides whose session the row is attributed to. Pass the caller's
 * request-scoped client when there is a session, so scanned_by and the
 * supplier are filled from auth.uid(). Pass nothing for a visitor with no
 * session at all - the anonymous forged-token case, which is the attempt most
 * worth having and which the pre-085 function dropped on the floor. The
 * anonymous path is bounded per address inside the function.
 *
 * Never throws. An audit write that fails must not take down the page that was
 * already refusing the request; the caller has nothing useful to do about it.
 */
export async function recordRefusedScan(params: {
  codeEntered: string
  outcome: PreDbScanOutcome
  scanMethod: 'camera' | 'manual'
  context: ScanContext
  client?: SupabaseClient
}): Promise<void> {
  const client = params.client ?? createAdminClient()
  try {
    await client.rpc('log_voucher_scan', {
      p_code_entered: params.codeEntered.slice(0, 32),
      p_scan_method: params.scanMethod,
      p_outcome: params.outcome,
      p_ip: params.context.ip,
      p_user_agent: params.context.userAgent,
    })
  } catch (error) {
    console.error('log_voucher_scan failed:', error)
  }
}
