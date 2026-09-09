-- 225_supplier_contact_requests.sql
--
-- A supplier asks for their contact details to be changed; an admin decides.
--
-- =============================================================================
-- WHY A REQUEST TABLE AND NOT AN UPDATE GRANT ON `suppliers`
-- =============================================================================
--
-- Section 28 words this as "contact details edit request form (admin
-- approves)", and the request row is the whole reason it is not simply an
-- editable form. `suppliers` carries `business_id`, `min_payout_ils`,
-- `payout_hold_business_days` and `status` beside the contact columns. Any
-- UPDATE grant to `authenticated` is a grant on the ROW; narrowing it to the
-- contact columns has to be done with a column-level grant plus a policy, and
-- the moment somebody adds a column to the table the default is that the new
-- column is NOT covered by the column grant -- which is safe -- or that a
-- trigger someone wrote to police it silently stops covering it -- which is
-- not. There is no version of this where a supplier holds UPDATE on the table
-- that pays them.
--
-- So the supplier writes to a table of their own, and the only thing that ever
-- writes `suppliers` stays what it already is: an admin, through the service
-- role.
--
-- THE ROW IS ALSO THE RECORD. "Who changed the payout email, and who approved
-- it" is a question that gets asked exactly once, after money goes somewhere
-- unexpected. A form that mutated the row directly answers it with nothing.
-- `requested_by`, `decided_by`, `decided_at` and the before/after values are
-- here so that it is answerable.
--
-- =============================================================================
-- WHAT MAY BE REQUESTED
-- =============================================================================
--
-- Six contact columns: `contact_name`, `contact_email`, `contact_phone`,
-- `whatsapp`, `address`, `city`, `website`. Not `name` -- the business's
-- display name is on the storefront, in the sitemap and in indexed URLs, and
-- renaming it is a catalogue decision rather than a contact correction. Not
-- `business_id`, which is the identity the invoices are issued against. Not
-- anything in the payout terms.
--
-- The allowlist is a CHECK constraint on the key and NOT only a list in
-- TypeScript, because the app-side allowlist is one refactor away from being
-- bypassed by a caller that constructs the field name from input. Two locks,
-- the same shape as the tenant scoping in the portal reads.
--
-- =============================================================================
-- ONE OPEN REQUEST PER FIELD PER SUPPLIER
-- =============================================================================
--
-- A partial unique index over `status = 'pending'`. Without it a supplier can
-- file forty requests for `contact_email` and an admin approving them in the
-- order they happen to appear lands on whichever one was clicked last, which is
-- not a decision. Filing again replaces the pending one (the app withdraws the
-- old row first); a decided row is never in the way, so history accumulates.
--
-- =============================================================================
-- APPLYING IS THE ADMIN'S WRITE, NOT A TRIGGER
-- =============================================================================
--
-- No trigger copies an approved value onto `suppliers`. A trigger here would
-- mean that flipping a status column is a money-adjacent write to another
-- table, performed by whatever role happened to run the UPDATE -- and the admin
-- panel is not the only thing that will ever touch this table. The application
-- writes `suppliers` first and marks the request approved second, so a failure
-- between the two leaves a pending request whose value is already live: a
-- re-approval writes the same value again and is idempotent. The other order
-- loses the change and reports success, which is the direction that must not
-- happen.

BEGIN;

CREATE TABLE IF NOT EXISTS public.supplier_contact_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id   uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  field         text NOT NULL,
  -- What the column held when the request was filed. Kept so a decision made a
  -- week later can be read against what it was actually changing, and so an
  -- approval that turns out to be wrong can be undone without guesswork.
  current_value text,
  requested_value text NOT NULL,
  note          text,
  status        text NOT NULL DEFAULT 'pending',
  requested_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  decided_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at    timestamptz,
  decision_note text
);

COMMENT ON TABLE public.supplier_contact_requests IS
  'Supplier-filed contact detail changes awaiting admin approval. The row is also the audit record; see 225.';

ALTER TABLE public.supplier_contact_requests
  DROP CONSTRAINT IF EXISTS supplier_contact_requests_field_allowed;
ALTER TABLE public.supplier_contact_requests
  ADD CONSTRAINT supplier_contact_requests_field_allowed
  CHECK (field IN ('contact_name', 'contact_email', 'contact_phone', 'whatsapp', 'address', 'city', 'website'));

ALTER TABLE public.supplier_contact_requests
  DROP CONSTRAINT IF EXISTS supplier_contact_requests_status_allowed;
ALTER TABLE public.supplier_contact_requests
  ADD CONSTRAINT supplier_contact_requests_status_allowed
  CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn'));

-- A decided row must say who decided and when; a pending row must not pretend
-- it was. This is the constraint that keeps "approved by nobody at no time"
-- out of the audit trail.
ALTER TABLE public.supplier_contact_requests
  DROP CONSTRAINT IF EXISTS supplier_contact_requests_decision_complete;
