-- Migration 231: GDPR + Israeli Privacy Law - Data Export and Deletion
-- Section 40: Implements articles 15 and 20 of GDPR and sections 11-13 of Israeli Privacy Protection Law 1981
--
-- This migration adds:
-- 1. pending_exports table: tracks generated data export downloads with signed URLs (24h expiry)
-- 2. pending_deletions table: tracks deletion requests with 30-day grace period and scheduled anonymization
-- 3. Audit logging for all operations
-- 4. RLS policies to ensure users can only see their own requests

-- =====================================================================
-- 1. ENUMS
-- =====================================================================

DO $$ BEGIN
  CREATE TYPE public.deletion_status AS ENUM (
    'requested',          -- User initiated deletion
    'confirmed',          -- User confirmed via email
    'grace_period',       -- 30-day grace period active
    'anonymized',         -- PII removed, account anonymized
    'cancelled'           -- User cancelled during grace period
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =====================================================================
-- 2. pending_exports TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.pending_exports (
  id              uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid      NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  export_url      text      NOT NULL,
  export_hash     text      NOT NULL UNIQUE,  -- Hash of URL for secure validation
  file_size_bytes bigint,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,       -- 24 hours from creation
  downloaded_at   timestamptz,                -- When/if user actually downloaded
  
  -- Audit trail
  ip_address      inet,
  user_agent      text
);

-- Indexes for pending_exports
CREATE INDEX IF NOT EXISTS idx_pending_exports_user_id
  ON public.pending_exports (user_id);

CREATE INDEX IF NOT EXISTS idx_pending_exports_expires_at
  ON public.pending_exports (expires_at);

CREATE INDEX IF NOT EXISTS idx_pending_exports_export_hash
  ON public.pending_exports (export_hash);

-- =====================================================================
-- 3. pending_deletions TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.pending_deletions (
  id              uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid      NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Request lifecycle
  status          public.deletion_status NOT NULL DEFAULT 'requested',
  requested_at    timestamptz NOT NULL DEFAULT now(),
  confirmed_at    timestamptz,              -- When user confirmed via email
  scheduled_delete_at timestamptz,          -- When anonymization should run (requested_at + 30 days)
  anonymized_at   timestamptz,              -- When anonymization actually completed
  
  -- Reason and notes for audit
  reason          text,                     -- Optional: why user requested deletion
  metadata        jsonb NOT NULL DEFAULT '{}',
  
  -- Audit trail
  requested_by_ip inet,
  requested_by_user_agent text,
  confirmed_by_ip inet,
  confirmed_by_user_agent text,
  
  -- Cancellation
  cancelled_at    timestamptz,
  cancelled_reason text
);

-- Indexes for pending_deletions
CREATE INDEX IF NOT EXISTS idx_pending_deletions_user_id
  ON public.pending_deletions (user_id, status);

CREATE INDEX IF NOT EXISTS idx_pending_deletions_status
  ON public.pending_deletions (status);

CREATE INDEX IF NOT EXISTS idx_pending_deletions_scheduled_delete_at
  ON public.pending_deletions (scheduled_delete_at)
  WHERE status = 'grace_period';

CREATE INDEX IF NOT EXISTS idx_pending_deletions_anonymized_at
  ON public.pending_deletions (anonymized_at);

-- =====================================================================
-- 4. RLS POLICIES
-- =====================================================================

ALTER TABLE public.pending_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_deletions ENABLE ROW LEVEL SECURITY;

-- pending_exports: Users can READ their own exports
DROP POLICY IF EXISTS "pending_exports: user read own" ON public.pending_exports;
CREATE POLICY "pending_exports: user read own"
  ON public.pending_exports FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- pending_exports: Admins can read all
DROP POLICY IF EXISTS "pending_exports: admin read all" ON public.pending_exports;
CREATE POLICY "pending_exports: admin read all"
  ON public.pending_exports FOR SELECT TO authenticated
  USING (public.is_admin());

-- pending_exports: Block direct inserts (writes via API only)
DROP POLICY IF EXISTS "pending_exports: no direct insert" ON public.pending_exports;
CREATE POLICY "pending_exports: no direct insert"
  ON public.pending_exports FOR INSERT TO authenticated
  WITH CHECK (false);

-- pending_deletions: Users can READ their own deletion requests
DROP POLICY IF EXISTS "pending_deletions: user read own" ON public.pending_deletions;
CREATE POLICY "pending_deletions: user read own"
  ON public.pending_deletions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- pending_deletions: Admins can read all
DROP POLICY IF EXISTS "pending_deletions: admin read all" ON public.pending_deletions;
CREATE POLICY "pending_deletions: admin read all"
  ON public.pending_deletions FOR SELECT TO authenticated
  USING (public.is_admin());

-- pending_deletions: Block direct inserts (writes via API only)
DROP POLICY IF EXISTS "pending_deletions: no direct insert" ON public.pending_deletions;
CREATE POLICY "pending_deletions: no direct insert"
  ON public.pending_deletions FOR INSERT TO authenticated
  WITH CHECK (false);

-- =====================================================================
-- 5. CONSTRAINT CHECKS
-- =====================================================================

ALTER TABLE public.pending_exports ADD CONSTRAINT check_export_expiry
  CHECK (expires_at > created_at);

ALTER TABLE public.pending_deletions ADD CONSTRAINT check_deletion_scheduled
  CHECK (scheduled_delete_at IS NULL OR scheduled_delete_at > requested_at);

ALTER TABLE public.pending_deletions ADD CONSTRAINT check_deletion_timeline
  CHECK (
    (status = 'requested' AND confirmed_at IS NULL AND scheduled_delete_at IS NULL) OR
    (status = 'confirmed' AND confirmed_at IS NOT NULL AND scheduled_delete_at IS NOT NULL) OR
    (status = 'grace_period' AND confirmed_at IS NOT NULL AND scheduled_delete_at IS NOT NULL) OR
    (status = 'anonymized' AND anonymized_at IS NOT NULL) OR
    (status = 'cancelled' AND cancelled_at IS NOT NULL)
  );
