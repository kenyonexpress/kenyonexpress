import { z } from 'zod'

/** Israeli mobile or landline, with or without the leading zero / +972. */
const phoneSchema = z
  .string()
  .trim()
  .min(9, 'מספר טלפון קצר מדי')
  .max(15, 'מספר טלפון ארוך מדי')
  .regex(/^(\+?972|0)[-\s]?\d{1,2}[-\s]?\d{3}[-\s]?\d{4}$/, 'מספר טלפון לא תקין')

export const profileDetailsSchema = z.object({
  full_name: z.string().trim().min(2, 'יש להזין שם מלא').max(80, 'השם ארוך מדי'),
  phone: phoneSchema,
})

export type ProfileDetailsInput = z.infer<typeof profileDetailsSchema>

export const addressSchema = z.object({
  id: z.string().uuid().optional(),
  full_name: z.string().trim().min(2, 'יש להזין שם מלא').max(80, 'השם ארוך מדי'),
  phone: phoneSchema,
  street: z.string().trim().min(2, 'יש להזין רחוב').max(120, 'שם הרחוב ארוך מדי'),
  street_number: z.string().trim().max(10).optional().or(z.literal('')),
  apartment: z.string().trim().max(10).optional().or(z.literal('')),
  entrance: z.string().trim().max(10).optional().or(z.literal('')),
  floor: z.string().trim().max(10).optional().or(z.literal('')),
  city: z.string().trim().min(2, 'יש להזין עיר').max(80, 'שם העיר ארוך מדי'),
  zip: z.string().trim().max(10).optional().or(z.literal('')),
  notes_for_courier: z.string().trim().max(200, 'ההערה ארוכה מדי').optional().or(z.literal('')),
  is_default: z.coerce.boolean().optional(),
})

export type AddressInput = z.infer<typeof addressSchema>

export const idSchema = z.object({ id: z.string().uuid('מזהה לא תקין') })

export type AccountActionState = { error: string } | { success: string } | null

/**
 * "Invoice to business name" (OWNER DECISIONS v2, 22.09.2026). Both fields
 * are required TOGETHER when the toggle is on: a business invoice with a
 * name and no registration number is not one a business can use for input
 * VAT, so half-filled is treated as not filled rather than saved partially.
 * When the toggle is off, both are optional -- a customer may have typed a
 * name, changed their mind, and switched back without losing it.
 */
export const invoiceSettingsSchema = z
  .object({
    invoice_to_business: z.coerce.boolean(),
    business_name: z.string().trim().max(120, 'שם העסק ארוך מדי').optional().or(z.literal('')),
    // ח.פ. (חברה) ותעודת עוסק מורשה הן תשע ספרות בישראל.
    business_registration_number: z
      .string()
      .trim()
      .regex(/^\d{9}$/, 'מספר עוסק / ח.פ. חייב להיות תשע ספרות')
      .optional()
      .or(z.literal('')),
  })
  .superRefine((value, ctx) => {
    if (!value.invoice_to_business) return
    if (!value.business_name) {
      ctx.addIssue({ code: 'custom', path: ['business_name'], message: 'יש להזין שם עסק' })
    }
    if (!value.business_registration_number) {
      ctx.addIssue({
        code: 'custom',
        path: ['business_registration_number'],
        message: 'יש להזין מספר עוסק / ח.פ.',
      })
    }
  })

export type InvoiceSettingsInput = z.infer<typeof invoiceSettingsSchema>
