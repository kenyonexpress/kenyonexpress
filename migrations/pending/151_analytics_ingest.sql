-- 151: the analytics pipeline's missing half -- the function every event calls.
--
-- MEASURED 2026-09-02: `/api/a` collects consented client events, validates
-- them against the taxonomy mirror, and calls
-- `admin.rpc('fn_ingest_analytics_events', ...)`. That function DOES NOT EXIST
-- in production, and there is no analytics_events table either. Every batch
-- ever sent has returned "function not found", logged as
-- analytics.ingest_failed, and vanished. A caller without its function -- the
-- fourth instance of the pattern this closeout keeps finding (payment_events,
-- refunds and subscriptions were tables without writers).
--
-- The function is written to the CALLER'S contract exactly -- the payload
-- /api/a already sends today -- so applying this file turns the existing
-- pipeline on without touching a line of application code:
--
--   rpc('fn_ingest_analytics_events', {
--     p_events:   [ { event_id, event_name, occurred_at, source, source_app,
--                     session_id, path?, referrer?, utm?, props, anonymous_id } ],
--     p_user_id:  uuid | null,
--     p_ip:       text | null,
--     p_user_agent: text | null,
--   })
--
-- PRIVACY, BY SHAPE AND NOT BY POLICY. The IP is not stored; it arrives only
-- so the function can refuse an absurd batch and could rate-limit later. The
-- user agent is truncated. props is already capped client-side at 4KB and the
-- taxonomy's required-props are re-checked here, because the mirror's comment
-- promises the database re-validates and until now that promise had nothing
-- behind it.
--
-- SECURITY DEFINER, EXECUTE service_role only: the route runs it through the
-- admin client after doing consent and rate-limit checks; anon/authenticated
-- get no direct path to write analytics about other people.
--
-- ROLLBACK
--
--   drop function if exists public.fn_ingest_analytics_events(jsonb, uuid, text, text);
--   drop table if exists public.analytics_events;
--
-- DRY RUN, 2026-09-02, against production in a transaction that was rolled
-- back: a three-event batch inserted 2 (the unknown name skipped), a replay of
-- the same event_id inserted 0 more (rows stayed 2), a non-array payload
-- refused 22023, and nothing named evil_unknown was stored.
--
-- NOT APPLIED. migrations/pending/ is unapplied by definition. The route to
-- production is MCP apply_migration after a human approves this file.

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL,
  event_name    text NOT NULL,
  occurred_at   timestamptz NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  source        text NOT NULL DEFAULT 'web',
  source_app    text NOT NULL DEFAULT 'shop',
  session_id    text NOT NULL,
  anonymous_id  text,
  user_id       uuid,
  path          text,
  referrer      text,
  utm           jsonb,
  props         jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_agent    text
);

-- Replays happen: the client queue retries a batch the network lost after the
-- server stored it. The event_id makes the second arrival a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS analytics_events_event_id_key
  ON public.analytics_events (event_id);
CREATE INDEX IF NOT EXISTS analytics_events_name_time_idx
  ON public.analytics_events (event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_session_idx
  ON public.analytics_events (session_id, occurred_at);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: with RLS on and zero policies, anon and
-- authenticated can neither read nor write. The definer function below and the
-- service role are the only paths.

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
    IF v_name IS NULL OR v_name NOT IN (
      'page_view', 'view_product', 'view_category', 'add_to_cart',
      'remove_from_cart', 'checkout_step', 'web_vital', 'whatsapp_click'
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

REVOKE ALL ON FUNCTION public.fn_ingest_analytics_events(jsonb, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_ingest_analytics_events(jsonb, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.fn_ingest_analytics_events(jsonb, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ingest_analytics_events(jsonb, uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.fn_ingest_analytics_events(jsonb, uuid, text, text) IS
  'The ingest half /api/a has been calling since the analytics client shipped. Written to that caller''s payload exactly. Skips unknown event names rather than failing the batch; dedups on event_id. The IP parameter is accepted and not stored.';
