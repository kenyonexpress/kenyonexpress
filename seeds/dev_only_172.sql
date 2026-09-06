-- seeds/dev_only_172.sql -- development fixture. NEVER run against production.
--
-- WHY THIS FILE EXISTS, AND WHY IT IS NOT PART OF MIGRATION 172.
--
-- The closeout brief asked for the "one shekel test product insert" in
-- migration 172 to be guarded by `current_setting('app.env', true) =
-- 'development'`, or moved here. There is no such insert. `172_hide_master_
-- product_test_row.sql` contains one UPDATE, and it is the FIX: it zeroes the
-- stock on the ₪1 row so the shopfront stops rendering it. Guarding that
-- UPDATE behind an env check would make it a no-op in production and leave the
-- row on the homepage, which is the opposite of what was asked for. 172 is
-- therefore unchanged, and the reasoning is in docs/MIGRATION-AUDIT-162-172.md.
--
-- The row itself came in with the WordPress import (`128_wp_publish.sql`
-- matched `restaurants-meat-3` to live at kenyon 1 / full 400), not from a
-- seed. So the coherent version of the request is this file: the fixture a
-- developer needs to reproduce the defect locally, with the env guard, so that
-- it can never be the thing that puts a ₪1 product in front of a customer.
--
-- It creates a SEPARATE row (`dev-implausible-discount-fixture`) rather than
-- touching the production id, so running it locally and then applying 172 are
-- independent of each other.
--
-- Run with:  psql "$LOCAL_DATABASE_URL" -c "set app.env = 'development'" -f seeds/dev_only_172.sql
-- or set it per-session first; without it this file does nothing and says so.

do $$
declare
  v_category uuid;
begin
  if coalesce(current_setting('app.env', true), '') <> 'development' then
    raise notice 'dev_only_172: app.env is %, not development -- nothing inserted.',
      coalesce(nullif(current_setting('app.env', true), ''), '(unset)');
    return;
  end if;

  select id into v_category from public.categories where is_active order by sort_order limit 1;

  insert into public.products (
    slug, name_he, type, status, price_ils, full_price, kenyon_price,
    stock_quantity, category_id, attributes, images, published_at
  )
  values (
    'dev-implausible-discount-fixture',
    'פיקסצ׳ר פיתוח: הנחה לא סבירה',
    'physical'::public.product_type,
    'active'::public.product_status,
    400, 400, 1,
    10,
    v_category,
    jsonb_build_object('fixture', true),
    '[]'::jsonb,
    now()
  )
  on conflict (slug) do update
     set kenyon_price   = excluded.kenyon_price,
         full_price     = excluded.full_price,
         stock_quantity = excluded.stock_quantity,
         status         = excluded.status;

  raise notice 'dev_only_172: fixture dev-implausible-discount-fixture is in place.';
end
$$;

-- Remove it again:
--   delete from public.products where slug = 'dev-implausible-discount-fixture';
