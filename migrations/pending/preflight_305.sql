-- Preflight check for migration 305
-- Verifies orders table exists and column doesn't already exist

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'orders'
  ) THEN
    RAISE EXCEPTION 'Table orders does not exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'orders'
    AND column_name = 'gift_scheduled_at'
  ) THEN
    RAISE EXCEPTION 'Column orders.gift_scheduled_at already exists';
  END IF;
END $$;
