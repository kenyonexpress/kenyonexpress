-- preflight_325.sql -- read-only. Run before 325_vouchers_redemption_code.sql.

-- (1) The gap: EXPECT 0 rows before 325, 2 after.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'vouchers'
  and column_name in ('redemption_code', 'redemption_code_signature');

-- (2) No constraint or index of the same name already. EXPECT 0 rows before 325.
select conname from pg_constraint
where conrelid = 'public.vouchers'::regclass and conname like 'vouchers_redemption_code%';
select indexname from pg_indexes
where schemaname = 'public' and indexname = 'vouchers_redemption_code_unique';
