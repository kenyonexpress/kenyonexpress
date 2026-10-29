-- Preflight check for migration 164 (read-only)
-- orders must carry the columns compute_tier reads; club_tiers may or may not exist yet (the migration is idempotent).
select column_name
  from information_schema.columns
 where table_schema = 'public' and table_name = 'orders'
   and column_name in ('user_id', 'paid_at', 'status', 'total_ils_agorot', 'deleted_at');
-- expect 5 rows
select to_regclass('public.club_tiers') as club_tiers, to_regprocedure('public.compute_tier(uuid)') as compute_tier;
-- either may be null; non-null means a prior apply, which this migration replaces in place
