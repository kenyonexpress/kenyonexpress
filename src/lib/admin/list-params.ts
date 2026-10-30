import { z } from 'zod'

// Shared URL-state schema for admin list pages (D10): pagination, sort and
// free-text search live in searchParams, parsed with Zod, never trusted raw.

export const DEFAULT_PER_PAGE = 20
export const MAX_PER_PAGE = 100

export const baseListParamsSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  per: z.coerce.number().int().min(5).max(MAX_PER_PAGE).catch(DEFAULT_PER_PAGE),
  q: z.string().trim().max(100).optional(),
  sort: z.string().max(40).optional(),
  dir: z.enum(['asc', 'desc']).catch('desc'),
})

export type BaseListParams = z.infer<typeof baseListParamsSchema>

export function listRange(params: { page: number; per: number }): {
  from: number
  to: number
} {
  const from = (params.page - 1) * params.per
  return { from, to: from + params.per - 1 }
}

// Builds a query string from the current params with overrides applied.
// Undefined/empty values drop out so URLs stay clean and shareable.
export function buildListQuery(
  current: Record<string, string | number | undefined>,
  overrides: Record<string, string | number | undefined>,
): string {
  const merged: Record<string, string | number | undefined> = { ...current, ...overrides }
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === '') continue
    search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}
