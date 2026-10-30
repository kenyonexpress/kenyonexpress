-- preflight 319: read-only. Expect affiliate_links present, product_id absent.
select to_regclass('public.affiliate_links') is not null as links_exist,
       not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'affiliate_links'
                      and column_name = 'product_id') as product_id_absent;
