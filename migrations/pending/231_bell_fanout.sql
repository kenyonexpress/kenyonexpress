-- 231_bell_fanout.sql
--
-- The writer 198 never had: outbox rows fan out into the bell.
--
-- WHAT 198 BUILT AND WHAT IT LEFT OPEN
--
-- 198 (applied) created `public.notifications` -- the in-app bell's rows, RLS
-- select-own, `GRANT UPDATE (read_at)` and nothing else to authenticated,
-- REPLICA IDENTITY FULL, and membership in the `supabase_realtime`
-- publication. Measured on 2026-09-10: all of that is live and the table has
-- ZERO rows, because nothing anywhere writes to it. A bell over an
-- always-empty table is the "finished feature with no consumer" shape this
-- project keeps finding; this file is the consumer's other half.
--
-- WHY A TRIGGER ON `notification_outbox`, NOT APP CODE
--
-- Every notification the platform owes a customer already passes through one
-- INSERT: `notification_outbox`, written by DB triggers
-- (`tg_orders_notify_paid`, `tg_orders_notify_shipped`,
-- `tg_vouchers_notify_redeemed`) and by server code through
-- `fn_enqueue_notification`, which resolves `user_id` from `profiles` by
-- email and stamps it on the row. Fanning out at that INSERT means:
--
--   * one writer instead of a dozen call sites that can each forget;
--   * the bell row is created in the SAME transaction as the event, so the
--     realtime INSERT event fires the moment the event commits, not when a
--     cron drains the queue;
--   * the outbox's `ON CONFLICT (dedupe_key) DO NOTHING` is inherited for
--     free -- a replayed enqueue inserts no outbox row, so the trigger never
--     fires twice for one event.
--
-- A KIND WITHOUT COPY HERE GETS NO BELL ROW, AND THAT IS THE GATE -- the same
-- contract `src/lib/push/templates.ts` states for push. The outbox carries
-- operator alerts (`supplier_sale`, `invoice_dead`, `low_stock`,
-- `reconciliation_gap`) and `account_deleted` (whose subject no longer has an
-- account to see a bell in); none of those belong in a customer's bell, and a
-- future kind added to the outbox stays out of the bell until somebody writes
-- its Hebrew here. The ELSE branch below is that gate.
--
-- NOT SECURITY DEFINER, DELIBERATELY. The only roles that can INSERT into
-- `notification_outbox` are `service_role` and `postgres` (095 revoked
-- anon/authenticated), and both already hold INSERT on `notifications`. A
-- definer function would be one more member of the class the 2026-09 audits
-- kept finding uid-confused; an invoker function cannot be.
--
-- THE COPY IS HEBREW IN SQL AND THAT IS A TRADE. The email builders compose
-- their Hebrew in TypeScript where it is unit-testable; the bell's title has
-- to exist at trigger time to ride the realtime INSERT payload, so it is
-- composed here. The strings are short, payload-tolerant (every field is
-- optional, the body degrades to a generic sentence), and the whole body is
-- wrapped in the same WARNING-not-ERROR clause as every notify trigger since
-- 095: a bug in bell copy must never roll back a payment.

BEGIN;

-- Refuse to run against a database that is not the one this was written for.
DO $$
BEGIN
  IF to_regclass('public.notifications') IS NULL
     OR to_regclass('public.notification_outbox') IS NULL THEN
    RAISE EXCEPTION '198/095 are not applied here; 231 has nothing to fan into';
  END IF;
END $$;

-- ---------------------------------------------------------------- formatting
--
-- Agorot to a display string, in SQL, because the bell body is composed in
-- SQL. Integer arithmetic only, matching src/lib/money.ts's rule: the money
-- PATH is integer agorot, and only display divides. `₪25` when the fraction
-- is zero, `₪25.50` when it is not -- the same choice shekelsCompact() makes
-- for push titles, for the same reason: a notification is glanced at.

