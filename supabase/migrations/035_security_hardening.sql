-- Migration 035: Security hardening
-- ============================================================================
-- Companion to docs/ARCHITECTURE-SECURITY.md. Implements the fixes for the
-- findings register SEC-01..SEC-14.
--
-- Numbered after all existing drafts (renumbered 036 -> 035 on 2026-07-17 for a
-- gapless 026-035 sequence; analytics_bi is now 034). Fully idempotent and
-- existence-guarded: safe to apply on the
-- live DB (currently ~025) whether or not drafts 026-034 have been applied. Every
-- statement that targets a draft-era object is wrapped in an existence check, so
-- it is skipped until that draft lands and then activates on a re-run. The fixes
-- that target already-applied objects (SEC-02/03/04/06/09) run immediately.
--
-- Apply ONLY via Supabase MCP apply_migration (never `db push`).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- SEC-01: fn_wallet_transfer must not be callable by browser roles.
--   026 only did `REVOKE ... FROM anon`, leaving the default PUBLIC EXECUTE
--   (which includes `authenticated`). Any logged-in user could mint wallet
--   balance by crediting their own account from a platform account. Lock it to
--   service_role. Guarded: runs only if the function exists (i.e. 026 applied).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_wallet_transfer'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.fn_wallet_transfer(uuid, uuid, numeric, public.wallet_reason, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.fn_wallet_transfer(uuid, uuid, numeric, public.wallet_reason, text, uuid, uuid, text) TO service_role';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- SEC-10: the legacy 026 redemption path fn_redeem_coupon(text, text) is a
--   second, differently-authorized entry point. 027's redeem_coupon is the
--   single canonical path. Revoke execute on the legacy function from every
--   browser role. Guarded on existence.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_redeem_coupon'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.fn_redeem_coupon(text, text) FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- SEC-02: affiliates_user_update let an owner UPDATE any column, including
--   status, approved_by and total_earnings_ils (self-approval + fabricated
--   earnings). Drop it; affiliate self-service edits return later as a scoped
--   SECURITY DEFINER function, never a raw policy. Guarded on table existence.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.affiliates') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS affiliates_user_update ON public.affiliates';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- SEC-03: any `admin` could set role='super_admin' on anyone (the "profiles:
--   admin all" policy has no column restriction). Recreate it with a WITH CHECK
--   and add a BEFORE trigger that enforces the elevation rules at the DB level
--   (defense in depth, independent of the app-side check in updateUserRole).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "profiles: admin all" ON public.profiles;
CREATE POLICY "profiles: admin all"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.enforce_role_change_privilege()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller public.user_role;
BEGIN
  -- No role change on this UPDATE: nothing to enforce.
  IF TG_OP = 'UPDATE' AND NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  -- Service role / internal contexts have no JWT (auth.uid() IS NULL): trusted.
  -- Covers migrations, the Supabase Auth Admin API, and SECURITY DEFINER
  -- onboarding (handle_new_user, approve_supplier_application runs as the admin).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- A brand-new self profile always starts as 'customer' (handle_new_user).
  IF TG_OP = 'INSERT' AND NEW.role = 'customer'::public.user_role THEN
    RETURN NEW;
  END IF;

  v_caller := public.current_user_role();

  -- Only staff at the admin tier may set or change any role.
  IF v_caller IS NULL
     OR v_caller NOT IN ('admin'::public.user_role, 'super_admin'::public.user_role) THEN
    RAISE EXCEPTION 'insufficient privilege to set or change role';
  END IF;

  -- Nobody changes their own role through this path (blocks self-elevation).
  IF TG_OP = 'UPDATE' AND NEW.id = auth.uid() THEN
    RAISE EXCEPTION 'cannot change your own role';
  END IF;

  -- Granting OR revoking the admin tier requires super_admin.
  IF (
        NEW.role IN ('admin'::public.user_role, 'super_admin'::public.user_role)
        OR (TG_OP = 'UPDATE' AND OLD.role IN ('admin'::public.user_role, 'super_admin'::public.user_role))
     )
     AND v_caller <> 'super_admin'::public.user_role THEN
    RAISE EXCEPTION 'only super_admin may grant or revoke admin roles';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_role_change_privilege ON public.profiles;
CREATE TRIGGER enforce_role_change_privilege
  BEFORE INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_role_change_privilege();

-- ---------------------------------------------------------------------------
-- SEC-17: pin profiles.supplier_id on owner self-update.
--   The applied 008 policy coupons_supplier_read_assigned keys supplier coupon
--   visibility off profiles.supplier_id, but "profiles: owner update" pinned only
--   `role` in its WITH CHECK. A vendor/content_uploader could self-assign any
--   supplier_id and then read that supplier's coupons (customer names, codes,
--   collect amounts) -> cross-supplier info disclosure. SEC-04 removes the write
--   vector; this closes the read vector until 027 moves authorization onto
--   supplier_members. Only approve_supplier_application / admins set supplier_id.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "profiles: owner update" ON public.profiles;
CREATE POLICY "profiles: owner update"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
    AND supplier_id IS NOT DISTINCT FROM (SELECT supplier_id FROM public.profiles WHERE id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- SEC-04: coupons_supplier_mark_used (008) was a column-unrestricted UPDATE, so
--   a supplier could set status='refunded', reset used_at or move expires_at.
--   Redemption goes only through redeem_coupon() (027, SECURITY DEFINER). Draft
--   027 drops this policy; 035 makes it true on the live DB now. Guarded.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.coupon_codes') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS coupons_supplier_mark_used ON public.coupon_codes';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- SEC-06: stale FOR ALL policies from 005/012 survive alongside the newer,
--   narrower per-command policies from 012/014. Permissive policies OR together,
--   so the effective write scope is the union. Drop the stale ALL policies; the
--   newer policies (which grant admins write via has_role/is_admin) remain
--   authoritative. Also drop the dead 014 policy that joins the wrong keyspace.
--   product_images had only the single ALL policy (no newer replacement), so it
--   is recreated as explicit per-command staff policies instead of dropped, to
--   preserve admin image management.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS products_admin_write   ON public.products;
DROP POLICY IF EXISTS variants_admin_write   ON public.product_variants;
DROP POLICY IF EXISTS categories_admin_write ON public.categories;
DROP POLICY IF EXISTS "vendors: owner manage" ON public.vendors;
DROP POLICY IF EXISTS "products: vendor read own" ON public.products;

-- product_images: replace the single is_admin() ALL policy with explicit
-- per-command staff policies (content_uploader tier includes admins).
DROP POLICY IF EXISTS images_admin_write ON public.product_images;

DROP POLICY IF EXISTS "product_images: staff insert" ON public.product_images;
CREATE POLICY "product_images: staff insert"
  ON public.product_images FOR INSERT TO authenticated
  WITH CHECK (public.has_role('content_uploader'));

DROP POLICY IF EXISTS "product_images: staff update" ON public.product_images;
CREATE POLICY "product_images: staff update"
  ON public.product_images FOR UPDATE TO authenticated
  USING (public.has_role('content_uploader'))
  WITH CHECK (public.has_role('content_uploader'));

DROP POLICY IF EXISTS "product_images: staff delete" ON public.product_images;
CREATE POLICY "product_images: staff delete"
  ON public.product_images FOR DELETE TO authenticated
  USING (public.has_role('content_uploader'));

-- ---------------------------------------------------------------------------
-- SEC-09: the 001 "carts: owner all" WITH CHECK allowed profile_id IS NULL for
--   anyone, so an anon caller could write null-owner cart rows and the
--   session_id branch was unvalidated. Restrict Data-API cart writes to the
--   authenticated owner (or admin); guest carts are written server-side with the
--   service role (see mergeGuestCart / fn_merge_guest_cart).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "carts: owner all" ON public.carts;
CREATE POLICY "carts: owner all"
  ON public.carts FOR ALL TO authenticated
  USING (profile_id = auth.uid() OR public.is_admin())
  WITH CHECK (profile_id = auth.uid() OR public.is_admin());

-- ---------------------------------------------------------------------------
-- SEC-11: a supplier owner's self-service INSERT/UPDATE on supplier_members
--   could add any user_id as an 'owner' (account takeover / peer escalation).
--   A trigger caps self-service membership to 'manager'/'scanner'; creating or
--   elevating an 'owner' requires an admin (or a service-role/definer context,
--   which is how approve_supplier_application seeds the first owner). Guarded on
--   table existence (027).
-- ---------------------------------------------------------------------------

DO $do$
BEGIN
  IF to_regclass('public.supplier_members') IS NOT NULL THEN
    EXECUTE $x$
      CREATE OR REPLACE FUNCTION public.enforce_supplier_member_role()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
      BEGIN
        -- Service role / definer onboarding (auth.uid() IS NULL) is trusted.
        IF auth.uid() IS NULL THEN
          RETURN NEW;
        END IF;
        -- Admins may set any member_role.
        IF public.is_admin() THEN
          RETURN NEW;
        END IF;
        -- Everyone else (a supplier owner acting on their own team) may only
        -- create or keep managers/scanners, never owners.
        IF NEW.member_role = 'owner'::public.supplier_member_role THEN
          RAISE EXCEPTION 'only an admin may create or elevate a supplier owner';
        END IF;
        RETURN NEW;
      END $fn$;
    $x$;
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_supplier_member_role ON public.supplier_members';
    EXECUTE 'CREATE TRIGGER enforce_supplier_member_role
             BEFORE INSERT OR UPDATE OF member_role ON public.supplier_members
             FOR EACH ROW EXECUTE FUNCTION public.enforce_supplier_member_role()';
  END IF;
END $do$;

-- ---------------------------------------------------------------------------
-- SEC-05: check_user_rate_limit(p_user_id, ...) (019) trusts a caller-supplied
--   user_id, so an authenticated caller can pollute or bypass another user's
--   bucket. Add check_my_rate_limit() which keys on auth.uid() internally and
--   fails closed for anon, then revoke the raw function from authenticated
--   (kept for service_role, which legitimately acts for a resolved user).
-- ---------------------------------------------------------------------------

DO $do$
BEGIN
  IF to_regclass('public.user_rate_limits') IS NOT NULL THEN
    EXECUTE $x$
      CREATE OR REPLACE FUNCTION public.check_my_rate_limit(
        p_action         text,
        p_limit          integer DEFAULT 100,
        p_window_seconds integer DEFAULT 3600
      )
      RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
      DECLARE
        v_uid   uuid := auth.uid();
        v_count integer;
      BEGIN
        IF v_uid IS NULL THEN
          RETURN false;  -- fail closed: no anon rate-limited actions
        END IF;
        INSERT INTO public.user_rate_limits (user_id, action) VALUES (v_uid, p_action);
        SELECT count(*) INTO v_count
        FROM public.user_rate_limits
        WHERE user_id = v_uid
          AND action = p_action
          AND created_at > now() - (p_window_seconds || ' seconds')::interval;
        RETURN v_count <= p_limit;
      END $fn$;
    $x$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.check_my_rate_limit(text, integer, integer) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.check_my_rate_limit(text, integer, integer) TO authenticated, service_role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'check_user_rate_limit'
  ) THEN
    -- redeem_coupon (027) calls this as its definer-owner, not as `authenticated`,
    -- so revoking from authenticated does not break the internal callers.
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.check_user_rate_limit(uuid, text, integer, integer) FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.check_user_rate_limit(uuid, text, integer, integer) TO service_role';
  END IF;
