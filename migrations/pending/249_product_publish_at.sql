-- 249_product_publish_at.sql
-- Scheduled publish for products (W03, 2026-10-05): a draft that carries a
-- future `publish_at` is promoted to `status = 'active'` by the
-- `price-schedule` cron job (every five minutes) when that moment passes.
--
-- WHY A TIMESTAMP ON THE DRAFT AND NOT A NEW STATUS VALUE. Every storefront
-- read filters `status = 'active'` (ten call sites in src/lib, measured
-- 2026-10-05). A `scheduled` enum value would be invisible to all of them by
-- accident, and `product_status` is a production type that nothing else needs
-- extended. A draft with a date stays a draft everywhere until the job flips
-- it, and the flip is the same single UPDATE an admin makes by hand.
--
-- WHO WRITES IT. Only the admin form (`upsertProduct`, money-visible roles):
-- the content_uploader never sees the field and the server ignores it for
-- that role, so an uploader cannot schedule a publish past the approval queue.
-- The job additionally requires `approval_status = 'approved'`.
--
-- WHAT THE JOB DOES, exactly (src/lib/admin/product-publish-schedule.ts):
--   UPDATE products SET status = 'active', published_at = now(), publish_at = NULL
--   WHERE id = $1 AND status = 'draft'
-- for each row of
--   SELECT id FROM products
--   WHERE status = 'draft' AND approval_status = 'approved'
--     AND deleted_at IS NULL AND publish_at IS NOT NULL AND publish_at <= now()
--   LIMIT 100
--
-- APPLICATION BEHAVIOUR BEFORE THIS FILE IS APPLIED. The form saves every
-- other field and refuses a FILLED schedule with this file's name
-- (optional-column-groups); the job logs `publish_schedule.column_absent`
-- once and returns `skipped`. Nothing is written nowhere.
--
-- Idempotent. No data change. No RLS change: the column rides the existing
-- products policies (admin / content_uploader write, public read of active
-- rows only, so an unpublished schedule is never readable by anon).

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS publish_at timestamptz;

COMMENT ON COLUMN public.products.publish_at IS
  'Scheduled publish: when set on a draft, the price-schedule cron promotes the row to active at or after this instant and clears it. NULL = no schedule.';

-- The job's read, and only the rows it can act on. Partial so the 44 live
-- products and every published row cost nothing.
CREATE INDEX IF NOT EXISTS products_publish_at_due_idx
  ON public.products (publish_at)
  WHERE status = 'draft' AND publish_at IS NOT NULL AND deleted_at IS NULL;

-- A schedule on a non-draft row is meaningless and would be silently ignored
-- by the job's filter; refuse it at the write so the form's rule (schedule
-- implies draft) is also the database's. NOT VALID is deliberate: no row has
-- the column yet, so there is nothing to validate, and the constraint still
-- applies to every write from this point on.
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_publish_at_only_on_draft;
ALTER TABLE public.products
  ADD CONSTRAINT products_publish_at_only_on_draft
  CHECK (publish_at IS NULL OR status = 'draft') NOT VALID;
