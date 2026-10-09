import 'server-only'

import { log } from '@/lib/observability/log'
import {
  isWhatsappConfigured,
  sendWhatsappTemplate,
  toWhatsappAddress,
} from '@/lib/whatsapp/twilio'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The WhatsApp leg of the notification outbox (marathon step 8).
 *
 * WHAT RIDES WHERE. The outbox row's own state machine belongs to the email
 * leg and the push leg, which have status columns. WhatsApp deliberately has
 * none: it piggybacks on the email leg's pending->sent transition, which the
 * drain performs exactly once per row, so a template cannot be sent twice
 * without a schema change this project is not allowed to apply. The cost is
 * honest and accepted: an email that succeeds while WhatsApp fails is not
 * retried on the WhatsApp side. For a v1 whose Twilio account does not exist
 * yet, best-effort beside an exactly-once email beats a second state machine
 * in a table only Ofir may migrate.
 *
 * WHY ONLY TWO KINDS. Approved templates are per-message-shape; the two the
 * business asked for (CLOSEOUT §4 order) are voucher-issued and
 * expiry-reminder. Everything else returns null and costs nothing.
 */

export const WHATSAPP_KINDS = ['voucher_issued', 'voucher_expiring'] as const

export type WhatsappMessage = { contentSid: string; variables: Record<string, string> }

function text(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key]
  return typeof v === 'string' && v.length > 0 ? v : null
}

/** `2026-10-01T...` -> `01.10.2026`, the format the templates were written with. */
function hebrewDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`
}

/**
 * The template and its positional variables for a queued kind, or null when
 * the kind has no template, the payload cannot fill it, or the template's SID
 * is not configured yet (the approval blocker).
 */
export function buildWhatsappMessage(
  kind: string,
  payload: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): WhatsappMessage | null {
  if (kind === 'voucher_issued') {
    const contentSid = env.TWILIO_CONTENT_SID_VOUCHER_ISSUED
    if (!contentSid) return null
    const vouchers = Array.isArray(payload.vouchers) ? payload.vouchers : []
    const first = (vouchers[0] ?? null) as Record<string, unknown> | null
    const code = first ? text(first, 'code') : null
    if (!code) return null
    return {
      contentSid,
      variables: {
        '1': code,
        '2': (first && text(first, 'supplier_name')) ?? 'בית העסק',
        '3': hebrewDate(first ? text(first, 'expires_at') : null) ?? '',
      },
    }
  }

  if (kind === 'voucher_expiring') {
    const contentSid = env.TWILIO_CONTENT_SID_VOUCHER_EXPIRING
    if (!contentSid) return null
    const code = text(payload, 'code')
    if (!code) return null
    return {
      contentSid,
      variables: {
        '1': code,
        '2': text(payload, 'supplier_name') ?? 'בית העסק',
        '3': hebrewDate(text(payload, 'expires_at')) ?? '',
      },
    }
  }

  return null
}

/**
 * Best-effort WhatsApp beside a just-sent email. Never throws and never
 * touches the outbox row; the caller's state machine is not this function's
 * to move. Returns what happened so the drain can count it.
 */
export async function sendOutboxWhatsapp(
  admin: SupabaseClient,
  row: { kind: string; user_id: string | null; payload: Record<string, unknown> | null },
): Promise<'sent' | 'skipped' | 'failed'> {
  try {
    if (!isWhatsappConfigured()) return 'skipped'
    const message = buildWhatsappMessage(row.kind, row.payload ?? {})
    if (!message || !row.user_id) return 'skipped'

    const { data, error } = await admin
      .from('profiles')
      .select('phone')
      .eq('id', row.user_id)
      .maybeSingle()
    if (error) {
      // A phone we could not read is a message not sent, and it must say so:
      // rendering the failure as "no phone" would hide a database problem
      // behind a silent skip.
      log.warn('whatsapp.phone_lookup_failed', { kind: row.kind, reason: error.message })
      return 'failed'
    }
    const to = toWhatsappAddress((data as { phone: string | null } | null)?.phone)
    if (!to) return 'skipped'

    const result = await sendWhatsappTemplate({ to, ...message })
    if (result.ok) return 'sent'
    if ('skipped' in result && result.skipped) return 'skipped'
    log.warn('whatsapp.send_failed', {
      kind: row.kind,
      reason: 'error' in result ? result.error : 'unknown',
    })
    return 'failed'
  } catch (err) {
    log.warn('whatsapp.send_failed', {
      kind: row.kind,
      reason: err instanceof Error ? err.message : 'unknown',
    })
    return 'failed'
  }
}
