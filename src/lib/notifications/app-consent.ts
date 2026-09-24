import { type Channel, OPTIONAL_KINDS, type OptionalKind } from '@/lib/notifications/preferences'

/**
 * "Everything in the app": one switch that turns on every OPTIONAL notification
 * kind on the two channels that live inside the app (the notification centre and
 * push), and records that the customer asked for it.
 *
 * WHAT IT IS NOT. It never touches `email`, `whatsapp` or SMS. The 22.09.2026
 * owner policy keeps customer email off, and WhatsApp is only ever a message the
 * customer starts. Required kinds (receipt, voucher, refund) have no rows and
 * are unaffected: they are sent regardless.
 *
 * THE CONSENT IS EVIDENCE, NOT A SETTING. The switch state is read back from the
 * newest consent event, and each change appends a row with the wording version
 * the customer saw, so "when did they agree, and to what text" has an answer.
 */

/** Bump when the sentence shown next to the switch changes, so old consents stay attributable. */
export const APP_CONSENT_WORDING_VERSION = '2026-09-23'

export const APP_CONSENT_CHANNELS = ['in_app', 'push'] as const satisfies readonly Channel[]

export type AppConsentSource = 'account_page' | 'post_purchase'

export interface PreferenceUpsertRow {
  user_id: string
  kind: OptionalKind
  channel: (typeof APP_CONSENT_CHANNELS)[number]
  enabled: boolean
}

/** Every optional kind on every in-app channel, all set to `enabled`. */
export function appConsentPreferenceRows(userId: string, enabled: boolean): PreferenceUpsertRow[] {
  return OPTIONAL_KINDS.flatMap((kind) =>
    APP_CONSENT_CHANNELS.map((channel) => ({ user_id: userId, kind, channel, enabled })),
  )
}

export interface ConsentEventLike {
  action: string
  created_at: string
}

/** The switch is on when the newest event is an opt-in. No events means off. */
export function appConsentIsOn(events: readonly ConsentEventLike[]): boolean {
  if (events.length === 0) return false
  const newest = [...events].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]
  return newest?.action === 'opt_in'
}
