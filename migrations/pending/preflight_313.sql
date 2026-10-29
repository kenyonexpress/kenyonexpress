-- Preflight check for migration 313 (read-only)
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'vouchers' and column_name = 'partner_pin';
-- expect 0 rows
select to_regclass('public.vouchers_redemption_events') as events_table,
       to_regclass('public.vouchers') as vouchers,
       to_regclass('public.suppliers') as suppliers;
-- events_table null; vouchers and suppliers non-null
