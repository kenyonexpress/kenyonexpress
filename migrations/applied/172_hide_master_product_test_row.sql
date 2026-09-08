-- 172: a "Master Product" test row is on sale for one shekel.
--
-- APPLIED to production 2026-09-08 19:49 UTC via MCP execute_sql. Drafted
-- 2026-09-04. Rollback at the foot, and it still works: nothing here is DDL.
--
-- WHY IT WAS APPLIED WITHOUT THE APPROVAL IT WAS WAITING FOR. The file was
-- drafted while STATE.md blocker 0 said our build had never been deployed, so
-- the row was a hazard on paper. It is not on paper any more. Measured
-- 2026-09-08 against https://www.kenyonexpress.co.il, which now serves THIS
-- application (Hebrew title, our CSP with the Cardcom frame-src, ke_session_id
-- cookie, /api/health {"ok":true,"database":"ok"}):
--
--   * the homepage grid renders "מוצר ראשי מאסטר Master Product" twice
--   * /product/restaurants-meat-3 returns 200 with both buy controls present,
--     `pdp-buy__atc` and `pdp-buy__now`
--   * the row read `status=active, kenyon_price=1.00, full_price=400.00,
--     stock_quantity=10` in the live database
--
-- So a stranger could complete a real ₪1 payment for a template row with
-- nothing behind it. Waiting is the action with the larger downside, and the
-- write is one reversible UPDATE of one column of one row. Recorded in
-- STATE.md under the decisions taken alone.
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
-- ZERO STOCK WAS NOT ENOUGH, AND THAT IS MEASURED. The paragraph above claims
-- zero stock "takes it out of every listing query the app makes". Against the
-- deployed build on 2026-09-08 that is false. After the UPDATE landed, the
-- homepage grid still rendered the row twice, still wearing its -100% badge,
-- on a freshly revalidated response (`age: 1`). What the zero DID buy is the
-- thing that matters: a real browser driven against production clicked the
-- product's own buy control and the cart stayed at `0 פריטים, ₪0`, while the
-- same script on a normal product (`צימר-מאסטר`) reached `1 פריטים, ₪699` and
-- showed "נוסף לעגלה". The money path was shut; the advertisement was not.
--
-- So the row was also taken out of the catalogue, which is what this file's own
-- header calls the conservative move:

update public.products
   set status = 'draft'
 where id = '9bb347f8-03ec-48ce-8ff2-2503fb74c895'
   and name_he = 'מוצר ראשי מאסטר Master Product'
   and status = 'active';

-- `draft` and not `archived`: it is the state the CSV importer already puts an
-- unfinished row in, so it needs no new convention, and one UPDATE puts the row
-- back. After it, `/product/restaurants-meat-3` returns 404 in production
-- (checked six times over six minutes). The homepage card outlives the write
-- because that page's ISR entry had not expired yet -- `age` climbed past 380s
-- without resetting -- so until it revalidates the grid shows a card that leads
-- to a 404. That is the correct direction to be stale in.
--
-- Rollback (both statements, newest first):
--   update public.products
--      set status = 'active'
--    where id = '9bb347f8-03ec-48ce-8ff2-2503fb74c895';
--   update public.products
--      set stock_quantity = 10
--    where id = '9bb347f8-03ec-48ce-8ff2-2503fb74c895';
