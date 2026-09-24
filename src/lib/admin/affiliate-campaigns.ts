/**
 * An affiliate campaign as an admin edits it.
 *
 * Money fields arrive as shekel text and leave as integer agorot through
 * `parseIls`; the commission arrives as a percent ("12.5") and leaves as basis
 * points through `percentToBp`. No float reaches the row. The same numbers
 * are read back by `lib/affiliates/commission.ts` at finalize.
 */

import { parseIls, percentToBp } from '@/lib/money'
import { z } from 'zod'

export const CAMPAIGN_FIELDS = [
  'name',
  'commission_bp',
  'min_order_agorot',
  'max_commission_agorot',
  'budget_agorot',
  'max_conversions_per_day',
  'require_manual_approval',
  'starts_at',
  'ends_at',
  'is_active',
  'category_id',
  'product_id',
] as const

export type CampaignField = (typeof CAMPAIGN_FIELDS)[number]

export const CAMPAIGN_LABELS: Record<CampaignField, string> = {
  name: 'שם הקמפיין',
  commission_bp: 'עמלה (%)',
  min_order_agorot: 'הזמנה מינימלית (₪)',
  max_commission_agorot: 'תקרת עמלה למכירה (₪, ריק = ללא)',
  budget_agorot: 'תקציב כולל (₪, ריק = ללא)',
  max_conversions_per_day: 'מכירות ליום לשותף לפני בדיקה',
  require_manual_approval: 'כל עמלה עוברת אישור ידני',
  starts_at: 'התחלה',
  ends_at: 'סיום (ריק = ללא)',
  is_active: 'הקמפיין פעיל',
  category_id: 'מוגבל לקטגוריה (ריק = הכל)',
  product_id: 'מוגבל למוצר (ריק = הכל)',
}

const optionalAgorot = (label: string) =>
  z
    .number()
    .int(`${label}: אגורות שלמות בלבד`)
    .positive(`${label}: חייב להיות חיובי`)
    .max(100_000_000, `${label}: מוגבל ל-1,000,000 ₪`)
    .nullable()

export const campaignSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'שם הקמפיין: לפחות שני תווים')
      .max(80, 'שם הקמפיין: עד 80 תווים'),
    // Mirrors `affiliate_campaigns_commission_range` (0..5000 bp).
    commission_bp: z.number().int().min(0, 'עמלה: לא שלילית').max(5000, 'עמלה: עד 50%'),
    min_order_agorot: z.number().int().min(0, 'הזמנה מינימלית: לא שלילית').max(100_000_000),
    max_commission_agorot: optionalAgorot('תקרת עמלה'),
    budget_agorot: optionalAgorot('תקציב'),
    max_conversions_per_day: z.number().int().min(1, 'לפחות מכירה אחת ביום').max(1000),
    require_manual_approval: z.boolean(),
    starts_at: z.string().datetime({ offset: true, message: 'התחלה: תאריך לא תקין' }),
    ends_at: z.string().datetime({ offset: true, message: 'סיום: תאריך לא תקין' }).nullable(),
    is_active: z.boolean(),
    category_id: z.string().uuid('קטגוריה: מזהה לא תקין').nullable(),
    product_id: z.string().uuid('מוצר: מזהה לא תקין').nullable(),
  })
  .refine((v) => v.ends_at === null || new Date(v.ends_at) > new Date(v.starts_at), {
    message: 'הסיום חייב להיות אחרי ההתחלה',
    path: ['ends_at'],
  })
  .refine((v) => !(v.category_id && v.product_id), {
    message: 'קמפיין מוגבל לקטגוריה או למוצר, לא לשניהם',
    path: ['product_id'],
  })

export type CampaignInput = z.infer<typeof campaignSchema>

/**
 * `<input type="datetime-local">` value (no zone) → ISO with the Israel
 * offset the admin meant. Israel is UTC+3 in summer and UTC+2 in winter; the
 * offset is read off the date itself so a campaign typed for January is not
 * an hour off in July.
 */
