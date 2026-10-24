-- Preflight for 296_bookings.sql
-- Verifies no conflicting tables exist

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'bookings'
  ) THEN
    RAISE EXCEPTION 'bookings table from migration 296 already exists';
  END IF;
END $$;
