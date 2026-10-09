import { z } from 'zod'

/**
 * The generation form of a printed QR batch, as a pure schema so the action
 * and its tests share one definition.
 *
 * `expires_at` is the per-code deadline 217 added to `coupon_qr_codes`: NULL
 * means the campaign window alone governs. The form sends a
 * `datetime-local` value (no zone) or an empty string; the action stores the
 * instant the operator's browser meant, which for this operator is
 * Asia/Jerusalem. `now` is a parameter so "must be in the future" is
 * testable without a clock.
 */
export const qrBatchInputSchema = z.object({
  campaign_id: z.string().uuid(),
  label: z
    .string()
    .trim()
    .min(1, 'לאיזה שימוש הקבוצה? (למשל: פליירים ספטמבר)')
    .max(80, 'תיאור ארוך מדי'),
  // The DB CHECK has the same ceiling; validating here turns a constraint
  // violation into a field error.
  quantity: z.coerce
    .number()
    .int('כמות חייבת להיות מספר שלם')
    .min(1, 'לפחות קוד אחד')
    .max(1000, 'עד 1000 קודים בקבוצה'),
  expires_at: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
})

export type QrBatchInput = z.infer<typeof qrBatchInputSchema>

export type QrBatchParse =
  | { ok: true; value: QrBatchInput & { expires_at: string | null } }
  | { ok: false; fieldErrors: Record<string, string[]> }

/**
 * Parses the form and resolves `expires_at` to an ISO instant, or refuses a
 * deadline that is unparseable or already past: a print run that is dead on
 * arrival is a mistake worth a field error, not a batch.
 */
export function parseQrBatchInput(
  raw: Record<string, unknown>,
  now: Date = new Date(),
): QrBatchParse {
  const parsed = qrBatchInputSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }
  const v = parsed.data
  if (v.expires_at === null) return { ok: true, value: { ...v, expires_at: null } }

  const instant = new Date(v.expires_at)
  if (Number.isNaN(instant.getTime())) {
    return { ok: false, fieldErrors: { expires_at: ['תאריך התוקף אינו תקין'] } }
  }
  if (instant.getTime() <= now.getTime()) {
    return { ok: false, fieldErrors: { expires_at: ['תאריך התוקף חייב להיות בעתיד'] } }
  }
  return { ok: true, value: { ...v, expires_at: instant.toISOString() } }
}
