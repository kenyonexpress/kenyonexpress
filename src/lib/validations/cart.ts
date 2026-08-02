import { z } from 'zod'

const uuid = z.string().uuid('מזהה לא תקין')

export const addToCartSchema = z.object({
  product_id: uuid,
  variant_id: uuid.nullable().default(null),
  quantity: z.number().int().min(1, 'כמות מינימלית: 1').max(99, 'כמות מקסימלית: 99').default(1),
})

export const updateCartItemSchema = z.object({
  product_id: uuid,
  variant_id: uuid.nullable().default(null),
  quantity: z.number().int().min(0, 'כמות לא תקינה').max(99, 'כמות מקסימלית: 99'),
})

export type AddToCartInput = z.infer<typeof addToCartSchema>
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>
