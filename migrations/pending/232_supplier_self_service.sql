-- 232_supplier_self_service.sql
--
-- Section 54 (SUPPLIER-SELF-SERVICE): what a supplier may change about their
-- own shop without an admin typing it for them, and the queue an admin decides
-- each change in.
--
-- =============================================================================
-- WHAT IS HERE, AND WHY EACH IS A REQUEST ROW AND NOT A GRANT
-- =============================================================================
--
-- 225 made the case once for contact details: `suppliers` carries money
-- columns beside the editable ones, an UPDATE grant is a grant on the row, and
-- a request table is both the narrow write AND the audit record. The same
-- argument covers everything below, so nothing here grants a client role a
-- write on `suppliers`, `products` or `product_images`.
--
-- 1. `suppliers.about_he` and `suppliers.opening_hours`: two text columns the
--    supplier page can show, requested through the SAME table as contact
--    details (225's `supplier_contact_requests`), whose field CHECK is widened
--    here. Section 28 called them contact details; section 54 calls them the
--    profile. One queue, one admin screen.
--
-- 2. `supplier_price_proposals`: a supplier proposes a new sticker price for
--    one of THEIR products. Prices are money; the admin applies an approved
--    proposal through `buildProductMoneyWrite`, the same pure module the admin
--    form and checkout use, so a proposal can never write a price the split
--    arithmetic would not accept. The proposal stores agorot (integer), never
--    a float, per the money rule.
--
-- 3. `supplier_image_submissions` and the PRIVATE `supplier-pending` bucket:
--    a supplier's upload lands where nobody can link to it. The server writes
--    the object and the row with the service role; the client roles have no
--    INSERT here and no storage policy on the bucket at all. An approval copies
--    the object into the public bucket and appends its URL to the product (or
--    sets the shop logo); a rejection leaves the public catalogue untouched.
--    "Pending bucket" in the section's words is exactly this: a bucket with
--    zero client policies.
--
-- RLS on both new tables: members read their own supplier's rows, owners file
-- and withdraw, admins read everything and decide with the service role.
-- Section 54's last clause, "all writes RLS-scoped to their supplier_id", is
-- the WITH CHECK on every INSERT/UPDATE policy below, plus the product
-- ownership subquery on proposals: a supplier cannot price someone else's
-- product by pasting its id.
--
-- ORDER: after 225 (widens its CHECK when the table exists; skips cleanly when
-- it does not, so 232 never fails on 225's absence, it just leaves the two
-- profile fields unrequestable until 225 lands). Independent of everything
-- else in pending/.
--
-- IDEMPOTENT: every statement is IF NOT EXISTS / DROP IF EXISTS / ON CONFLICT.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Profile columns, and the request field list that reaches them
-- -----------------------------------------------------------------------------

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS about_he text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS opening_hours text;

COMMENT ON COLUMN public.suppliers.about_he IS
  'Supplier-written description shown on the supplier page. Changed only through supplier_contact_requests (232).';
COMMENT ON COLUMN public.suppliers.opening_hours IS
  'Free-text opening hours, Hebrew. Changed only through supplier_contact_requests (232).';

ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_profile_text_lengths;
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_profile_text_lengths
  CHECK (
    (about_he IS NULL OR length(about_he) <= 300)
    AND (opening_hours IS NULL OR length(opening_hours) <= 300)
  );

DO $$
BEGIN
  IF to_regclass('public.supplier_contact_requests') IS NOT NULL THEN
    ALTER TABLE public.supplier_contact_requests
      DROP CONSTRAINT IF EXISTS supplier_contact_requests_field_allowed;
    ALTER TABLE public.supplier_contact_requests
      ADD CONSTRAINT supplier_contact_requests_field_allowed
      CHECK (field IN (
        'contact_name', 'contact_email', 'contact_phone', 'whatsapp', 'address', 'city', 'website',
        'about_he', 'opening_hours'
      ));
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Price proposals
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.supplier_price_proposals (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id                 uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  product_id                  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  current_kenyon_price_agorot bigint,
  proposed_kenyon_price_agorot bigint NOT NULL,
  note                        text,
  status                      text NOT NULL DEFAULT 'pending',
  requested_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  decided_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at                  timestamptz,
  decision_note               text
);

COMMENT ON TABLE public.supplier_price_proposals IS
  'Supplier-proposed sticker prices awaiting an admin decision; agorot, integer. The row is the audit record. See 232.';

ALTER TABLE public.supplier_price_proposals
  DROP CONSTRAINT IF EXISTS supplier_price_proposals_status_allowed;
ALTER TABLE public.supplier_price_proposals
  ADD CONSTRAINT supplier_price_proposals_status_allowed
  CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn'));

ALTER TABLE public.supplier_price_proposals
  DROP CONSTRAINT IF EXISTS supplier_price_proposals_money;
ALTER TABLE public.supplier_price_proposals
  ADD CONSTRAINT supplier_price_proposals_money
  CHECK (
    proposed_kenyon_price_agorot > 0
    AND proposed_kenyon_price_agorot <= 10000000
    AND (current_kenyon_price_agorot IS NULL OR current_kenyon_price_agorot >= 0)
  );

ALTER TABLE public.supplier_price_proposals
  DROP CONSTRAINT IF EXISTS supplier_price_proposals_decision_complete;
ALTER TABLE public.supplier_price_proposals
  ADD CONSTRAINT supplier_price_proposals_decision_complete
  CHECK (
    (status = 'pending' AND decided_at IS NULL)
    OR (status <> 'pending' AND decided_at IS NOT NULL)
  );

ALTER TABLE public.supplier_price_proposals
  DROP CONSTRAINT IF EXISTS supplier_price_proposals_lengths;
ALTER TABLE public.supplier_price_proposals
  ADD CONSTRAINT supplier_price_proposals_lengths
  CHECK (
    (note IS NULL OR length(note) <= 1000)
    AND (decision_note IS NULL OR length(decision_note) <= 1000)
  );

-- One open proposal per product: a second one is a changed mind, so withdraw
-- first. The partial unique index is the only thing that makes that true
-- under two concurrent submits.
CREATE UNIQUE INDEX IF NOT EXISTS supplier_price_proposals_one_pending_idx
  ON public.supplier_price_proposals (product_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS supplier_price_proposals_pending_idx
  ON public.supplier_price_proposals (created_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS supplier_price_proposals_supplier_idx
  ON public.supplier_price_proposals (supplier_id, created_at DESC);

ALTER TABLE public.supplier_price_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supplier_price_proposals_member_select" ON public.supplier_price_proposals;
CREATE POLICY "supplier_price_proposals_member_select"
  ON public.supplier_price_proposals FOR SELECT TO authenticated
  USING (public.is_supplier_member(supplier_id) OR public.is_admin());

DROP POLICY IF EXISTS "supplier_price_proposals_owner_insert" ON public.supplier_price_proposals;
CREATE POLICY "supplier_price_proposals_owner_insert"
  ON public.supplier_price_proposals FOR INSERT TO authenticated
  WITH CHECK (
    public.is_supplier_owner(supplier_id)
    AND requested_by = (SELECT auth.uid())
    AND status = 'pending'
    AND decided_at IS NULL
    AND decided_by IS NULL
    AND decision_note IS NULL
    -- The product must be this supplier's. Without this line the owner of shop
    -- A could file a price for shop B's product and an admin would see a
    -- plausible-looking row.
    AND EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id AND p.supplier_id = supplier_price_proposals.supplier_id
    )
  );

DROP POLICY IF EXISTS "supplier_price_proposals_owner_withdraw" ON public.supplier_price_proposals;
CREATE POLICY "supplier_price_proposals_owner_withdraw"
  ON public.supplier_price_proposals FOR UPDATE TO authenticated
  USING (public.is_supplier_owner(supplier_id) AND status = 'pending')
  WITH CHECK (
    public.is_supplier_owner(supplier_id)
    AND status IN ('pending', 'withdrawn')
    AND decided_by IS NULL
  );

REVOKE ALL ON public.supplier_price_proposals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.supplier_price_proposals TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Image submissions and the pending bucket
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.supplier_image_submissions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id    uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  kind           text NOT NULL,
  product_id     uuid REFERENCES public.products(id) ON DELETE CASCADE,
  storage_bucket text NOT NULL DEFAULT 'supplier-pending',
  storage_path   text NOT NULL,
  mime_type      text NOT NULL,
  byte_size      integer NOT NULL,
  alt_he         text NOT NULL,
  status         text NOT NULL DEFAULT 'pending',
  submitted_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  decided_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at     timestamptz,
  decision_note  text,
  published_url  text
);

COMMENT ON TABLE public.supplier_image_submissions IS
  'Supplier uploads (product image or shop logo) parked in the private supplier-pending bucket until an admin publishes or rejects them. See 232.';

ALTER TABLE public.supplier_image_submissions
  DROP CONSTRAINT IF EXISTS supplier_image_submissions_kind_allowed;
ALTER TABLE public.supplier_image_submissions
  ADD CONSTRAINT supplier_image_submissions_kind_allowed
  CHECK (
    (kind = 'product' AND product_id IS NOT NULL)
    OR (kind = 'logo' AND product_id IS NULL)
  );

ALTER TABLE public.supplier_image_submissions
  DROP CONSTRAINT IF EXISTS supplier_image_submissions_status_allowed;
ALTER TABLE public.supplier_image_submissions
  ADD CONSTRAINT supplier_image_submissions_status_allowed
  CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn'));

ALTER TABLE public.supplier_image_submissions
  DROP CONSTRAINT IF EXISTS supplier_image_submissions_decision_complete;
ALTER TABLE public.supplier_image_submissions
  ADD CONSTRAINT supplier_image_submissions_decision_complete
  CHECK (
    (status = 'pending' AND decided_at IS NULL AND published_url IS NULL)
    OR (status <> 'pending' AND decided_at IS NOT NULL)
  );

ALTER TABLE public.supplier_image_submissions
  DROP CONSTRAINT IF EXISTS supplier_image_submissions_shape;
ALTER TABLE public.supplier_image_submissions
  ADD CONSTRAINT supplier_image_submissions_shape
  CHECK (
    byte_size > 0 AND byte_size <= 5242880
    AND length(alt_he) BETWEEN 1 AND 200
    AND length(storage_path) BETWEEN 1 AND 400
    AND (decision_note IS NULL OR length(decision_note) <= 1000)
  );

CREATE INDEX IF NOT EXISTS supplier_image_submissions_pending_idx
  ON public.supplier_image_submissions (created_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS supplier_image_submissions_supplier_idx
  ON public.supplier_image_submissions (supplier_id, created_at DESC);

ALTER TABLE public.supplier_image_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supplier_image_submissions_member_select" ON public.supplier_image_submissions;
CREATE POLICY "supplier_image_submissions_member_select"
  ON public.supplier_image_submissions FOR SELECT TO authenticated
  USING (public.is_supplier_member(supplier_id) OR public.is_admin());

-- No INSERT policy on purpose: the server action validates the file, writes the
-- object with the service role and inserts the row with it. A client-side
-- insert would let a row name an object that was never uploaded.

DROP POLICY IF EXISTS "supplier_image_submissions_owner_withdraw" ON public.supplier_image_submissions;
CREATE POLICY "supplier_image_submissions_owner_withdraw"
  ON public.supplier_image_submissions FOR UPDATE TO authenticated
  USING (public.is_supplier_owner(supplier_id) AND status = 'pending')
  WITH CHECK (
    public.is_supplier_owner(supplier_id)
    AND status IN ('pending', 'withdrawn')
    AND decided_by IS NULL
    AND published_url IS NULL
  );

REVOKE ALL ON public.supplier_image_submissions FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.supplier_image_submissions TO authenticated;

-- The pending bucket: private, and with NO storage.objects policy for any
-- client role. Only the service role reads or writes it, which is what makes
-- "pending" mean something.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'supplier-pending', 'supplier-pending', false, 5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
