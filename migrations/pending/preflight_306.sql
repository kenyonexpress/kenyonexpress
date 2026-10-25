-- Preflight check for migration 306
-- Verifies suppliers table exists and column doesn't already exist

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'suppliers'
  ) THEN
    RAISE EXCEPTION 'Table suppliers does not exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'suppliers'
    AND column_name = 'open_weekends'
  ) THEN
    RAISE EXCEPTION 'Column suppliers.open_weekends already exists';
  END IF;
END $$;
