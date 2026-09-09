-- 227_voucher_expiry_engine.sql
--
-- The expiry engine's four database-side gaps, measured against production
-- `ixvwfbuvfxxsjiywhbbb` on 2026-09-10 before a line of this file was written.
--
-- =============================================================================
-- WHAT WAS ALREADY THERE, SO THIS FILE IS NOT READ AS BUILDING IT
-- =============================================================================
--
-- `expire_vouchers()`, `credit_expired_vouchers()` and
-- `enqueue_expiring_voucher_notices(integer[])` are all LIVE, and
-- `/api/cron/expire-vouchers` calls all three in the right order. The sweep
-- works, the wallet credit works, and the T-7/T-1 mail works on a day the cron
-- runs. Three of SECTIONS 29's seven items needed nothing from the database.
--
-- This file changes four things and adds two functions. Every one of them is a
-- behaviour that was measured wrong or missing, not a preference.
--
-- =============================================================================
-- 1. THE REMINDER MATCHES ONE EXACT DAY, SO A DROPPED CRON RUN LOSES IT FOREVER
-- =============================================================================
--
-- The live body selects on
--
--   (v.expires_at AT TIME ZONE 'Asia/Jerusalem')::date
--     = ((now() AT TIME ZONE 'Asia/Jerusalem')::date + v_bucket)
--
-- Equality. A voucher is eligible for its 1-day notice on exactly one calendar
-- day, and the job that would send it runs once a day. If that run does not
-- happen, the customer is never warned at all, and nothing anywhere reports it:
-- the next night's run asks about a different day and finds the voucher no
-- longer matches.
--
-- This is not hypothetical. `.github/workflows/cron.yml` schedules the job and
-- its own header says so in writing: "GitHub's cron is best effort. Runs are
-- delayed under load, routinely by five to fifteen minutes, and a run can be
-- dropped entirely." It also notes GitHub disables scheduled workflows after 60
-- days without a commit. A missed night is an expected event here, and the
-- reminder is the one leg with no second chance -- the sweep and the credit both
-- pick their backlog up on the next run because they select on `<= now()`.
--
-- THE FIX IS A WINDOW PER BUCKET, NOT A DAY. Buckets are sorted descending and
-- each one owns the half-open range down to the next bucket below it:
--
--   buckets [7, 1]   ->   bucket 7 covers  1 <  days_remaining <= 7
--                         bucket 1 covers -1 <  days_remaining <= 1  (ie 0 or 1)
--
-- Idempotency was already in place and is what makes a window safe: the dedupe
-- key is `voucher_expiring:<id>:<bucket>` and `notification_outbox.dedupe_key`
-- is UNIQUE with ON CONFLICT DO NOTHING, so re-selecting a voucher every night
-- inside its window enqueues at most one row per bucket, ever. A missed night is
-- now recovered by the next one.
--
-- WHAT THE WINDOW DOES NOT BUY, said plainly rather than left to be discovered:
-- if the cron is down for a bucket's whole window the notice for THAT bucket is
-- still lost. Bucket 7 needs one run in six days; bucket 1 needs one run in two.
-- The narrow bucket is the one that matters and it is the one with the least
-- slack, which is the honest limit of a daily job.
--
-- WHY THE BUCKETS DO NOT OVERLAP. The obvious version of this fix is `<= bucket`
-- with no lower edge, and it double-mails: a voucher issued with one day of life
-- satisfies both `<= 7` and `<= 1` on its first night, and gets two emails an
-- instant apart. The floor makes each voucher-night belong to exactly one
-- bucket.
--
-- `days_remaining` NOW CARRIES THE TRUE NUMBER AND NOT THE BUCKET. Under
-- equality the two were always the same, so nothing noticed. Under a window they
-- are not: a voucher with three days left is caught by bucket 7. The email
-- (`buildVoucherExpiringEmail`), the in-app row (`buildInAppContent`) and the
-- push template all print this key as a sentence a customer reads -- "פג בעוד 7
-- ימים" on a voucher that dies in three sends them to the shop after it is dead.
-- The bucket is still in the payload, under `bucket`, for anyone reconciling a
-- row against the job that queued it.
--
-- =============================================================================
-- 2. THE WALLET CREDIT IS SILENT
-- =============================================================================
--
-- `credit_expired_vouchers()` moves the customer's money back into their wallet
-- and tells nobody. Measured: no trigger on `wallet_entries` or `vouchers`
-- enqueues anything for it, and `notification_outbox` has no kind that could
-- carry it. The customer sees a coupon go grey and has to find the wallet page
-- on their own to learn the money came back.
--
-- That is the failure C6 was written to prevent turning into its opposite:
-- expiry is not forfeiture, and a refund nobody is told about is
-- indistinguishable from forfeiture at the only place it is read.
--
-- A NEW KIND AND NOT A BORROWED ONE. `refund_completed` says "זיכינו את הכרטיס
-- שלך" -- the CARD. This money goes to the WALLET and cannot be taken to
-- another shop. `cashback_credited` names the right destination and the wrong
-- reason ("נכנס לך קאשבק"), and a customer who reads that looks for a purchase
-- that earned it. Either reuse ships a sentence that is false about money, so
-- `voucher_expiry_credited` is its own kind.
--
-- =============================================================================
-- 3. THE KIND CHECK IS SPLICED, NOT RESTATED
-- =============================================================================
--
-- `APPLY-ORDER.md` carries a standing ordering rule: apply 214 AFTER any other
-- pending file that restates `notification_outbox_kind_check`, because the later
-- of two full restatements wins and the earlier one's names vanish. That rule
-- exists because `200_wishlist_alert_kinds.sql` restated the list and is now
-- unapplyable against the production it already shipped to.
--
-- This file does not restate the list. It reads whatever `pg_get_constraintdef`
-- currently returns and splices one name into the ARRAY literal, so it composes
-- with 214 in EITHER order and cannot drop a name it has never heard of. The
-- splice refuses loudly if the constraint is not the `kind = ANY (ARRAY[...])`
-- shape, rather than silently doing nothing.
--
-- Production on 2026-09-10 holds sixteen names and `settlement_gap` is not among
-- them, so 214 is genuinely unapplied and this file must not assume otherwise.
--
-- =============================================================================
-- 4. THE STATUS GUARD FORBIDS THE ONE TRANSITION AN OVERRIDE NEEDS
-- =============================================================================
--
-- `fn_vouchers_status_guard()` permits four transitions, all out of `issued`.
-- `expired -> issued` raises 23514. So "admin override to extend expiry" could
-- only ever have meant "extend one that has not expired yet", which is the case
-- nobody calls support about: the request always arrives after the customer
-- turned up and was refused.
--
-- The transition is opened, and `extend_voucher_expiry()` below is the only
-- thing that should use it.
--
-- THE MONEY IS WHY THIS IS NOT JUST A COLUMN UPDATE. An expired voucher has
-- usually already had `coupon_price_agorot` credited to the customer's wallet by
-- step 2 of the nightly job. Reviving that voucher without looking hands the
-- customer the money AND the coupon: they spend the credit, then present the
-- code, and the supplier is owed for goods against a prepayment that was given
-- back. So the function refuses a revival once
-- `voucher:<id>:expiry_credit` exists in `wallet_entries`, and says which reason
-- it refused for, so support can tell the customer what actually happened rather
-- than "the button did not work".
--
-- Clawing the credit back instead of refusing was considered and rejected: the
-- wallet can already have been spent, and a debit that overdraws it turns a
-- goodwill gesture into a negative balance the customer did not agree to.
--
-- THE CURSOR IN `credit_expired_vouchers` TAKES `FOR UPDATE`. Without it the
-- credit job and an extension can interleave: the extension checks for a credit,
-- finds none, and commits a revival while the job is mid-flight on the same row.
-- With it the two serialise on the voucher row and whichever is second sees what
-- the first did. The cost is that an admin holding the row briefly blocks the
-- nightly job, which is a wait measured in milliseconds against a job with a
-- whole night.
--
-- =============================================================================
-- 5. `supplier_expiry_metrics` -- AND WHAT AN "EXPIRY RATE" IS OVER
-- =============================================================================
--
-- PostgREST has no GROUP BY, so a per-supplier breakdown is either a function or
-- an unbounded read of every voucher into TypeScript. It is a function.
--
-- It returns COUNTS and not a rate. The denominator is a decision -- see
-- `src/lib/vouchers/expiry-metrics.ts`, which owns it and is tested on it -- and
-- a rate computed in two places is a rate that will eventually be two numbers.
--
-- Granted to `service_role` alone. Both callers already resolve the supplier
-- from a session before they call (`requireSupplierMember` on the supplier
-- console, `requireSection` in admin) and pass it explicitly.
--
-- SECURITY INVOKER, DELIBERATELY. Neither new function needs to out-privilege
-- its caller: the only role that may execute them is `service_role`, which
-- bypasses RLS already. A SECURITY DEFINER function is a standing grant of the
-- owner's rights to whoever can reach it, and there is nothing here that needs
-- one. See `definer-fn-caller-controlled-uid`: the definer functions in this
-- database that read `auth.uid()` are the ones that went wrong.

