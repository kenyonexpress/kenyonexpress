-- preflight_184.sql -- run each block through MCP execute_sql BEFORE 184.
-- Every block must come back matching the expectation in its comment;
-- otherwise DO NOT apply 184 -- record the failing block under
-- "## חסמים לאופיר" in STATE.md and move on.
--
-- WHY THIS FILE EXISTS. 184 drops and rebuilds public.orders. Anything
-- attached to the old table that the file does not name is gone the moment
-- step 3.2 runs, with no error at any point: not a failed migration, just a
-- database that quietly stopped doing something. On 2026-09-09 that was
-- already true of three triggers. The file said it recreated "the three
-- triggers"; production carried six. Two of the missing ones (183's shipped
-- mail, 173's WhatsApp enqueue) had landed that same day, but the third was
-- `audit_orders` from 169, applied 09-04 -- so the file had been silently
-- wrong for five days, and applying it would have removed the audit trail
-- from the orders table. The FK list was stale the same way: sixteen names
-- against seventeen live inbound foreign keys, the new one being
-- cashback_ledger from 177.
--
-- Both were corrected in the file. THAT IS NOT THE POINT OF THIS FILE. The
-- point is that `orders` is the most-attached-to table in the schema, 184 is
-- the last migration in the queue and will be applied in a maintenance
-- window at some unknown later date, and every migration that lands between
-- now and then can make it stale again in exactly the same silent way.
-- Blocks (1) and (2) below are the ones that must be re-run in the window:
-- they compare production against what the file names, so drift refuses
-- loudly instead of deleting something.

-- (1) EVERY TRIGGER ON public.orders MUST BE NAMED IN 184.
--     EXPECT (2026-09-09): exactly these six rows --
--       audit_orders, set_updated_at, tg_orders_status_guard,
--       tg_orders_whatsapp_status, trg_orders_notify_paid,
--       trg_orders_notify_shipped
--     Any name here that does not appear in a CREATE TRIGGER in 184 will be
--     LOST. Grep the file for each name before proceeding. Note that
--     `audit_orders` must be recreated AFTER the row copy (3.7b), never in
--     3.6: it fires on INSERT, so creating it before the backfill writes one
--     fabricated 'created' audit row per pre-existing order.
select t.tgname, pg_get_triggerdef(t.oid) as def
  from pg_trigger t
 where t.tgrelid = 'public.orders'::regclass
   and not t.tgisinternal
 order by t.tgname;

-- (2) EVERY INBOUND FOREIGN KEY MUST BE IN 184's referencing-table array.
--     EXPECT (2026-09-09): seventeen rows. Each becomes a composite FK on
--     (<column>, <created_at twin>), so a table missing from the array keeps
--     a single-column FK to a primary key that no longer exists and the
--     migration fails -- loudly, which is the good case. The bad case is a
--     table added to the array with the wrong ON DELETE action, so compare
--     the action column against the array's fifth field, name by name.
select c.conrelid::regclass::text as referencing_table,
       a.attname                  as referencing_column,
       c.conname                  as constraint_name,
       case c.confdeltype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
                          when 'c' then 'CASCADE'   when 'n' then 'SET NULL'
                          when 'd' then 'SET DEFAULT' end as on_delete
  from pg_constraint c
  join unnest(c.conkey) with ordinality k(attnum, ord) on true
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
 where c.confrelid = 'public.orders'::regclass
   and c.contype = 'f'
 order by 1, 2;

-- (3) The invoice-number uniqueness that moves to the registry table is
--     still a single-column unique constraint on the parent.
--     EXPECT: one row, orders_invoice_number_key UNIQUE (invoice_number).
select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
 where conrelid = 'public.orders'::regclass and contype = 'u';

-- (4) No duplicate invoice numbers, or the registry backfill in 3.7 fails on
--     orders_invoice_numbers_pkey halfway through the conversion.
--     EXPECT: zero rows.
select invoice_number, count(*)
  from public.orders
 where invoice_number is not null
 group by invoice_number having count(*) > 1;

-- (5) Nothing is dated outside the partition range the file provisions
--     (oldest existing row's month .. current month + 12).
--     EXPECT: zero rows. A future-dated order beyond +12 months would fail
--     the copy with "no partition of relation".
select count(*) as rows_beyond_partition_range
  from public.orders
 where created_at >= (date_trunc('month', now() at time zone 'utc') + interval '13 months');

-- (6) Row count to compare against 3.7's own check, recorded before the run.
--     EXPECT: matches v_count_before/v_count_after inside the migration.
select count(*) as orders_rows, min(created_at) as oldest, max(created_at) as newest
  from public.orders;

-- (7) pg_cron is installed, since the file schedules
--     'orders-ensure-partitions' at 03:17 UTC daily.
--     EXPECT: one row, pg_cron.
select extname, extversion from pg_extension where extname = 'pg_cron';

-- (8) OUTSIDE SQL: 184 is the one file the project records as needing a
--     maintenance window. It rewrites the table every order lives in, and
--     production is live. Do not run it unattended. After applying,
--     regenerate src/types/database.ts (the seventeen twin columns and the
--     registry table change the generated types) and re-append the
--     hand-written alias tail, which `supabase gen types` drops -- see the
--     comment at the bottom of that file.
