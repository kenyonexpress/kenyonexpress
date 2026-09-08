-- 180: the ingest whitelist learns the four server event names.
--
-- WHY. The deployed fn_ingest_analytics_events (read off production via MCP
-- on 2026-09-07) carries a name whitelist of ONLY the eight client events.
-- trackServerEvent calls the same function with 'begin_checkout' -- and the
-- function CONTINUEs past unknown names by design, so every server event
-- ever emitted was silently skipped. The PostHog wiring added three more
-- ('purchase', 'voucher_redeemed', 'order_refunded'); until this applies,
-- all four go into the first-party void, loudly documented at the emit
-- sites. PostHog itself receives them regardless: its fan-out in
-- src/server/analytics/track.ts does not pass through this function.
--
-- WHAT. CREATE OR REPLACE of the deployed function, byte-identical except
-- the IN list, which gains the four names of src/lib/analytics/events.ts
-- SERVER_EVENT_NAMES. The registry file and this list must move together.
--
-- ROLLBACK: re-run the CREATE OR REPLACE with the eight-name IN list
-- (drop the second row of names below); the rest of the body is unchanged.
--
-- APPLIED to production 2026-09-08 through MCP `apply_migration` as
-- `analytics_server_event_names_169`. This file and `180_analytics_server_
-- event_names.sql` are byte-identical SQL written by two sessions that could
-- not see each other; the single CREATE OR REPLACE applied both, and both
-- moved here together rather than one being deleted.
--
-- WHAT WAS MEASURED FIRST, because "the site is not deployed" was the reason
-- this waited and that reason turned out to be false. Production serves this
-- application (STATE.md 08.09). The deployed function body was read off
-- pg_get_functiondef: whitelist of exactly the eight client names, nothing
-- else, so every server event ever emitted was skipped. And the harm was
-- counted, not assumed: `orders` held 4 rows, 2 of them paid, while
-- `analytics_events` held ZERO `purchase` rows -- only `page_view` (12) and
-- `web_vital` (16) had ever landed, spanning 02.09 to 06.09.
--
-- WHY IT WAS SAFE TO WIDEN. The only new failure mode is an INSERT that now
-- runs where it used to be skipped, and `trackServerEvent` cannot propagate
-- it: rule 2 at the head of src/server/analytics/track.ts is enforced by a
-- try/catch AND by an explicit `if (error)` on the PostgREST result, which is
-- the shape that used to swallow refusals silently.
--
-- PROVED AFTER APPLYING, with a rolled-back DO block so production kept no
-- probe rows: five events in, `returned=4`, rows written were begin_checkout,
-- order_refunded, purchase, voucher_redeemed, and a made-up name was still
-- skipped. The block then raised, and `residue = 0`.

-- PREFLIGHT (inline; this branch keeps one file per pending change).
-- Run each block through MCP execute_sql BEFORE applying:
--
--
-- -- (1) The function exists with exactly the deployed signature.
-- --     EXPECT: one row, fn_ingest_analytics_events(jsonb, uuid, text, text).
-- select p.oid::regprocedure as signature, p.prosecdef
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'fn_ingest_analytics_events';
--
-- -- (2) The current whitelist is the deployed eight-name one (the before picture).
-- --     EXPECT: the body contains the eight client names and NOT
-- --     'begin_checkout'. If it already contains it, 180 (or a variant) has
-- --     been applied -- stop and compare.
-- select position('begin_checkout' in pg_get_functiondef(p.oid)) > 0 as already_widened
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'fn_ingest_analytics_events';
--
-- -- (3) Grants stay as deployed: service_role only.
-- --     EXPECT: service_role EXECUTE, no anon, no authenticated.
-- select grantee, privilege_type
--   from information_schema.routine_privileges
--  where routine_schema = 'public' and routine_name = 'fn_ingest_analytics_events'
--  order by grantee;
--
-- -- (4) Scale note: how many events exist (no lock concern -- CREATE OR
-- --     REPLACE FUNCTION does not touch the table). EXPECT: a count.
-- select count(*) from public.analytics_events;

CREATE OR REPLACE FUNCTION public.fn_ingest_analytics_events(
  p_events jsonb,
  p_user_id uuid DEFAULT NULL,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_event jsonb;
  v_name text;
  v_inserted integer := 0;
BEGIN
  IF p_events IS NULL OR jsonb_typeof(p_events) <> 'array' THEN
    RAISE EXCEPTION 'fn_ingest_analytics_events: p_events must be an array'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_events) > 20 THEN
    -- MAX_BATCH_SIZE client-side is 20; a bigger batch did not come from our
    -- client.
    RAISE EXCEPTION 'fn_ingest_analytics_events: batch too large'
      USING ERRCODE = '22023';
  END IF;

  FOR v_event IN SELECT * FROM jsonb_array_elements(p_events) LOOP
    v_name := v_event->>'event_name';
    -- The registry check the client mirror promises. Unknown names are skipped
    -- rather than raised: one bad event must not lose the nineteen good ones.
    -- The second row is SERVER_EVENT_NAMES (events.ts); the two lists move
    -- together.
    IF v_name IS NULL OR v_name NOT IN (
      'page_view', 'view_product', 'view_category', 'add_to_cart',
      'remove_from_cart', 'checkout_step', 'web_vital', 'whatsapp_click',
      'begin_checkout', 'purchase', 'voucher_redeemed', 'order_refunded'
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.analytics_events (
      event_id, event_name, occurred_at, source, source_app, session_id,
      anonymous_id, user_id, path, referrer, utm, props, user_agent
    )
    VALUES (
      (v_event->>'event_id')::uuid,
      v_name,
      (v_event->>'occurred_at')::timestamptz,
      coalesce(v_event->>'source', 'web'),
      coalesce(v_event->>'source_app', 'shop'),
      left(v_event->>'session_id', 64),
      left(v_event->>'anonymous_id', 128),
      p_user_id,
      left(v_event->>'path', 300),
      left(v_event->>'referrer', 600),
      v_event->'utm',
      coalesce(v_event->'props', '{}'::jsonb),
      left(p_user_agent, 400)
    )
    ON CONFLICT (event_id) DO NOTHING;
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN v_inserted;
END
$$;
