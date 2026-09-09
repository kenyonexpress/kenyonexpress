/**
 * The restock RPC migration 223 adds, typed here because it is not in
 * `src/types/database.ts` yet.
 *
 * Same pattern and same deletion point as pending-reports.ts (170): the name
 * lives HERE, next to the one cast that names it, instead of leaking
 * `as never` through the call site or hand-editing the generated file.
 *
 * 223 WAS applied to production on 2026-09-09 (MCP, `restock_on_refund_223`),
 * proved first in a rolled-back transaction: consume-then-restock returned
 * the exact quantity, a replayed restock returned nothing, and an untracked
 * product (stock_quantity IS NULL) was stamped without a level change. What
 * has NOT happened is a regeneration of `database.ts`, for the reason
 * pending-reports.ts records: the file regenerates from the whole schema at
 * once, a ripple this goal does not own.
 *
 * WHEN database.ts IS REGENERATED: delete this file and call
 * `admin.rpc('restock_order_stock', ...)` directly in refund.ts.
 */

/** Args of public.restock_order_stock. */
export interface RestockOrderStockArgs {
  p_order_id: string
}

/**
 * Names the RPC the generated types do not have, for `.rpc()`. The cast is
 * confined to this one expression, exactly like `pendingReportRpc`.
 */
export function pendingRestockRpc(): never {
  return 'restock_order_stock' as never
}
