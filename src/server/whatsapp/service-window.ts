import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * WhatsApp's 24-hour customer-service window.
 *
 * A business may send free text to a number only within 24 hours of that
 * number's last message to the business; outside it only approved templates
 * deliver. The webhook records every inbound message in
 * `whatsapp_inbound_messages` (173), so "is the window open" is one indexed
 * read of the newest row for the phone. The check is deliberately strict:
 * a read error, a missing table, or no row at all reads as CLOSED, because
 * the failure mode of guessing open is a send Twilio refuses and bills.
 */

export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000

type AdminClient = ReturnType<typeof createAdminClient>

/** True only when the phone wrote to us within the last 24 hours. */
export function windowOpenSince(
  lastInboundIso: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!lastInboundIso) return false
  const at = new Date(lastInboundIso).getTime()
  if (Number.isNaN(at)) return false
  return now - at >= 0 && now - at < SERVICE_WINDOW_MS
}

/**
 * The newest inbound message from `phoneDigits` (international digits, no
 * plus), or null. Never throws; the drain treats null as a closed window.
 */
export async function lastInboundAt(
  admin: AdminClient,
  phoneDigits: string,
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from('whatsapp_inbound_messages')
      .select('created_at')
      .eq('phone', phoneDigits)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    return (data as { created_at: string }).created_at ?? null
  } catch {
    return null
  }
}

export async function serviceWindowOpen(
  admin: AdminClient,
  phoneDigits: string,
  now = Date.now(),
): Promise<boolean> {
  return windowOpenSince(await lastInboundAt(admin, phoneDigits), now)
}
