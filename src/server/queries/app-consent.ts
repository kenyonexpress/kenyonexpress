import { appConsentIsOn } from '@/lib/notifications/app-consent'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'

/** "That table is not there": 240 is written and unapplied. */
const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

export interface AppConsentState {
  /** False while `app_consent_events` does not exist, so the page says so instead of lying. */
  available: boolean
  on: boolean
}

/** The signed-in customer's "everything in the app" state, read under RLS from the newest events. */
export async function loadAppConsent(): Promise<AppConsentState> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('app_consent_events' as never)
    .select('action, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    if (error.code && MISSING_TABLE.has(error.code)) return { available: false, on: false }
    log.warn('app_consent.read_failed', { reason: error.message })
    return { available: false, on: false }
  }

  const events = ((data ?? []) as unknown as { action: string; created_at: string }[]).map(
    (row) => ({ action: String(row.action), created_at: String(row.created_at) }),
  )
  return { available: true, on: appConsentIsOn(events) }
}
