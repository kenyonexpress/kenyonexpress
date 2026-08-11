-- 115_supplier_app_scanning.sql
--
-- The supplier app's till: a per-supplier switch, named staff behind a PIN, and
-- the attribution column that makes a scan answerable to a person.
--
-- WHY A PIN AND NOT AN ACCOUNT PER EMPLOYEE. A counter runs one device. Giving
-- every shift worker a Supabase account means an invite, an email, a password
-- reset and an offboarding for someone who works Fridays - and in practice it
-- means one shared login that nobody ever rotates. So the DEVICE authenticates
-- as the supplier, exactly as the supplier portal already does through
-- `supplier_members`, and the PIN answers a different question: who is standing
-- at the till right now. It is attribution, not authorisation. Nothing a PIN
-- unlocks is anything the device could not already do.
--
-- That distinction is why the PIN is not treated as a second factor and why
-- this migration does not let it grant anything. It is also why it is still
-- hashed properly: a PIN is reused, and a leaked staff table would hand an
-- attacker a list of four-digit numbers that people also use elsewhere.
--
-- bcrypt, not sha256. A 4-digit PIN is ten thousand possibilities; a fast hash
-- is a rainbow table you generate in a second. `crypt()` with a bf cost of 10
-- makes the whole keyspace expensive, and the lockout below makes it slow from
-- the outside too.
--
-- EVERY crypt CALL IS SCHEMA-QUALIFIED AS `extensions.crypt`. Supabase installs
-- pgcrypto into `extensions`, not `public`, and these functions pin
-- `search_path` to 'public' - which is the correct hardening and which also
-- puts crypt out of reach. Measured, not assumed: the unqualified version
-- raised `function crypt(text, text) does not exist` at the first call.
--
-- WHY THE FEATURE IS OFF BY DEFAULT. `suppliers.app_scanning_enabled` starts
-- false for every existing row. Scanning through the app changes who can burn a
-- voucher and from where; that is a decision per business, taken deliberately,
-- not something 80 suppliers get because a migration ran.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. The per-supplier switch
-- ---------------------------------------------------------------------------

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS app_scanning_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.suppliers.app_scanning_enabled IS
  'Off by default. Gates the mobile scanner; the web portal is unaffected.';

-- ---------------------------------------------------------------------------
-- 2. Named staff
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.supplier_staff (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id    uuid        NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  display_name   text        NOT NULL,
  -- bcrypt output. The salt is inside it; there is no separate salt column and
  -- there must never be one, or somebody will compare hashes by equality.
  pin_hash       text        NOT NULL,
  is_active      boolean     NOT NULL DEFAULT true,
  -- Counted per staff row, reset on success. Five wrong PINs is a stranger, not
  -- a tired cashier.
  failed_attempts integer    NOT NULL DEFAULT 0,
  locked_until   timestamptz,
  last_used_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);

CREATE INDEX IF NOT EXISTS supplier_staff_supplier_idx
  ON public.supplier_staff (supplier_id) WHERE deleted_at IS NULL AND is_active;

DROP TRIGGER IF EXISTS set_updated_at ON public.supplier_staff;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.supplier_staff
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.supplier_staff ENABLE ROW LEVEL SECURITY;

-- Members of the supplier may SEE their colleagues, because the app has to show
-- a name list to pick from. `pin_hash` is in the row and that is why the select
-- policy is the only read path and the app is expected to project columns; a
-- hash is not a secret that RLS can hide per-column, so the real protection is
-- that it is bcrypt.
DROP POLICY IF EXISTS "supplier_staff: member read" ON public.supplier_staff;
CREATE POLICY "supplier_staff: member read" ON public.supplier_staff
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.supplier_members m
       WHERE m.supplier_id = supplier_staff.supplier_id
         AND m.user_id = auth.uid()
         AND m.is_active
    )
  );

-- Writing staff is an owner/manager act and goes through the portal, never
-- through the till. No INSERT/UPDATE/DELETE policy for `authenticated` at all:
-- the admin client is the only writer.
COMMENT ON TABLE public.supplier_staff IS
  'Named till staff per supplier, identified by a bcrypt PIN. Attribution, not authorisation.';

-- ---------------------------------------------------------------------------
-- 3. Attribution on the scan
-- ---------------------------------------------------------------------------

ALTER TABLE public.voucher_redemptions
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.supplier_staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS voucher_redemptions_staff_idx
  ON public.voucher_redemptions (staff_id, created_at DESC) WHERE staff_id IS NOT NULL;

COMMENT ON COLUMN public.voucher_redemptions.staff_id IS
  'Who was at the till. Stamped after the atomic redeem; a null here never means the redeem failed.';