export function localDateTimeToIso(value: string): string | null {
  const raw = value.trim()
  if (raw === '') return null
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw)) return raw
  const probe = new Date(`${raw}Z`)
  if (Number.isNaN(probe.getTime())) return raw
  // Israel Daylight Time: last Friday before the last Sunday of March, 02:00,
  // until the last Sunday of October, 02:00. Approximated at the day level:
  // the campaigns this serves start at midnight, not at the switch hour.
  const offset = isIsraelSummer(probe) ? '+03:00' : '+02:00'
  return `${raw.length === 16 ? `${raw}:00` : raw}${offset}`
}

function lastSunday(year: number, monthIndex: number): number {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0))
  return last.getUTCDate() - last.getUTCDay()
}

function isIsraelSummer(date: Date): boolean {
  const y = date.getUTCFullYear()
  const start = Date.UTC(y, 2, lastSunday(y, 2) - 2) // Friday before the last Sunday of March
  const end = Date.UTC(y, 9, lastSunday(y, 9))
  const t = date.getTime()
  return t >= start && t < end
}

/** ISO → `datetime-local` value in Israel time, for the form's default. */
export function isoToLocalDateTime(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const offsetMinutes = isIsraelSummer(date) ? 180 : 120
  const local = new Date(date.getTime() + offsetMinutes * 60_000)
  return local.toISOString().slice(0, 16)
}

/** Form → validated row. A bad number is a field error naming the field. */
export function parseCampaignForm(
  form: Pick<FormData, 'get'>,
): { ok: true; value: CampaignInput } | { ok: false; error: string } {
  const text = (key: string) => String(form.get(key) ?? '').trim()
  const money = (key: CampaignField, optional: boolean): number | null | { error: string } => {
    const raw = text(key)
    if (raw === '') return optional ? null : 0
    try {
      return parseIls(raw)
    } catch {
      return { error: `${CAMPAIGN_LABELS[key]}: סכום לא תקין` }
    }
  }
  const minOrder = money('min_order_agorot', false)
  const maxCommission = money('max_commission_agorot', true)
  const budget = money('budget_agorot', true)
  for (const m of [minOrder, maxCommission, budget]) {
    if (m !== null && typeof m !== 'number') return { ok: false, error: m.error }
  }

  let commissionBp: number
  try {
    const raw = text('commission_bp')
    if (raw === '') return { ok: false, error: `${CAMPAIGN_LABELS.commission_bp}: חובה` }
    commissionBp = percentToBp(raw)
  } catch {
    return { ok: false, error: `${CAMPAIGN_LABELS.commission_bp}: אחוז לא תקין` }
  }

  const perDayRaw = text('max_conversions_per_day')
  const startsAt = localDateTimeToIso(text('starts_at')) ?? new Date().toISOString()

  const parsed = campaignSchema.safeParse({
    name: text('name'),
    commission_bp: commissionBp,
    min_order_agorot: minOrder,
    max_commission_agorot: maxCommission,
    budget_agorot: budget,
    max_conversions_per_day: perDayRaw === '' ? 20 : Number(perDayRaw),
    require_manual_approval: form.get('require_manual_approval') === 'on',
    starts_at: startsAt,
    ends_at: localDateTimeToIso(text('ends_at')),
    is_active: form.get('is_active') === 'on',
    category_id: text('category_id') || null,
    product_id: text('product_id') || null,
  })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path[0]
    const label = field ? CAMPAIGN_LABELS[field as CampaignField] : null
    const message = issue?.message ?? 'קלט לא תקין'
    return {
      ok: false,
      error: label && !message.startsWith(label) ? `${label}: ${message}` : message,
    }
  }
  return { ok: true, value: parsed.data }
}

/** The row's before/after for the audit diff: only the fields the form owns. */
export function pickCampaign(row: Record<string, unknown> | null): Partial<CampaignInput> | null {
  if (!row) return null
  const out: Record<string, unknown> = {}
  for (const key of CAMPAIGN_FIELDS) out[key] = row[key] ?? null
  return out as Partial<CampaignInput>
}
