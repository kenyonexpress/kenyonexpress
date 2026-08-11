import { z } from 'zod'

export const productListParamsSchema = z.object({
  q: z.string().max(100).optional(),
  status: z.enum(['draft', 'active', 'paused', 'archived']).optional(),
  // Orthogonal to status, not a fifth status: a product missing its supplier or
  // its split can sit in any status, and these are exactly the ones that cannot
  // be published. All 19 of them were draft on 2026-08-11.
  incomplete: z.literal('1').optional(),
  page: z.coerce.number().int().min(1).catch(1),
  new: z.literal('1').optional(),
  edit: z.string().uuid().optional(),
})

/**
 * The PostgREST filter behind the "חסרי הגדרה" chip: no supplier, or either
 * half of the split missing. Kept next to the schema so the chip and the query
 * cannot drift apart.
 */
export const INCOMPLETE_PRODUCT_FILTER =
  'supplier_id.is.null,platform_percent.is.null,supplier_split_percent.is.null'

export const couponListParamsSchema = z.object({
  status: z.enum(['draft', 'active', 'paused', 'archived']).optional(),
  new: z.literal('1').optional(),
  edit: z.string().uuid().optional(),
})

export const categoryListParamsSchema = z.object({
  new: z.literal('1').optional(),
  edit: z.string().uuid().optional(),
})

export const userListParamsSchema = z.object({
  role: z.enum(['admin', 'content_uploader', 'vendor', 'customer', 'super_admin']).optional(),
})

export type ProductListParams = z.infer<typeof productListParamsSchema>
export type CouponListParams = z.infer<typeof couponListParamsSchema>
export type CategoryListParams = z.infer<typeof categoryListParamsSchema>
export type UserListParams = z.infer<typeof userListParamsSchema>
