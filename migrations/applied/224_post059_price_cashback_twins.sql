-- 224: the two post-059 column names the payment path selects, added to the
-- hosted pre-059 lineage as generated twins of their ils sources.
--
-- WHY
--   `orders.cashback_applied_agorot` and `order_items.unit_price_agorot` are
--   post-059 names. The hosted project never received 059, so selecting either
--   bare name raised 42703 and failed the WHOLE select - in finalize, for a
--   card that had already been charged. The code guards this with a
--   per-generation probe and (for unit_price) a PostgREST alias; this
--   migration makes the real names exist so the guard stops being the only
--   thing between a paid card and an aborted finalize.
--
-- SHAPE
--   Same pattern as the 138/147 twins: `round(<ils> * 100)::bigint`,
--   GENERATED ALWAYS ... STORED. Both sources are NOT NULL on the hosted
--   project (`cashback_applied_ils` numeric default 0, `unit_price_ils`
--   numeric), so no coalesce. Additive only: writers keep writing the ils
--   sources, and the generation probes (`orders.total_agorot`,
--   `order_items.platform_bp`) still resolve 'ils', so no write path changes.
--
-- IDEMPOTENCY
--   Each column in its own DO block, guarded on information_schema both ways:
--   skipped where the source column does not exist (a post-059 database, which
--   already has the name as a real writable column) and where the target
--   already exists (a rerun). `IF NOT EXISTS` on a table is not `IF NOT
--   EXISTS` on its columns - the 026 lesson - so the guards are explicit.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name = 'cashback_applied_ils'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name = 'cashback_applied_agorot'
  ) then
    alter table public.orders
      add column cashback_applied_agorot bigint
        generated always as ((round((cashback_applied_ils * (100)::numeric)))::bigint) stored;
    comment on column public.orders.cashback_applied_agorot is
      '224: generated twin of cashback_applied_ils, integer agorot under the post-059 name. Read-only; write cashback_applied_ils.';
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'order_items'
      and column_name = 'unit_price_ils'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'order_items'
      and column_name = 'unit_price_agorot'
  ) then
    alter table public.order_items
      add column unit_price_agorot bigint
        generated always as ((round((unit_price_ils * (100)::numeric)))::bigint) stored;
    comment on column public.order_items.unit_price_agorot is
      '224: generated twin of unit_price_ils, integer agorot under the post-059 name. Read-only; write unit_price_ils.';
  end if;
end $$;
