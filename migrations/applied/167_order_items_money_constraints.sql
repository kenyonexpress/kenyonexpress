-- 167: sign constraints + money conservation on public.order_items.
--
-- WHY. BUSINESS-RULES §10 lists two stated-but-unenforced rules on this
-- table, in a table surrounded by constrained ones:
--
--   * "order_items money columns are non-negative" -- eight agorot columns
--     carry no sign constraint at all.
--   * "face = paid_on_site + balance_due on a line" -- code and tests hold
--     it (buildOrderItemMoneyRow throws since marathon step 5), the database
--     does not. vouchers has the equivalent CHECK; order_items never did.
--
-- The JS half is live first (src/lib/commerce/order-money-columns.ts,
-- assertOrderItemMoneyInvariants): every insert path already refuses a line
-- that violates what these constraints state, so applying this cannot break
-- the running writer -- it only removes service_role's ability to write a row
-- whose money does not add up.
--
-- REFUSES RATHER THAN CORRUPTS (the 126 property): ADD CONSTRAINT validates
-- existing rows and raises if any violates, instead of constraining bad data
-- into place. preflight_167.sql measures violations BEFORE the apply; if any
-- block returns rows, STOP and investigate the rows, do not apply.
--
-- NULL is "not participating" on every constraint: rows written before 070's
-- backfill carry NULLs and must keep moving.
--
-- ROLLBACK
--   ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_money_conservation;
--   -- and per column:
--   ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_<col>_nonneg;
--
-- NOT APPLIED. `migrations/pending/` is unapplied by definition.

DO $$
DECLARE
  col text;
BEGIN
  FOREACH col IN ARRAY ARRAY[
    'balance_due_agorot',
    'cashback_amount_agorot',
    'commission_agorot',
    'escrow_held_agorot',
    'escrow_release_agorot',
    'face_value_agorot',
    'paid_on_site_agorot',
    'supplier_immediate_agorot'
  ] LOOP
    BEGIN
      EXECUTE format(
        'ALTER TABLE public.order_items ADD CONSTRAINT %I CHECK (%I IS NULL OR %I >= 0)',
        'order_items_' || col || '_nonneg', col, col
      );
    EXCEPTION WHEN duplicate_object THEN
      NULL; -- re-run: the constraint is already there
    END;
  END LOOP;
END
$$;

DO $$
BEGIN
  ALTER TABLE public.order_items
    ADD CONSTRAINT order_items_money_conservation CHECK (
      face_value_agorot IS NULL
      OR paid_on_site_agorot IS NULL
      OR balance_due_agorot IS NULL
      OR face_value_agorot = paid_on_site_agorot + balance_due_agorot
    );
EXCEPTION WHEN duplicate_object THEN
  NULL; -- re-run: the constraint is already there
END
$$;
