import { checkOptionalIsraeliPostalCode } from '@/lib/checkout/israeli-postal-code'
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

/**
 * The billing-details form on /checkout, exactly as the form posts it.
 *
 * One schema validated in two places on purpose: the client runs it before the
 * submit so the shopper gets field-level Hebrew errors without a round trip,
 * and `submitCheckout` runs it again on the server because the client run is a
 * courtesy, not a guarantee about what actually arrived.
 *
 * The zip goes through the same `checkOptionalIsraeliPostalCode` the server
 * always used (empty is fine, a present value must be a real 7-digit postal
 * code) and comes out normalized.
 */
export const checkoutDetailsFormSchema = z.object({
  first_name: z.string().trim().min(2, 'יש למלא שם פרטי'),
  last_name: z.string().trim().min(1, 'יש למלא שם משפחה'),
  city: z.string().trim().min(2, 'יש למלא עיר').max(80, 'שם עיר ארוך מדי'),
  street: z.string().trim().min(2, 'יש למלא רחוב').max(120, 'שם רחוב ארוך מדי'),
  street_number: z.string().trim().min(1, 'יש למלא מספר בית').max(20, 'מספר בית ארוך מדי'),
  apartment: z.string().trim().max(20, 'מספר דירה ארוך מדי').default(''),
  floor: z.string().trim().max(20, 'קומה ארוכה מדי').default(''),
  zip: z
    .string()
    .trim()
    .default('')
    .superRefine((value, ctx) => {
      const check = checkOptionalIsraeliPostalCode(value)
      if (check && !check.ok) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: check.message })
      }
    })
    .transform((value) => {
      const check = checkOptionalIsraeliPostalCode(value)
      return check?.ok ? check.normalized : ''
    }),
  phone: z
    .string()
    .trim()
    .regex(/^05\d{8}$/, 'טלפון בפורמט 05XXXXXXXX'),
  email: z.string().trim().email('אימייל לא תקין').max(254, 'אימייל ארוך מדי'),
  order_notes: z.string().trim().max(500, 'ההערות ארוכות מדי').default(''),
})

export type CheckoutDetailsForm = z.infer<typeof checkoutDetailsFormSchema>

export type CheckoutDetailsParse =
  | { ok: true; data: CheckoutDetailsForm }
  | { ok: false; fieldErrors: Partial<Record<keyof CheckoutDetailsForm, string>> }

/**
 * safeParse flattened to one message per field, first issue wins. The form
 * renders one error line under each input, so a list per field buys nothing.
 */
export function parseCheckoutDetails(raw: Record<string, unknown>): CheckoutDetailsParse {
  const parsed = checkoutDetailsFormSchema.safeParse(raw)
  if (parsed.success) return { ok: true, data: parsed.data }
  const fieldErrors: Partial<Record<keyof CheckoutDetailsForm, string>> = {}
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as keyof CheckoutDetailsForm | undefined
    if (field && !fieldErrors[field]) fieldErrors[field] = issue.message
  }
  return { ok: false, fieldErrors }
}

export const checkoutPaymentSchema = z.object({
  client_ref: uuid,
  apply_wallet_ils: ilsAmount.default(0),
  accept_terms: z.literal(true, {
    errorMap: () => ({ message: 'יש לאשר את התקנון' }),
  }),
  save_card: z.boolean().default(true),
  token_id: uuid.optional(),
})

/**
 * Buying the coupons of this order for somebody else (108).
 *
 * One recipient per ORDER, not per line. A gift purchase is one order for one
 * person, and a per-line recipient would have to be agreed on by the cart row,
 * the order line, the settlement snapshot and the voucher - four places, for
 * something no screen asks for.
 *
 * The email is the only required field: without it there is nobody to send to.
 * The greeting is capped because it is reproduced verbatim in an email, and an
 * unbounded field there is a payload, not a message.
 */
export const giftSchema = z.object({
  gift_recipient_email: z
    .string()
    .trim()
    .email('כתובת המייל של המקבל אינה תקינה')
    .max(200)
    .optional(),
  gift_recipient_name: z.string().trim().max(80).optional(),
  gift_message: z.string().trim().max(500, 'הברכה ארוכה מדי').optional(),
})

/**
 * Which surface the shopper is on. It changes exactly one thing: where Cardcom
 * sends the browser when its hosted page finishes.
 *
 * `web` returns into `/checkout/frame-return`, the framable stub that breaks
 * the iframe out to the top window so the Lax session cookie is sent.
 * `app` returns into `/checkout/app-return`, which hands control back to the
 * native app. The app has no iframe and no cookie problem, and the web stub's
 * top-window break would leave the customer stranded in a WebView showing our
 * desktop checkout.
 *
 * It decides nothing about money, and nothing downstream of the redirect reads
 * it: both paths settle through the same webhook and the same `GetLpResult`
 * verification.
 */
export const checkoutChannelSchema = z.enum(['web', 'app']).default('web')

export const beginCheckoutInputSchema = checkoutPaymentSchema
  .merge(
    z.object({
      address_id: uuid.nullable().default(null),
      channel: checkoutChannelSchema,
    }),
  )
  .merge(giftSchema)
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
