-- preflight_185.sql -- read-only. Run before 185.

-- (1) Neither column exists yet.
--     EXPECT: 0 rows.
select column_name
  from information_schema.columns
 where table_schema = 'public' and table_name = 'products'
   and column_name in ('cancellation_window_days', 'payout_cadence');

-- (2) products is small enough that ADD COLUMN with no default is instant.
select count(*) as products from public.products;
