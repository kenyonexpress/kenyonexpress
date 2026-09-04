-- preflight_170.sql -- run each block through MCP execute_sql BEFORE 170.

-- (1) None of the ten index names exists yet.
--     EXPECT: zero rows (any row means a name collision, stop).
select indexname
  from pg_indexes
 where schemaname = 'public'
   and indexname in (
     'products_active_category_created_idx',
     'products_status_created_idx',
     'products_active_category_price_idx',
     'products_active_price_created_idx',
     'products_active_category_name_idx',
     'orders_user_created_active_idx',
     'vouchers_order_item_issued_idx',
     'invoices_order_doc_status_idx',
     'carts_session_profile_idx',
     'user_addresses_user_default_created_idx');

-- (2) Every column the indexes touch exists with the expected type.
--     EXPECT: 14 rows.
select table_name, column_name, udt_name
  from information_schema.columns
 where table_schema = 'public'
   and (table_name, column_name) in (
     ('products','category_id'), ('products','created_at'),
     ('products','kenyon_price'), ('products','name_he'),
     ('products','status'), ('products','deleted_at'),
     ('orders','user_id'), ('orders','created_at'), ('orders','deleted_at'),
     ('vouchers','order_item_id'), ('vouchers','issued_at'),
     ('invoices','document_type'),
     ('carts','session_id'),
     ('user_addresses','is_default'))
 order by table_name, column_name;

-- (3) products.status enum carries 'active' (the partial predicates cast to it).
--     EXPECT: one row, enumlabel = active.
select e.enumlabel
  from pg_type t join pg_enum e on e.enumtypid = t.oid
 where t.typname = 'product_status' and e.enumlabel = 'active';

-- (4) No existing index already covers any pattern (near-duplicate scan).
--     EXPECT: the known singles only (products_category_id_idx,
--     carts_session_id_idx, orders_user_id_idx, idx_orders_user_status,
--     idx_user_addresses_user_default, vouchers_order_item_idx,
--     idx_invoices_order); none of them has the composite key + sort column.
select tablename, indexname, indexdef
  from pg_indexes
 where schemaname = 'public'
   and tablename in ('products','orders','vouchers','invoices','carts','user_addresses')
 order by tablename, indexname;
