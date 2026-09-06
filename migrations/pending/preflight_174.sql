-- preflight_174.sql -- run each block through MCP execute_sql BEFORE 174.
--
-- Every block was run against production on 2026-09-07 and its answer is
-- recorded under EXPECT. 174 creates a table, so most of these ask the same
-- question from different directions: is the ground it stands on the ground it
-- was written against.

-- (1) The premise. `payments` cannot hold a top-up, which is the whole reason
--     174 exists rather than an ALTER.
--     EXPECT (07.09): order_id_nullable = NO, payment_kind_labels =
--     'charge, refund'. If order_id has since become nullable, or a
--     'wallet_topup' kind was added, re-read 174: somebody chose the other
--     design and the two must not both land.
select (select is_nullable from information_schema.columns
         where table_schema='public' and table_name='payments' and column_name='order_id')
         as order_id_nullable,
       (select string_agg(e.enumlabel, ', ' order by e.enumsortorder)
          from pg_type t join pg_enum e on e.enumtypid = t.oid
          join pg_namespace n on n.oid = t.typnamespace
         where n.nspname='public' and t.typname='payment_kind') as payment_kind_labels;

-- (2) The table does not already exist.
--     EXPECT: zero rows. `create table if not exists` would be a silent no-op
--     over a DIFFERENT table with the same name, so this is checked rather
--     than relied on.
select tablename from pg_tables where schemaname='public' and tablename='wallet_topups';

-- (3) Everything 174 references exists: profiles(id) for the FK,
--     current_user_role() and the user_role enum for the staff policy,
--     gen_random_uuid() for the default.
--     EXPECT: profiles_id 1, current_user_role_fn 1, user_role_type 1,
--     pgcrypto 1.
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='id') as profiles_id,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='current_user_role') as current_user_role_fn,
  (select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='public' and t.typname='user_role') as user_role_type,
  (select count(*) from pg_extension where extname='pgcrypto') as pgcrypto;

-- (4) The shape 174 copies. `refunds` is the table this one is modelled on:
--     RLS on, SELECT for the owner and for staff, and no write policy for any
--     client role.
--     EXPECT: two SELECT policies, no INSERT/UPDATE/DELETE row.
select policyname, cmd from pg_policies
 where schemaname='public' and tablename='refunds' order by policyname;

-- (5) The wallet primitives 174 hands work to are unchanged.
--     EXPECT: fn_wallet_transfer takes p_amount_ils numeric and is idempotent
--     on wallet_entries.idempotency_key; the user balance floor constraint is
--     live. If the floor is gone, a top-up table is not the change to make
--     first.
select p.proname, pg_get_function_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='fn_wallet_transfer';

select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
 where conrelid='public.wallet_accounts'::regclass and contype='c'
 order by conname;

-- (6) What is actually in the ledger today, so "this changes nothing that
--     exists" is measured rather than asserted.
--     EXPECT (07.09): one reason only, order_cashback, 2 entries, 1.80 total.
select reason, count(*) as entries, sum(amount_ils) as total_ils
  from public.wallet_entries group by 1 order by 2 desc;
