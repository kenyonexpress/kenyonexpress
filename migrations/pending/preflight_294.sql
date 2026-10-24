-- Preflight for 294_group_deals.sql
-- Verifies no conflicting tables exist

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('group_deals', 'group_deal_participants')
  ) THEN
    RAISE EXCEPTION 'One or more tables from migration 294 already exist';
  END IF;
END $$;
