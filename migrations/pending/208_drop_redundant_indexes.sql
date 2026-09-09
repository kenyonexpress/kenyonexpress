-- 208_drop_redundant_indexes.sql
--
-- Fourteen indexes whose work another index already does.
--
-- =============================================================================
-- WHAT WAS MEASURED, ON PRODUCTION, 2026-09-09
-- =============================================================================
--
--   tables                     91
--   indexes                   390
--   never scanned since 16.07 253   (65%)
--   whole database          9,856 kB
--   of which indexes        5,920 kB   (60%)
--   of which never scanned  3,168 kB
--
-- 253 UNUSED INDEXES IS NOT THE FINDING, AND THIS FILE DOES NOT DROP THEM.
-- This database has almost no traffic: the storefront's reads are cached, the
-- catalogue is 44 rows, and `pg_stat_statements` shows no application query
-- above 10 ms mean. "Never scanned" here mostly means "the query that would use
-- it has never run", not "the index is useless" - and Postgres will not use an
-- index on a 44-row table at all, because a sequential scan of one page is
-- cheaper. Dropping an index because it is unused at 44 rows is optimising for
-- a scale the business is trying to leave.
--
-- THE FINDING IS REDUNDANCY, WHICH IS WRONG AT EVERY SCALE. An index on (a) is
-- pointless beside an index on (a, b): the composite serves every query the
-- narrow one serves, because a B-tree can be scanned on any prefix of its key.
-- The narrow one costs a write on every insert and update, costs planning time
-- on every query against the table, and buys nothing at 44 rows or at 44
-- million. Fourteen such pairs exist, found by comparing every non-unique,
-- non-primary index against every other index on the same table with the same
-- partial predicate.
--
-- =============================================================================
-- WHY THE NARROW ONE GOES AND NOT THE WIDE ONE
-- =============================================================================
--
-- Two of these look backwards on the scan counts:
--
--   products_status_idx      (status)         55,593 scans
--   idx_products_status_type (status, type)       14 scans
--
--   carts_session_id_idx      (session_id)             49,714 scans
--   carts_session_profile_idx (session_id, profile_id)      0 scans
--
-- The heavily used one is the one being dropped, and that is correct rather
-- than reckless: the planner picked the narrow index because it was there and
-- is slightly smaller, not because nothing else can serve the query.
--
-- THAT WAS NOT ASSUMED. All fifteen were dropped inside a rolled-back
-- transaction, `enable_seqscan` was turned off so a 44-row table could not hide
-- the answer behind a sequential scan, and `EXPLAIN` was re-read for each. The
-- plans:
--
--   products.status = 'active'  ->  idx_products_published
--   carts.session_id = ...      ->  carts_session_profile_idx
--   orders.user_id = ...        ->  idx_orders_user_status
--   vouchers.order_item_id      ->  vouchers_order_item_issued_idx
--
-- THE FIRST ONE IS NOT WHAT THE PAIR-WISE ANALYSIS PREDICTED, and it is worth
-- keeping rather than tidying away. `products` carries FOUR status-leading or
-- status-filtered indexes:
--
--   products_status_idx          (status)                              55,593
--   idx_products_published       (published_at DESC) WHERE status=active 30,833
--   products_status_created_idx  (status, created_at) WHERE not deleted  1,084
--   idx_products_status_type     (status, type)                             14
--
-- With the plain one gone the planner takes the PARTIAL index, which matches
-- the predicate exactly and is smaller than the composite. That is a better
-- answer than the one this file was written expecting, and the only way to know
-- was to drop it and look.
--
-- The probe also caught a defect in itself, which is why it is described here
-- rather than summarised: the first run used `user_id = gen_random_uuid()` and
-- reported a sequential scan on `orders`. `gen_random_uuid()` is VOLATILE, so
-- no index scan is possible against it - the schema was fine and the test was
-- wrong, and a less suspicious reading would have kept an index on the strength
-- of it.
--
-- =============================================================================
-- WHAT IS NOT TOUCHED
-- =============================================================================
--
-- Every index backing a PRIMARY KEY or a UNIQUE constraint. Those cannot be
-- dropped without dropping the constraint, and the constraint is the point:
-- `affiliates_affiliate_code_key` is what makes two affiliates unable to share
-- a code, and `idx_affiliates_code` is the copy of it that buys nothing.
--
-- `DROP INDEX` and not `DROP INDEX CONCURRENTLY`, because CONCURRENTLY cannot
-- run inside a transaction block and this file is one. At this size the lock is
-- microseconds; a database where it is not should apply these one at a time.

BEGIN;

-- affiliates: both duplicates of a UNIQUE constraint's own index.
DROP INDEX IF EXISTS public.idx_affiliates_code;      -- (affiliate_code) = affiliates_affiliate_code_key
DROP INDEX IF EXISTS public.idx_affiliates_user_id;   -- (user_id)        = affiliates_user_id_key

-- carts: (session_id) is a prefix of (session_id, profile_id).
DROP INDEX IF EXISTS public.carts_session_id_idx;

-- escrow_holds: (supplier_id, status) is a prefix of (supplier_id, status, held_at).
DROP INDEX IF EXISTS public.idx_escrow_holds_supplier;

-- invoices: (order_id) is a prefix of (order_id, document_type, status).
DROP INDEX IF EXISTS public.idx_invoices_order;

-- orders. `orders_created_at_idx` and `idx_orders_created_at` are the SAME
-- index under two names, created by two migrations that did not know about each
-- other. The one with fewer scans goes; either would have done.
DROP INDEX IF EXISTS public.orders_created_at_idx;
DROP INDEX IF EXISTS public.idx_orders_invoice_number;  -- = orders_invoice_number_key
DROP INDEX IF EXISTS public.orders_user_id_idx;         -- prefix of idx_orders_user_status

-- price_history: (product_id, observed_on) is a prefix of the uniqueness index.
DROP INDEX IF EXISTS public.price_history_product_recent;

-- products: (status) is a prefix of (status, type). See the note above about
-- the scan counts.
DROP INDEX IF EXISTS public.products_status_idx;

-- rate_limits: (key) duplicates the UNIQUE constraint's index, which is also
-- the one already carrying the traffic (3,895 scans against 2).
DROP INDEX IF EXISTS public.rate_limits_key_idx;

-- stock_waitlist: (product_id) is a prefix of (product_id, email).
DROP INDEX IF EXISTS public.stock_waitlist_pending;

-- user_addresses: (user_id) is a prefix of (user_id, is_default, created_at).
DROP INDEX IF EXISTS public.idx_user_addresses_user_active;

-- vouchers: (order_item_id) is a prefix of (order_item_id, issued_at).
DROP INDEX IF EXISTS public.vouchers_order_item_idx;

-- wallet_balances: (user_id) duplicates the UNIQUE constraint's index.
DROP INDEX IF EXISTS public.idx_wallet_balances_user_id;

COMMIT;
