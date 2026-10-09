import { z } from 'zod'
import { API_ERROR_CODES } from './errors'

/**
 * Shared request/response contract schemas for route handlers.
 * Request schemas coerce, because query strings and form posts arrive as text.
 */

export const uuidSchema = z.string().uuid('מזהה לא תקין')

export const idParamSchema = z.object({ id: uuidSchema })

export const slugParamSchema = z.object({
  slug: z.string().min(1, 'מזהה חסר').max(200),
})

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type PaginationQuery = z.infer<typeof paginationQuerySchema>

/** Error envelope: the shape every non-2xx JSON response carries. */
export const apiErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z.enum(API_ERROR_CODES),
  message: z.string().optional(),
  details: z.unknown().optional(),
})

export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>

/** Success envelope: `data` is the handler's payload schema. */
export function apiSuccessEnvelopeSchema<T extends z.ZodTypeAny>(data: T) {
  return z.object({ ok: z.literal(true), data })
}

export type ApiSuccessEnvelope<T> = { ok: true; data: T }

export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope
