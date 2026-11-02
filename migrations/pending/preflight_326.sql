-- preflight_326.sql -- read-only. Run before 326_payments_token_id.sql.

-- (1) The gap: EXPECT 0 rows before 326, 1 after.
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'payments' and column_name = 'token_id';

-- (2) The FK target exists. EXPECT one row, id uuid.
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'payment_tokens' and column_name = 'id';
