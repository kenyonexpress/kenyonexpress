-- Preflight checks for migration 189: Affiliate program
--
-- Verifies that affiliate tables don't already exist

-- Check if affiliate tables already exist
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'affiliates')
  THEN 'SKIP: affiliates already exists'
  ELSE 'OK: Can create affiliates'
END AS affiliates_check;

SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'affiliate_links')
  THEN 'SKIP: affiliate_links already exists'
  ELSE 'OK: Can create affiliate_links'
END AS affiliate_links_check;

SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'affiliate_clicks')
  THEN 'SKIP: affiliate_clicks already exists'
  ELSE 'OK: Can create affiliate_clicks'
END AS affiliate_clicks_check;

SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'affiliate_orders')
  THEN 'SKIP: affiliate_orders already exists'
  ELSE 'OK: Can create affiliate_orders'
END AS affiliate_orders_check;

SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'affiliate_commissions')
  THEN 'SKIP: affiliate_commissions already exists'
  ELSE 'OK: Can create affiliate_commissions'
END AS affiliate_commissions_check;

SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'affiliate_payouts')
  THEN 'SKIP: affiliate_payouts already exists'
  ELSE 'OK: Can create affiliate_payouts'
END AS affiliate_payouts_check;

-- All checks passed if this query runs without errors
