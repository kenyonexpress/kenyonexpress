import { z } from 'zod'

/**
 * Cardcom Low Profile webhook payload (superset-tolerant).
 * Field names follow Cardcom's form-encoded callback conventions.
 */
export const cardcomWebhookPayloadSchema = z
  .object({
    terminalnumber: z.coerce.number(),
    lowprofilecode: z.string().min(1),
    Operation: z.string().optional(),
    ResponseCode: z.coerce.number(),
    InternalDealNumber: z.coerce.string().optional(),
    Amount: z.coerce.number().optional(),
    Token: z.string().optional(),
    CardValidityMonth: z.coerce.number().optional(),
    CardValidityYear: z.coerce.number().optional(),
    Last4CardDigits: z.coerce.string().optional(),
    CardBrand: z.coerce.string().optional(),
    ReturnValue: z.string().optional(),
  })
  .passthrough()

export type CardcomWebhookPayload = z.infer<typeof cardcomWebhookPayloadSchema>

export function isCardcomSuccess(payload: CardcomWebhookPayload): boolean {
  return payload.ResponseCode === 0
}
