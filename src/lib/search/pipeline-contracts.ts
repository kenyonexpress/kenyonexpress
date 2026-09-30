import { z } from 'zod'

/**
 * Contracts for the incremental search-index pipeline:
 * Supabase DB webhook -> /api/webhooks/products -> QStash -> /api/search/index-job.
 *
 * The webhook payload is treated as a change NOTIFICATION, never as data: the
 * worker re-reads the row from Postgres before touching the index (same
 * philosophy as the Cardcom webhook — re-verify, then act). That makes
 * out-of-order and duplicate deliveries converge on the truth.
 *
 * TWO SOURCE TABLES, TWO JOB SHAPES (STEP 08, 30.09). The products job is the
 * original one and its wire shape is unchanged, because jobs of that shape are
 * in flight in QStash, parked in `search_index_dlq`, and enqueued by
 * `search_index_outbox` rows the 132 trigger wrote. The categories job is
 * NEW and carries an `entity` literal so a worker can tell the two apart
 * without guessing from which id field is present. A product job has no
 * `entity` field at all, on purpose: adding one would make every job already
 * queued fail the schema and be acked dead.
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

/**
 * A change to one row of `categories`. The worker re-reads the category and
 * recounts its products before writing the categories index, exactly as the
 * product worker re-reads the product; `op` is a hint, not a claim.
 */
export const categoryIndexJobSchema = z.object({
  entity: z.literal('category'),
  op: z.enum(['upsert', 'delete']),
  categoryId: z.string().uuid(),
  reason: z.string().min(1).max(200),
  enqueuedAt: z.string().datetime(),
})

export type CategoryIndexJob = z.infer<typeof categoryIndexJobSchema>

/**
 * Anything the worker accepts. The category shape is tried first because it
 * is the one with a discriminating literal; a product job has no `entity`
 * and falls through to the original schema unchanged.
 */
export const anyIndexJobSchema = z.union([categoryIndexJobSchema, searchIndexJobSchema])

export type AnyIndexJob = z.infer<typeof anyIndexJobSchema>

export function isCategoryIndexJob(job: AnyIndexJob): job is CategoryIndexJob {
  return 'entity' in job && job.entity === 'category'
}

/** Row fields the decision logic reads. Tolerant: unknown columns pass through. */
const productRowSchema = z
  .object({
    id: z.string().uuid(),
    status: z.string().nullable().optional(),
    deleted_at: z.string().nullable().optional(),
  })
  .passthrough()

/**
 * The categories row, by the same rule the public read and the setup script
 * use: a category is visible while `is_active` is not false and it is not
 * soft-deleted. `is_active` is nullable in the schema, and null has always
 * meant "active" to every reader here.
 */
const categoryRowSchema = z
  .object({
    id: z.string().uuid(),
    is_active: z.boolean().nullable().optional(),
    deleted_at: z.string().nullable().optional(),
  })
  .passthrough()

/**
 * Decides what a table change means for the index.
 *
 * - `products`: DELETE, soft-delete (`deleted_at` set) or any non-active
 *   status -> delete from the index. The inclusion predicate is the same one
 *   RLS enforces for the public read: `status = 'active' AND deleted_at IS
 *   NULL`. Otherwise -> upsert.
 * - `categories`: DELETE, soft-delete or `is_active = false` -> delete the
 *   category document. Otherwise -> upsert (re-read, recount, PUT).
 * - Any other table -> null (ignore, answer 200, no queue traffic).
 *
 * The worker re-checks the same predicate against a fresh row, so a stale or
 * spoofed payload can at worst schedule a no-op.
 *
 * WHY A PRODUCT CHANGE DOES NOT ALSO ENQUEUE ITS BRAND AND CATEGORY: the
 * product worker refreshes both derived documents itself, from the row it
 * just read (lib/search/indexer.ts). One job per change keeps the outbox and
 * the DLQ describing the change that happened, not the fan-out it caused.
 */
export function jobForChange(payload: DbChangePayload, now: Date): AnyIndexJob | null {
  const row = payload.type === 'DELETE' ? payload.old_record : payload.record

  if (payload.table === 'products') {
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

  if (payload.table === 'categories') {
    const parsed = categoryRowSchema.safeParse(row)
    if (!parsed.success) return null

    const gone =
      payload.type === 'DELETE' || parsed.data.deleted_at != null || parsed.data.is_active === false

    return {
      entity: 'category',
      op: gone ? 'delete' : 'upsert',
      categoryId: parsed.data.id,
      reason: `${payload.type.toLowerCase()}:${gone ? 'hidden' : 'active'}`,
      enqueuedAt: now.toISOString(),
    }
  }

  return null
}
