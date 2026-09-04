-- 170_composite_indexes_top_queries.sql
-- Composite indexes for the ten most frequent query patterns.
-- Pattern source: ARCHITECTURE.md points to docs/MASTER-ARCHITECTURE.md,
-- whose section 2.12 (planned 038_performance_indexes) defers to
-- docs/ARCHITECTURE-PERFORMANCE.md section 6.3 plus measured query plans.
-- Each pattern below was matched to the live code path that issues it and
-- verified non-duplicate against pg_indexes before writing.
-- Baseline and after plans: docs/perf/indexes.md.
-- Expand-only: CREATE INDEX IF NOT EXISTS only, no drops, no data changes.

-- (1) Category listing, newest first (src/lib/category-page.ts:369-441)
--     products WHERE status='active' AND deleted_at IS NULL AND category_id=?
--     ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS products_active_category_created_idx
  ON public.products (category_id, created_at DESC)
  WHERE status = 'active'::product_status AND deleted_at IS NULL;

-- (2) Shop-wide listing, newest first, and the related-products fallback rail
--     (src/lib/category-page.ts:335, src/lib/related-products.ts:90)
--     products WHERE status='active' AND deleted_at IS NULL
--     ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS products_status_created_idx
  ON public.products (status, created_at DESC)
  WHERE deleted_at IS NULL;

-- (3) Category listing, price sort (src/lib/category-page.ts:404-407)
CREATE INDEX IF NOT EXISTS products_active_category_price_idx
  ON public.products (category_id, kenyon_price)
  WHERE status = 'active'::product_status AND deleted_at IS NULL;

-- (4) Shop-wide price sort (src/lib/category-page.ts:514-517)
CREATE INDEX IF NOT EXISTS products_active_price_created_idx
  ON public.products (kenyon_price, created_at DESC)
  WHERE status = 'active'::product_status AND deleted_at IS NULL;

-- (5) Category listing, Hebrew name sort (src/lib/category-page.ts:410, 520)
CREATE INDEX IF NOT EXISTS products_active_category_name_idx
  ON public.products (category_id, name_he)
  WHERE status = 'active'::product_status AND deleted_at IS NULL;

-- (6) Account order history (src/server/queries/orders.ts:141-148)
--     orders WHERE user_id=? AND deleted_at IS NULL
--     ORDER BY created_at DESC LIMIT 50
CREATE INDEX IF NOT EXISTS orders_user_created_active_idx
  ON public.orders (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- (7) Vouchers per order item on the order detail page
--     (src/server/queries/orders.ts:281-286)
--     vouchers WHERE order_item_id IN (...) ORDER BY issued_at ASC
CREATE INDEX IF NOT EXISTS vouchers_order_item_issued_idx
  ON public.vouchers (order_item_id, issued_at);

-- (8) Receipt lookup on the order detail page
--     (src/server/queries/orders.ts:403-411)
--     invoices WHERE order_id=? AND document_type IN (...) AND status='issued'
CREATE INDEX IF NOT EXISTS invoices_order_doc_status_idx
  ON public.invoices (order_id, document_type, status);

-- (9) Guest cart lookup, runs on every cart mutation and cart read
--     (src/server/actions/cart.ts:205-209, 568-572)
--     carts WHERE session_id=? AND profile_id IS NULL
--     btree indexes NULLs, so the composite serves the IS NULL arm directly.
CREATE INDEX IF NOT EXISTS carts_session_profile_idx
  ON public.carts (session_id, profile_id);

-- (10) Address book per user (src/server/queries/account.ts:168-174)
--      user_addresses WHERE user_id=? AND deleted_at IS NULL
--      ORDER BY is_default DESC, created_at DESC
CREATE INDEX IF NOT EXISTS user_addresses_user_default_created_idx
  ON public.user_addresses (user_id, is_default DESC, created_at DESC)
  WHERE deleted_at IS NULL;
