-- 240_perf_fk_indexes_and_cart_uniqueness.sql (idempotent)
--
-- Two things Supabase's performance advisor and the application's own
-- comments have been asking for, measured against production on 2026-09-17.
--
-- SECTION 1: covering indexes for the nine foreign keys the advisor lists as
-- unindexed (lint 0001_unindexed_foreign_keys). Every one of these is a
-- child column that a DELETE or UPDATE on the parent row has to scan the
-- child table for, and three of the parents are the tables that grow with
-- every order (orders, product_variants, wallet_entries). The tables are
-- small today, which is why the cost is invisible; 160 and 163 did the same
-- for the previous generation of tables. Plain CREATE INDEX rather than
-- CONCURRENTLY, because CONCURRENTLY cannot run inside the transaction the
-- apply runs in, and at today's row counts (largest child: 2 rows) the lock
-- is measured in milliseconds.
--
-- SECTION 2: one cart per account. `public.carts` has `carts_profile_id_idx`
-- but nothing unique on `profile_id`, and src/server/actions/cart.ts has
-- carried a paragraph about it since 2026-08-20 (`cartRowOrFail`): a failed
-- read takes the INSERT branch, the insert SUCCEEDS, and the account owns two
-- rows that `.maybeSingle()` then refuses with PGRST116 on every request. The
-- partial unique index turns that second insert into a 23505, which the merge
-- now handles as "retry at next login" (cart.ts, `runMergeGuestCart`). It is
-- partial on `profile_id IS NOT NULL` because guest rows are keyed by
-- `session_id` and have no profile. The guard block refuses to run if any
-- account already holds two rows: measured 0 on 2026-09-17 across 2763 carts,
-- but the check is what makes the file safe to apply on another day.
--
-- Dry-run on production 2026-09-17 in a rolled-back transaction (see
-- APPLY-ORDER.md for the probe output). No RLS, grant or trigger touched.

-- Section 1 ------------------------------------------------------------------

create index if not exists cashback_ledger_created_by_idx
  on public.cashback_ledger (created_by);

create index if not exists cashback_ledger_wallet_entry_id_idx
  on public.cashback_ledger (wallet_entry_id);

create index if not exists coupon_qr_batches_created_by_idx
  on public.coupon_qr_batches (created_by);

create index if not exists coupon_redemptions_order_id_idx
  on public.coupon_redemptions (order_id);

create index if not exists gift_cards_order_id_idx
  on public.gift_cards (order_id);

create index if not exists pickup_points_zone_id_idx
  on public.pickup_points (zone_id);

create index if not exists stock_waitlist_variant_id_idx
  on public.stock_waitlist (variant_id);

create index if not exists support_tickets_user_id_idx
  on public.support_tickets (user_id);

create index if not exists whatsapp_contacts_user_id_idx
  on public.whatsapp_contacts (user_id);

-- Section 2 ------------------------------------------------------------------

do $$
declare
  duplicate_accounts integer;
begin
  select count(*) into duplicate_accounts
  from (
    select profile_id
    from public.carts
    where profile_id is not null
    group by profile_id
    having count(*) > 1
  ) d;

  if duplicate_accounts > 0 then
    raise exception
      '240: % account(s) own more than one cart row; merge or delete the extras before adding carts_profile_id_uidx',
      duplicate_accounts;
  end if;
end $$;

create unique index if not exists carts_profile_id_uidx
  on public.carts (profile_id)
  where profile_id is not null;

-- Verification ---------------------------------------------------------------

do $$
declare
  missing text[];
  expected text[] := array[
    'cashback_ledger_created_by_idx',
    'cashback_ledger_wallet_entry_id_idx',
    'coupon_qr_batches_created_by_idx',
    'coupon_redemptions_order_id_idx',
    'gift_cards_order_id_idx',
    'pickup_points_zone_id_idx',
    'stock_waitlist_variant_id_idx',
    'support_tickets_user_id_idx',
    'whatsapp_contacts_user_id_idx',
    'carts_profile_id_uidx'
  ];
begin
  select array_agg(name) into missing
  from unnest(expected) as name
  where not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = name
  );
  if missing is not null then
    raise exception '240: indexes not present after apply: %', missing;
  end if;
end $$;
