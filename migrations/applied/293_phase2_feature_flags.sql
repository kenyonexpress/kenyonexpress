-- 293: Seed Phase 2 feature flags in feature_flags table (C37).
-- Extends migration 286's feature_flags table to include all Phase 2 flags:
-- physical-products, courses-monthly, tzimmer-calendar, monthly-billing.
-- All seeded as false (OFF). The env var fallback from src/lib/flags/index.ts
-- remains: FLAG_* env can override, but the DB is the source of truth.
--
-- Rollback: delete from public.feature_flags where key in (
--   'physical_products', 'courses_monthly', 'tzimmer_calendar', 'monthly_billing'
-- );

insert into public.feature_flags (key, bool_value)
values
  ('physical_products', false),
  ('courses_monthly', false),
  ('tzimmer_calendar', false),
  ('monthly_billing', false)
on conflict (key) do nothing;

comment on table public.feature_flags is
  'Runtime flags, world-readable by design (no secrets). maintenance_mode drives the proxy. Phase 2 flags control feature rollout.';