END $do$;

-- ---------------------------------------------------------------------------
-- SEC-07: cleanup_rate_limits() / cleanup_user_rate_limits() are executable by
--   PUBLIC, so any caller can purge the limiter tables (defeating rate limits).
--   Restrict to service_role (run via cron). Guarded on existence.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'cleanup_rate_limits') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.cleanup_rate_limits() FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits() TO service_role';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'cleanup_user_rate_limits') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.cleanup_user_rate_limits() FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.cleanup_user_rate_limits() TO service_role';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- SEC-12: the generic audit trigger serializes full bank account numbers into
--   audit_log.changes. Attach a dedicated redacting trigger on
--   supplier_bank_accounts that strips account_number and holder_id_number, and
--   detach the generic one. Guarded on table existence (027).
-- ---------------------------------------------------------------------------

DO $do$
BEGIN
  IF to_regclass('public.supplier_bank_accounts') IS NOT NULL THEN
    EXECUTE $x$
      CREATE OR REPLACE FUNCTION public.audit_supplier_bank_accounts_fn()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
      DECLARE
        v_old jsonb;
        v_new jsonb;
      BEGIN
        IF TG_OP <> 'INSERT' THEN
          v_old := to_jsonb(OLD) - 'account_number' - 'holder_id_number';
        END IF;
        IF TG_OP <> 'DELETE' THEN
          v_new := to_jsonb(NEW) - 'account_number' - 'holder_id_number';
        END IF;
        INSERT INTO public.audit_log
          (actor_id, actor_role, action, entity_type, entity_id, changes)
        VALUES (
          auth.uid(),
          public.current_user_role()::text,
          (CASE TG_OP
             WHEN 'INSERT' THEN 'created'
             WHEN 'UPDATE' THEN 'updated'
             WHEN 'DELETE' THEN 'deleted'
           END)::public.audit_action,
          'supplier_bank_accounts',
          CASE TG_OP WHEN 'DELETE' THEN OLD.id ELSE NEW.id END,
          jsonb_strip_nulls(jsonb_build_object('old', v_old, 'new', v_new))
        );
        RETURN NULL;
      END $fn$;
    $x$;
    EXECUTE 'DROP TRIGGER IF EXISTS audit_supplier_bank_accounts ON public.supplier_bank_accounts';
    EXECUTE 'CREATE TRIGGER audit_supplier_bank_accounts
             AFTER INSERT OR UPDATE OR DELETE ON public.supplier_bank_accounts
             FOR EACH ROW EXECUTE FUNCTION public.audit_supplier_bank_accounts_fn()';
  END IF;
