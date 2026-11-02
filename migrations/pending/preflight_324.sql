-- preflight_324.sql -- read-only. Run each block before 324_orders_monthly_partitioning.sql.

-- (1) orders is still a plain table. EXPECT relkind = 'r' (not 'p').
select c.relname, c.relkind
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'orders';

-- (2) Inbound foreign keys the file rewrites. EXPECT the count the file header names;
--     any table not listed in the file must be added to it before applying.
select conrelid::regclass as referencing_table, conname
from pg_constraint
where contype = 'f' and confrelid = 'public.orders'::regclass
order by 1, 2;

-- (3) Triggers recreated on the parent. EXPECT exactly the list in the file header.
select tgname from pg_trigger
where tgrelid = 'public.orders'::regclass and not tgisinternal
order by 1;

-- (4) No duplicate invoice numbers, or the registry insert fails. EXPECT 0 rows.
select invoice_number, count(*) from public.orders
where invoice_number is not null
group by 1 having count(*) > 1;

-- (5) pg_cron present for partition provisioning. EXPECT one row.
select extname, extversion from pg_extension where extname = 'pg_cron';

-- (6) Size, for the maintenance-window estimate.
select pg_size_pretty(pg_total_relation_size('public.orders')) as orders_total, count(*) as rows
from public.orders;
