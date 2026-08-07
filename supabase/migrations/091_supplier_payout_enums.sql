-- 091_supplier_payout_enums.sql
-- Foundation enums for the supplier payout engine.
-- Enums only: no tables, no functions, no data. Safe to re-run.
--
-- payout_status is declared here with the 5-value form from 027:40, NOT the
-- 4-value form from 026:34. The two shadow each other through the
-- duplicate_object guard, and whichever lands first wins permanently.
-- Taking the superset first makes 083 a no-op instead of a repair.
--
-- supplier_member_role is deliberately absent: 072 already put it on the DB.

DO $$ BEGIN
  CREATE TYPE public.supplier_status AS ENUM ('active', 'suspended', 'closed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.supplier_application_status AS ENUM
    ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.payout_status AS ENUM
    ('draft', 'pending_approval', 'approved', 'paid', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.payout_line_type AS ENUM
    ('physical_delivery', 'coupon_redemption', 'adjustment');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.dispute_status AS ENUM
    ('open', 'in_review', 'resolved_accepted', 'resolved_rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.scan_result AS ENUM
    ('success', 'not_found', 'already_used', 'expired', 'refunded',
     'wrong_supplier', 'unauthorized', 'rate_limited');
EXCEPTION WHEN duplicate_object THEN null; END $$;
