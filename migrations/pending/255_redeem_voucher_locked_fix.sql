-- 255_redeem_voucher_locked_fix.sql
--
-- S15 (2026-11-04): partner redeem. Measured on production before writing.
--
-- 1. vouchers_redemption_events AND redeem_voucher_locked WERE LIVE AND NEVER
--    IN THE REPO.
--
--    Production has the table (0 rows, RLS on, no policy, service_role grants
--    only) and a SECURITY DEFINER wrapper redeem_voucher_locked(p_code,
--    p_input_kind, p_scan_method, p_idempotency_key, p_ip inet, p_user_agent)
--    that takes a per-code advisory lock, calls redeem_voucher, and writes one
--    event row per call. No file here creates either. Section 1 writes the
--    table down idempotently, as pg_get_* returned it.
--
-- 2. THE WRAPPER HAS NEVER RUN ONCE.
--
--    It passes p_ip (inet) to redeem_voucher(..., p_ip text, ...). inet -> text
--    is an ASSIGNMENT cast (pg_cast.castcontext = 'a'), which function-call
--    resolution does not apply, so every call fails:
--
--      42883: function public.redeem_voucher(text, text, text, inet, text)
--             does not exist
--
--    Measured 04.11 in a rolled-back transaction as a real supplier member.
--    That is why the events table is empty. Section 2 passes p_ip::text, and
--    also normalises the code the way redeem_voucher does before taking the
--    lock and reading the row, so `abcde-fghjk` and `ABCDEFGHJK` share one lock
--    and one voucher_id in the event.
--
-- Grants: CREATE OR REPLACE keeps the ACL, which is
-- {postgres, authenticated, service_role} = EXECUTE (anon has none). They are
-- restated below so a from-zero replay ends in the same place.
--
-- Rollback: re-run the previous body (it is the one in section 2 with
-- `p_ip` instead of `p_ip::text` and `p_code` instead of `v_code`). That
-- restores a function that cannot be called; nothing depends on it before S15.

-- ------------------------------------------------- 1. the event table, as-is

CREATE TABLE IF NOT EXISTS public.vouchers_redemption_events (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  voucher_id    uuid        REFERENCES public.vouchers(id),
  supplier_id   uuid        REFERENCES public.suppliers(id),
  actor_user_id uuid,
  code          text        NOT NULL,
  input_kind    text        NOT NULL
    CONSTRAINT vouchers_redemption_events_input_kind_check
    CHECK (input_kind = ANY (ARRAY['qr'::text, 'code'::text, 'pin'::text])),
  scan_method   text,
  outcome       text        NOT NULL,
  replayed      boolean     NOT NULL DEFAULT false,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vouchers_redemption_events_voucher_idx
  ON public.vouchers_redemption_events USING btree (voucher_id, created_at DESC);

ALTER TABLE public.vouchers_redemption_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vouchers_redemption_events FROM anon, authenticated;
GRANT ALL ON public.vouchers_redemption_events TO service_role;

-- ------------------------------------------------------ 2. the wrapper, fixed

CREATE OR REPLACE FUNCTION public.redeem_voucher_locked(
  p_code text,
  p_input_kind text,
  p_scan_method text,
  p_idempotency_key text,
  p_ip inet,
  p_user_agent text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  v_result jsonb;
  v_voucher public.vouchers%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('voucher-redeem:' || v_code, 0));

  v_result := public.redeem_voucher(v_code, p_scan_method, p_idempotency_key, p_ip::text, p_user_agent);

  select * into v_voucher from public.vouchers where code = v_code;
  insert into public.vouchers_redemption_events
    (voucher_id, supplier_id, actor_user_id, code, input_kind, scan_method, outcome, replayed, ip_address, user_agent)
  values
    (v_voucher.id, v_voucher.supplier_id, auth.uid(), v_code, p_input_kind, p_scan_method,
     coalesce(v_result->>'outcome', 'unknown'), coalesce((v_result->>'replayed')::boolean, false),
     p_ip, p_user_agent);
  return v_result;
end $function$;

REVOKE ALL ON FUNCTION public.redeem_voucher_locked(text, text, text, text, inet, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_voucher_locked(text, text, text, text, inet, text)
  TO authenticated, service_role;
