-- ============================================================================
-- 045_restore_carts.sql
-- The remote dev DB is missing public.carts (defined in 001, which stops
-- early on live DBs). This restores the exact 001 definition idempotently:
-- single jsonb-items cart table for guests (session_id) and users
-- (profile_id), used by src/server/actions/cart.ts.
-- ============================================================================

-- Defensive: 001 may not have completed on this DB (skill rule for 005+).
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.carts (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid        REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id text,
  items      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz NOT NULL DEFAULT now() + INTERVAL '30 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT carts_owner_check CHECK (profile_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS carts_profile_id_idx ON public.carts (profile_id);
CREATE INDEX IF NOT EXISTS carts_session_id_idx ON public.carts (session_id);
CREATE INDEX IF NOT EXISTS carts_expires_at_idx ON public.carts (expires_at);

DROP TRIGGER IF EXISTS carts_set_updated_at ON public.carts;
CREATE TRIGGER carts_set_updated_at
  BEFORE UPDATE ON public.carts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;

-- 001 policy, verbatim. Guest carts are handled by the service role in
-- server actions; the session_id cookie clause matches 001.
DROP POLICY IF EXISTS "carts: owner all" ON public.carts;
CREATE POLICY "carts: owner all"
  ON public.carts FOR ALL
  USING (
    profile_id = auth.uid()
    OR session_id = current_setting('request.cookies', true)::json->>'session_id'
    OR public.is_admin()
  )
  WITH CHECK (
    profile_id = auth.uid()
    OR profile_id IS NULL
    OR public.is_admin()
  );
