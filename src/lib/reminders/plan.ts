/**
 * Expiry reminders for coupons (vouchers): T-7 and T-1.
 *
 * Pure planning, no I/O. The caller reads the vouchers and the user's consent,
 * this decides which reminder is owed and on which channels, and builds the
 * `notification_outbox` row (kind `voucher_expiring`, which already has an
 * email builder and a push template).
 *
 * CHANNELS. Push and email always. WhatsApp only on an explicit opt-in, and
 * even then never as an automated send: the store is wa.me only, so an opted-in
 * user gets a ready wa.me link they open themselves (`waReminderLink`).
 */

import { waChatLink } from '@/lib/whatsapp'

const REMINDER_OFFSETS_DAYS = [7, 1] as const
export type ReminderOffset = (typeof REMINDER_OFFSETS_DAYS)[number]

/** Validity a product may carry. 90 is the default when none is set. */
const ALLOWED_VALIDITY_DAYS = [30, 60, 90] as const
const DEFAULT_VALIDITY_DAYS = 90

const DAY_MS = 24 * 60 * 60 * 1000

/** Per-product override if it is one of 30/60/90, otherwise the 90 day default. */
export function resolveValidityDays(override: number | null | undefined): number {
  return ALLOWED_VALIDITY_DAYS.includes(override as (typeof ALLOWED_VALIDITY_DAYS)[number])
    ? (override as number)
    : DEFAULT_VALIDITY_DAYS
}

export function expiryFrom(issuedAt: Date, validityDays: number): Date {
  return new Date(issuedAt.getTime() + validityDays * DAY_MS)
}

/**
 * Which reminder is due now, or null. T-1 wins when both windows contain `now`
 * (a coupon issued with under a week left). Windows are whole days: T-7 is
 * (1, 7] days before expiry, T-1 is (0, 1].
 */
export function dueOffset(expiresAt: Date, now: Date): ReminderOffset | null {
  const msLeft = expiresAt.getTime() - now.getTime()
  if (msLeft <= 0) return null
  if (msLeft <= DAY_MS) return 1
  if (msLeft <= 7 * DAY_MS) return 7
  return null
}

export type ReminderChannels = { push: true; email: true; whatsappLink: boolean }

export function channelsFor(consent: { whatsappOptIn: boolean }): ReminderChannels {
  return { push: true, email: true, whatsappLink: consent.whatsappOptIn === true }
}

export type VoucherForReminder = {
  id: string
  userId: string
  email: string
  code: string
  supplierName: string | null
  expiresAt: Date
  alreadySent: ReadonlyArray<ReminderOffset>
}

export type OutboxReminder = {
  kind: 'voucher_expiring'
  user_id: string
  recipient_email: string
  dedupe_key: string
  payload: Record<string, unknown>
}

/** One outbox row per voucher per offset; `dedupe_key` makes a re-run a no-op. */
export function planReminder(v: VoucherForReminder, now: Date): OutboxReminder | null {
  const offset = dueOffset(v.expiresAt, now)
  if (offset === null || v.alreadySent.includes(offset)) return null
  return {
    kind: 'voucher_expiring',
    user_id: v.userId,
    recipient_email: v.email,
    dedupe_key: `voucher_expiring:${v.id}:T${offset}`,
    payload: {
      voucher_id: v.id,
      code: v.code,
      supplier_name: v.supplierName,
      expires_at: v.expiresAt.toISOString(),
      days_left: offset,
    },
  }
}

/** wa.me link the opted-in user taps; null without consent or a usable phone. */
export function waReminderLink(
  consent: { whatsappOptIn: boolean },
  phone: string | null,
  text: string,
): string | null {
  if (!consent.whatsappOptIn || !phone) return null
  return waChatLink(phone, text)
}
