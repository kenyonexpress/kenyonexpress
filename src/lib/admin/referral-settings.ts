/**
 * The referral program's terms, as an admin edits them.
 *
 * `referral_program_settings` is a one-row table (`id = true`) read by
 * `server/referrals/program.ts` on every referrals page. Money columns are
 * agorot integers; the form takes shekels as text and `parseIls` from the
 * money module turns them into agorot, so no float ever reaches the row.
 */

import { parseIls } from '@/lib/money'
import { z } from 'zod'

export const REFERRAL_SETTINGS_FIELDS = [
  'is_active',
  'referrer_bonus_agorot',
  'referred_bonus_agorot',
  'min_order_agorot',
  'qualify_window_days',
  'max_per_referrer_month',
  'max_per_referrer_year',
  'require_manual_approval',
] as const

export type ReferralSettingsField = (typeof REFERRAL_SETTINGS_FIELDS)[number]

const agorotField = (label: string) =>
  z
    .number()
    .int(`${label}: אגורות שלמות בלבד`)
    .min(0, `${label}: לא יכול להיות שלילי`)
    .max(1_000_000, `${label}: מוגבל ל-10,000 ₪`)

export const referralSettingsSchema = z
  .object({
    is_active: z.boolean(),
    referrer_bonus_agorot: agorotField('בונוס למפנה'),
    referred_bonus_agorot: agorotField('בונוס למופנה'),
    min_order_agorot: agorotField('הזמנה מינימלית'),
    qualify_window_days: z.number().int().min(1, 'חלון הזכאות: לפחות יום אחד').max(365),
    // Mirrors `referral_settings_amounts` on the table, measured 22.09.2026:
    // month > 0 and year >= month. A form that allowed 0 for "no cap" would
    // pass here and fail there with a constraint name the operator cannot read.
    max_per_referrer_month: z.number().int().min(1, 'לפחות הפניה אחת בחודש').max(1000),
    max_per_referrer_year: z.number().int().min(1).max(10_000),
    require_manual_approval: z.boolean(),
  })
  .refine((v) => v.max_per_referrer_year >= v.max_per_referrer_month, {
    message: 'המכסה השנתית לא יכולה להיות קטנה מהחודשית',
    path: ['max_per_referrer_year'],
  })

export type ReferralSettings = z.infer<typeof referralSettingsSchema>

export const REFERRAL_SETTINGS_LABELS: Record<ReferralSettingsField, string> = {
  is_active: 'התוכנית פעילה',
  referrer_bonus_agorot: 'בונוס למפנה (₪)',
  referred_bonus_agorot: 'בונוס למופנה (₪)',
  min_order_agorot: 'הזמנה מינימלית לזכאות (₪)',
  qualify_window_days: 'חלון זכאות (ימים)',
  max_per_referrer_month: 'מקסימום הפניות למפנה בחודש ',
  max_per_referrer_year: 'מקסימום הפניות למפנה בשנה ',
  require_manual_approval: 'בונוס משולם רק אחרי אישור ידני',
}

/** Form → validated row. Shekel fields are parsed to agorot; a bad number is a field error. */
export function parseReferralSettingsForm(
  form: Pick<FormData, 'get'>,
): { ok: true; value: ReferralSettings } | { ok: false; error: string } {
  const money = (key: string): number | { error: string } => {
    try {
      return parseIls(String(form.get(key) ?? '0').trim() || '0')
    } catch {
      return { error: `${REFERRAL_SETTINGS_LABELS[key as ReferralSettingsField]}: סכום לא תקין` }
    }
  }
  const int = (key: string): number => {
    const raw = String(form.get(key) ?? '').trim()
    return raw === '' ? Number.NaN : Number(raw)
  }
  const referrer = money('referrer_bonus_agorot')
  const referred = money('referred_bonus_agorot')
  const minOrder = money('min_order_agorot')
  for (const m of [referrer, referred, minOrder]) {
    if (typeof m !== 'number') return { ok: false, error: m.error }
  }

  const parsed = referralSettingsSchema.safeParse({
    is_active: form.get('is_active') === 'on',
    referrer_bonus_agorot: referrer,
    referred_bonus_agorot: referred,
    min_order_agorot: minOrder,
    qualify_window_days: int('qualify_window_days'),
    max_per_referrer_month: int('max_per_referrer_month'),
    max_per_referrer_year: int('max_per_referrer_year'),
    require_manual_approval: form.get('require_manual_approval') === 'on',
  })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path[0]
    const label = field ? REFERRAL_SETTINGS_LABELS[field as ReferralSettingsField] : null
    const message = issue?.message ?? 'קלט לא תקין'
    return {
      ok: false,
      error: label && !message.startsWith(label) ? `${label}: ${message}` : message,
    }
  }
  return { ok: true, value: parsed.data }
}

/** The row's before/after for the audit diff: only the fields the form owns. */
export function pickSettings(
  row: Record<string, unknown> | null,
): Partial<ReferralSettings> | null {
  if (!row) return null
  const out: Record<string, unknown> = {}
  for (const key of REFERRAL_SETTINGS_FIELDS) out[key] = row[key] ?? null
  return out as Partial<ReferralSettings>
}
