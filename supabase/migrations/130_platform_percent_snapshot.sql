-- migration 130: platform_percent_snapshot on order_items
--
-- CONTEXT
--   products.platform_percent exists (migration 027) as the admin-editable field
--   order_items.platform_percent exists (migration 026) but the name doesn't
--   signal that it's a snapshot taken at order time and should never change.
--
-- CHANGE
--   Rename order_items.platform_percent → platform_percent_snapshot to make
--   immutability explicit. Update finalize.ts, settlement-events.ts and tests.
--
-- IMMUTABILITY
--   The snapshot is written once when the order is finalized. No UPDATE is
--   permitted: settlement depends on the percent that was agreed at purchase,
--   and changing it after-the-fact rewrites financial history.
--
-- SAFE
--   Column rename is a metadata-only DDL; no data moves. The NOT NULL
--   constraint is not added here because older rows may be NULL (docs/
--   CONTRADICTIONS.md C1: no default exists). Finalize fails loud on NULL.

ALTER TABLE public.order_items
  RENAME COLUMN platform_percent TO platform_percent_snapshot;

COMMENT ON COLUMN public.order_items.platform_percent_snapshot IS
  'Platform share (%) snapshotted from products.platform_percent at order time. '
  'IMMUTABLE: never edited after finalize. Settlement and supplier-payout logic '
  'keys off this value, so retroactive changes would rewrite financial history. '
  'NULL is refused by finalize (no default exists, C1), but older rows may have it.';
