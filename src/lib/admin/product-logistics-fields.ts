import { z } from 'zod'

/**
 * The product columns migrations 185, 187 and 278 added: cancellation window,
 * payout cadence, street address and shipping price.
 *
 * PRESENT-KEYS-ONLY, ON PURPOSE. The admin product form does not send these
 * fields, and productSchema's preprocess turns an absent key into null, which
 * would wipe a value the CSV import had set the next time anyone saved the
 * product. So this parser returns ONLY the keys the submitted form carries;
 * a form that never mentions a column never writes it.
 *
 * shipping_price_agorot is integer agorot (money.ts rule): no shekel float is
 * ever accepted for it.
 */

const PAYOUT_CADENCES = ['weekly', 'biweekly', 'monthly'] as const
export type PayoutCadence = (typeof PAYOUT_CADENCES)[number]

/** `payout_cadence_days` in a CSV is accepted only as one of these three. */
const CADENCE_BY_DAYS: Record<string, PayoutCadence> = {
  '7': 'weekly',
  '14': 'biweekly',
  '30': 'monthly',
}

const fieldSchemas = {
  cancellation_window_days: z.coerce
    .number({ message: 'חלון ביטול חייב להיות מספר ימים' })
    .int('חלון ביטול חייב להיות מספר שלם')
    .min(0, 'חלון ביטול בין 0 ל-365 ימים')
    .max(365, 'חלון ביטול בין 0 ל-365 ימים'),
  supplier_transfer_days: z.coerce
    .number({ message: 'ימי העברה לספק חייבים להיות מספר' })
    .int('ימי העברה לספק חייבים להיות מספר שלם')
    .min(0, 'ימי העברה לספק בין 0 ל-90')
    .max(90, 'ימי העברה לספק בין 0 ל-90'),
  payout_cadence: z.enum(PAYOUT_CADENCES, { message: 'מחזור תשלום: weekly, biweekly או monthly' }),
  full_address: z.string().trim().min(1).max(200, 'כתובת עד 200 תווים'),
  shipping_price_agorot: z.coerce
    .number({ message: 'מחיר משלוח באגורות חייב להיות מספר' })
    .int('מחיר משלוח באגורות חייב להיות מספר שלם')
    .min(0, 'מחיר משלוח לא יכול להיות שלילי')
    .max(10_000_000, 'מחיר משלוח גבוה מדי'),
} as const

type LogisticsKey = keyof typeof fieldSchemas
const LOGISTICS_KEYS = Object.keys(fieldSchemas) as LogisticsKey[]

type LogisticsFields = Partial<{
  cancellation_window_days: number | null
  supplier_transfer_days: number | null
  payout_cadence: PayoutCadence | null
  full_address: string | null
  shipping_price_agorot: number | null
}>

export type LogisticsResult = { ok: true; fields: LogisticsFields } | { ok: false; error: string }

/** Maps the CSV alias to the stored column, refusing anything but 7, 14, 30. */
export function cadenceFromDays(days: string): PayoutCadence | null {
  return CADENCE_BY_DAYS[days.trim()] ?? null
}

/**
 * Reads the logistics keys present on `form`. An explicitly empty value clears
 * the column (null); a missing key is left out entirely.
 */
export function parseLogisticsFields(form: FormData): LogisticsResult {
  const fields: Record<string, unknown> = {}
  for (const key of LOGISTICS_KEYS) {
    if (!form.has(key)) continue
    const raw = String(form.get(key) ?? '').trim()
    if (raw === '') {
      fields[key] = null
      continue
    }
    const parsed = fieldSchemas[key].safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? `ערך לא תקין ב-${key}` }
    }
    fields[key] = parsed.data
  }
  return { ok: true, fields: fields as LogisticsFields }
}
