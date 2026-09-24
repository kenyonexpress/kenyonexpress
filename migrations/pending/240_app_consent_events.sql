-- 240_app_consent_events.sql
--
-- OWNER DECISION, 2026-09-23, Login: an "everything in the app" switch with
-- RECORDED consent.
--
-- APPEND-ONLY EVIDENCE, NOT A SETTING. The switch state is derived from the
-- newest row; each change adds a row with the wording version the customer was
-- shown, the source screen, the IP and the user agent. Nothing updates or
-- deletes a row, for anybody: there is no UPDATE/DELETE policy and no grant.
--
-- A NEW TABLE, NOT `consent_events` (031). Measured 2026-09-23 against
-- production: `consent_events` does not exist there (031 is in the file lineage
-- but not in the hosted one) and its CHECKs name email/sms/whatsapp only. This
-- table is scoped to the in-app switch and does not depend on it.
--
-- THE FUNCTION TAKES NO USER ID. `record_app_consent` reads `auth.uid()`; a
-- SECURITY DEFINER function that accepts the uid from its caller lets any
-- authenticated user write consent as somebody else (the trap that bit
-- `definer-fn-caller-controlled-uid`). It is granted to `authenticated` only.
--
-- IDEMPOTENT. Nothing here alters an existing object.

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_consent_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope           text        NOT NULL CHECK (scope IN ('everything_in_app')),
  action          text        NOT NULL CHECK (action IN ('opt_in', 'opt_out')),
  source          text        NOT NULL CHECK (source IN ('account_page', 'post_purchase')),
  wording_version text        NOT NULL,
  ip              inet,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_consent_events IS
  'Append-only record of the customer''s "everything in the app" consent. State = newest row. Written only through record_app_consent().';

CREATE INDEX IF NOT EXISTS app_consent_events_user_idx
  ON public.app_consent_events (user_id, created_at DESC);

ALTER TABLE public.app_consent_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_consent_events: owner select" ON public.app_consent_events;
CREATE POLICY "app_consent_events: owner select"
  ON public.app_consent_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- REVOKE first, then grant exactly what the policy needs: a REVOKE after the
-- policy exists silently disables it, so the order here is the whole point.
REVOKE ALL ON TABLE public.app_consent_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.app_consent_events TO authenticated;

CREATE OR REPLACE FUNCTION public.record_app_consent(
  p_action          text,
  p_source          text,
  p_wording_version text,
  p_ip              inet DEFAULT NULL,
  p_user_agent      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  INSERT INTO public.app_consent_events
    (user_id, scope, action, source, wording_version, ip, user_agent)
  VALUES
    (v_uid, 'everything_in_app', p_action, p_source, p_wording_version, p_ip,
     left(p_user_agent, 400))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_app_consent(text, text, text, inet, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_app_consent(text, text, text, inet, text) TO authenticated;

COMMIT;

-- VERIFY (after applying):
--   select to_regclass('public.app_consent_events');                         -- not null
--   select has_function_privilege('anon', 'public.record_app_consent(text,text,text,inet,text)', 'execute');  -- false
--   select has_function_privilege('authenticated', 'public.record_app_consent(text,text,text,inet,text)', 'execute'); -- true
--
-- REVERSAL: DROP FUNCTION public.record_app_consent(text, text, text, inet, text);
--           DROP TABLE public.app_consent_events;   -- nothing references either
