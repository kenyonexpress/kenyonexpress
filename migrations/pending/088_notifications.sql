-- 088_notifications.sql
--
-- In-app notifications (the bell), a delivery audit trail, and the claim
-- protocol the three `notify-*` Edge Functions need in order to drain
-- `notification_outbox` without racing the Next cron that drains it today.
--
-- WHY THE NUMBER IS 088 AND THE CHAIN IS AT 118. This file was asked for by
-- that name. `migrations/pending/` already carries its own number line
-- (`003-…` next to `110_…` through `123_…`) precisely because nothing here has
-- been applied and the ordinal is a label rather than a position. Read the
-- number as a name. The file depends only on objects that production already
-- has: `095`'s `notification_outbox` and `fn_enqueue_notification`, `102`'s
-- `voucher_issued` kind, and `114`'s `user_id` column on the outbox.
--
-- NOTHING HERE HAS BEEN RUN. Per `migrations/pending/README.md` the route to
-- production is `apply_migration` through MCP after a human approves the file.
-- Every statement is idempotent and forward-only.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS ADDS, AND WHAT IT DELIBERATELY DOES NOT
-- ---------------------------------------------------------------------------
--
-- It does NOT add a second queue. `notification_outbox` is already durable and
-- already written in the same transaction as the event that owes the mail, and
-- a second queue beside it would mean two answers to "was this sent". The three
-- Edge Functions read that same outbox.
--
-- It DOES add three things the outbox cannot answer:
--
--   1. `notifications` — what a person sees in the bell. The outbox is keyed by
--      email address and holds other people's addresses, so it can never be
--      exposed to a customer or a supplier. The bell needs a row a customer
--      may SELECT and mark read, and that Realtime may broadcast.
--
--   2. `notification_log` — one row per delivery ATTEMPT. The outbox keeps only
--      the latest state of a row: after a retry succeeds, the failure that came
--      before it is gone, and `last_error` has been overwritten. A bounced
--      supplier address that eventually worked leaves no trace today.
--
--   3. `sending` — a claim state on the outbox. Two drains now exist: the Next
--      cron at `/api/cron/notifications` and these Edge Functions. The cron
--      selects `status = 'pending'`, so a row moved to `sending` is invisible
--      to it, and `fn_claim_notification_batch` moves rows there under
--      FOR UPDATE SKIP LOCKED. Resend's idempotency key (the `dedupe_key`) is
--      the second line of defence, not the first.

-- ---------------------------------------------------------------------------
-- 0. Defensive: 001 is not idempotent and may have stopped early on a live DB.
-- ---------------------------------------------------------------------------

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
-- 1. The bell
-- ---------------------------------------------------------------------------

/**
 * One row is one thing a person should see in the bell.
 *
 * AUDIENCE IS A PAIR OF NULLABLE COLUMNS, NOT A ROLE STRING. A notification is
 * addressed to a user, or to a supplier, and a supplier is a business with
 * several staff who must all see the same new-order row. Encoding that as
 * `audience_role = 'supplier'` plus one user id would send a sale alert to
 * whichever member happened to be on the account. The CHECK below requires
 * exactly one of the two to be set, so an unaddressed row cannot exist.
 *
 * TEXT IS STORED, NOT COMPUTED AT READ TIME. The bell must say what was true
 * when the event happened. A product renamed next month must not rewrite the
 * notification that announced its sale, which is the same reason `095` freezes
 * its payloads and `order_items` snapshots its percentages.
 */
CREATE TABLE IF NOT EXISTS public.notifications (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Exactly one of these is set. See the CHECK.
  user_id      uuid        REFERENCES public.profiles(id)  ON DELETE CASCADE,
  supplier_id  uuid        REFERENCES public.suppliers(id) ON DELETE CASCADE,

  kind         text        NOT NULL,
  title_he     text        NOT NULL,
  body_he      text,
  -- Where the bell sends them. Relative, always: an absolute URL in a row
  -- outlives the domain it was written against.
  href         text,
  -- Free-form context for the row's own rendering (an amount, a code). Never
  -- an email address: this table is readable by the person it names.
  data         jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- Same discipline as the outbox: one logical notification, one row, forever.
  dedupe_key   text        NOT NULL UNIQUE,

  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notifications_one_audience CHECK (
    (user_id IS NOT NULL AND supplier_id IS NULL)
    OR (user_id IS NULL AND supplier_id IS NOT NULL)
  )
);

