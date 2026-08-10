import { z } from 'zod'

const israeliPhone = z
  .string()
  .min(1, 'מספר טלפון נדרש')
  .transform((s) => s.replace(/[\s\-\(\)]/g, ''))
  .refine(
    (s) => /^(?:\+972|972|0)(5[0-9]|7[2-9])\d{7}$/.test(s),
    'מספר טלפון ישראלי לא תקין (לדוגמה: 050-1234567)',
  )

export const loginSchema = z.object({
  email: z.string().min(1, 'אימייל נדרש').email('כתובת אימייל לא תקינה'),
  password: z.string().min(1, 'סיסמה נדרשת'),
})

export const signupSchema = z.object({
  full_name: z.string().min(2, 'שם מלא חייב להכיל לפחות 2 תווים').trim(),
  email: z
    .string()
    .min(1, 'אימייל נדרש')
    .email('כתובת אימייל לא תקינה')
    .transform((s) => s.toLowerCase().trim()),
  phone: israeliPhone,
  password: z
    .string()
    .min(8, 'הסיסמה חייבת להכיל לפחות 8 תווים')
    .regex(/\d/, 'הסיסמה חייבת להכיל לפחות ספרה אחת'),
})

export const magicLinkSchema = z.object({
  email: z
    .string()
    .min(1, 'אימייל נדרש')
    .email('כתובת אימייל לא תקינה')
    .transform((s) => s.toLowerCase().trim()),
})

export const passwordResetSchema = z.object({
  email: z
    .string()
    .min(1, 'אימייל נדרש')
    .email('כתובת אימייל לא תקינה')
    .transform((s) => s.toLowerCase().trim()),
})

export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'הסיסמה חייבת להכיל לפחות 8 תווים')
      .regex(/\d/, 'הסיסמה חייבת להכיל לפחות ספרה אחת'),
    confirm_password: z.string().min(1, 'אישור סיסמה נדרש'),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'הסיסמאות אינן תואמות',
    path: ['confirm_password'],
  })

export type LoginInput = z.infer<typeof loginSchema>
export type SignupInput = z.infer<typeof signupSchema>
/**
 * The phone the customer typed, before normalisation. Kept permissive on
 * purpose: the shape check that matters is `isSmsCapableIsraeli`, which knows
 * about mobile prefixes, and duplicating a regex here would let the two
 * disagree about what a valid number is.
 */
export const phoneOtpSchema = z.object({
  phone: z.string().min(9, 'מספר טלפון נדרש').max(20, 'מספר טלפון לא תקין'),
})

export const phoneVerifySchema = z.object({
  phone: z.string().min(9, 'מספר טלפון נדרש').max(20, 'מספר טלפון לא תקין'),
  // Supabase issues six digits; the range is wider so a project configured for
  // a different length does not fail here with a message about the wrong thing.
  token: z
    .string()
    .trim()
    .regex(/^\d{4,10}$/, 'הקוד מורכב מספרות בלבד'),
})

export type PhoneOtpInput = z.infer<typeof phoneOtpSchema>
export type PhoneVerifyInput = z.infer<typeof phoneVerifySchema>

export type MagicLinkInput = z.infer<typeof magicLinkSchema>
export type PasswordResetInput = z.infer<typeof passwordResetSchema>
export type NewPasswordInput = z.infer<typeof newPasswordSchema>