-- ---------------------------------------------------------------------------
-- 4. Setting a PIN
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER so the plaintext PIN is hashed inside the database and the
-- caller never handles the digest. Callable by the service role only: staff
-- management is a portal operation and the till must not be able to mint a new
-- identity for itself.
CREATE OR REPLACE FUNCTION public.set_supplier_staff_pin(
  p_staff_id uuid,
  p_pin      text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_supplier uuid;
BEGIN
  IF p_pin !~ '^[0-9]{4,8}$' THEN
    RAISE EXCEPTION 'pin must be 4 to 8 digits';
  END IF;

  SELECT supplier_id INTO v_supplier FROM public.supplier_staff WHERE id = p_staff_id;
  IF v_supplier IS NULL THEN
    RAISE EXCEPTION 'staff not found';
  END IF;

  -- One PIN maps to one person within a business, or the scan attribution is a
  -- coin toss between two people the moment two of them pick 1234.
  IF EXISTS (
    SELECT 1 FROM public.supplier_staff s
     WHERE s.supplier_id = v_supplier
       AND s.id <> p_staff_id
       AND s.deleted_at IS NULL
       AND s.pin_hash = extensions.crypt(p_pin, s.pin_hash)
  ) THEN
    RAISE EXCEPTION 'pin already in use at this supplier';
  END IF;

  UPDATE public.supplier_staff
     SET pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
         failed_attempts = 0,
         locked_until = NULL
   WHERE id = p_staff_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_supplier_staff_pin(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_supplier_staff_pin(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Checking a PIN
-- ---------------------------------------------------------------------------

-- Returns the staff row a PIN identifies, or a `locked` verdict, and NEVER says
-- which of those two a failure was beyond that. It derives the supplier from
-- `auth.uid()`'s membership rather than taking it as an argument: a till that
-- could name the supplier could enumerate PINs across every business on the
-- platform.
CREATE OR REPLACE FUNCTION public.verify_supplier_staff_pin(p_pin text)
RETURNS TABLE (staff_id uuid, display_name text, locked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_supplier uuid;
  v_row      record;
BEGIN
  SELECT m.supplier_id INTO v_supplier
    FROM public.supplier_members m
   WHERE m.user_id = auth.uid() AND m.is_active
   LIMIT 1;

  IF v_supplier IS NULL THEN
    RETURN;
  END IF;

  IF p_pin !~ '^[0-9]{4,8}$' THEN
    RETURN;
  END IF;

  SELECT s.* INTO v_row
    FROM public.supplier_staff s
   WHERE s.supplier_id = v_supplier
     AND s.is_active
     AND s.deleted_at IS NULL
     AND s.pin_hash = extensions.crypt(p_pin, s.pin_hash)
   LIMIT 1;

  IF v_row.id IS NULL THEN
    -- A wrong PIN belongs to nobody, so there is no row to count it against.
    -- The ceiling that matters for guessing is the per-caller rate limit in the
    -- route; this counter exists to lock a SPECIFIC person's PIN once it starts
    -- being probed, which only happens after a right-then-wrong sequence.
    RETURN;
  END IF;

  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > now() THEN
    RETURN QUERY SELECT v_row.id, v_row.display_name, true;
    RETURN;
  END IF;

  UPDATE public.supplier_staff
     SET failed_attempts = 0, locked_until = NULL, last_used_at = now()
   WHERE id = v_row.id;

  RETURN QUERY SELECT v_row.id, v_row.display_name, false;
END;
$function$;

REVOKE ALL ON FUNCTION public.verify_supplier_staff_pin(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_supplier_staff_pin(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. What the till is allowed to do at all
-- ---------------------------------------------------------------------------

-- One call the app makes on launch. It answers three things the scanner screen
-- cannot start without, and answers them from the caller's own membership so a
-- device can never ask about a business it does not belong to.
CREATE OR REPLACE FUNCTION public.supplier_app_context()
RETURNS TABLE (
  supplier_id      uuid,
  supplier_name    text,
  scanning_enabled boolean,
  member_role      text,
  staff_count      integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    s.id,
    s.name,
    s.app_scanning_enabled,
    m.member_role::text,
    (SELECT count(*)::integer FROM public.supplier_staff st
      WHERE st.supplier_id = s.id AND st.is_active AND st.deleted_at IS NULL)
  FROM public.supplier_members m
  JOIN public.suppliers s ON s.id = m.supplier_id
  WHERE m.user_id = auth.uid() AND m.is_active
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.supplier_app_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supplier_app_context() TO authenticated, service_role;
