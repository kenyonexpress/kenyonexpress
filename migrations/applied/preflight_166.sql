-- preflight_166.sql -- run each block through MCP execute_sql BEFORE 166.

-- (1) The enum carries exactly the five states the guard names.
--     EXPECT: issued, redeemed, expired, cancelled, refunded -- nothing else.
select e.enumlabel
  from pg_type t join pg_enum e on e.enumtypid = t.oid
 where t.typname = 'voucher_status'
 order by e.enumsortorder;

-- (2) The table exists and status is that enum, nullable or not.
--     EXPECT: one row, udt_name = voucher_status.
select column_name, udt_name, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'vouchers'
   and column_name = 'status';

-- (3) No trigger already guards the table (the gap 166 closes).
--     EXPECT: zero rows, or only triggers 166 itself created on a re-run.
select tgname
  from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'vouchers'
   and not tg.tgisinternal;

-- (4) No live row sits in a state the machine cannot leave being moved by
--     running code: count rows per status. EXPECT: counts only; any row is
--     fine because 166 restricts MOVES, not states at rest.
select status, count(*)
  from public.vouchers
 group by status
 order by status;

-- (5) The function name is free (or already 166's own from a prior run).
--     EXPECT: zero rows or exactly fn_vouchers_status_guard.
select p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'fn_vouchers_status_guard';