ALTER TABLE public.supplier_contact_requests
  ADD CONSTRAINT supplier_contact_requests_decision_complete
  CHECK (
    (status = 'pending' AND decided_at IS NULL)
    OR (status <> 'pending' AND decided_at IS NOT NULL)
  );

-- Length ceilings. A `text` column with no bound is a place to store a novel,
-- and these are rendered into an admin table.
ALTER TABLE public.supplier_contact_requests
  DROP CONSTRAINT IF EXISTS supplier_contact_requests_lengths;
ALTER TABLE public.supplier_contact_requests
  ADD CONSTRAINT supplier_contact_requests_lengths
  CHECK (
    length(requested_value) BETWEEN 1 AND 300
    AND (note IS NULL OR length(note) <= 1000)
    AND (decision_note IS NULL OR length(decision_note) <= 1000)
  );

-- One open request per field per supplier. See the header.
CREATE UNIQUE INDEX IF NOT EXISTS supplier_contact_requests_one_pending_idx
  ON public.supplier_contact_requests (supplier_id, field)
  WHERE status = 'pending';

-- The admin queue's read: every pending row, oldest first.
CREATE INDEX IF NOT EXISTS supplier_contact_requests_pending_idx
  ON public.supplier_contact_requests (created_at)
  WHERE status = 'pending';

-- The supplier's own history.
CREATE INDEX IF NOT EXISTS supplier_contact_requests_supplier_idx
  ON public.supplier_contact_requests (supplier_id, created_at DESC);

ALTER TABLE public.supplier_contact_requests ENABLE ROW LEVEL SECURITY;

-- READ: the shop's own staff, and admins.
--
-- `is_supplier_member` rather than `is_supplier_owner`: a manager files these
-- and has to be able to see the answer. The rows carry contact details of the
-- business itself and no customer data, so there is nothing here a member of
-- staff may not see.
DROP POLICY IF EXISTS "supplier_contact_requests_member_select" ON public.supplier_contact_requests;
CREATE POLICY "supplier_contact_requests_member_select"
  ON public.supplier_contact_requests FOR SELECT TO authenticated
  USING (public.is_supplier_member(supplier_id) OR public.is_admin());

-- WRITE: owners only, and only rows that name their own supplier, as their own
-- user, in the pending state.
--
-- `status = 'pending'` and `decided_at IS NULL` are in the WITH CHECK because
-- without them an INSERT may name its own outcome: a supplier could file a row
-- that is already `approved`, and the admin queue -- which lists pending rows --
-- would never show it. The approval write reads the request row, so a
-- self-approved row is a supplier writing their own contact details through a
-- path that looks audited.
DROP POLICY IF EXISTS "supplier_contact_requests_owner_insert" ON public.supplier_contact_requests;
CREATE POLICY "supplier_contact_requests_owner_insert"
  ON public.supplier_contact_requests FOR INSERT TO authenticated
  WITH CHECK (
    public.is_supplier_owner(supplier_id)
    AND requested_by = (SELECT auth.uid())
    AND status = 'pending'
    AND decided_at IS NULL
    AND decided_by IS NULL
    AND decision_note IS NULL
  );

-- WITHDRAW: an owner may take back their own pending request, and that is the
-- ONLY update they get. `USING` restricts which rows they may touch; the
-- `WITH CHECK` restricts what the row may become, and without it an owner
-- passing the USING clause could set the row to `approved`.
--
-- This cannot stop them rewriting `requested_value` on a row that stays
-- pending, which is fine: a pending row has not been acted on, and editing it
-- is filing it again. What it stops is any transition out of `pending`.
DROP POLICY IF EXISTS "supplier_contact_requests_owner_withdraw" ON public.supplier_contact_requests;
CREATE POLICY "supplier_contact_requests_owner_withdraw"
  ON public.supplier_contact_requests FOR UPDATE TO authenticated
  USING (public.is_supplier_owner(supplier_id) AND status = 'pending')
  WITH CHECK (
    public.is_supplier_owner(supplier_id)
    AND status IN ('pending', 'withdrawn')
    AND decided_by IS NULL
  );

-- No DELETE policy at all. Withdrawing sets a status; the row stays, because
-- the point of the table is that the history of who asked for what survives.

-- The grant is the outer boundary and the policies narrow it. DELETE is not
-- granted, so the absent DELETE policy cannot be re-enabled by a future policy
-- alone. `anon` gets nothing: none of this is public.
REVOKE ALL ON public.supplier_contact_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.supplier_contact_requests TO authenticated;

-- Admin approval runs through the service role, which bypasses RLS; it needs no
-- policy and is deliberately given none, so that the only UPDATE reachable with
-- a user's own JWT is the withdraw above.

COMMIT;
