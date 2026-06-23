-- 022: Demo coupons seed + restore public read for active vendors
-- Idempotent: safe to run multiple times.
--
-- Context: the homepage Hot Coupons and Brands sections read coupon_deals and
-- vendors. coupon_deals already has a "public read active" policy, but vendors
-- lost its public read (anon visitors get 0 rows), so the Brands section stays
-- empty. This migration restores public read for active vendors and seeds
-- realistic Hebrew demo coupons. The demo vendors (which require auth users)
-- are seeded in migration 023 after the handle_new_user trigger is repaired.

-- ---------------------------------------------------------------------------
-- 1. Public read for active vendors (required by the homepage Brands section)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "vendors: public select active" ON public.vendors;
CREATE POLICY "vendors: public select active"
  ON public.vendors FOR SELECT
  USING ((status = 'active' AND deleted_at IS NULL) OR public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. Demo coupons (coupon_deals). Guarded by (title_he, business_name).
-- ---------------------------------------------------------------------------

INSERT INTO public.coupon_deals (title_he, business_name, original_price, location_he, terms_he, status)
SELECT v.title_he, v.business_name, v.original_price, v.location_he, v.terms_he, v.status
FROM (VALUES
  ('עיסוי שוודי מפנק 60 דקות', 'ספא נירוונה',    320::numeric, 'תל אביב',   'בתיאום מראש, בתוקף לחצי שנה', 'active'),
  ('ארוחה זוגית במסעדה איטלקית','טרטוריה בלה',     240::numeric, 'הרצליה',    'לא כולל אלכוהול, בימים א-ה',  'active'),
  ('כניסה זוגית לפארק מים',     'ימית 2000',      180::numeric, 'חולון',     'בתוקף לעונת הקיץ',           'active'),
  ('טיפול פנים יוקרתי',         'קליניק ביוטי',    290::numeric, 'רמת גן',    'בתיאום מראש',                'active'),
  ('לילה רומנטי בצימר בצפון',   'צימרים בגליל',    850::numeric, 'ראש פינה',  'בכפוף לזמינות, אמצע שבוע',    'active'),
  ('קורס סדנת בישול איטלקי',    'שף בבית',         360::numeric, 'ירושלים',   'סדנה של 3 שעות',             'active'),
  ('כרטיס זוגי להופעה',         'היכל התרבות',     280::numeric, 'תל אביב',   'בכפוף לזמינות מקומות',        'active'),
  ('חבילת גלישה וסאפ',          'אתגר אקסטרים',    199::numeric, 'אילת',      'כולל ציוד מלא',              'active')
) AS v(title_he, business_name, original_price, location_he, terms_he, status)
WHERE NOT EXISTS (
  SELECT 1 FROM public.coupon_deals c
  WHERE c.title_he = v.title_he AND c.business_name = v.business_name
);
