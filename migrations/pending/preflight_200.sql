-- Preflight for migration 200: deal seeding infrastructure
--
-- READ-ONLY. Run it through execute_sql BEFORE the migration; every row must
-- start with OK (or SKIP/NOTE, which say why the migration is partly a no-op).
-- Any row starting with STOP means do not apply.

SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'categories')
  THEN 'OK: public.categories exists (required)'
  ELSE 'STOP: public.categories is missing, this migration cannot apply'
END AS requires_categories;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pending_deals')
  THEN 'SKIP: public.pending_deals already exists'
  ELSE 'OK: can create public.pending_deals'
END AS pending_deals_check;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'deal_sources')
  THEN 'SKIP: public.deal_sources already exists'
  ELSE 'OK: can create public.deal_sources'
END AS deal_sources_check;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'deal_duplicates')
  THEN 'SKIP: public.deal_duplicates already exists'
  ELSE 'OK: can create public.deal_duplicates'
END AS deal_duplicates_check;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'deal_validations')
  THEN 'SKIP: public.deal_validations already exists'
  ELSE 'OK: can create public.deal_validations'
END AS deal_validations_check;
