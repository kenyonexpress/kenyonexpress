-- Migration 297: Supplier verification status
--
-- Adds verification status enum and column to suppliers table.
-- Allows admin to mark suppliers as verified, pending, or unverified.

-- Create enum for supplier verification status
DO $$ BEGIN
  CREATE TYPE public.supplier_verification_status AS ENUM ('unverified', 'pending', 'verified');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Add verification_status column to suppliers table
ALTER TABLE public.suppliers
ADD COLUMN IF NOT EXISTS verification_status public.supplier_verification_status NOT NULL DEFAULT 'unverified';

-- Add index for filtering by verification status
CREATE INDEX IF NOT EXISTS idx_suppliers_verification_status
ON public.suppliers(verification_status)
WHERE deleted_at IS NULL;

-- Add verification metadata columns
ALTER TABLE public.suppliers
ADD COLUMN IF NOT EXISTS verified_at timestamptz,
ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.suppliers.verification_status IS 'Verification status: unverified (default), pending (awaiting review), verified (approved)';
COMMENT ON COLUMN public.suppliers.verified_at IS 'Timestamp when supplier was verified';
COMMENT ON COLUMN public.suppliers.verified_by IS 'Admin user who verified the supplier';
