-- ===========================================================================
-- notifications_edge_cron.sql  (APPLY-TIME SCRIPT, NOT A NUMBERED MIGRATION)
--
-- Schedules for the three `notify-*` Edge Functions. Kept out of
-- supabase/migrations for the reason `analytics_cron.sql` gives: a schedule is
-- environment state, not schema. Running it twice is safe — `cron.schedule`
-- upserts by job name.
--
-- ---------------------------------------------------------------------------
-- READ THIS BEFORE RUNNING IT: pg_net IS NOT INSTALLED ON THIS PROJECT
-- ---------------------------------------------------------------------------
--
-- pg_cron runs SQL inside the database and cannot make an HTTP request on its
-- own. Calling an Edge Function from a schedule needs `pg_net`, and this
-- project has it available but not installed — the same finding
-- `095_notification_outbox.sql` and `/api/cron/notifications` both record, and
-- the reason the existing drain is a Vercel cron rather than a trigger.
--
-- So this script does NOT install the extension. Installing an extension on
-- production is one of the four decisions that stop for a human, and it is not
-- this file's to make. It checks instead, and tells you which of the three
-- routes you are on:
--
--   A. pg_net IS installed  -> the jobs below are created and you are done.
--
--   B. pg_net is NOT installed, and you want it -> approve and install it
--      separately, then re-run this file. Nothing here needs changing.
--
--   C. pg_net is NOT installed and stays that way -> schedule the three
--      functions from outside the database. Any scheduler that can send an
--      HTTP request with a header works, because that is the entire contract:
--
--        POST https://<project-ref>.functions.supabase.co/notify-supplier-new-order
--        Authorization: Bearer $CRON_SECRET
--
--      The Vercel cron that already drains this queue is the incumbent, and
--      `supabase/functions/notifications-worker` is the existing proxy shape.
--      Nothing is lost while none of them run: the outbox row was written in
--      the same transaction as the payment and waits.
--
-- Times are UTC. pg_cron has no timezone; the Israel-local intent is written
-- next to each entry, and DST moves them by an hour twice a year.
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  v_base    text;
  v_secret  text;
  v_has_net boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_net'
  ) INTO v_has_net;

  IF NOT v_has_net THEN
    RAISE NOTICE '%',
      'pg_net is not installed: no jobs were created. See routes B and C in the header of this file. The Edge Functions are deployed and callable; only the alarm clock is missing.';
    RETURN;
  END IF;

  -- Set these once per environment before running:
  --   ALTER DATABASE postgres SET app.functions_base_url = 'https://<ref>.functions.supabase.co';
  --   ALTER DATABASE postgres SET app.cron_secret        = '<CRON_SECRET>';
  --
  -- They are read from settings rather than written into the job body because
  -- `cron.job.command` is world-readable to anybody who can query the catalog,
  -- and a bearer token pasted into it is a bearer token published.
  v_base   := current_setting('app.functions_base_url', true);
  v_secret := current_setting('app.cron_secret', true);

  IF v_base IS NULL OR v_secret IS NULL THEN
    RAISE EXCEPTION
      'app.functions_base_url and app.cron_secret must be set before scheduling; see the comment above';
  END IF;

  -- The customer's confirmation. Every minute: this is the mail somebody is
  -- refreshing their inbox for while the payment page is still open.
  PERFORM cron.schedule(
    'notify_customer_order',
    '* * * * *',
    format(
      $cmd$SELECT net.http_post(
             url     := %L,
             headers := jsonb_build_object(
                          'Authorization', %L,
                          'Content-Type',  'application/json'
                        ),
             body    := '{}'::jsonb
           )$cmd$,
      v_base || '/notify-customer-order',
      'Bearer ' || v_secret
    )
  );

  -- The supplier's alert. Every minute as well: it is a picking slip, and a
  -- business that packs an hour late ships a day late.
  PERFORM cron.schedule(
    'notify_supplier_new_order',
    '* * * * *',
    format(
      $cmd$SELECT net.http_post(
             url     := %L,
             headers := jsonb_build_object(
                          'Authorization', %L,
                          'Content-Type',  'application/json'
                        ),
             body    := '{}'::jsonb
           )$cmd$,
      v_base || '/notify-supplier-new-order',
      'Bearer ' || v_secret
    )
  );

  -- The expiry reminder. 06:00 UTC = 09:00 Israel in winter, 08:00 in summer:
  -- a morning mail about a coupon with three days left is read; a 02:00 one is
  -- buried by breakfast. It runs long after the 01:50 expiry sweep, so every
  -- voucher it looks at is already in its final state.
  PERFORM cron.schedule(
    'notify_voucher_expiring',
    '0 6 * * *',
    format(
      $cmd$SELECT net.http_post(
             url     := %L,
             headers := jsonb_build_object(
                          'Authorization', %L,
                          'Content-Type',  'application/json'
                        ),
             body    := '{"buckets":[3]}'::jsonb
           )$cmd$,
      v_base || '/notify-voucher-expiring',
      'Bearer ' || v_secret
    )
  );

  RAISE NOTICE '%', 'notify_customer_order, notify_supplier_new_order and notify_voucher_expiring are scheduled.';
END $$;

-- To inspect or remove:
--   SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname LIKE 'notify\_%';
--   SELECT cron.unschedule('notify_voucher_expiring');
