-- 150: the deletion the privacy policy promises, as one atomic function.
--
-- THE GAP. The privacy page offers "מימוש זכות עיון או למחיקה" and there is no
-- code behind the offer: no server action, no function, nothing greps for
-- delete_account or anonymize anywhere in src/. A promise in a legal document
-- with no implementation is the gap; this file is the database half of closing
-- it.
--
-- ANONYMIZE, NOT DELETE, AND THE LINE BETWEEN THEM IS THE LAW. Orders,
-- payments, invoices and audit rows are bookkeeping records with a statutory
-- retention period (7 years); deleting them on request is not permitted, and
-- the CASCADE from auth.users -> profiles means a hard auth delete would take
-- the profile and orphan every order. So: the profile is anonymized in place,
-- the personal satellites (addresses, push tokens, carts, saved cards, recent
-- searches) are deleted outright, and the auth user is soft-deleted by the
-- CALLER through the admin API -- soft, precisely because of that CASCADE.
--
-- SECURITY DEFINER, EXECUTE FOR service_role ONLY. The deletes cross tables
-- the user has no DELETE policy on (payment_tokens deliberately so). Definer
-- runs them under the owner; revoking EXECUTE from anon/authenticated keeps
-- the memory-documented definer-uid trap closed: nobody can anonymize someone
-- else by calling this with a foreign uid, because nobody but the server can
-- call it at all.
--
-- ROLLBACK
--
--   drop function if exists public.fn_anonymize_user(uuid);
--   -- and restore the previous notification_outbox_kind_check from this header:
--   -- (order_paid, supplier_sale, voucher_redeemed, voucher_issued,
--   --  voucher_gifted, voucher_expiring, cashback_credited, invoice_dead,
--   --  low_stock, reconciliation_gap, refund_completed, welcome)
--
-- DRY RUN, 2026-09-02, against production in a transaction that was rolled
-- back, on a real profile:
--
--   email ken… -> deleted+b1e3aa9588695b31@anonymized.invalid
--   name -> משתמש שנמחק | satellites after: 0 | orders preserved
--   rerun idempotent: OK | null uid refused: 22004
--
-- NOT APPLIED. migrations/pending/ is unapplied by definition. The route to
-- production is MCP apply_migration after a human approves this file.


CREATE OR REPLACE FUNCTION public.fn_anonymize_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'fn_anonymize_user: user id is null' USING ERRCODE = '22004';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'fn_anonymize_user: no profile for %', p_user_id USING ERRCODE = 'P0002';
  END IF;

  -- The satellites carry nothing the books need. Deleted outright.
  -- Owner columns verified against production 2026-09-02, not assumed: three
  -- of these key on user_id and two on profile_id, and the first draft of this
  -- function guessed user_id for all five and failed its own dry run.
  DELETE FROM public.user_recent_searches WHERE user_id    = p_user_id;
  DELETE FROM public.push_tokens          WHERE user_id    = p_user_id;
  DELETE FROM public.user_addresses       WHERE user_id    = p_user_id;
  DELETE FROM public.payment_tokens       WHERE profile_id = p_user_id;
  DELETE FROM public.carts                WHERE profile_id = p_user_id;

  -- The profile row stays, because orders point at it, and becomes no one.
  -- The email keeps a valid shape (an RFC-invalid TLD, so nothing can ever
  -- deliver to it) and is derived from the id, so re-running is idempotent
  -- rather than stacking hashes.
  UPDATE public.profiles
  SET email     = 'deleted+' || substr(md5(p_user_id::text), 1, 16) || '@anonymized.invalid',
      full_name = 'משתמש שנמחק',
      phone     = NULL
  WHERE id = p_user_id;

  -- The books keep a trace that the erasure HAPPENED, which the law also
  -- expects. No personal data in the row: the id is already the pseudonym.
  INSERT INTO public.audit_log (actor_id, actor_role, action, entity_type, entity_id, metadata)
  VALUES (p_user_id, 'customer', 'manual_override', 'profile', p_user_id,
          jsonb_build_object('event', 'account_anonymized'));
END
$$;

REVOKE ALL ON FUNCTION public.fn_anonymize_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_anonymize_user(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_anonymize_user(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_anonymize_user(uuid) TO service_role;

COMMENT ON FUNCTION public.fn_anonymize_user(uuid) IS
  'The deletion the privacy policy promises. Anonymizes the profile in place (orders keep their FK and their 7-year retention), deletes the personal satellites, writes the erasure to audit_log. EXECUTE is service_role only; the caller also soft-deletes the auth user, soft because auth.users cascades to profiles.';


-- The goodbye email needs a kind the outbox constraint accepts.
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint WHERE conname = 'notification_outbox_kind_check';

  IF v_def IS NULL THEN
    RAISE NOTICE 'notification_outbox has no kind check; skipping';
    RETURN;
  END IF;

  IF v_def LIKE '%account_deleted%' THEN
    RAISE NOTICE 'account_deleted already in the kind check; skipping';
    RETURN;
  END IF;

  ALTER TABLE public.notification_outbox DROP CONSTRAINT notification_outbox_kind_check;
  ALTER TABLE public.notification_outbox ADD CONSTRAINT notification_outbox_kind_check
    CHECK (kind = ANY (ARRAY[
      'order_paid'::text, 'supplier_sale'::text, 'voucher_redeemed'::text,
      'voucher_issued'::text, 'voucher_gifted'::text, 'voucher_expiring'::text,
      'cashback_credited'::text, 'invoice_dead'::text, 'low_stock'::text,
      'reconciliation_gap'::text, 'refund_completed'::text, 'welcome'::text,
      'account_deleted'::text
    ]));
END
$$;