BEGIN;

-- =============================================================================
-- 1. The outbox learns one more kind, by splice.
-- =============================================================================

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.notification_outbox'::regclass
     AND conname  = 'notification_outbox_kind_check';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'notification_outbox_kind_check is missing; refusing to guess the kind list';
  END IF;

  -- Already spliced. Idempotent re-runs are the rule, not an accident.
  IF position('''voucher_expiry_credited''' IN v_def) > 0 THEN
    RETURN;
  END IF;

  IF position('ARRAY[' IN v_def) = 0 THEN
    RAISE EXCEPTION
      'kind CHECK is not the ARRAY[...] shape this splice expects: %', v_def;
  END IF;

  v_def := replace(v_def, 'ARRAY[', 'ARRAY[''voucher_expiry_credited''::text, ');

  ALTER TABLE public.notification_outbox DROP CONSTRAINT notification_outbox_kind_check;
  EXECUTE 'ALTER TABLE public.notification_outbox ADD CONSTRAINT notification_outbox_kind_check '
          || v_def;
END $$;

-- =============================================================================
-- 2. Reminders: a window per bucket, and the true days remaining.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enqueue_expiring_voucher_notices(
  p_buckets integer[] DEFAULT ARRAY[7, 1]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sorted integer[];
  v_count  integer;
  v_i      integer;
  v_bucket integer;
  v_floor  integer;
  v_queued integer := 0;
  v_before integer;
  v_after  integer;
BEGIN
  -- Descending, deduplicated, negatives dropped. The caller passes [7, 1] and
  -- the order it passes them in must not decide who owns which night.
  SELECT array_agg(b ORDER BY b DESC)
    INTO v_sorted
    FROM (SELECT DISTINCT unnest(p_buckets) AS b) s
   WHERE b >= 0;

  v_count := coalesce(array_length(v_sorted, 1), 0);

  FOR v_i IN 1 .. v_count LOOP
    v_bucket := v_sorted[v_i];
    -- The next bucket down is this one's exclusive floor. The last bucket
    -- reaches -1 so that `days_remaining = 0` -- expiring later today -- is
    -- inside it rather than falling off the bottom.
    v_floor := CASE WHEN v_i < v_count THEN v_sorted[v_i + 1] ELSE -1 END;

    SELECT count(*)::integer INTO v_before FROM public.notification_outbox;

    PERFORM public.fn_enqueue_notification(
      'voucher_expiring',
      pr.email,
      'voucher_expiring:' || v.id::text || ':' || v_bucket::text,
      jsonb_build_object(
        'voucher_id',     v.id,
        'code',           v.code,
        'product_name',   p.name_he,
        'supplier_name',  s.name,
        'expires_at',     v.expires_at,
        -- The real figure, not the bucket. Under the old equality match they
        -- were the same number and nothing depended on the difference; under a
        -- window they are not, and three templates print this as a promise.
        'days_remaining', (v.expires_at AT TIME ZONE 'Asia/Jerusalem')::date
                          - (now() AT TIME ZONE 'Asia/Jerusalem')::date,
        'bucket',         v_bucket
      ),
      v.user_id
    )
    FROM public.vouchers v
    LEFT JOIN public.products  p  ON p.id = v.product_id
    LEFT JOIN public.suppliers s  ON s.id = v.supplier_id
    LEFT JOIN public.profiles  pr ON pr.id = v.user_id
    WHERE v.status = 'issued'::public.voucher_status
      AND v.expires_at IS NOT NULL
      AND pr.email IS NOT NULL
      -- Never remind about one that is already dead. The sweep runs first in
      -- the same request, so this only catches a row that died between them.
      AND v.expires_at > now()
      AND ((v.expires_at AT TIME ZONE 'Asia/Jerusalem')::date
           - (now() AT TIME ZONE 'Asia/Jerusalem')::date)
          BETWEEN v_floor + 1 AND v_bucket;

    SELECT count(*)::integer INTO v_after FROM public.notification_outbox;
    v_queued := v_queued + greatest(v_after - v_before, 0);
  END LOOP;

  RETURN v_queued;
END;
$function$;

-- =============================================================================
-- 3. The credit locks what it is about to pay, and says that it paid.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.credit_expired_vouchers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_voucher   public.vouchers%ROWTYPE;
  v_source    uuid;
  v_target    uuid;
  v_email     text;
  v_product   text;
  v_supplier  text;
  v_count     integer := 0;
BEGIN
  SELECT id INTO v_source FROM public.wallet_accounts WHERE code = 'platform:adjustments';
  IF v_source IS NULL THEN
    RAISE EXCEPTION 'platform:adjustments wallet account is missing; refusing to credit';
  END IF;

  FOR v_voucher IN
    SELECT v.* FROM public.vouchers v
    WHERE v.status = 'expired'::public.voucher_status
      AND v.coupon_price_agorot > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.wallet_entries w
        WHERE w.idempotency_key = 'voucher:' || v.id::text || ':expiry_credit'
      )
    ORDER BY v.expires_at
    LIMIT 500
    -- Added by 227. An admin extension takes the same lock, so a revival and a
    -- credit cannot both decide they are first.
    FOR UPDATE
  LOOP
    SELECT id INTO v_target FROM public.wallet_accounts WHERE user_id = v_voucher.user_id;
    IF v_target IS NULL THEN
      INSERT INTO public.wallet_accounts (user_id) VALUES (v_voucher.user_id)
      RETURNING id INTO v_target;
    END IF;

    PERFORM public.fn_wallet_transfer(
      v_source,
      v_target,
      round(v_voucher.coupon_price_agorot::numeric / 100, 2),
      'voucher_expiry_credit',
      'voucher:' || v_voucher.id::text || ':expiry_credit',
      v_voucher.order_id
    );
    v_count := v_count + 1;

    -- AFTER the transfer and never before: an email that promises money the
    -- ledger does not hold is a support ticket. Same ordering rule
    -- `buildCashbackCreditedEmail` states for the cashback credit.
    --
    -- The enqueue cannot stop the loop. `fn_enqueue_notification` returns
    -- quietly for a missing or suppressed address, and the outbox INSERT is
    -- ON CONFLICT DO NOTHING on the dedupe key. If it raised anyway, the money
    -- has already moved and the whole batch would roll back -- so it is wrapped.
    BEGIN
      SELECT pr.email, p.name_he, s.name
        INTO v_email, v_product, v_supplier
        FROM public.profiles pr
        LEFT JOIN public.products  p ON p.id = v_voucher.product_id
        LEFT JOIN public.suppliers s ON s.id = v_voucher.supplier_id
       WHERE pr.id = v_voucher.user_id;

      IF v_email IS NOT NULL THEN
        PERFORM public.fn_enqueue_notification(
          'voucher_expiry_credited',
          v_email,
          'voucher_expiry_credited:' || v_voucher.id::text,
          jsonb_build_object(
            'voucher_id',    v_voucher.id,
            'amount_agorot', v_voucher.coupon_price_agorot,
            'product_name',  v_product,
            'supplier_name', v_supplier,
            'expires_at',    v_voucher.expires_at
          ),
          v_voucher.user_id
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'voucher_expiry_credited enqueue failed for %: %', v_voucher.id, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- =============================================================================
-- 4. One more legal transition: back from expired.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_vouchers_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  -- Not participating, or not moving. Either way this trigger has no opinion.
  IF NEW.status IS NULL OR OLD.status IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF (OLD.status::text, NEW.status::text) IN (
    ('issued','redeemed'),
    ('issued','expired'),
    ('issued','cancelled'),
    ('issued','refunded'),
    -- 227. An operator extending the deadline of a voucher the sweep already
    -- took. `extend_voucher_expiry()` is the only intended writer and refuses
    -- once the expiry credit has been paid; this trigger deliberately does NOT
    -- re-check that, because a trigger that reads the wallet to decide a status
    -- move would put the money rule in two places.
    ('expired','issued')
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'illegal vouchers.status transition: % -> %', OLD.status, NEW.status
    USING ERRCODE = '23514';
END
$function$;

-- =============================================================================
-- 5. The override itself.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.extend_voucher_expiry(
  p_voucher_id     uuid,
  p_new_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v          public.vouchers%ROWTYPE;
  v_credited boolean;
BEGIN
  -- FOR UPDATE, so a concurrent `credit_expired_vouchers()` either finished
  -- before this read or waits behind it. Without the lock the credit check
  -- below is a snapshot that can be stale by the time the UPDATE lands.
  SELECT * INTO v FROM public.vouchers WHERE id = p_voucher_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v.status NOT IN ('issued'::public.voucher_status, 'expired'::public.voucher_status) THEN
    -- Redeemed, cancelled and refunded are terminal states with money already
    -- settled against them. Extending one would create a second life for a
    -- coupon that has been paid out.
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_status',
                              'status', v.status::text);
  END IF;

  IF p_new_expires_at <= v.expires_at THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_later',
                              'expires_at', v.expires_at);
  END IF;

  IF p_new_expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'in_the_past');
  END IF;

  -- `vouchers_expires_within_offer` would raise 23514 here anyway. Refusing
  -- first turns a constraint violation into a sentence naming the ceiling --
  -- and the ceiling is what the supplier agreed to honour, so raising it is a
  -- change to their commitment and not this function's to make.
  IF v.offer_valid_until IS NOT NULL AND p_new_expires_at > v.offer_valid_until THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'past_offer',
                              'offer_valid_until', v.offer_valid_until);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.wallet_entries w
     WHERE w.idempotency_key = 'voucher:' || v.id::text || ':expiry_credit'
  ) INTO v_credited;

  IF v_credited THEN
    -- The customer already has the money back. Reviving the code as well would
    -- hand them both.
    RETURN jsonb_build_object('ok', false, 'reason', 'already_credited');
  END IF;

  UPDATE public.vouchers
     SET expires_at    = p_new_expires_at,
         status        = 'issued'::public.voucher_status,
         status_reason = 'expiry extended'
   WHERE id = v.id;

  RETURN jsonb_build_object(
    'ok',                  true,
    'previous_expires_at', v.expires_at,
    'expires_at',          p_new_expires_at,
    'revived',             v.status = 'expired'::public.voucher_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.extend_voucher_expiry(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.extend_voucher_expiry(uuid, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.extend_voucher_expiry(uuid, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.extend_voucher_expiry(uuid, timestamptz) TO service_role;

-- =============================================================================
-- 6. The per-supplier counts a rate is computed from.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.supplier_expiry_metrics(
  p_since       timestamptz DEFAULT NULL,
  p_supplier_id uuid        DEFAULT NULL
)
RETURNS TABLE (
  supplier_id            uuid,
  supplier_name          text,
  issued_count           bigint,
  live_count             bigint,
  redeemed_count         bigint,
  expired_count          bigint,
  expired_value_agorot   bigint,
  credited_value_agorot  bigint
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path TO ''
AS $function$
  SELECT
    v.supplier_id,
    max(s.name)                                                          AS supplier_name,
    count(*)                                                             AS issued_count,
    count(*) FILTER (
      WHERE v.status = 'issued'::public.voucher_status
        AND v.expires_at > now()
    )                                                                    AS live_count,
    count(*) FILTER (WHERE v.status = 'redeemed'::public.voucher_status)  AS redeemed_count,
    count(*) FILTER (WHERE v.status = 'expired'::public.voucher_status)   AS expired_count,
    -- What the customer paid online for coupons that died unused. Not the face
    -- value: face value includes the part that was always going to be paid at
    -- the counter, and nobody ever held that money.
    coalesce(sum(v.coupon_price_agorot) FILTER (
      WHERE v.status = 'expired'::public.voucher_status), 0)::bigint      AS expired_value_agorot,
    -- Of that, how much has actually been handed back. The gap between these
    -- two is the credit job's backlog, and it is the number worth watching.
    coalesce(sum(v.coupon_price_agorot) FILTER (
      WHERE v.status = 'expired'::public.voucher_status
        AND EXISTS (
          SELECT 1 FROM public.wallet_entries w
           WHERE w.idempotency_key = 'voucher:' || v.id::text || ':expiry_credit'
        )), 0)::bigint                                                    AS credited_value_agorot
  FROM public.vouchers v
  LEFT JOIN public.suppliers s ON s.id = v.supplier_id
  WHERE v.supplier_id IS NOT NULL
    AND (p_since IS NULL OR v.issued_at >= p_since)
    AND (p_supplier_id IS NULL OR v.supplier_id = p_supplier_id)
  GROUP BY v.supplier_id
  ORDER BY count(*) FILTER (WHERE v.status = 'expired'::public.voucher_status) DESC;
$function$;

REVOKE ALL ON FUNCTION public.supplier_expiry_metrics(timestamptz, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supplier_expiry_metrics(timestamptz, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.supplier_expiry_metrics(timestamptz, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_expiry_metrics(timestamptz, uuid) TO service_role;

COMMIT;

-- =============================================================================
-- PROBED AGAINST PRODUCTION, ROLLED BACK, 2026-09-10
-- =============================================================================
--
-- THE SPLICE, against a scratch table carrying the EXACT live constraint
-- definition rather than a hand-copied one:
--
--   accepted_names = 17   the new name plus all sixteen live ones insert
--   bogus kind             still raises check_violation
--   re-run                 finds the name present and returns early
--
-- The first draft of the splice was written as a full restatement of the list.
-- It would have passed every test in this file and silently dropped whatever
-- 214 adds, in whichever order the two were applied. That is the failure
-- `200_wishlist_alert_kinds.sql` already shipped once.
--
-- THE BUCKET WINDOWS, every days_remaining from -1 to 10 fed through the
-- sorting and floor arithmetic verbatim:
--
--   days 0, 1        -> bucket 1     and nothing else
--   days 2 .. 7      -> bucket 7     and nothing else
--   days -1, 8 .. 10 -> no bucket
--
-- The probe RAISES if any day is claimed by two buckets, because that is the
-- exact regression the naive `<= bucket` version has and it is invisible until
-- a customer receives two identical emails.
--
-- BOTH NEW FUNCTIONS were created, called and rolled back:
--
--   extend_voucher_expiry(<absent uuid>, now() + 30d) -> {"ok":false,"reason":"not_found"}
--   supplier_expiry_metrics(NULL, NULL)               -> 0 rows, no error
--   supplier_expiry_metrics(now() - 90d, NULL)        -> 0 rows, no error
--
-- Zero rows because production holds ZERO vouchers (measured the same day), so
-- this proves the functions parse, plan and run against the real schema -- and
-- proves nothing at all about their arithmetic on live data. The arithmetic
-- that a customer can be harmed by lives in TypeScript for exactly that reason:
-- `src/lib/vouchers/expiry-metrics.ts` and `src/lib/vouchers/expiry-refund.ts`
-- are pure and are tested on numbers this database cannot yet supply.
--
-- After the rollback: no `probe_*` function exists and the CHECK is unchanged.
--
-- =============================================================================
-- VERIFY after applying
-- =============================================================================
--
--   -- the spliced name is there and the other sixteen survived
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'notification_outbox_kind_check';
--
--   -- the override is reachable by nobody but the service role
--   SELECT grantee, privilege_type FROM information_schema.role_routine_grants
--    WHERE routine_name IN ('extend_voucher_expiry', 'supplier_expiry_metrics');
--
--   -- and the guard now knows five transitions, not four
--   SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'fn_vouchers_status_guard';
--
-- Reversal: restore the four function bodies from this file's git history and
-- splice `'voucher_expiry_credited'::text, ` back out of the CHECK. The two new
-- functions are DROP FUNCTION public.extend_voucher_expiry(uuid, timestamptz)
-- and DROP FUNCTION public.supplier_expiry_metrics(timestamptz, uuid); nothing
-- in the database references either.
