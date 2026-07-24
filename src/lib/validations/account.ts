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
