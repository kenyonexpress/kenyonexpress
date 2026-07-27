import { z } from 'zod'

/**
 * Contracts for the incremental search-index pipeline:
 * Supabase DB webhook -> /api/webhooks/products -> QStash -> /api/search/index-job.
 *
 * The webhook payload is treated as a change NOTIFICATION, never as data: the
 * worker re-reads the product row from Postgres before touching the index
 * (same philosophy as the Cardcom webhook — re-verify, then act). That makes
 * out-of-order and duplicate deliveries converge on the truth.
 */

/** Supabase Database Webhook payload (pg_net / dashboard webhooks shape). */
export const dbChangePayloadSchema = z
  .object({
    type: z.enum(['INSERT', 'UPDATE', 'DELETE']),
    table: z.string().min(1),
    schema: z.string().min(1),
    record: z.record(z.unknown()).nullable().optional(),
    old_record: z.record(z.unknown()).nullable().optional(),
  })
  .passthrough()

export type DbChangePayload = z.infer<typeof dbChangePayloadSchema>

/** The unit of work delivered through the queue. Small on purpose: the id and
 * the operation. Everything else is re-read from the database at run time. */
export const searchIndexJobSchema = z.object({
  op: z.enum(['upsert', 'delete']),
  productId: z.string().uuid(),
  /** Why the job exists — for the DLQ and for humans reading logs. */
  reason: z.string().min(1).max(200),
  enqueuedAt: z.string().datetime(),
})

export type SearchIndexJob = z.infer<typeof searchIndexJobSchema>

/** Row fields the decision logic reads. Tolerant: unknown columns pass through. */
const productRowSchema = z
  .object({
    id: z.string().uuid(),
    status: z.string().nullable().optional(),
    deleted_at: z.string().nullable().optional(),
  })
  .passthrough()

/**
 * Decides what a products-table change means for the index.
 *
 * - Not the products table -> null (ignore, answer 200, no queue traffic).
 * - DELETE, soft-delete (`deleted_at` set) or any non-active status -> delete
 *   from the index. The inclusion predicate is the same one RLS enforces for
 *   the public read: `status = 'active' AND deleted_at IS NULL`.
 * - Otherwise -> upsert.
 *
 * The worker re-checks the same predicate against a fresh row, so a stale or
 * spoofed payload can at worst schedule a no-op.
 */
export function jobForChange(payload: DbChangePayload, now: Date): SearchIndexJob | null {
  if (payload.table !== 'products') return null

  const row = payload.type === 'DELETE' ? payload.old_record : payload.record
  const parsed = productRowSchema.safeParse(row)
  if (!parsed.success) return null

  const gone =
    payload.type === 'DELETE' || parsed.data.deleted_at != null || parsed.data.status !== 'active'

  return {
    op: gone ? 'delete' : 'upsert',
    productId: parsed.data.id,
    reason: `${payload.type.toLowerCase()}:${parsed.data.status ?? 'unknown'}`,
    enqueuedAt: now.toISOString(),
  }
}
