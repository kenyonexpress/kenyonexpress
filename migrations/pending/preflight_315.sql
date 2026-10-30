-- Preflight check for migration 315 (read-only)
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'products' and column_name = 'supplier_transfer_days';
-- expect 0 rows; the add is "if not exists", so an existing column is never changed
