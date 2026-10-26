-- 169: the ingest whitelist learns the four server event names.
--
-- WHY. 151 shipped fn_ingest_analytics_events with a name whitelist that
-- carries ONLY the eight client events. trackServerEvent has been calling
-- the same function with 'begin_checkout' since the checkout wave -- and the
-- function CONTINUEs past unknown names by design, so every server event
-- ever emitted was silently skipped. Marathon step 14 added three more
-- ('purchase', 'voucher_redeemed', 'order_refunded'); until this applies,
-- all four go into the void, loudly documented at the emit sites.
--
-- WHAT. CREATE OR REPLACE of the 151 function, byte-identical except the IN
-- list, which gains the four names of src/lib/analytics/events.ts
-- SERVER_EVENT_NAMES. The registry file and this list must move together.
--
-- ROLLBACK: re-run the CREATE OR REPLACE FUNCTION block from
-- migrations/applied/151_analytics_ingest.sql (the eight-name list).
--
-- NOT APPLIED. `migrations/pending/` is unapplied by definition.

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
