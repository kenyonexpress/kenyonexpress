-- 252_affiliate_clicks_payouts.sql
--
-- W08 (2026-10-05): the affiliate programme's two missing pieces, measured
-- against the tree before a line was written.
--
-- WHAT ALREADY EXISTS AND IS NOT CHANGED (Q16, 25.09; 244 pending):
--
--   profiles.referral_code (098)   the one code a customer holds; the
--                                  affiliate code IS the referral code.
--   ke_ref cookie (src/proxy.ts)   30 days, last touch, written on any
--                                  `?ref=<code>` landing. Attribution.
--   orders.affiliate_code (010)    the snapshot checkout writes from the
--                                  cookie (server/affiliates/attribution.ts).
--   affiliate_campaigns (244)      commission per campaign in basis points.
--   affiliate_conversions (244)    one row per attributed paid order.
--   fn_wallet_transfer (026)       the ledger write, integer agorot in the
--                                  application and shekels only at the RPC
--                                  boundary (server/affiliates/pay.ts).
--   affiliates.total_clicks (010)  a counter NOTHING HAS EVER WRITTEN. The
--                                  admin console has shown "0 / n" since 010.
--
-- WHAT THIS FILE ADDS, and only this:
--
--   1. `affiliate_clicks`: one row per landing that set the `ke_ref` cookie
--      for an affiliate's code. Written by the proxy on the service key after
--      the response is sent (`event.waitUntil`), so a click costs the visitor
--      nothing. A BEFORE INSERT trigger resolves the code to the affiliate row
--      and DROPS the insert (RETURN NULL) when the code belongs to nobody in
--      the programme: a friend-referral link is not an affiliate click and
--      leaves no row. The same trigger bumps `affiliates.total_clicks`, which
--      is what the admin console and the account dashboard display, so the
--      counter and the rows cannot disagree.
--
--      The trigger function is SECURITY INVOKER on purpose. The only inserter
--      is the service role, which may update `affiliates` anyway; a DEFINER
--      here would be a privilege nobody needs. EXECUTE is revoked from the
--      client roles so the function cannot be called by hand either.
--
--      "A click" is a cookie write, not a page view: the proxy records only
--      when the cookie was absent or held a different code, so one browser
--      re-opening the same link inside the 30-day window is one click.
--      Fingerprints are the hashes `referral_signals` already uses (098),
--      namespaced and never raw.
--
--   2. `affiliate_payout_requests`: the affiliate asks for their paid
--      commissions in cash, and the row is the request Ofir reads on
--      /admin/affiliates?tab=payouts. The amount is fixed by the server at
--      the moment of the request: paid commissions minus what earlier
--      requests already cover, capped by the wallet balance (the commission
--      is wallet credit the affiliate may have spent in the shop). ONE OPEN
--      REQUEST PER AFFILIATE, enforced by a partial unique index: a second
--      press while one waits gets 23505 and is told so.
--
--      Marking a request paid is the admin's action and it DEBITS THE WALLET
--      through `fn_wallet_transfer` (credit back to `platform:cashback_reserve`,
--      reason `affiliate_payout`, idempotency `affiliate_payout:<request id>`)
--      before the status flips, so the same shekel cannot be spent in the shop
--      and paid out in cash. The cash itself moves outside this system; the
--      row records that it did. No payment provider is involved.
--
-- MONEY IS INTEGER AGOROT. `amount_agorot bigint` with CHECK > 0. No numeric
-- shekel column anywhere in this file.
--
-- THE LEDGER REASON. `wallet_entries.reason` is `text` on the hosted database
-- (src/types/database.ts, `fn_wallet_transfer.Args.p_reason: string`; the
-- live ledger already carries `order_cashback`, which the 026 enum never
-- listed). No enum is altered here; `affiliate_payout` is labelled in
-- `server/queries/account.ts` next to `affiliate_commission`.
--
-- WHO CAN READ WHAT
--
--   affiliate_clicks           the affiliate reads their own rows (through
--                              affiliates.user_id = auth.uid()); admins all.
--   affiliate_payout_requests  the same two policies. The account page shows
--                              the affiliate their own requests and statuses.
--
-- WHO CAN WRITE: nobody but service_role. No INSERT/UPDATE/DELETE grant to any
-- client role, no write policy. Clicks are written by the proxy, requests by
-- `server/actions/affiliates.ts` after the session read, decisions by
-- `server/actions/admin/affiliate-payouts.ts` after requireSection
-- ('affiliates','write') + writeAuditLog.
--
-- ORDERING: after 010 and 098 (applied). Independent of 244 and of every other
-- pending file: neither table references the 244 tables. Apply it whenever.
--
-- THE CODE RUNS WITHOUT THIS FILE. Every reader and writer catches 42P01: the
-- proxy logs `affiliates.clicks_table_missing` once and drops the click, the
-- dashboard shows the 010 counter (0) and "payouts not open yet", the request
-- button says so instead of inserting, and the admin tab shows this file's
-- name.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS public.affiliate_payout_requests;
--   DROP TABLE IF EXISTS public.affiliate_clicks;
--   DROP FUNCTION IF EXISTS public.fn_affiliate_click_before_insert();
-- Wallet entries already written stay, as ledger entries must; the counter on
-- `affiliates.total_clicks` keeps whatever it reached.
--
-- Rehearse with BEGIN ... ROLLBACK per docs/RUNBOOK.md.
-- NOT APPLIED. `migrations/pending/` is unapplied by definition.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. affiliate_clicks: one row per cookie write for an affiliate's code
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Resolved by the trigger from `code`; the proxy never looks it up.
  affiliate_id        uuid        REFERENCES public.affiliates(id) ON DELETE CASCADE,
  code                text        NOT NULL,
  -- The path the share link pointed at, so an affiliate's product links and
  -- their homepage link can be told apart later. No query string.
  landing_path        text        NOT NULL DEFAULT '/',
  -- referralFingerprint('ip', ...) and ('device', ...): hashed, never raw.
  ip_fingerprint      text,
  device_fingerprint  text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.affiliate_clicks IS
  'One row per ke_ref cookie write for an affiliate code, written by the proxy. See 252 and src/server/affiliates/clicks.ts.';

