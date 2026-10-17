-- 188_search_analytics.sql - Search Analytics: CTR tracking and weekly reporting

CREATE TABLE IF NOT EXISTS public.search_clicks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term       text NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  position   integer NOT NULL,
  clicked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX search_clicks_term_idx ON public.search_clicks(term, clicked_at DESC);
CREATE INDEX search_clicks_product_idx ON public.search_clicks(product_id);
CREATE INDEX search_clicks_position_idx ON public.search_clicks(position);

ALTER TABLE public.search_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "search_clicks: staff read" ON public.search_clicks;
CREATE POLICY "search_clicks: staff read" ON public.search_clicks FOR SELECT TO authenticated USING (public.has_role('admin'));

CREATE OR REPLACE FUNCTION public.fn_record_search_click(p_term text, p_product_id uuid, p_position integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_norm text;
BEGIN
  IF p_term IS NULL OR p_product_id IS NULL OR p_position < 1 THEN RETURN; END IF;
  v_norm := lower(regexp_replace(btrim(p_term), '\s+', ' ', 'g'));
  IF length(v_norm) < 2 OR length(v_norm) > 120 THEN RETURN; END IF;
  INSERT INTO public.search_clicks(term, product_id, position) VALUES(v_norm, p_product_id, p_position);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_record_search_click(text, uuid, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_search_weekly_report()
RETURNS TABLE(week_start date, week_end date, total_searches bigint, no_result_searches bigint, no_result_percentage numeric,
  total_clicks bigint, avg_ctr numeric, top_searches jsonb, top_no_result_searches jsonb, ctr_by_position jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_start date; v_end date; v_total bigint; v_no_result bigint; v_clicks bigint;
BEGIN
  v_start := CURRENT_DATE - 7;
  v_end := CURRENT_DATE;
  SELECT COALESCE(SUM(searches), 0) INTO v_total FROM public.search_events WHERE last_seen_at >= v_start;
  SELECT COALESCE(SUM(empty_results), 0) INTO v_no_result FROM public.search_events WHERE last_seen_at >= v_start;
  SELECT COALESCE(COUNT(*), 0) INTO v_clicks FROM public.search_clicks WHERE clicked_at >= v_start;
  RETURN QUERY SELECT
    v_start, v_end, v_total, v_no_result,
    ROUND((v_no_result::numeric / NULLIF(v_total, 0)) * 100, 2),
    v_clicks,
    ROUND((v_clicks::numeric / NULLIF(v_total, 0)) * 100, 2),
    COALESCE(json_agg(json_build_object('term', term, 'searches', searches, 'empty_results', empty_results, 'clicks', (SELECT COUNT(*) FROM public.search_clicks sc WHERE sc.term = search_events.term AND sc.clicked_at >= v_start))) ORDER BY searches DESC, '[]'::jsonb) FILTER (WHERE term IS NOT NULL),
    COALESCE(json_agg(json_build_object('term', term, 'searches', searches, 'empty_results', empty_results) ORDER BY empty_results DESC, '[]'::jsonb) FILTER (WHERE empty_results > 0),
    COALESCE(json_agg(json_build_object('position', position, 'clicks', clicks) ORDER BY position, '[]'::jsonb) FILTER (WHERE position IS NOT NULL)
  FROM public.search_events se, LATERAL(SELECT position, COUNT(*) clicks FROM public.search_clicks WHERE term = se.term AND clicked_at >= v_start GROUP BY position) ctr
  WHERE se.last_seen_at >= v_start LIMIT 10;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_search_weekly_report() TO authenticated, service_role;
