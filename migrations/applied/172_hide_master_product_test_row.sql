-- 172: a "Master Product" test row is on sale for one shekel.
--
-- NOT APPLIED. Drafted 2026-09-04, awaiting approval. Rollback at the foot.
--
-- WHAT IS WRONG. `products` carries:
--
--   id     9bb347f8-03ec-48ce-8ff2-2503fb74c895
--   slug   restaurants-meat-3
--   name   מוצר ראשי מאסטר Master Product
--   price  kenyon_price 1, full_price 400, stock_quantity 10
--
-- It renders on the homepage grid as a real, buyable product at ₪1 against a
-- ₪400 compare-at price -- a 99.75% discount badge on a row whose name says it
-- is a template. Found by the rendered copy audit
-- (`docs/COPY-AUDIT.md`), which walks the funnel and lists every Latin-script
-- string a visitor can read.
--
-- Ten in stock. If anyone buys one, the order is real, the payment is real, and
-- there is nothing to fulfil.
--
-- WHY THIS IS A DRAFT AND NOT A RENDER-EDGE FIX. The shekel-sign repair in
-- migration 171 has a counterpart in `getAllCategories` because a wrong glyph
-- order is a FORMATTING defect and formatting can be corrected on read. This is
-- not formatting: it is a row that should not be in the catalogue, and hiding
-- one product by name at the render edge is a rule nobody can maintain and that
-- would hide a real product the day one is legitimately called "master".
--
-- The conservative move is to take it out of the catalogue, and that is Ofir's
-- call to approve. Until then it is listed as an open defect in
-- docs/COPY-AUDIT.md rather than silently patched.
--
-- WHAT THIS DOES. Sets stock to zero rather than deleting the row: the product
-- may be referenced by an order_items row, and deleting it would orphan a
-- historical order line. Zero stock takes it out of every listing query the app
-- makes without touching history.

update public.products
   set stock_quantity = 0
 where id = '9bb347f8-03ec-48ce-8ff2-2503fb74c895'
   and name_he = 'מוצר ראשי מאסטר Master Product';

-- Verify:
--   select id, slug, name_he, stock_quantity from public.products
--    where id = '9bb347f8-03ec-48ce-8ff2-2503fb74c895';
--
-- Rollback:
--   update public.products
--      set stock_quantity = 10
--    where id = '9bb347f8-03ec-48ce-8ff2-2503fb74c895';
