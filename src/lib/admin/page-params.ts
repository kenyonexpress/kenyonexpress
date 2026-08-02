import { z } from 'zod'

export const productListParamsSchema = z.object({
  q: z.string().max(100).optional(),
  status: z.enum(['draft', 'active', 'paused', 'archived']).optional(),
  page: z.coerce.number().int().min(1).catch(1),
  new: z.literal('1').optional(),
  edit: z.string().uuid().optional(),
})

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
