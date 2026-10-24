-- Preflight for 301_supplier_verification_status.sql
-- Read-only. Reports whether the enum and the suppliers columns already exist.
-- The migration is idempotent, so this is informational, not a stop.

SELECT EXISTS (
  SELECT 1 FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typname = 'supplier_verification_status'
) AS enum_already_present;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'suppliers'
  AND column_name IN ('verification_status', 'verified_at', 'verified_by');
