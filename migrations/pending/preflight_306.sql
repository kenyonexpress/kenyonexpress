-- Preflight for 306_product_upload_fields.sql and 306_supplier_agreements.sql
-- (two files share the number). Read-only.
-- Expect every column TRUE. Run 305 before 306_supplier_agreements.
select
  to_regclass('public.products') is not null as products_exists,
  to_regclass('public.categories') is not null as categories_exists,
  to_regclass('public.product_categories') is null as product_categories_absent,
  not exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'products'
                and column_name in ('original_price', 'source_url', 'valid_from')) as upload_columns_absent,
  to_regprocedure('public.is_admin()') is not null as is_admin_exists,
  to_regprocedure('public.current_user_role()') is not null as current_user_role_exists,
  to_regclass('public.supplier_applications') is not null as supplier_applications_exists_run_305_first,
  to_regclass('public.supplier_agreements') is null as supplier_agreements_absent;
