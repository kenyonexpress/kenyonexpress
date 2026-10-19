-- preflight_172.sql -- run each block through MCP execute_sql BEFORE 172.
--
-- 172 sets one integer column of one row to zero. These blocks answer the two
-- questions that decide whether it is safe and whether it is sufficient:
-- is this row the one the migration was written against, and does zero stock
-- actually take it off the shopfront.

-- (1) The target row is still what the migration describes.
--     EXPECT: one row --
--       slug restaurants-meat-3, name_he 'מוצר ראשי מאסטר Master Product',
--       kenyon_price 1.00, full_price 400.00, stock_quantity 10,
--       status active, deleted_at null.
--     Any drift (a different price, an already-zero stock, a soft delete)
--     means the situation changed since drafting -- re-read before applying,
--     because the migration matches on id AND name and would update nothing.
select id, slug, name_he, kenyon_price, full_price, stock_quantity, status,
       deleted_at, type, category_id, supplier_id
  from public.products
 where id = '9bb347f8-03ec-48ce-8ff2-2503fb74c895';

-- (2) Nothing in history points at the row.
--     EXPECT: zero order_items. Zero is what makes the stock-zero choice
--     cheap; a non-zero count is not a blocker (the migration does not
--     delete) but it is the reason the migration must never become a DELETE.
select count(*) as order_item_lines
  from public.order_items
 where product_id = '9bb347f8-03ec-48ce-8ff2-2503fb74c895';

-- (3) No open cart is holding one.
--     EXPECT: zero rows. A cart holding it would be re-priced on the next
--     read and the line marked unavailable, which is correct but visible;
--     knowing beforehand is the point of the block.
select id, session_id, profile_id, updated_at
  from public.carts
 where items::text like '%9bb347f8-03ec-48ce-8ff2-2503fb74c895%';

-- (4) What zero stock does and does not do.
--     EXPECT: products_select_anon USING = (status = 'active' AND
--     deleted_at IS NULL) -- with NO stock term. This is the block that
--     stops 172 being mistaken for a delisting: RLS keeps serving the row,
--     and it disappears from the shopfront only where the APPLICATION
--     filters stock (FeaturedProductsTabs) or renders the out-of-stock
--     state (ProductCard, CategoryProductCard, ProductDealCard). The
--     product page keeps rendering it, out of stock.
select policyname, cmd, roles::text, qual as using_expr
  from pg_policies
 where schemaname = 'public' and tablename = 'products' and cmd = 'SELECT'
 order by policyname;

-- (5) The sale is already refused by code, independently of this migration.
--     EXPECT: implausible = true. src/lib/commerce/implausible-discount.ts
--     refuses any line whose sell price is <= 5% of its compare-at
--     (MAX_PLAUSIBLE_DISCOUNT_PERCENT = 95); 100 agorot against 40000 is
--     0.25%. addToCart, the cart pricer and beginCheckout each refuse it.
--     So 172 closes a DISPLAY defect, not an open till. Record the answer:
--     if this ever returns false, the urgency changes completely.
select kenyon_price, full_price,
       (kenyon_price * 100 <= full_price * 5) as implausible
  from public.products
 where id = '9bb347f8-03ec-48ce-8ff2-2503fb74c895';

-- (6) No other catalogue row is priced the same way.
--     EXPECT: review every row returned. Each is a product a visitor sees
--     with a >= 95% discount badge that no cart will accept.
select id, slug, name_he, kenyon_price, full_price, stock_quantity
  from public.products
 where status = 'active' and deleted_at is null
   and full_price > 0
   and kenyon_price * 100 <= full_price * 5
 order by slug;
