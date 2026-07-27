import { z } from 'zod'

const uuid = z.string().uuid()

/** ILS as a non-negative decimal with at most 2 fraction digits (wire form). */
export const ilsAmount = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    const normalized = typeof value === 'number' ? value.toFixed(2) : value.trim()
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid ILS amount' })
      return z.NEVER
    }
    return Number(normalized)
  })
  .pipe(z.number().nonnegative())

export const checkoutCustomerSchema = z.object({
  full_name: z.string().trim().min(2, 'שם מלא נדרש').max(120),
  email: z.string().trim().email('אימייל לא תקין').max(254),
  phone: z
    .string()
    .trim()
    .regex(/^05\d{8}$/, 'טלפון בפורמט 05XXXXXXXX')
    .optional()
    .or(z.literal('').transform(() => undefined)),
})

export const checkoutAddressSchema = z.object({
  address_id: uuid.nullable().default(null),
  city: z.string().trim().min(2).max(80).optional(),
  street: z.string().trim().min(2).max(120).optional(),
  house_number: z.string().trim().min(1).max(20).optional(),
  apartment: z.string().trim().max(20).optional(),
  zip: z.string().trim().max(10).optional(),
  notes: z.string().trim().max(500).optional(),
})

export const checkoutPaymentSchema = z.object({
  client_ref: uuid,
  apply_wallet_ils: ilsAmount.default(0),
  accept_terms: z.literal(true, {
    errorMap: () => ({ message: 'יש לאשר את התקנון' }),
  }),
  save_card: z.boolean().default(true),
  token_id: uuid.optional(),
})

export const beginCheckoutInputSchema = checkoutPaymentSchema
  .merge(
    z.object({
      address_id: uuid.nullable().default(null),
    }),
  )
  .superRefine((data, ctx) => {
    // address_id requirement depends on cart composition; enforced in the action.
    if (data.apply_wallet_ils < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['apply_wallet_ils'],
        message: 'סכום ארנק לא יכול להיות שלילי',
      })
    }
  })

export const beginCheckoutOutputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('redirect'),
    order_id: uuid,
    redirect_url: z.string().url(),
  }),
  z.object({
    kind: z.literal('paid'),
    order_id: uuid,
  }),
])

export const validateCartInputSchema = z.object({
  // empty object: cart is loaded from session/user
})

export const calculateSplitInputSchema = z.object({
  lines: z
    .array(
      z.object({
        id: z.string().min(1),
        productType: z.enum(['coupon', 'physical']),
        unitPriceIls: ilsAmount,
        quantity: z.number().int().min(1).max(99),
        // Mandatory on BOTH types since 2026-07-27: a coupon's prepayment is
        // now split by it too. Optional here only so the engine, not zod,
        // reports the missing-percent error with the offending line id.
        platformPercent: z.union([z.string(), z.number()]).optional(),
        // Coupon lines: the admin-set absolute on-site price. Mandatory there.
        couponPriceIls: ilsAmount.optional(),
        cashbackPercent: z.union([z.string(), z.number()]).default(0),
      }),
    )
    .min(1),
  walletAppliedIls: ilsAmount.default(0),
  idempotencyKey: z.string().min(1),
})

export const createOrderInputSchema = beginCheckoutInputSchema

export type CheckoutCustomer = z.infer<typeof checkoutCustomerSchema>
export type CheckoutAddress = z.infer<typeof checkoutAddressSchema>
export type BeginCheckoutInput = z.infer<typeof beginCheckoutInputSchema>
export type BeginCheckoutOutput = z.infer<typeof beginCheckoutOutputSchema>
export type CalculateSplitInput = z.infer<typeof calculateSplitInputSchema>
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>

export type CheckoutActionErrorCode =
  | 'UNAUTHENTICATED'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'INSUFFICIENT_STOCK'
  | 'INSUFFICIENT_WALLET'
  | 'CONSENT_REQUIRED'
  | 'ADDRESS_REQUIRED'
  | 'EXPIRED'
  | 'IDEMPOTENT_REPLAY'
  | 'PAYMENT_PROVIDER_ERROR'
  | 'PAYMENT_DECLINED'
  | 'RATE_LIMITED'
  | 'CHECKOUT_DISABLED'
  | 'INTERNAL'

export type CheckoutActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: CheckoutActionErrorCode }
