-- preflight 320: read-only. Expect products present, opening_hours absent.
select to_regclass('public.products') is not null as products_exist,
       not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'products'
                      and column_name = 'opening_hours') as opening_hours_absent;
