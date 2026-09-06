-- preflight_173.sql -- run each block through MCP execute_sql BEFORE 173.
--
-- Every block below was run against production on 2026-09-07 and its result is
-- recorded under EXPECT. A block that answers differently means the table moved
-- since the migration was drafted: stop and re-read 173, do not apply it.

-- (1) The drift itself, and its exact size.
--     EXPECT (07.09): products 80, disagreeing 80, half_pair 19, pp_null 0,
--     broken_pair 0. `disagreeing` is what statement (1) of 173 repairs and
--     `half_pair` is what statement (2) fills. `pp_null` MUST be 0: a product
--     with no platform_percent has no answer for either statement, and both
--     skip it, so a non-zero here means 173 is not the whole fix.
select count(*)                                                                as products,
       count(*) filter (where platform_percent is not null
                          and commission_percent is distinct from platform_percent) as disagreeing,
       count(*) filter (where supplier_split_percent is null
                          and platform_percent is not null)                    as half_pair,
       count(*) filter (where platform_percent is null)                        as pp_null,
       count(*) filter (where platform_percent is not null
                          and supplier_split_percent is not null
                          and platform_percent + supplier_split_percent <> 100) as broken_pair
  from public.products;

-- (2) What the retired column actually holds, so the claim "it is 047's
--     default and not a second fee" is measured rather than asserted.
--     EXPECT (07.09): exactly two values, 5.00 on 65 rows and 10.00 on 15,
--     against platform_percent of 15 / 25 / 30. A third value, or one that
--     tracks platform_percent on some rows, would mean somebody has been
--     maintaining this column and 173 would erase their edit.
select commission_percent,
       platform_percent,
       count(*) as rows
  from public.products
 group by 1, 2
 order by rows desc;

-- (3) Nothing in the database reads the retired column.
--     EXPECT: zero rows. A function here reads a number 173 is about to
--     change, and has to be read before applying.
select p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prokind = 'f'
   and pg_get_functiondef(p.oid) ilike '%commission_percent%'
 order by 1;

-- (4) No generated column or default derives from it.
--     EXPECT: zero rows.
select a.attname, pg_get_expr(d.adbin, d.adrelid) as expr
  from pg_attribute a
  join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
 where a.attrelid = 'public.products'::regclass
   and pg_get_expr(d.adbin, d.adrelid) ilike '%commission_percent%';

-- (5) The triggers that will fire, and what they cost.
--     EXPECT four: audit_products, enforce_product_approval,
--     products_enqueue_search_index, set_updated_at (plus
--     products_track_stock_initial, which is UPDATE OF stock_quantity and does
--     NOT fire here). `set_updated_at` is unconditional `now()`, so all 80
--     lastmod values in the sitemap move to the apply date. That is the price;
--     see the header of 173.
select t.tgname, pg_get_triggerdef(t.oid) as def
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'products' and not t.tgisinternal
 order by t.tgname;

-- (6) The rollback in 173's footer names real columns.
--     EXPECT: entity_type, entity_id, action, before, after, created_at all
--     present, and `action` an enum whose UPDATE value is the lower-case
--     'updated'. The first draft of that rollback named table_name, record_id
--     and old_data; none of them exist, which is why this block is here.
select string_agg(column_name, ', ' order by ordinal_position) as audit_log_columns
  from information_schema.columns
 where table_schema = 'public' and table_name = 'audit_log'
   and column_name in ('entity_type','entity_id','action','before','after','created_at');

select enumlabel from pg_enum
 where enumtypid = 'public.audit_action'::regtype
 order by enumsortorder;

-- (7) Open carts and unpaid orders are unaffected, stated as a measurement.
--     Checkout reads platform_percent and supplier_split_percent and snapshots
--     them onto the line; statement (2) changes what a NULL half resolves to
--     from "computed by completeSplitPair" to "read from the column", which is
--     the same number. This block proves the numbers agree BEFORE the change.
--     EXPECT: zero rows.
select p.id, p.slug, p.platform_percent, p.supplier_split_percent
  from public.products p
 where p.supplier_split_percent is not null
   and p.platform_percent is not null
   and p.supplier_split_percent <> 100 - p.platform_percent;