CREATE OR REPLACE FUNCTION public.fn_bell_agorot(p_payload jsonb, p_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN (p_payload ->> p_key) ~ '^[0-9]+$'
     AND length(p_payload ->> p_key) <= 15
    THEN '₪'
      || to_char(((p_payload ->> p_key)::bigint / 100), 'FM999,999,999,999')
      || CASE
           WHEN ((p_payload ->> p_key)::bigint % 100) = 0 THEN ''
           ELSE '.' || lpad((((p_payload ->> p_key)::bigint % 100))::text, 2, '0')
         END
    ELSE NULL
  END
$$;

REVOKE ALL ON FUNCTION public.fn_bell_agorot(jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_bell_agorot(jsonb, text) TO service_role;

-- ------------------------------------------------------------------ the fan

CREATE OR REPLACE FUNCTION public.tg_outbox_bell()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_title   text;
  v_body    text;
  v_href    text;
  -- The fields more than one kind reads, pulled once. NULL when absent or
  -- blank, so `'prefix ' || v_x` vanishes with the field.
  v_product text := nullif(btrim(coalesce(NEW.payload ->> 'product_name', '')), '');
  v_ref     text := nullif(btrim(coalesce(NEW.payload ->> 'order_ref', '')), '');
  v_name    text := nullif(btrim(coalesce(NEW.payload ->> 'full_name', '')), '');
  v_sender  text := nullif(btrim(coalesce(NEW.payload ->> 'sender_name', '')), '');
BEGIN
  -- No profile matched the recipient email: there is no account to ring.
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  CASE NEW.kind
    WHEN 'order_paid' THEN
      v_title := 'ההזמנה שלך התקבלה';
      -- nullif around array_to_string: over an empty array it returns '' and
      -- not NULL, so a bare coalesce never reaches the fallback and the bell
      -- row ships an empty body. Caught by the rolled-back probe, 2026-09-10.
      v_body  := coalesce(
        nullif(array_to_string(array_remove(ARRAY[
          'מספר הזמנה ' || v_ref,
          'סך הכל ' || public.fn_bell_agorot(NEW.payload, 'total_agorot')
        ], NULL), ', '), ''),
        'התשלום נקלט בהצלחה');
      v_href  := '/account/orders';

    WHEN 'order_shipped' THEN
      v_title := 'ההזמנה שלך נשלחה';
      v_body  := coalesce('הזמנה ' || v_ref || ' יצאה לדרך', 'ההזמנה יצאה לדרך');
      v_href  := '/account/orders';

    WHEN 'voucher_issued' THEN
      v_title := 'הקופון שלך מוכן';
      v_body  := coalesce('קופון עבור ' || v_product || ' ממתין לך',
                          'הקופון ממתין לך באזור האישי');
      v_href  := '/account/coupons';

    WHEN 'voucher_gifted' THEN
      v_title := 'קיבלת קופון במתנה';
      v_body  := coalesce('מתנה מ' || v_sender, 'מחכה לך קופון מתנה');
      v_href  := '/account/coupons';

    WHEN 'voucher_redeemed' THEN
      v_title := 'הקופון מומש';
      v_body  := coalesce('הקופון עבור ' || v_product || ' מומש כעת',
                          'אחד הקופונים שלך מומש כעת');
      v_href  := '/account/coupons';

    WHEN 'voucher_expiring' THEN
      v_title := 'קופון עומד לפוג';
      v_body  := coalesce('תוקף הקופון עבור ' || v_product || ' מסתיים בקרוב',
                          'יש לך קופון שתוקפו מסתיים בקרוב');
      v_href  := '/account/coupons';

    WHEN 'cashback_credited' THEN
      v_title := 'נוסף קאשבק לארנק';
      v_body  := coalesce(public.fn_bell_agorot(NEW.payload, 'amount_agorot') || ' נוספו לארנק שלך',
                          'קאשבק נוסף לארנק שלך');
      v_href  := '/account/wallet';

    WHEN 'refund_completed' THEN
      v_title := 'הזיכוי בוצע';
      v_body  := coalesce(
        nullif(array_to_string(array_remove(ARRAY[
          'זיכוי בסך ' || public.fn_bell_agorot(NEW.payload, 'refunded_agorot'),
          'הזמנה ' || v_ref
        ], NULL), ', '), ''),
        'הזיכוי שלך הושלם');
      v_href  := '/account/orders';

    WHEN 'welcome' THEN
      v_title := 'ברוכים הבאים לקניון אקספרס';
      v_body  := coalesce('שלום ' || v_name || ', העדכונים שלך יופיעו כאן',
                          'העדכונים על ההזמנות שלך יופיעו כאן');
      v_href  := '/account';

    WHEN 'price_drop' THEN
      v_title := 'ירידת מחיר על פריט ששמרת';
      v_body  := coalesce(v_product || ' זמין עכשיו במחיר נמוך יותר',
                          'פריט מרשימת המשאלות שלך ירד במחיר');
      v_href  := '/account/wishlist';

    WHEN 'back_in_stock' THEN
      v_title := 'פריט ששמרת חזר למלאי';
      v_body  := coalesce(v_product || ' חזר למלאי',
                          'פריט מרשימת המשאלות שלך חזר למלאי');
      v_href  := '/account/wishlist';

    -- Operator alerts, account_deleted, and any kind added after this file:
    -- no bell row until its Hebrew is written here.
    ELSE
      RETURN NEW;
  END CASE;

  INSERT INTO public.notifications (user_id, kind, title_he, body_he, href)
  VALUES (NEW.user_id, NEW.kind, v_title, v_body, v_href);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- The bell must never cost anyone their order: same contract as every
  -- notify trigger since 095.
  RAISE WARNING 'tg_outbox_bell failed for outbox row % (kind %): %', NEW.id, NEW.kind, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_outbox_bell() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS outbox_bell_fanout ON public.notification_outbox;
CREATE TRIGGER outbox_bell_fanout
  AFTER INSERT ON public.notification_outbox
  FOR EACH ROW EXECUTE FUNCTION public.tg_outbox_bell();

-- ------------------------------------------------------------------ realtime
--
-- 198 already added the table to the publication and set REPLICA IDENTITY
-- FULL; both are re-asserted rather than re-done, because a bell whose
-- subscription reports SUBSCRIBED and receives nothing is the silent failure
-- 198's own header measured. If either has been undone since, this file must
-- refuse rather than ship a dead bell.

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime'
     AND schemaname = 'public' AND tablename = 'notifications';
  IF n <> 1 THEN
    RAISE EXCEPTION 'notifications is not in supabase_realtime; the bell would be silently dead';
  END IF;

  IF (SELECT relreplident FROM pg_class WHERE oid = 'public.notifications'::regclass) <> 'f' THEN
    RAISE EXCEPTION 'notifications lost REPLICA IDENTITY FULL; realtime user_id filters cannot be evaluated';
  END IF;
END $$;

COMMIT;
