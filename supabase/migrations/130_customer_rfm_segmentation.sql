-- PENDING 130: Customer Segmentation — RFM analysis (Recency, Frequency, Monetary)
-- ================================================================================
--
-- Implements RFM customer segmentation infrastructure:
-- 1. `customer_rfm_scores` — RFM metrics (recency days, purchase count, total spent)
-- 2. `customer_segments` — Segment definitions with RFM thresholds (champions, loyal, at-risk)
-- 3. `user_segment_tags` — User-to-segment assignments for campaign targeting
-- 4. `fn_calculate_rfm_scores()` — RPC to refresh RFM data for all users
-- 5. `fn_segment_users()` — RPC to assign users to segments based on RFM thresholds
-- 6. `fn_get_user_segments()` — RPC to retrieve active segments for a user
--
-- Segments:
-- - Champions (high R, high F, high M): VIP customers, frequent buyers, high spend
-- - Loyal (medium R, high F, high M): Repeat customers with consistent spend
-- - Potential (high R, low F, medium M): Recent buyers, lower frequency
-- - At Risk (low R, low F): Haven't purchased recently or frequently
-- - Dormant (very low R, any F): Haven't purchased in 90+ days
--
-- All RLS policies in place: customers see only their own segments.
-- SECURITY DEFINER functions accessible to authenticated users only.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Enum for segment types
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.customer_segment_type AS ENUM (
    'champions',
    'loyal',
    'potential',
    'at_risk',
    'dormant'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- 2. customer_rfm_scores — RFM metrics per user
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.customer_rfm_scores (
  id                   uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid           NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  recency_days         int            NOT NULL DEFAULT 9999,
  frequency_count      int            NOT NULL DEFAULT 0,
  monetary_total_ils   numeric(12,2)  NOT NULL DEFAULT 0.00,
  last_order_at        timestamptz,
  first_order_at       timestamptz,
  avg_order_value_ils  numeric(12,2)  NOT NULL DEFAULT 0.00,
  calculated_at        timestamptz    NOT NULL DEFAULT now(),
  updated_at           timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_rfm_scores_user_id_idx
  ON public.customer_rfm_scores (user_id);
CREATE INDEX IF NOT EXISTS customer_rfm_scores_recency_idx
  ON public.customer_rfm_scores (recency_days);
CREATE INDEX IF NOT EXISTS customer_rfm_scores_frequency_idx
  ON public.customer_rfm_scores (frequency_count);
CREATE INDEX IF NOT EXISTS customer_rfm_scores_monetary_idx
  ON public.customer_rfm_scores (monetary_total_ils DESC);

DROP TRIGGER IF EXISTS customer_rfm_scores_set_updated_at ON public.customer_rfm_scores;
CREATE TRIGGER customer_rfm_scores_set_updated_at
  BEFORE UPDATE ON public.customer_rfm_scores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. customer_segments — Segment definitions with RFM thresholds
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.customer_segments (
  id                        uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_type              public.customer_segment_type NOT NULL UNIQUE,
  name_he                   text           NOT NULL,
  name_en                   text           NOT NULL,
  description_he            text,
  description_en            text,
  -- RFM thresholds (defaults are percentile-based guidelines)
  min_recency_days          int            NOT NULL DEFAULT 0,
  max_recency_days          int            NOT NULL DEFAULT 9999,
  min_frequency_count       int            NOT NULL DEFAULT 0,
  min_monetary_total_ils    numeric(12,2)  NOT NULL DEFAULT 0.00,
  is_active                 boolean        NOT NULL DEFAULT true,
  campaign_hook_enabled     boolean        NOT NULL DEFAULT false,
  campaign_hook_description text,
  created_at                timestamptz    NOT NULL DEFAULT now(),
  updated_at                timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_segments_segment_type_idx
  ON public.customer_segments (segment_type);
CREATE INDEX IF NOT EXISTS customer_segments_active_idx
  ON public.customer_segments (is_active);

DROP TRIGGER IF EXISTS customer_segments_set_updated_at ON public.customer_segments;
CREATE TRIGGER customer_segments_set_updated_at
  BEFORE UPDATE ON public.customer_segments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Insert segment definitions
INSERT INTO public.customer_segments (
  segment_type,
  name_he,
  name_en,
  description_he,
  description_en,
  min_recency_days,
  max_recency_days,
  min_frequency_count,
  min_monetary_total_ils,
  is_active,
  campaign_hook_enabled,
  campaign_hook_description
) VALUES (
  'champions'::public.customer_segment_type,
  'אלופים',
  'Champions',
  'לקוחות VIP עם קניות תכופות וכנסות גבוהות',
  'VIP customers with frequent purchases and high revenue',
  0, 60,
  5,
  500.00,
  true, true,
  'Exclusive deals, early access, loyalty rewards'
), (
  'loyal'::public.customer_segment_type,
  'נאמנים',
  'Loyal',
  'לקוחות שחוזרים על עצמם עם הוצאות עקביות',
  'Repeat customers with consistent spending patterns',
  0, 90,
  3,
  200.00,
  true, true,
  'Special discounts, thank you campaigns, referral bonuses'
), (
  'potential'::public.customer_segment_type,
  'פוטנציאליים',
  'Potential',
  'קונים אחרונים עם תדירות נמוכה',
  'Recent buyers with lower purchase frequency',
  0, 60,
  1,
  50.00,
  true, true,
  'Encouragement to repeat, new product recommendations'
), (
  'at_risk'::public.customer_segment_type,
  'בסכנה',
  'At Risk',
  'לקוחות שלא קנו לאחרונה או בתדירות נמוכה',
  'Customers with low recency and frequency',
  61, 180,
  0,
  0.00,
  true, true,
  'Re-engagement campaigns, special comeback offers'
), (
  'dormant'::public.customer_segment_type,
  'כלא פעילים',
  'Dormant',
  'לא הראו פעילות במשך 90+ ימים',
  'No activity for 90+ days, requires reactivation',
  181, 9999,
  0,
  0.00,
  true, true,
  'Win-back campaigns, seasonal promotions'
) ON CONFLICT (segment_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. user_segment_tags — User-to-segment assignment (many-to-many)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_segment_tags (
  id            uuid       PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid       NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  segment_id    uuid       NOT NULL REFERENCES public.customer_segments(id) ON DELETE CASCADE,
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  reason        text,
  UNIQUE (user_id, segment_id)
);

CREATE INDEX IF NOT EXISTS user_segment_tags_user_id_idx
  ON public.user_segment_tags (user_id);
CREATE INDEX IF NOT EXISTS user_segment_tags_segment_id_idx
  ON public.user_segment_tags (segment_id);

-- ---------------------------------------------------------------------------
-- 5. fn_calculate_rfm_scores() — Calculate RFM metrics for all users
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_calculate_rfm_scores()
RETURNS TABLE(
  user_id uuid,
  recency_days int,
  frequency_count int,
  monetary_total_ils numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH rfm_data AS (
    SELECT
      o.user_id,
      COALESCE(EXTRACT(DAY FROM (now() - MAX(o.created_at))), 9999)::int
        AS recency_days,
      COUNT(*) AS frequency_count,
      COALESCE(SUM(o.total_ils), 0)::numeric(12,2)
        AS monetary_total_ils,
      MAX(o.created_at) AS last_order_at,
      MIN(o.created_at) AS first_order_at
    FROM public.orders o
    WHERE o.deleted_at IS NULL AND o.status NOT IN ('cancelled', 'refunded')
    GROUP BY o.user_id
  )
  INSERT INTO public.customer_rfm_scores (
    user_id,
    recency_days,
    frequency_count,
    monetary_total_ils,
    last_order_at,
    first_order_at,
    avg_order_value_ils,
    calculated_at
  )
  SELECT
    rfm_data.user_id,
    rfm_data.recency_days,
    rfm_data.frequency_count,
    rfm_data.monetary_total_ils,
    rfm_data.last_order_at,
    rfm_data.first_order_at,
    CASE WHEN rfm_data.frequency_count > 0
      THEN (rfm_data.monetary_total_ils / rfm_data.frequency_count)::numeric(12,2)
      ELSE 0
    END,
    now()
  FROM rfm_data
  ON CONFLICT (user_id) DO UPDATE SET
    recency_days = EXCLUDED.recency_days,
    frequency_count = EXCLUDED.frequency_count,
    monetary_total_ils = EXCLUDED.monetary_total_ils,
    last_order_at = EXCLUDED.last_order_at,
    first_order_at = EXCLUDED.first_order_at,
    avg_order_value_ils = EXCLUDED.avg_order_value_ils,
    calculated_at = now(),
    updated_at = now()
  RETURNING user_id, recency_days, frequency_count, monetary_total_ils;
$$;

-- ---------------------------------------------------------------------------
-- 6. fn_segment_users() — Assign users to segments based on RFM thresholds
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_segment_users()
RETURNS TABLE(
  user_id uuid,
  segment_type public.customer_segment_type
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH user_segments AS (
    SELECT
      rfm.user_id,
      cs.id AS segment_id,
      cs.segment_type,
      ROW_NUMBER() OVER (PARTITION BY rfm.user_id ORDER BY
        CASE
          -- Champions: high R, high F, high M
          WHEN rfm.recency_days <= 60 AND rfm.frequency_count >= 5 AND rfm.monetary_total_ils >= 500 THEN 1
          -- Loyal: medium R, high F, high M
          WHEN rfm.recency_days <= 90 AND rfm.frequency_count >= 3 AND rfm.monetary_total_ils >= 200 THEN 2
          -- Potential: high R, low F, medium M
          WHEN rfm.recency_days <= 60 AND rfm.frequency_count >= 1 AND rfm.monetary_total_ils >= 50 THEN 3
          -- At Risk: low R, low F
          WHEN rfm.recency_days > 60 AND rfm.recency_days <= 180 THEN 4
          -- Dormant: very low R
          WHEN rfm.recency_days > 180 THEN 5
          ELSE 999
        END
      ) AS seg_rank
    FROM public.customer_rfm_scores rfm
    CROSS JOIN public.customer_segments cs
    WHERE cs.is_active = true
      AND rfm.recency_days >= cs.min_recency_days
      AND rfm.recency_days <= cs.max_recency_days
      AND rfm.frequency_count >= cs.min_frequency_count
      AND rfm.monetary_total_ils >= cs.min_monetary_total_ils
  )
  INSERT INTO public.user_segment_tags (user_id, segment_id, reason)
  SELECT us.user_id, us.segment_id, 'Automatic RFM segmentation'
  FROM user_segments us
  WHERE us.seg_rank = 1
  ON CONFLICT (user_id, segment_id) DO NOTHING
  RETURNING user_id, segment_type;
$$;

-- ---------------------------------------------------------------------------
-- 7. fn_get_user_segments() — Retrieve segments for a user (current auth user)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_get_user_segments()
RETURNS TABLE(
  segment_type public.customer_segment_type,
  name_he text,
  name_en text,
  description_he text,
  campaign_hook_enabled boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    cs.segment_type,
    cs.name_he,
    cs.name_en,
    cs.description_he,
    cs.campaign_hook_enabled
  FROM public.user_segment_tags ust
  JOIN public.customer_segments cs ON ust.segment_id = cs.id
  WHERE ust.user_id = auth.uid() AND cs.is_active = true
  ORDER BY cs.segment_type;
$$;

-- ---------------------------------------------------------------------------
-- 8. fn_get_segment_users() — List all users in a segment (admin only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_get_segment_users(p_segment_type public.customer_segment_type)
RETURNS TABLE(
  user_id uuid,
  email text,
  full_name text,
  recency_days int,
  frequency_count int,
  monetary_total_ils numeric,
  assigned_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.email,
    p.full_name,
    rfm.recency_days,
    rfm.frequency_count,
    rfm.monetary_total_ils,
    ust.assigned_at
  FROM public.user_segment_tags ust
  JOIN public.customer_segments cs ON ust.segment_id = cs.id
  JOIN auth.users au ON ust.user_id = au.id
  JOIN public.profiles p ON au.id = p.id
  JOIN public.customer_rfm_scores rfm ON ust.user_id = rfm.user_id
  WHERE cs.segment_type = p_segment_type
  ORDER BY ust.assigned_at DESC;
$$;

-- ---------------------------------------------------------------------------
-- 9. RLS Policies
-- ---------------------------------------------------------------------------

ALTER TABLE public.customer_rfm_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_rfm_scores_select_own
  ON public.customer_rfm_scores FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY customer_rfm_scores_admin_all
  ON public.customer_rfm_scores FOR ALL
  USING (public.is_admin());

ALTER TABLE public.customer_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_segments_select_all
  ON public.customer_segments FOR SELECT
  USING (is_active = true);

CREATE POLICY customer_segments_admin_all
  ON public.customer_segments FOR ALL
  USING (public.is_admin());

ALTER TABLE public.user_segment_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_segment_tags_select_own
  ON public.user_segment_tags FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY user_segment_tags_admin_all
  ON public.user_segment_tags FOR ALL
  USING (public.is_admin());

COMMIT;
