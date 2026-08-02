-- 052_product_approval_workflow.sql
-- Content-uploader approval flow: products created/edited by content_uploader
-- require admin approval before they can be published (status = 'active').
-- Adds approval columns on public.products + a privilege-enforcement trigger.
-- Numbering note: written as 046 on the old phase6/admin branch; renumbered to
-- 048 after 046_checkout_runtime.sql + 047_checkout_settlement.sql landed.

-- 1. Approval status enum
DO $$ BEGIN
  CREATE TYPE public.product_approval_status AS ENUM ('draft', 'pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Approval columns on products.
-- Default 'approved': all pre-existing products are live/admin-managed; the
-- trigger below forces 'pending' for content_uploader writes, so the default
-- cannot be used to bypass review.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS approval_status public.product_approval_status NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approval_note text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_products_approval_pending
  ON public.products (submitted_at)
  WHERE approval_status = 'pending';

-- 3. Enforcement trigger:
--    * content_uploader (any non-admin authenticated writer) can never
--      self-approve: every INSERT/UPDATE they make lands in 'pending'
--      (or stays 'draft') and clears approved_by/approved_at.
--    * status = 'active' requires approval_status = 'approved'.
--    * an admin setting status = 'active' auto-approves.
--    * service-role writes (auth.uid() IS NULL) are trusted as-is.
CREATE OR REPLACE FUNCTION public.enforce_product_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service role / internal jobs
  END IF;

  IF NOT public.is_admin() THEN
    -- Non-admin (content_uploader by RLS): edits always require re-review.
    IF NEW.approval_status NOT IN ('draft'::public.product_approval_status,
                                   'pending'::public.product_approval_status) THEN
      NEW.approval_status := 'pending'::public.product_approval_status;
    END IF;
    IF TG_OP = 'UPDATE'
       AND OLD.approval_status = 'approved'::public.product_approval_status THEN
      NEW.approval_status := 'pending'::public.product_approval_status;
    END IF;
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
    IF NEW.approval_status = 'pending'::public.product_approval_status
       AND NEW.submitted_at IS NULL THEN
      NEW.submitted_at := now();
    END IF;
    -- Publishing is blocked until an admin approves.
    IF NEW.status = 'active'::public.product_status THEN
      RAISE EXCEPTION 'product requires admin approval before publishing'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    -- Admin path: activating a product implies approval.
    IF NEW.status = 'active'::public.product_status
       AND NEW.approval_status <> 'approved'::public.product_approval_status THEN
      NEW.approval_status := 'approved'::public.product_approval_status;
    END IF;
    IF NEW.approval_status = 'approved'::public.product_approval_status
       AND (TG_OP = 'INSERT'
            OR OLD.approval_status <> 'approved'::public.product_approval_status) THEN
      NEW.approved_by := auth.uid();
      NEW.approved_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_product_approval ON public.products;
CREATE TRIGGER enforce_product_approval
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_approval();