DROP TRIGGER IF EXISTS set_updated_at ON public.notifications;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- The bell's only two queries: this person's newest rows, and how many of them
-- are unread. Both are partial or ordered exactly as the query asks for them.
CREATE INDEX IF NOT EXISTS notifications_user_recent_idx
  ON public.notifications (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_supplier_recent_idx
  ON public.notifications (supplier_id, created_at DESC)
  WHERE supplier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON public.notifications (user_id, supplier_id)
  WHERE read_at IS NULL;

COMMENT ON TABLE public.notifications IS
  'In-app bell feed. Addressed to exactly one user OR one supplier. Written only by fn_push_inapp_notification; a reader may mark rows read and nothing else.';

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- SELECT: your own rows, or your supplier''s rows, or admin.
DROP POLICY IF EXISTS notifications_read_own ON public.notifications;
CREATE POLICY notifications_read_own ON public.notifications
  FOR SELECT
  USING (
    (SELECT public.is_admin())
    OR ((SELECT auth.uid()) IS NOT NULL AND user_id = (SELECT auth.uid()))
    OR (supplier_id IS NOT NULL AND public.is_supplier_member(supplier_id))
  );

-- UPDATE: the read flag, and only on rows you can already see. The WITH CHECK
-- repeats the audience test so an UPDATE cannot re-address a row to somebody
-- else on its way out. Columns are not restricted by RLS, so the grant below
-- is what actually confines this to `read_at`.
DROP POLICY IF EXISTS notifications_mark_read ON public.notifications;
CREATE POLICY notifications_mark_read ON public.notifications
  FOR UPDATE
  USING (
    ((SELECT auth.uid()) IS NOT NULL AND user_id = (SELECT auth.uid()))
    OR (supplier_id IS NOT NULL AND public.is_supplier_member(supplier_id))
  )
  WITH CHECK (
    ((SELECT auth.uid()) IS NOT NULL AND user_id = (SELECT auth.uid()))
    OR (supplier_id IS NOT NULL AND public.is_supplier_member(supplier_id))
  );

-- No INSERT and no DELETE policy exists, on purpose. Rows are written by a
-- SECURITY DEFINER function called from triggers, and a notification a person
-- can delete is an audit trail they can edit.
REVOKE ALL ON public.notifications FROM anon, authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Realtime
-- ---------------------------------------------------------------------------

-- The bell subscribes to postgres_changes on this table. Two things are needed
-- and both are easy to forget:
--
--   * membership in the `supabase_realtime` publication, or no change is ever
--     published;
--   * REPLICA IDENTITY FULL, or an UPDATE arrives with only the primary key in
--     `old_record`, and Realtime cannot evaluate RLS on the old row — which is
--     what makes "mark as read" show up on the other tab.
--
-- Realtime enforces the SELECT policy above per subscriber, so a customer's
-- socket never carries another customer's row.
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. The single write path for the bell
-- ---------------------------------------------------------------------------

/**
 * Refuses silently rather than raising. Every caller is a trigger on the
 * payment or redemption path, and `095` already established the rule these
 * follow: a notification that cannot be written must never fail a charge or
 * refuse a coupon at a counter.
 */
CREATE OR REPLACE FUNCTION public.fn_push_inapp_notification(
  p_user_id     uuid,
  p_supplier_id uuid,
  p_kind        text,
  p_title       text,
  p_body        text,
  p_href        text,
  p_dedupe      text,
  p_data        jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Exactly one audience, checked here as well as by the constraint so the
  -- caller gets a no-op instead of an exception it is not allowed to raise.
  IF (p_user_id IS NULL) = (p_supplier_id IS NULL) THEN
    RETURN NULL;
  END IF;

  IF coalesce(btrim(p_kind), '') = '' OR coalesce(btrim(p_title), '') = '' THEN
    RETURN NULL;
  END IF;

  IF coalesce(btrim(p_dedupe), '') = '' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications
    (user_id, supplier_id, kind, title_he, body_he, href, dedupe_key, data)
  VALUES
    (p_user_id, p_supplier_id, p_kind, p_title, p_body, p_href, p_dedupe,
     coalesce(p_data, '{}'::jsonb))
  ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_push_inapp_notification(uuid, uuid, text, text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_push_inapp_notification(uuid, uuid, text, text, text, text, text, jsonb)
  TO service_role;

/**
 * Mark read. Exists as an RPC because the common case is "mark all of mine",
 * which as a bare UPDATE from the client would be an unbounded statement whose
 * WHERE clause the client chooses.
 *
 * Returns the number of rows it changed. Already-read rows are not touched, so
 * a second call returns 0 rather than bumping `updated_at` on the whole feed
 * and waking every subscriber.
 */
CREATE OR REPLACE FUNCTION public.fn_mark_notifications_read(
  p_ids uuid[] DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  -- SECURITY INVOKER on purpose: the UPDATE policy above is the authorisation,
  -- so this cannot reach a row the caller could not have reached by hand.
  UPDATE public.notifications
     SET read_at = now()
   WHERE read_at IS NULL
     AND (p_ids IS NULL OR id = ANY(p_ids));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_mark_notifications_read(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_mark_notifications_read(uuid[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The delivery audit
-- ---------------------------------------------------------------------------

/**
 * One row per ATTEMPT, never updated.
 *
 * `notification_outbox` holds the current state of a queued message; this holds
 * its history. They answer different questions and the difference matters in
 * exactly the case anyone ever looks: a supplier says they got nothing, the
 * outbox row says `sent`, and only an append-only log can show that the first
 * two attempts were refused by Resend and the third went to an address that had
 * been corrected in between.
 *
 * `outbox_id` is nullable and ON DELETE SET NULL: the log must outlive any
 * pruning of the queue.
 */
CREATE TABLE IF NOT EXISTS public.notification_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id    uuid        REFERENCES public.notification_outbox(id) ON DELETE SET NULL,
  kind         text        NOT NULL,
  channel      text        NOT NULL DEFAULT 'email'
                           CHECK (channel IN ('email', 'push', 'inapp')),
  -- Who it went to. This table is admin-only for exactly this column.
  recipient    text,
  dedupe_key   text,
  status       text        NOT NULL
                           CHECK (status IN ('sent', 'failed', 'skipped')),
  -- Resend's own message id, when it gave us one. The only handle their
  -- dashboard understands.
  provider_id  text,
  error        text,
  -- Which drain sent it: 'edge:notify-customer-order', 'cron:notifications'.
  source       text,
  attempt      integer     NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_log_outbox_idx
  ON public.notification_log (outbox_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notification_log_recent_idx
  ON public.notification_log (created_at DESC);

-- Failures are what anyone actually greps for, and they are the small minority.
CREATE INDEX IF NOT EXISTS notification_log_failed_idx
  ON public.notification_log (created_at DESC)
  WHERE status = 'failed';

COMMENT ON TABLE public.notification_log IS
  'Append-only delivery history for outbound notifications. Written by the drains with the service role. Admin read only: rows name recipient addresses.';

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_log_admin_read ON public.notification_log;
CREATE POLICY notification_log_admin_read ON public.notification_log
  FOR SELECT USING (public.is_admin());

REVOKE ALL ON public.notification_log FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. The claim protocol
-- ---------------------------------------------------------------------------

-- `sending` joins the outbox's status vocabulary. Every existing reader either
-- asks for `pending` (the Next cron) or for a specific id, so widening the
-- CHECK cannot change what any of them sees.
ALTER TABLE public.notification_outbox
  DROP CONSTRAINT IF EXISTS notification_outbox_status_check;

ALTER TABLE public.notification_outbox
  ADD CONSTRAINT notification_outbox_status_check
  CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'dead'));

/**
 * Hand a drain a batch of due rows that nobody else is holding.
 *
 * FOR UPDATE SKIP LOCKED plus the move to `sending` is what lets three Edge
 * Functions and the Next cron run against one queue: a claimed row is neither
 * locked for long nor visible as `pending` to the next caller.
 *
 * A row claimed by a function that then dies would sit in `sending` forever, so
 * the claim is reclaimable: rows in `sending` whose `next_attempt_at` has
 * passed are picked up again. The stale window is set by the caller when it
 * claims (`p_lease_minutes`), and the dedupe key still makes a double send a
 * single email at Resend.
 */
CREATE OR REPLACE FUNCTION public.fn_claim_notification_batch(
  p_kinds         text[],
  p_limit         integer DEFAULT 25,
  p_lease_minutes integer DEFAULT 5
) RETURNS SETOF public.notification_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT o.id
      FROM public.notification_outbox o
     WHERE o.kind = ANY(p_kinds)
       AND o.status IN ('pending', 'sending')
       AND o.next_attempt_at <= now()
     ORDER BY o.created_at
     LIMIT greatest(coalesce(p_limit, 25), 1)
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.notification_outbox o
     SET status          = 'sending',
         -- The lease. If this drain never settles the row, it becomes due
         -- again here and only here.
         next_attempt_at = now() + make_interval(mins => greatest(coalesce(p_lease_minutes, 5), 1))
    FROM due
   WHERE o.id = due.id
  RETURNING o.*;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_claim_notification_batch(text[], integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_claim_notification_batch(text[], integer, integer)
  TO service_role;

/**
 * Settle a claimed row and write its audit line, in one transaction.
 *
 * The two must not come apart. A `sent` row with no log line is a delivery
 * nobody can trace; a log line with the row still `sending` is a message that
 * will be sent again when the lease expires.
 *
 * Backoff and the death threshold are `095`'s, restated here rather than
 * imported because the Next cron holds them in TypeScript: 2, 8, 32, 128
 * minutes, dead on the fifth failure. A `dead` row is a state an admin can see
 * and requeue, not a silent drop.
 */
CREATE OR REPLACE FUNCTION public.fn_settle_notification(
  p_id          uuid,
  p_ok          boolean,
  p_provider_id text DEFAULT NULL,
  p_error       text DEFAULT NULL,
  p_source      text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row      public.notification_outbox;
  v_attempts integer;
  v_status   text;
BEGIN
  SELECT * INTO v_row FROM public.notification_outbox WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF p_ok THEN
    UPDATE public.notification_outbox
       SET status     = 'sent',
           sent_at    = now(),
           attempts   = v_row.attempts + 1,
           last_error = NULL
     WHERE id = p_id;
    v_status := 'sent';
  ELSE
    v_attempts := v_row.attempts + 1;
    IF v_attempts >= 5 THEN
      v_status := 'dead';
      UPDATE public.notification_outbox
         SET status = 'dead', attempts = v_attempts, last_error = left(coalesce(p_error, ''), 500)
       WHERE id = p_id;
    ELSE
      v_status := 'pending';
      UPDATE public.notification_outbox
         SET status          = 'pending',
             attempts        = v_attempts,
             last_error      = left(coalesce(p_error, ''), 500),
             next_attempt_at = now() + make_interval(mins => 2 * power(4, v_attempts - 1)::integer)
       WHERE id = p_id;
    END IF;
  END IF;

  INSERT INTO public.notification_log
    (outbox_id, kind, channel, recipient, dedupe_key, status, provider_id, error, source, attempt)
  VALUES
    (p_id, v_row.kind, 'email', v_row.recipient_email, v_row.dedupe_key,
     CASE WHEN p_ok THEN 'sent' ELSE 'failed' END,
     p_provider_id, left(coalesce(p_error, ''), 500), p_source, v_row.attempts + 1);

  RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_settle_notification(uuid, boolean, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_settle_notification(uuid, boolean, text, text, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Filling the bell
-- ---------------------------------------------------------------------------

/**
 * The bell's rows for a paid order: one for the customer, one per supplier.
 *
 * A SEPARATE TRIGGER, NOT AN EDIT TO `tg_orders_notify_paid`. That function has
 * already been rewritten once (`102`) and its body is 90 lines of money-shaped
 * SQL. Copying it a third time to add two INSERTs would put three versions of
 * the paid-order fan-out in the tree, and the next person to change the email
 * half would have to find and change this half too. This one only writes the
 * bell.
 *
 * The customer's row deliberately says nothing about the total. It exists to
 * carry them to the order, and the bell is rendered in a header next to a cart
 * badge, where an amount reads as something owed.
 */
CREATE OR REPLACE FUNCTION public.tg_orders_notify_paid_inapp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ref          text;
  v_has_vouchers boolean;
  v_supplier     record;
BEGIN
  IF NEW.paid_at IS NULL OR OLD.paid_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_ref := upper(left(NEW.id::text, 8));

  SELECT EXISTS (SELECT 1 FROM public.vouchers v WHERE v.order_id = NEW.id)
    INTO v_has_vouchers;

  PERFORM public.fn_push_inapp_notification(
    NEW.user_id,
    NULL,
    CASE WHEN v_has_vouchers THEN 'voucher_issued' ELSE 'order_paid' END,
    CASE WHEN v_has_vouchers
         THEN 'הקופונים שלך מוכנים'
         ELSE 'ההזמנה שלך התקבלה' END,
    'הזמנה ' || v_ref,
    CASE WHEN v_has_vouchers
         THEN '/account/coupons'
         ELSE '/account/orders/' || NEW.id::text END,
    'inapp:order_paid:' || NEW.id::text,
    jsonb_build_object('order_id', NEW.id, 'order_ref', v_ref)
  );

  -- One row per supplier, not per line, for the same reason `095` sends one
  -- mail per supplier: a business that sold three products in one order wants
  -- one alert.
  FOR v_supplier IN
    SELECT
      i.supplier_id,
      sum(coalesce(i.quantity, 1))::integer AS units,
      bool_or(i.product_type = 'physical'::public.product_type) AS has_physical
    FROM public.order_items i
    WHERE i.order_id = NEW.id AND i.supplier_id IS NOT NULL
    GROUP BY i.supplier_id
  LOOP
    PERFORM public.fn_push_inapp_notification(
      NULL,
      v_supplier.supplier_id,
      'supplier_sale',
      CASE WHEN v_supplier.has_physical
           THEN 'הזמנה חדשה למשלוח'
           ELSE 'מכירה חדשה' END,
      v_supplier.units || ' פריטים · הזמנה ' || v_ref,
      -- The supplier dashboard. There is no /supplier/orders/[id] route; a
      -- bell link to one would be a 404 at the moment a business is told it
      -- has a sale.
      '/supplier',
      'inapp:supplier_sale:' || NEW.id::text || ':' || v_supplier.supplier_id::text,
      jsonb_build_object(
        'order_id',     NEW.id,
        'order_ref',    v_ref,
        'units',        v_supplier.units,
        'has_physical', v_supplier.has_physical
      )
    );
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- The card has already been charged. `095` §"why every trigger swallows its
  -- own errors" applies verbatim.
  RAISE WARNING 'tg_orders_notify_paid_inapp failed for order %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_notify_paid_inapp ON public.orders;
CREATE TRIGGER trg_orders_notify_paid_inapp
  AFTER UPDATE OF paid_at ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_orders_notify_paid_inapp();

/**
 * The bell's row when a coupon is scanned. Fires inside redeem_voucher(), and
 * so must never raise: a cashier seeing a coupon refused because a bell row
 * would not write is the failure this EXCEPTION block exists to prevent.
 *
 * Both sides get one. The customer learns their coupon was used at the instant
 * it is used, which is also the fraud signal that matters — if it was not them,
 * this is how they find out. The supplier's row is the counter's own receipt.
 */
CREATE OR REPLACE FUNCTION public.tg_vouchers_notify_redeemed_inapp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_product text;
BEGIN
  IF NEW.status <> 'redeemed'::public.voucher_status
     OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT pr.name_he INTO v_product FROM public.products pr WHERE pr.id = NEW.product_id;

  PERFORM public.fn_push_inapp_notification(
    NEW.user_id,
    NULL,
    'voucher_redeemed',
    'הקופון מומש',
    coalesce(v_product, 'קופון'),
    '/coupon/' || NEW.id::text,
    'inapp:voucher_redeemed:' || NEW.id::text,
    jsonb_build_object(
      'voucher_id',       NEW.id,
      'product_name',     v_product,
      'collected_agorot', coalesce(NEW.redeemed_amount_collected_agorot, 0)
    )
  );

  IF NEW.redeemed_by_supplier_id IS NOT NULL THEN
    PERFORM public.fn_push_inapp_notification(
      NULL,
      NEW.redeemed_by_supplier_id,
      'voucher_redeemed',
      'קופון מומש בעסק',
      coalesce(v_product, 'קופון'),
      '/supplier/redemptions',
      'inapp:voucher_redeemed_supplier:' || NEW.id::text,
      jsonb_build_object(
        'voucher_id',       NEW.id,
        'product_name',     v_product,
        'collected_agorot', coalesce(NEW.redeemed_amount_collected_agorot, 0)
      )
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_vouchers_notify_redeemed_inapp failed for voucher %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vouchers_notify_redeemed_inapp ON public.vouchers;
CREATE TRIGGER trg_vouchers_notify_redeemed_inapp
  AFTER UPDATE OF status ON public.vouchers
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_vouchers_notify_redeemed_inapp();

/**
 * The bell's row for an expiring coupon.
 *
 * `114` already queues the EMAIL through `enqueue_expiring_voucher_notices`.
 * This is its in-app twin and is called by the same Edge Function, right after
 * that one, so the two cannot disagree about which vouchers are close to their
 * deadline: both read `vouchers` at the same instant with the same predicate.
 *
 * `expires_at` and not `offer_valid_until`, as `lib/vouchers/coupon-view.ts`
 * spells out: expires_at is min(rolling window, offer end), so the offer end
 * can promise a date the voucher will not survive to.
 */
CREATE OR REPLACE FUNCTION public.enqueue_expiring_voucher_inapp(
  p_buckets integer[] DEFAULT ARRAY[3]
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bucket integer;
  v_queued integer := 0;
  v_row    record;
  v_id     uuid;
BEGIN
  FOREACH v_bucket IN ARRAY p_buckets LOOP
    FOR v_row IN
      SELECT v.id, v.user_id, v.code, p.name_he AS product_name, s.name AS supplier_name
        FROM public.vouchers v
        LEFT JOIN public.products  p ON p.id = v.product_id
        LEFT JOIN public.suppliers s ON s.id = v.supplier_id
       WHERE v.status = 'issued'::public.voucher_status
         AND v.expires_at IS NOT NULL
         AND v.user_id IS NOT NULL
         AND (v.expires_at AT TIME ZONE 'Asia/Jerusalem')::date
             = ((now() AT TIME ZONE 'Asia/Jerusalem')::date + v_bucket)
    LOOP
      v_id := public.fn_push_inapp_notification(
        v_row.user_id,
        NULL,
        'voucher_expiring',
        CASE WHEN v_bucket = 1
             THEN 'הקופון שלך פג מחר'
             ELSE 'הקופון שלך פג בעוד ' || v_bucket || ' ימים' END,
        coalesce(v_row.product_name, 'קופון')
          || CASE WHEN v_row.supplier_name IS NOT NULL
                  THEN ' · ' || v_row.supplier_name ELSE '' END,
        '/coupon/' || v_row.id::text,
        'inapp:voucher_expiring:' || v_row.id::text || ':' || v_bucket::text,
        jsonb_build_object(
          'voucher_id',     v_row.id,
          'product_name',   v_row.product_name,
          'supplier_name',  v_row.supplier_name,
          'days_remaining', v_bucket
        )
      );
      IF v_id IS NOT NULL THEN
        v_queued := v_queued + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_queued;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_expiring_voucher_inapp(integer[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_expiring_voucher_inapp(integer[]) TO service_role;