ALTER TABLE public.affiliate_clicks DROP CONSTRAINT IF EXISTS affiliate_clicks_code_shape;
ALTER TABLE public.affiliate_clicks ADD CONSTRAINT affiliate_clicks_code_shape
  CHECK (code ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$');

ALTER TABLE public.affiliate_clicks DROP CONSTRAINT IF EXISTS affiliate_clicks_path_shape;
ALTER TABLE public.affiliate_clicks ADD CONSTRAINT affiliate_clicks_path_shape
  CHECK (landing_path ~ '^/' AND length(landing_path) <= 512 AND position('?' in landing_path) = 0);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_affiliate_created
  ON public.affiliate_clicks (affiliate_id, created_at DESC);

-- The resolver and the counter, one function. BEFORE INSERT so a code that
-- names no affiliate leaves no row at all (RETURN NULL skips the insert).
CREATE OR REPLACE FUNCTION public.fn_affiliate_click_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_affiliate_id uuid;
BEGIN
  SELECT a.id INTO v_affiliate_id
    FROM public.affiliates a
   WHERE a.affiliate_code = NEW.code
     AND a.deleted_at IS NULL
     AND a.status IN ('pending_review', 'approved')
   LIMIT 1;
  IF v_affiliate_id IS NULL THEN
    RETURN NULL;
  END IF;
  NEW.affiliate_id := v_affiliate_id;
  UPDATE public.affiliates
     SET total_clicks = COALESCE(total_clicks, 0) + 1
   WHERE id = v_affiliate_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_affiliate_click_before_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS affiliate_clicks_before_insert ON public.affiliate_clicks;
CREATE TRIGGER affiliate_clicks_before_insert
  BEFORE INSERT ON public.affiliate_clicks
  FOR EACH ROW EXECUTE FUNCTION public.fn_affiliate_click_before_insert();

ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS affiliate_clicks_own_read ON public.affiliate_clicks;
CREATE POLICY affiliate_clicks_own_read
  ON public.affiliate_clicks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.affiliates a
       WHERE a.id = affiliate_clicks.affiliate_id
         AND a.user_id = auth.uid()
         AND a.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS affiliate_clicks_admin_read ON public.affiliate_clicks;
CREATE POLICY affiliate_clicks_admin_read
  ON public.affiliate_clicks FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE ALL ON public.affiliate_clicks FROM PUBLIC, anon;
GRANT SELECT ON public.affiliate_clicks TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. affiliate_payout_requests: the affiliate asks, Ofir decides
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.affiliate_payout_requests (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id        uuid        NOT NULL REFERENCES public.affiliates(id) ON DELETE RESTRICT,
  user_id             uuid        NOT NULL REFERENCES auth.users(id)        ON DELETE RESTRICT,
  -- Fixed by the server at request time, integer agorot.
  amount_agorot       bigint      NOT NULL,
  status              text        NOT NULL DEFAULT 'pending',
  -- The affiliate's free line to the operator (how to pay, which account).
  note                text,
  -- The wallet entry of the debit, once paid. Idempotency `affiliate_payout:<id>`.
  wallet_entry_id     uuid,
  decided_by          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at          timestamptz,
  decision_note       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.affiliate_payout_requests IS
  'An affiliate asking for paid commissions in cash; the operator marks it paid (wallet debited first) or rejects it. See 252 and src/server/actions/affiliates.ts.';

ALTER TABLE public.affiliate_payout_requests DROP CONSTRAINT IF EXISTS affiliate_payout_requests_amount_positive;
ALTER TABLE public.affiliate_payout_requests ADD CONSTRAINT affiliate_payout_requests_amount_positive
  CHECK (amount_agorot > 0);

ALTER TABLE public.affiliate_payout_requests DROP CONSTRAINT IF EXISTS affiliate_payout_requests_status_known;
ALTER TABLE public.affiliate_payout_requests ADD CONSTRAINT affiliate_payout_requests_status_known
  CHECK (status IN ('pending', 'paid', 'rejected'));

ALTER TABLE public.affiliate_payout_requests DROP CONSTRAINT IF EXISTS affiliate_payout_requests_note_shape;
ALTER TABLE public.affiliate_payout_requests ADD CONSTRAINT affiliate_payout_requests_note_shape
  CHECK (note IS NULL OR length(note) <= 300);

ALTER TABLE public.affiliate_payout_requests DROP CONSTRAINT IF EXISTS affiliate_payout_requests_decided_complete;
ALTER TABLE public.affiliate_payout_requests ADD CONSTRAINT affiliate_payout_requests_decided_complete
  CHECK ((status = 'pending') = (decided_at IS NULL));

-- One open request per affiliate, ever at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_affiliate_payout_requests_one_open
  ON public.affiliate_payout_requests (affiliate_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_affiliate_payout_requests_status_created
  ON public.affiliate_payout_requests (status, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.affiliate_payout_requests;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.affiliate_payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.affiliate_payout_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS affiliate_payout_requests_own_read ON public.affiliate_payout_requests;
CREATE POLICY affiliate_payout_requests_own_read
  ON public.affiliate_payout_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS affiliate_payout_requests_admin_read ON public.affiliate_payout_requests;
CREATE POLICY affiliate_payout_requests_admin_read
  ON public.affiliate_payout_requests FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE ALL ON public.affiliate_payout_requests FROM PUBLIC, anon;
GRANT SELECT ON public.affiliate_payout_requests TO authenticated;

COMMIT;

-- What to check after applying:
--   SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE tablename IN ('affiliate_clicks', 'affiliate_payout_requests');
--   -- expect four SELECT policies and no other cmd
--   SELECT table_name, grantee, privilege_type
--     FROM information_schema.role_table_grants
--    WHERE table_name IN ('affiliate_clicks', 'affiliate_payout_requests')
--      AND grantee IN ('anon', 'authenticated');
--   -- expect only (authenticated, SELECT) rows, nothing for anon
--   SELECT grantee, privilege_type FROM information_schema.routine_privileges
--    WHERE routine_name = 'fn_affiliate_click_before_insert';
--   -- expect no anon / authenticated row
--   Then open any product page with `?ref=<an approved affiliate's code>` in
--   a fresh browser: `SELECT count(*) FROM affiliate_clicks` grows by one and
--   `affiliates.total_clicks` with it.
