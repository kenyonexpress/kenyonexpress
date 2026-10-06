import { writeAuditLog } from '@/lib/admin/audit'
import type { Json } from '@/types/database'

/**
 * The audit row behind every change of hands a voucher goes through.
 *
 * WHY A VOUCHER NEEDS ONE WHEN AN ORDER ALREADY HAS ONE. `finalizeOrder` and
 * `refundOrder` write `audit_log` rows for the ORDER, and until this file the
 * voucher had none of its own: a coupon could be sent to a stranger, taken
 * back, sent to somebody else and claimed, and the only trace was the current
 * state of six `gift_*` columns on one row - which says where the coupon is
 * now and nothing about where it has been. The first dispute over "I never
 * sent it" or "I never got it" would have been settled from memory.
 *
 * So each of the three transitions in `src/server/actions/gifts.ts` writes one
 * row: who did it (`actor_id`), what moved (`changes`), and which path it went
 * through (`metadata.source`). It goes through `writeAuditLog`, the one helper
 * every admin mutation already uses, and not a direct insert: the helper adds
 * the request's IP, user agent and request id, which is exactly the "from
 * where" a dispute asks for, and `audit-actor.test.ts` pins that no new direct
 * writer appears without being registered.
 *
 * BEST EFFORT, NEVER A THROW. `writeAuditLog` logs and swallows its own
 * failures. The row is written AFTER the guarded UPDATE that is the real
 * transition; an audit write that failed must not undo a transfer Postgres has
 * already accepted, and it must not turn a claimed gift into an error page for
 * the recipient.
 */

type GiftAuditSource = 'voucher_transfer' | 'voucher_transfer_revoke' | 'gift_claim'

export interface GiftAuditInput {
  /** The signed-in customer who asked for the transition. */
  actorId: string
  voucherId: string
  source: GiftAuditSource
  /** Column-level from/to pairs, same shape as the order rows use. */
  changes: Record<string, { from: unknown; to: unknown }>
  metadata?: Record<string, unknown>
}

export async function recordGiftAudit(input: GiftAuditInput): Promise<void> {
  await writeAuditLog({
    actorId: input.actorId,
    // The three callers are customer-facing actions on a coupon the caller
    // owns or is being given; an admin acting on their own coupon is a
    // customer here too.
    actorRole: 'customer',
    action: 'updated',
    entityType: 'voucher',
    entityId: input.voucherId,
    changes: input.changes as unknown as Json,
    metadata: { source: input.source, ...(input.metadata ?? {}) } as unknown as Json,
  })
}
