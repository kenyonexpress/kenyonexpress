-- 306: suppliers.open_weekends for F63 weekend filter chip.
-- The 'פתוח בסופ״ש' chip filters by suppliers that are open on weekends
-- (Friday/Saturday in Israel). NULL defaults to false for existing rows.
-- This is distinct from products.weekend_only (migration 284), which marks
-- products that are only valid on weekends, not whether the supplier is open.
-- Rollback: alter table public.suppliers drop column if exists open_weekends;

alter table public.suppliers
  add column if not exists open_weekends boolean;

comment on column public.suppliers.open_weekends is
  'True when the supplier business is open on weekends (Friday and Saturday in Israel). Drives the weekend filter chip on category pages.';