END $do$;

-- ---------------------------------------------------------------------------
-- SEC-13 / SEC-07: security_events is the single cross-cutting security signal
--   table (auth events, rate-limit trips, webhook signature failures, redemption
--   fraud, admin-sensitive actions). Append-only: admin reads, no client writes;
--   fn_log_security_event (SECURITY DEFINER) is the only writer.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.security_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type  text        NOT NULL,
  severity    text        NOT NULL DEFAULT 'info'
                CHECK (severity IN ('info', 'warning', 'critical')),
  entity_type text,
  entity_id   uuid,
  ip          inet,
  user_agent  text,
  metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_events_type_idx
  ON public.security_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_actor_idx
  ON public.security_events (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_severity_idx
  ON public.security_events (severity, created_at DESC) WHERE severity <> 'info';

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "security_events: admin select" ON public.security_events;
CREATE POLICY "security_events: admin select"
  ON public.security_events FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "security_events: no insert" ON public.security_events;
CREATE POLICY "security_events: no insert"
  ON public.security_events FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "security_events: no update" ON public.security_events;
CREATE POLICY "security_events: no update"
  ON public.security_events FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS "security_events: no delete" ON public.security_events;
CREATE POLICY "security_events: no delete"
  ON public.security_events FOR DELETE TO authenticated USING (false);

CREATE OR REPLACE FUNCTION public.fn_log_security_event(
  p_event_type  text,
  p_severity    text  DEFAULT 'info',
  p_entity_type text  DEFAULT NULL,
  p_entity_id   uuid  DEFAULT NULL,
  p_ip          inet  DEFAULT NULL,
  p_user_agent  text  DEFAULT NULL,
  p_metadata    jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_severity NOT IN ('info', 'warning', 'critical') THEN
    p_severity := 'info';
  END IF;
  INSERT INTO public.security_events
    (actor_id, event_type, severity, entity_type, entity_id, ip, user_agent, metadata)
  VALUES
    (auth.uid(), p_event_type, p_severity, p_entity_type, p_entity_id,
     p_ip, p_user_agent, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.fn_log_security_event(text, text, text, uuid, inet, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_log_security_event(text, text, text, uuid, inet, text, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- SEC-14: guard future seed data against running in production. Seed migrations
--   (e.g. the demo vendors in 023, or any future demo seed) should call
--   `PERFORM public.assert_seeds_allowed();` before inserting. Production sets
--   the GUC app.ke_env='production' (e.g. via ALTER DATABASE ... SET) so the
--   assertion aborts the seed.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_seeds_allowed()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(current_setting('app.ke_env', true), '') = 'production' THEN
    RAISE EXCEPTION 'seed/demo data is not allowed in production (app.ke_env=production)';
  END IF;
END $$;

-- ============================================================================
-- End of migration 035. Re-run after applying drafts 026-034 to activate the
-- guarded fixes (SEC-01/10/11/12 and the check_my_rate_limit wrapper). Every
-- statement is idempotent.
-- ============================================================================
